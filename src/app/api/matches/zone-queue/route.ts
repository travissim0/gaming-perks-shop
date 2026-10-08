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

/** A squad's captain and co-captains: who the zone whispers when something is still missing. */
const leadersOf = (block: any): string[] =>
  ((block?.roster || []) as any[]).filter((m) => m.role === 'captain' || m.role === 'co_captain').map((m) => m.alias).filter(Boolean);

/** How a captain picks the side in game. Kept to one short instruction. */
const SIDE_HOW = 'type ?side titan or ?side collective';

/** Minutes before kick-off at which the zone repeats the zone-wide reminder. */
const REMINDER_MINUTES = [30, 15, 5];

type CaptainReminder = { squad_tag: string; aliases: string[]; missing: string[]; message: string };

/**
 * One whisper per squad that still has something to do before players can be placed: the home
 * squad's side pick and lineup, the away squad's lineup. Empty once both are ready. The zone sends
 * each `message` privately to every alias online, repeating as kick-off nears.
 */
function captainRemindersFor(p: any): CaptainReminder[] {
  const out: CaptainReminder[] = [];
  const add = (block: any, missing: string[]) => {
    const aliases = leadersOf(block);
    const tag = block?.tag || '?';
    if (!missing.length || !aliases.length) return;
    const side = missing.includes('side'), lineup = missing.includes('lineup');
    const message = side && lineup
      ? `[${tag}] To start your match: ${SIDE_HOW}, and set your lineup on freeinf.org.`
      : side
        ? `[${tag}] To start your match, pick your side: ${SIDE_HOW}.`
        : `[${tag}] To start your match, set your lineup on freeinf.org.`;
    out.push({ squad_tag: tag, aliases, missing, message });
  };
  const homeMissing: string[] = [];
  if (!p.progress?.side_picked) homeMissing.push('side');
  if (!p.progress?.home_lineup_set) homeMissing.push('lineup');
  add(p.home, homeMissing);
  add(p.away, p.progress?.away_lineup_set ? [] : ['lineup']);
  return out;
}

/**
 * The announcements for a match, worded here so staff can change them without a zone change.
 * `reminders`: the zone-wide line for each of the 30 / 15 / 5 minute marks (`opened` is the 30 one).
 * Each says what is still holding the match up, in one short instruction.
 */
function announceFor(p: any): {
  opened: string; reminders: { at_min: number; message: string }[]; one_minute: string; captains: CaptainReminder[];
} {
  const when = new Date(p.match.scheduled_at);
  const fmt = (tz: string) => when.toLocaleTimeString('en-US', { timeZone: tz, hour: 'numeric', minute: '2-digit', timeZoneName: 'short' });
  const league = String(p.match.league_slug || 'league').toUpperCase();
  const kind = p.match.stage === 'fs' ? ` FS ${p.match.fs_color === 'green' ? 'Green' : 'Red'}` : p.match.stage === 'playoff' ? ' playoffs' : '';
  const home = p.home?.tag || 'home', away = p.away?.tag || 'away';
  const lineups = [!p.progress?.home_lineup_set && home, !p.progress?.away_lineup_set && away].filter(Boolean) as string[];
  const todo: string[] = [];
  if (!p.progress?.side_picked) todo.push(`${home} captain: ${SIDE_HOW}.`);
  if (lineups.length) todo.push(`Lineup needed from ${lineups.join(' and ')} on freeinf.org.`);
  const status = todo.length ? todo.join(' ') : 'Sides and lineups are set.';
  const line = (mins: number) => `${league}${kind}: ${away} vs ${home} in ${mins} min (${fmt('America/Los_Angeles')} / ${fmt('America/New_York')}). ${status}`;
  const reminders = REMINDER_MINUTES.map((m) => ({ at_min: m, message: line(m) }));
  return { opened: reminders[0].message, reminders, one_minute: ONE_MINUTE_TEXT, captains: captainRemindersFor(p) };
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
      home: p.home && { squad_id: p.home.squad_id, tag: p.home.tag, name: p.home.name, side: p.home.side, team_starting: p.home.team_starting, team_bench: p.home.team_bench, leaders: leadersOf(p.home) },
      away: p.away && { squad_id: p.away.squad_id, tag: p.away.tag, name: p.away.name, side: p.away.side, team_starting: p.away.team_starting, team_bench: p.away.team_bench, leaders: leadersOf(p.away) },
      progress: p.progress,
      client: p.client,
      subs: p.subs,
      /** Text the zone relays: `reminders` (30 / 15 / 5 min; `opened` = the 30 one) as *zone messages, `one_minute` as an *arena message a minute before the timer ends, `captains` as whispers to captains with something still to do. */
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
