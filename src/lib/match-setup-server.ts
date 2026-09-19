import { NextRequest } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { timingSafeEqual } from 'crypto';
import { supabase } from '@/lib/supabase';
import { getSetting } from '@/lib/site-settings';

/**
 * Match setup: the home team's side and both teams' lineups. PRIVATE.
 * Shared by /api/matches/[id]/setup (captains, staff, the game client) and
 * /api/matches/zone-queue (the zone's automation).
 *
 * Who sees what:
 *   - staff, or the game client (header `X-Client-Key: <MATCH_CLIENT_KEY>`): everything, incl. the `client` block
 *   - home captain/co-captain: the side + the home lineup
 *   - away captain/co-captain: the away lineup; the side once it is released
 *   - referees: both lineups once the side is released (they run the match), never before
 *   - everyone else: whether the side and each lineup have been submitted; the side once released
 *   The side is released to everyone 5 minutes before the scheduled time. Lineups stay private.
 *
 * Team naming: the home side's starters play on "<TAG> T" or "<TAG> C"
 * (Titan / Collective); their bench sits in spec on the other one. The away
 * team gets the opposite side. So KEVI home picking Titan gives
 * KEVI T (starters) / KEVI C (bench) and NSS C (starters) / NSS T (bench).
 */

export const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

export type Side = 'titan' | 'collective';
/** Starters per side: matches are 10v10 (John, 2026-09-17). Fewer is allowed, more is not. */
export const STARTERS = 10;
export const LETTER: Record<Side, 'T' | 'C'> = { titan: 'T', collective: 'C' };
export const OTHER: Record<Side, Side> = { titan: 'collective', collective: 'titan' };

export interface Member { player_id: string; alias: string; role: 'captain' | 'co_captain' | 'player' }
export interface SquadRow { id: string; name: string; tag: string | null; captain_id: string | null }
export type Squad = SquadRow & { members: Member[] };
export interface Viewer { id: string | null; alias: string; staff: boolean; referee: boolean; client: boolean }

export const tagOf = (s: SquadRow) => (s.tag || s.name).slice(0, 8).toUpperCase();
export const missingTable = (msg: string | undefined) => /match_setup|match_lineups|match_lineup_subs|does not exist/i.test(String(msg || ''));

/**
 * The in-game arena the zone opens for a match. The CTFDL rulebook fixes the format:
 * "CTFDL: <Away> vs <Home>" (e.g. "CTFDL: CBC vs 7P"), away first, colon after the league.
 */
export const arenaNameFor = (match: any, home: SquadRow | null, away: SquadRow | null) => {
  const league = String(match.league_slug || 'ctf').toUpperCase();
  return `${league}: ${away ? tagOf(away) : 'TBD'} vs ${home ? tagOf(home) : 'TBD'}`;
};

export async function loadMatch(id: string) {
  const { data, error } = await supabaseAdmin
    .from('matches')
    .select('id, title, scheduled_at, status, match_type, league_slug, season_number, week, stage, playoff_round, squad_a_id, squad_b_id, game_id')
    .eq('id', id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data as any | null;
}

export async function loadSquads(ids: string[]): Promise<Record<string, Squad>> {
  if (ids.length === 0) return {};
  const [{ data: squads }, { data: members }] = await Promise.all([
    supabaseAdmin.from('squads').select('id, name, tag, captain_id').in('id', ids),
    supabaseAdmin.from('squad_members').select('squad_id, player_id, role, profiles!squad_members_player_id_fkey(in_game_alias)').in('squad_id', ids).eq('status', 'active'),
  ]);
  const out: Record<string, Squad> = {};
  (squads || []).forEach((s: any) => { out[s.id] = { id: s.id, name: s.name, tag: s.tag ?? null, captain_id: s.captain_id ?? null, members: [] }; });
  (members || []).forEach((m: any) => {
    const sq = out[m.squad_id];
    if (!sq) return;
    const role = sq.captain_id === m.player_id ? 'captain' : m.role === 'co_captain' ? 'co_captain' : m.role === 'captain' ? 'captain' : 'player';
    sq.members.push({ player_id: m.player_id, alias: m.profiles?.in_game_alias || 'Unknown', role });
  });
  Object.values(out).forEach((s) => s.members.sort((a, b) => (a.role === 'captain' ? -1 : b.role === 'captain' ? 1 : a.alias.localeCompare(b.alias))));
  return out;
}

/** Does the request carry the game client's shared key? */
export async function hasClientKey(request: NextRequest): Promise<boolean> {
  const clientKey = request.headers.get('X-Client-Key');
  if (!clientKey) return false;
  const expected = await getSetting('MATCH_CLIENT_KEY');
  const a = Buffer.from(clientKey);
  const b = Buffer.from(expected);
  return !!expected && a.length === b.length && timingSafeEqual(a, b);
}

/** Who is asking: a signed-in user (Bearer), the game client (X-Client-Key), or nobody. */
export async function viewerFor(request: NextRequest): Promise<Viewer> {
  if (await hasClientKey(request)) return { id: null, alias: 'Game client', staff: false, referee: false, client: true };
  const authHeader = request.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) return { id: null, alias: '', staff: false, referee: false, client: false };
  const { data: { user }, error } = await supabase.auth.getUser(authHeader.slice(7));
  if (error || !user) return { id: null, alias: '', staff: false, referee: false, client: false };
  const { data: p } = await supabaseAdmin.from('profiles').select('is_admin, ctf_role, in_game_alias').eq('id', user.id).maybeSingle();
  const role = String((p as any)?.ctf_role || '').toLowerCase();
  return {
    id: user.id,
    alias: (p as any)?.in_game_alias || 'Staff',
    staff: !!p && (p.is_admin === true || role === 'ctf_admin'),
    referee: role.includes('referee'),
    client: false,
  };
}

export const leads = (sq: Squad | null | undefined, userId: string | null) =>
  !!sq && !!userId && (sq.captain_id === userId || sq.members.some((m) => m.player_id === userId && m.role !== 'player'));

export const isLocked = (match: any) =>
  match.status === 'completed' || match.status === 'cancelled' || match.status === 'expired' || Date.now() >= new Date(match.scheduled_at).getTime();

/** Subs are allowed from side release until the match is recorded. */
export const isSubWindow = (match: any) =>
  !['completed', 'cancelled', 'expired'].includes(match.status) && sideReleased(match);

/** The home side is released to the away squad and the public this long before the scheduled time. */
export const SIDE_REVEAL_MS = 5 * 60 * 1000;
export const sideRevealAt = (match: any) => new Date(new Date(match.scheduled_at).getTime() - SIDE_REVEAL_MS).toISOString();
export const sideReleased = (match: any) => Date.now() >= new Date(match.scheduled_at).getTime() - SIDE_REVEAL_MS;

export interface SubRow { id: string; squad_id: string; out_player_id: string; in_player_id: string; by_id: string | null; by_alias: string | null; created_at: string; out_alias?: string; in_alias?: string }

export function buildPayload(match: any, setupRow: any, squads: Record<string, Squad>, lineupRows: any[], subs: SubRow[], viewer: Viewer) {
  const home = match.squad_a_id ? squads[match.squad_a_id] : null;
  const away = match.squad_b_id ? squads[match.squad_b_id] : null;
  const side: Side | null = setupRow?.home_side || null;
  const locked = isLocked(match);

  const teamNames = (sq: SquadRow | null, s: Side | null) => {
    if (!sq || !s) return { starting: null as string | null, bench: null as string | null };
    const tag = tagOf(sq);
    return { starting: `${tag} ${LETTER[s]}`, bench: `${tag} ${LETTER[OTHER[s]]}` };
  };
  const homeNames = teamNames(home, side);
  const awayNames = teamNames(away, side ? OTHER[side] : null);

  type Entry = { player_id: string; alias: string; position: number };
  const bySquad: Record<string, { starting: Entry[]; bench: Entry[] }> = {};
  for (const sq of [home, away]) if (sq) bySquad[sq.id] = { starting: [], bench: [] };
  const aliasOf = new Map<string, string>();
  Object.values(squads).forEach((s) => s.members.forEach((m) => aliasOf.set(m.player_id, m.alias)));
  lineupRows.forEach((l: any) => {
    const b = bySquad[l.squad_id];
    if (!b) return;
    (l.slot === 'starting' ? b.starting : b.bench).push({ player_id: l.player_id, alias: aliasOf.get(l.player_id) || 'Unknown', position: l.position });
  });
  Object.values(bySquad).forEach((b) => { b.starting.sort((x, y) => x.position - y.position); b.bench.sort((x, y) => x.position - y.position); });

  const homeSet = !!home && bySquad[home.id].starting.length > 0;
  const awaySet = !!away && bySquad[away.id].starting.length > 0;
  const ready = !!side && homeSet && awaySet;

  // ---- Visibility ---------------------------------------------------------
  const full = viewer.staff || viewer.client;
  const leadsHome = leads(home, viewer.id);
  const leadsAway = leads(away, viewer.id);
  const released = sideReleased(match);
  const refSees = viewer.referee && released;
  const seeSide = full || leadsHome || released;
  const seeHome = full || leadsHome || refSees;
  const seeAway = full || leadsAway || refSees;
  const subWindow = isSubWindow(match);

  const teamBlock = (sq: Squad | null, s: Side | null, names: { starting: string | null; bench: string | null }, reveal: boolean) =>
    sq
      ? {
          squad_id: sq.id, name: sq.name, tag: tagOf(sq), roster: sq.members,
          side: seeSide ? s : null,
          team_starting: seeSide ? names.starting : null,
          team_bench: seeSide ? names.bench : null,
          lineup: reveal ? bySquad[sq.id] : null,
        }
      : null;

  const players: { alias: string; player_id: string; squad_tag: string; team: string; spec: boolean; slot: 'starting' | 'bench' }[] = [];
  if (full) {
    const push = (sq: Squad | null, names: { starting: string | null; bench: string | null }) => {
      if (!sq || !names.starting || !names.bench) return;
      bySquad[sq.id].starting.forEach((p) => players.push({ alias: p.alias, player_id: p.player_id, squad_tag: tagOf(sq), team: names.starting!, spec: false, slot: 'starting' }));
      bySquad[sq.id].bench.forEach((p) => players.push({ alias: p.alias, player_id: p.player_id, squad_tag: tagOf(sq), team: names.bench!, spec: true, slot: 'bench' }));
    };
    push(home, homeNames);
    push(away, awayNames);
  }

  const subsOut = subs
    .filter((s) => full || (s.squad_id === home?.id && seeHome) || (s.squad_id === away?.id && seeAway))
    .map((s) => ({ ...s, out_alias: aliasOf.get(s.out_player_id) || 'Unknown', in_alias: aliasOf.get(s.in_player_id) || 'Unknown' }));

  return {
    match: {
      id: match.id, title: match.title, scheduled_at: match.scheduled_at, status: match.status,
      league_slug: match.league_slug, season_number: match.season_number, week: match.week, stage: match.stage, playoff_round: match.playoff_round,
      locked,
      game_id: match.game_id || null,
      arena: arenaNameFor(match, home, away),
    },
    home: teamBlock(home, side, homeNames, seeHome),
    away: teamBlock(away, side ? OTHER[side] : null, awayNames, seeAway),
    /** Public progress flags — no values. */
    progress: { side_picked: !!side, home_lineup_set: homeSet, away_lineup_set: awaySet, ready },
    /** Starters per side (10v10). */
    starters: STARTERS,
    side_chosen_at: seeSide ? setupRow?.side_chosen_at || null : null,
    /** When the home side becomes visible to the away squad and the public (5 min before the match). */
    side_reveal_at: sideRevealAt(match),
    side_released: released,
    /** Substitutions made so far (visible to whoever may see that squad's lineup). */
    subs: subsOut,
    /** Latest change to the desired placement; the zone re-reads when this moves. */
    updated_at: [setupRow?.updated_at, ...lineupRows.map((l: any) => l.updated_at), ...subs.map((s) => s.created_at)].filter(Boolean).sort().pop() || null,
    client: full
      ? { ready, teams: side && home && away ? [homeNames.starting, homeNames.bench, awayNames.starting, awayNames.bench] : [], players }
      : null,
    viewer: viewer.id || viewer.staff
      ? {
          is_staff: viewer.staff,
          is_referee: viewer.referee,
          leads_home: leadsHome,
          leads_away: leadsAway,
          can_pick_side: viewer.staff || (!locked && leadsHome),
          can_edit_home: viewer.staff || (!locked && leadsHome),
          can_edit_away: viewer.staff || (!locked && leadsAway),
          // Subs: captains/co-captains of that squad, staff and referees, from side release until the match is recorded.
          can_sub_home: subWindow && (viewer.staff || viewer.referee || leadsHome),
          can_sub_away: subWindow && (viewer.staff || viewer.referee || leadsAway),
          sub_window: subWindow,
        }
      : null,
  };
}

export async function loadSubs(id: string): Promise<{ subs: SubRow[]; missing: boolean }> {
  const { data, error } = await supabaseAdmin
    .from('match_lineup_subs')
    .select('id, squad_id, out_player_id, in_player_id, by_id, created_at, by:profiles!match_lineup_subs_by_id_fkey(in_game_alias)')
    .eq('match_id', id)
    .order('created_at', { ascending: true });
  if (error) return { subs: [], missing: /match_lineup_subs/.test(error.message) || /does not exist/.test(error.message) };
  return { subs: (data || []).map((s: any) => ({ id: s.id, squad_id: s.squad_id, out_player_id: s.out_player_id, in_player_id: s.in_player_id, by_id: s.by_id, by_alias: s.by?.in_game_alias || null, created_at: s.created_at })), missing: false };
}

export async function loadAll(id: string, viewer: Viewer) {
  const match = await loadMatch(id);
  if (!match) return null;
  return loadForMatch(match, viewer);
}

/** Same as loadAll, for a match row already in hand (the zone queue loads many). */
export async function loadForMatch(match: any, viewer: Viewer) {
  const ids = [match.squad_a_id, match.squad_b_id].filter(Boolean) as string[];
  const [squads, setupRes, lineupRes, subsRes] = await Promise.all([
    loadSquads(ids),
    supabaseAdmin.from('match_setup').select('home_side, side_chosen_at, side_chosen_by, updated_at').eq('match_id', match.id).maybeSingle(),
    supabaseAdmin.from('match_lineups').select('squad_id, player_id, slot, position, updated_at').eq('match_id', match.id),
    loadSubs(match.id),
  ]);
  if ((setupRes.error && missingTable(setupRes.error.message)) || (lineupRes.error && missingTable(lineupRes.error.message))) return { pending_sql: true };
  return buildPayload(match, setupRes.data, squads, lineupRes.data || [], subsRes.subs, viewer);
}
