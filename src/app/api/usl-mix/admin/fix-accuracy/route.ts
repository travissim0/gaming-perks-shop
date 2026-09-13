import { NextRequest, NextResponse } from 'next/server';
import { getServiceSupabase } from '@/lib/supabase';
import { requireZoneAdmin } from '@/lib/adminApiAuth';
import { recomputeAllRatings } from '@/lib/uslMix/ingest';

/**
 * POST /api/usl-mix/admin/fix-accuracy
 *   { fixes: [{ game_id, alias, shots_fired, shots_landed, bio_dart_hits, weapon_hits? }], recompute?: boolean }
 *
 * Corrects the accuracy counters on stored player rows. Needed once (2026-09-13): the script-level
 * mix games shipped without resetting the zone's per-player weapon tracker between games, so every
 * game after the first of the night carried the earlier games' shots/hits/darts (a 928-hit
 * 20-minute game). The true per-game values are the deltas between consecutive payloads, which the
 * caller computes; this endpoint only writes them. bio_dart_hits feeds the ELO impact term, so
 * `recompute: true` replays the ratings afterwards. Zone admins only.
 */
export const runtime = 'nodejs';
export const maxDuration = 300;

// Same gate as recompute: the zone's own USL_MIX_INGEST_KEY (x-api-key / Bearer) or a zone admin's session.
function ingestKeyMatches(request: NextRequest): boolean {
  const expected = process.env.USL_MIX_INGEST_KEY;
  if (!expected) return false;
  const bearer = request.headers.get('Authorization');
  const given = request.headers.get('x-api-key') ?? (bearer?.startsWith('Bearer ') ? bearer.slice(7) : null);
  return !!given && given === expected;
}

type Fix = {
  game_id: string;
  alias: string;
  shots_fired: number;
  shots_landed: number;
  bio_dart_hits: number;
  weapon_hits?: Record<string, { name: string | null; fired: number; landed: number }>;
};

const isInt = (v: unknown) => typeof v === 'number' && Number.isFinite(v) && v >= 0;

export async function POST(request: NextRequest) {
  if (!ingestKeyMatches(request)) {
    const auth = await requireZoneAdmin(request);
    if (!auth.ok) return auth.response!;
  }
  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ success: false, error: 'Body must be JSON' }, { status: 400 });
  }
  const fixes: Fix[] = Array.isArray(body?.fixes) ? body.fixes : [];
  if (fixes.length === 0 || fixes.length > 500) {
    return NextResponse.json({ success: false, error: 'fixes must be a non-empty array (max 500)' }, { status: 400 });
  }
  for (const f of fixes) {
    if (typeof f?.game_id !== 'string' || typeof f?.alias !== 'string' || !isInt(f.shots_fired) || !isInt(f.shots_landed) || !isInt(f.bio_dart_hits)) {
      return NextResponse.json({ success: false, error: `bad fix entry: ${JSON.stringify(f).slice(0, 200)}` }, { status: 400 });
    }
  }

  const supabase = getServiceSupabase();
  const results: { game_id: string; alias: string; updated: number; error?: string }[] = [];
  for (const f of fixes) {
    const accuracy = f.shots_fired > 0 ? Math.round((f.shots_landed / f.shots_fired) * 10000) / 100 : 0;
    const patch: Record<string, unknown> = {
      shots_fired: f.shots_fired,
      shots_landed: f.shots_landed,
      accuracy,
      bio_dart_hits: f.bio_dart_hits,
    };
    if (f.weapon_hits && typeof f.weapon_hits === 'object') patch.weapon_hits = f.weapon_hits;
    // alias match is case-insensitive: rows were stored with the zone's spelling, the payload has the same
    const { data, error } = await supabase
      .from('usl_mix_game_players')
      .update(patch)
      .eq('game_id', f.game_id)
      .ilike('alias', f.alias)
      .select('id');
    results.push({ game_id: f.game_id, alias: f.alias, updated: data?.length ?? 0, ...(error ? { error: error.message } : {}) });
  }

  let recompute: unknown = null;
  if (body?.recompute === true) {
    try {
      recompute = await recomputeAllRatings(supabase);
    } catch (e: any) {
      return NextResponse.json({ success: false, results, error: e?.message || 'recompute failed after the fixes' }, { status: 500 });
    }
  }
  const updated = results.reduce((n, r) => n + r.updated, 0);
  const missed = results.filter((r) => r.updated === 0);
  return NextResponse.json({ success: true, updated, missed, results, recompute });
}
