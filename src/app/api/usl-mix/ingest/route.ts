import { NextRequest } from 'next/server';
import { getServiceSupabase } from '@/lib/supabase';
import { corsJson, corsError, corsPreflight } from '@/lib/uslMix/cors';
import { IngestError, applyRatingsForGame, storeGame, validatePayload } from '@/lib/uslMix/ingest';

/**
 * POST /api/usl-mix/ingest - game server -> site.
 *
 * Auth: a dedicated shared secret (USL_MIX_INGEST_KEY on Vercel), NOT the Supabase service
 * role key. Accepted as `x-api-key`, `Authorization: Bearer`, or `auth_key` in the body
 * (the body fallback exists because some edge networks strip custom headers).
 *
 *   action=test         -> 200 echo, nothing stored (proves connectivity + key)
 *   action=game_result  -> validate, store game/players/kill events, run the ELO pass
 */
export const runtime = 'nodejs';
export const maxDuration = 60;

export async function OPTIONS() {
  return corsPreflight();
}

function authenticate(request: NextRequest, body: any): { ok: boolean; reason?: string } {
  const expected = process.env.USL_MIX_INGEST_KEY;
  if (!expected) return { ok: false, reason: 'USL_MIX_INGEST_KEY is not configured on the server' };
  const candidates = [
    request.headers.get('x-api-key'),
    (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, ''),
    typeof body?.auth_key === 'string' ? body.auth_key : null,
  ].filter((v): v is string => !!v);
  return { ok: candidates.some((c) => c === expected) };
}

export async function POST(request: NextRequest) {
  let body: any;
  try {
    body = await request.json();
  } catch {
    return corsError('Body must be JSON', 400);
  }

  const auth = authenticate(request, body);
  if (!auth.ok) {
    if (auth.reason) {
      console.error('[usl-mix] ingest misconfigured:', auth.reason);
      return corsError(auth.reason, 500);
    }
    return corsError('Unauthorized', 401);
  }

  if (body.action === 'test') {
    return corsJson({
      success: true,
      message: 'USL Mix ingest reachable',
      zone_name: body.zone_name ?? null,
      script_version: body.script_version ?? null,
      server_time: new Date().toISOString(),
    });
  }

  try {
    const payload = validatePayload(body);
    const supabase = getServiceSupabase();
    const stored = await storeGame(supabase, payload, body);
    let ratings: { applied: boolean; reason?: string; changes: number } = { applied: false, reason: 'duplicate', changes: 0 };
    if (!stored.duplicate) {
      try {
        ratings = await applyRatingsForGame(supabase, stored.gameId);
      } catch (e: any) {
        console.error('[usl-mix] rating pass failed:', e?.message);
        ratings = { applied: false, reason: `rating pass failed: ${e?.message}`, changes: 0 };
      }
    }
    console.log(
      `[usl-mix] ${stored.duplicate ? 'DUPLICATE' : 'stored'} ${payload.game_kind} ${payload.match_id.slice(0, 8)} ` +
        `${payload.teams[0].name} ${payload.teams[0].kills}-${payload.teams[1].kills} ${payload.teams[1].name} ` +
        `players=${stored.players} events=${stored.killEvents} rated=${ratings.applied}`
    );
    return corsJson({
      success: true,
      game_id: stored.gameId,
      match_id: payload.match_id,
      duplicate: stored.duplicate,
      players: stored.players,
      kill_events: stored.killEvents,
      ratings,
      url: `/usl-mix/games/${stored.gameId}`,
    });
  } catch (e: any) {
    if (e instanceof IngestError) {
      return corsError(e.message, e.status, e.details ? { details: e.details } : undefined);
    }
    console.error('[usl-mix] ingest error:', e);
    return corsError('Internal error', 500, { message: e?.message });
  }
}
