import { NextRequest } from 'next/server';
import { corsError, corsJson, corsPreflight } from '@/lib/uslMix/cors';
import { normalizeSnapshot } from '@/lib/live/normalize';
import { upsertLiveArena } from '@/server/liveArenaStore';

/**
 * POST /api/live/ingest - zone script -> site, one arena snapshot per call, about once a minute.
 *
 * Producer: LiveSnapshotPublisher (USLLiveSnapshot.cs / CTFLiveSnapshot.cs). Both zones use the
 * same shared secret as the USL mix ingest (USL_MIX_INGEST_KEY on Vercel) - accepted as
 * `x-api-key`, `Authorization: Bearer`, or `auth_key` in the body. The latest snapshot per
 * game|zone|arena is kept; older ones are simply overwritten. Nothing here is idempotency
 * sensitive - a duplicate POST is a no-op refresh.
 */
export const runtime = 'nodejs';
export const maxDuration = 15;

export async function OPTIONS() {
  return corsPreflight();
}

function authenticate(request: NextRequest, body: any): { ok: boolean; reason?: string } {
  const expected = process.env.LIVE_INGEST_KEY || process.env.USL_MIX_INGEST_KEY;
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
      console.error('[live] ingest misconfigured:', auth.reason);
      return corsError(auth.reason, 500);
    }
    return corsError('Unauthorized', 401);
  }

  const result = normalizeSnapshot(body);
  if (!result.ok) return corsError(result.error, 400);

  try {
    const key = await upsertLiveArena(result.snapshot);
    const s = result.snapshot;
    return corsJson({
      success: true,
      key,
      players_total: s.players_total,
      players_playing: s.players_playing,
      mode: s.state.mode,
      server_time: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error('[live] ingest failed:', error);
    return corsError('Failed to store snapshot', 500);
  }
}
