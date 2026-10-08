import { NextRequest, NextResponse } from 'next/server';
import { loadForMatch, viewerFor, zoneAutomationEnabled } from '@/lib/match-setup-server';
import { selectZoneQueueMatches } from '@/lib/zone-queue-select';

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
/** What the arena says a minute before the match timer ends (%30 is the in-game bong). */
const ONE_MINUTE_TEXT = 'Match will start on the second restart. Good luck to both teams and have fun!!! %30';

/** The two announcements for a match, worded here so staff can change them without a zone change. */
function announceFor(p: any): { opened: string; one_minute: string } {
  const when = new Date(p.match.scheduled_at);
  const fmt = (tz: string) => when.toLocaleTimeString('en-US', { timeZone: tz, hour: 'numeric', minute: '2-digit', timeZoneName: 'short' });
  const league = String(p.match.league_slug || 'league').toUpperCase();
  const kind = p.match.stage === 'fs' ? ` FS ${p.match.fs_color === 'green' ? 'Green' : 'Red'}` : p.match.stage === 'playoff' ? ' playoffs' : '';
  const home = p.home?.tag || 'home', away = p.away?.tag || 'away';
  const missing: string[] = [];
  if (!p.progress?.side_picked) missing.push(`${home}'s side pick`);
  if (!p.progress?.home_lineup_set) missing.push(`${home}'s lineup`);
  if (!p.progress?.away_lineup_set) missing.push(`${away}'s lineup`);
  const url = `freeinf.org/matches/${p.match.id}`;
  const opened = `${league}${kind}: ${away} vs ${home} at ${fmt('America/Los_Angeles')} (${fmt('America/New_York')}). ` +
    (missing.length
      ? `Captains/co-captains: still needed on ${url}: ${missing.join(', ')}.`
      : `Side and lineups are set on ${url}; players are placed 5 minutes before the match.`);
  return { opened, one_minute: ONE_MINUTE_TEXT };
}

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

  const { data, error } = await selectZoneQueueMatches({ hours, past, league, now });
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
      /** Text the zone relays: `opened` as a *zone message when the arena is opened, `one_minute` as an *arena message a minute before the timer ends. */
      announce: announceFor(p),
      updated_at: p.updated_at,
      game_id: p.match.game_id,
    });
  }

  return NextResponse.json(
    { generated_at: new Date(now).toISOString(), window_hours: hours, automation: 'on', matches },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
