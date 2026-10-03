import { NextRequest, NextResponse } from 'next/server';
import { loadForMatch, supabaseAdmin, viewerFor, zoneAutomationEnabled } from '@/lib/match-setup-server';

export const dynamic = 'force-dynamic';

/**
 * GET /api/matches/zone-queue — what the zone's match automation needs, in one call.
 *
 * Header `X-Client-Key: <MATCH_CLIENT_KEY>` (or a staff Bearer token).
 *   ?hours=6      look-ahead window (1..48), default 6
 *   ?league=ctfdl restrict to one league (default: every league match)
 *   ?past=2       also include matches that started up to N hours ago (default 2, so a
 *                 running match keeps appearing while subs come in)
 *
 * Returns each scheduled league match with two squads set: its arena name
 * ("CTFDL - KEVI vs NSS", home first), times, the side/lineup block exactly as
 * /api/matches/[id]/setup returns it for the client (four team names, each player's
 * team and whether they sit in spec), the subs so far, and `updated_at` so the zone can
 * skip unchanged matches. See docs/zone-match-automation.md.
 */
export async function GET(request: NextRequest) {
  const viewer = await viewerFor(request);
  if (!viewer.client && !viewer.staff) return NextResponse.json({ error: 'Client key or staff token required' }, { status: 403 });

  const q = request.nextUrl.searchParams;
  const hours = Math.min(48, Math.max(1, parseInt(q.get('hours') || '6') || 6));
  const past = Math.min(24, Math.max(0, parseInt(q.get('past') || '2') || 0));
  const league = (q.get('league') || '').trim().toLowerCase();

  const now = Date.now();

  // Site-wide switch (CTF management → Season → Zone automation). Off = an empty queue, so the
  // zone opens nothing, places nobody and applies no subs, without any change on the zone side.
  if (!(await zoneAutomationEnabled())) {
    return NextResponse.json(
      { generated_at: new Date(now).toISOString(), window_hours: hours, automation: 'off', matches: [] },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  }

  const run = (skip: string[]) => {
    const extra = ['fs_color', 'fs_status'].filter((c) => !skip.includes(c));
    let query = supabaseAdmin
      .from('matches')
      .select(['id, title, scheduled_at, status, match_type, league_slug, season_number, week, stage, playoff_round, squad_a_id, squad_b_id, game_id', ...extra].join(', '))
      .in('status', ['scheduled', 'in_progress'])
      .not('squad_a_id', 'is', null)
      .not('squad_b_id', 'is', null)
      .gte('scheduled_at', new Date(now - past * 3_600_000).toISOString())
      .lte('scheduled_at', new Date(now + hours * 3_600_000).toISOString())
      .order('scheduled_at', { ascending: true })
      .limit(50);
    // "Time TBD" fixtures have no kick-off time (scheduled_at is only their play-by day), so the
    // zone must not open an arena for them. They join the queue once staff set a real time.
    if (!skip.includes('time_tbd')) query = query.eq('time_tbd', false);
    // Per-match switch: staff marked this one to be run by hand.
    if (!skip.includes('manual_zone')) query = query.eq('manual_zone', false);
    if (league) query = query.eq('league_slug', league);
    else query = query.not('league_slug', 'is', null);
    return query;
  };

  // Each optional column arrives with its own SQL file; drop a filter whose column is missing.
  const skip: string[] = [];
  let { data, error } = await run(skip);
  for (let i = 0; i < 4 && error; i++) {
    const col = ['time_tbd', 'manual_zone', 'fs_color', 'fs_status'].find((c) => !skip.includes(c) && error!.message.includes(c));
    if (!col) break;
    skip.push(col);
    ({ data, error } = await run(skip));
  }
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const matches = [];
  for (const m of (data || []) as any[]) {
    // An FS proposal the other captain hasn't accepted yet is not a match: no arena for it.
    if (m.stage === 'fs' && m.fs_status && m.fs_status !== 'accepted') continue;
    const payload = await loadForMatch(m, viewer);
    if (!payload || 'pending_sql' in payload) continue;
    const p = payload as any;
    matches.push({
      id: p.match.id,
      arena: p.match.arena,
      title: p.match.title,
      league_slug: p.match.league_slug,
      season_number: p.match.season_number,
      week: p.match.week,
      stage: p.match.stage,
      /** FS only: 'red' | 'green'. Green: `client.players` already leaves out everyone who may not play. */
      fs_color: p.match.fs_color,
      status: p.match.status,
      scheduled_at: p.match.scheduled_at,
      side_reveal_at: p.side_reveal_at,
      side_released: p.side_released,
      /** Minutes until the scheduled time (negative once it has started). Also the arena's `*timer` value when it is opened; re-set it if scheduled_at moves. */
      starts_in_min: Math.round((new Date(p.match.scheduled_at).getTime() - now) / 60_000),
      home: p.home && { squad_id: p.home.squad_id, tag: p.home.tag, name: p.home.name, side: p.home.side, team_starting: p.home.team_starting, team_bench: p.home.team_bench },
      away: p.away && { squad_id: p.away.squad_id, tag: p.away.tag, name: p.away.name, side: p.away.side, team_starting: p.away.team_starting, team_bench: p.away.team_bench },
      progress: p.progress,
      client: p.client,
      subs: p.subs,
      updated_at: p.updated_at,
      game_id: p.match.game_id,
    });
  }

  return NextResponse.json(
    { generated_at: new Date(now).toISOString(), window_hours: hours, automation: 'on', matches },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
