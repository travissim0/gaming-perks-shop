import { NextRequest, NextResponse } from 'next/server';
import { loadForMatch, supabaseAdmin, viewerFor } from '@/lib/match-setup-server';

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
  let query = supabaseAdmin
    .from('matches')
    .select('id, title, scheduled_at, status, match_type, league_slug, season_number, week, stage, playoff_round, squad_a_id, squad_b_id, game_id')
    .in('status', ['scheduled', 'in_progress'])
    .not('squad_a_id', 'is', null)
    .not('squad_b_id', 'is', null)
    .gte('scheduled_at', new Date(now - past * 3_600_000).toISOString())
    .lte('scheduled_at', new Date(now + hours * 3_600_000).toISOString())
    .order('scheduled_at', { ascending: true })
    .limit(50);
  if (league) query = query.eq('league_slug', league);
  else query = query.not('league_slug', 'is', null);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const matches = [];
  for (const m of data || []) {
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
      status: p.match.status,
      scheduled_at: p.match.scheduled_at,
      side_reveal_at: p.side_reveal_at,
      side_released: p.side_released,
      /** Minutes until the scheduled time (negative once it has started). */
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
    { generated_at: new Date(now).toISOString(), window_hours: hours, matches },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
