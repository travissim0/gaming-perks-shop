import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, viewerFor, zoneAutomationEnabled, sideReleased, sideRevealAt } from '@/lib/match-setup-server';
import { selectZoneQueueMatches } from '@/lib/zone-queue-select';

export const dynamic = 'force-dynamic';

/**
 * GET /api/matches/zone-queue/changes - the cheap "did anything change?" check for the zone.
 *
 * Same auth (X-Client-Key / staff token) and the same ?hours / ?past / ?league parameters as
 * /api/matches/zone-queue, and it applies the SAME match filters (shared selectZoneQueueMatches).
 * It returns only { id, status, scheduled_at, side_released, updated_at } per match - no lineups,
 * no squads - so the zone can ask every ~2 seconds while a match is live and fetch the full queue
 * only when something moved. `updated_at` is computed exactly as in the full payload (setup,
 * lineups, subs and the side release), so the two always agree.
 */
export async function GET(request: NextRequest) {
  const viewer = await viewerFor(request);
  if (!viewer.client && !viewer.staff) return NextResponse.json({ error: 'Client key or staff token required' }, { status: 403 });

  const q = request.nextUrl.searchParams;
  const hours = Math.min(48, Math.max(1, parseInt(q.get('hours') || '6') || 6));
  const past = Math.min(24, Math.max(0, parseInt(q.get('past') || '2') || 0));
  const league = (q.get('league') || '').trim().toLowerCase();
  const now = Date.now();
  const headers = { 'Cache-Control': 'no-store' };

  if (!(await zoneAutomationEnabled())) {
    return NextResponse.json({ generated_at: new Date(now).toISOString(), automation: 'off', matches: [] }, { headers });
  }

  const { data, error } = await selectZoneQueueMatches({ hours, past, league, now });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // An FS proposal the other captain hasn't accepted is not a match (same rule as the full queue).
  const rows = data.filter((m) => !(m.stage === 'fs' && m.fs_status && m.fs_status !== 'accepted'));
  const ids = rows.map((m) => m.id as string);

  // Three batched reads for ALL matches (not three per match). A missing table just means no stamps.
  const stamps = new Map<string, number[]>();
  const add = (matchId: string, t: unknown) => {
    const n = t ? new Date(t as string).getTime() : NaN;
    if (!Number.isFinite(n)) return;
    const list = stamps.get(matchId);
    if (list) list.push(n); else stamps.set(matchId, [n]);
  };
  if (ids.length) {
    const [setup, lineups, subs] = await Promise.all([
      supabaseAdmin.from('match_setup').select('match_id, updated_at').in('match_id', ids),
      supabaseAdmin.from('match_lineups').select('match_id, updated_at').in('match_id', ids),
      supabaseAdmin.from('match_lineup_subs').select('match_id, created_at').in('match_id', ids),
    ]);
    (setup.data || []).forEach((r: any) => add(r.match_id, r.updated_at));
    (lineups.data || []).forEach((r: any) => add(r.match_id, r.updated_at));
    (subs.data || []).forEach((r: any) => add(r.match_id, r.created_at));
  }

  const matches = rows.map((m) => {
    const released = sideReleased(m);
    if (released) add(m.id, sideRevealAt(m));
    const list = stamps.get(m.id) || [];
    return {
      id: m.id as string,
      status: m.status as string,
      scheduled_at: m.scheduled_at as string,
      side_released: released,
      updated_at: list.length ? new Date(Math.max(...list)).toISOString() : null,
    };
  });

  return NextResponse.json({ generated_at: new Date(now).toISOString(), automation: 'on', matches }, { headers });
}
