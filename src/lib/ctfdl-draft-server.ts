/**
 * CTFDL draft — server-side helpers (service role). Import only from API routes.
 */
import { createClient } from '@supabase/supabase-js';
import type { NextRequest } from 'next/server';
import { supabase } from '@/lib/supabase';
import { getLeagues, getOpenSeason, getLatestSeason } from '@/lib/leagues';
import { draftStamp, leadsTeam, type DraftBoard, type DraftBundle, type DraftMe, type DraftPick, type DraftPlayer, type DraftPresence, type DraftRow, type DraftState, type DraftTeam } from '@/lib/ctfdl-draft';

export const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

export async function userFromRequest(request: NextRequest) {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) return null;
  const { data: { user }, error } = await supabase.auth.getUser(authHeader.slice(7));
  return error || !user ? null : user;
}

export async function isStaff(userId: string): Promise<boolean> {
  const { data } = await supabaseAdmin.from('profiles').select('is_admin, ctf_role').eq('id', userId).maybeSingle();
  return !!data && (data.is_admin === true || data.ctf_role === 'ctf_admin');
}

export async function ctfdlLeague() {
  const leagues = await getLeagues();
  return leagues.find((l) => l.slug === 'ctfdl') || null;
}

/**
 * Resolve which draft to show: an explicit id, else the draft for CTFDL's
 * open season, else the most recently created draft (for recaps).
 */
export async function resolveDraft(draftId?: string | null, seasonId?: string | null): Promise<DraftRow | null> {
  if (draftId) {
    const { data } = await supabaseAdmin.from('ctfdl_drafts').select('*').eq('id', draftId).maybeSingle();
    return (data as DraftRow) || null;
  }
  if (seasonId) {
    const { data } = await supabaseAdmin.from('ctfdl_drafts').select('*').eq('league_season_id', seasonId).maybeSingle();
    return (data as DraftRow) || null;
  }
  const league = await ctfdlLeague();
  if (league) {
    const open = (await getOpenSeason(league)) || (await getLatestSeason(league));
    if (open) {
      const { data } = await supabaseAdmin.from('ctfdl_drafts').select('*').eq('league_season_id', open.id).maybeSingle();
      if (data) return data as DraftRow;
    }
  }
  const { data } = await supabaseAdmin.from('ctfdl_drafts').select('*').order('created_at', { ascending: false }).limit(1).maybeSingle();
  return (data as DraftRow) || null;
}

export async function loadTeams(draftId: string): Promise<DraftTeam[]> {
  const { data } = await supabaseAdmin
    .from('ctfdl_draft_teams')
    .select('id, squad_id, pick_order, squads(name, tag, captain_id)')
    .eq('draft_id', draftId)
    .order('pick_order');
  const rows = (data || []) as any[];
  const captainIds = rows.map((r) => r.squads?.captain_id).filter(Boolean);
  const aliasById: Record<string, string> = {};
  if (captainIds.length > 0) {
    const { data: profs } = await supabaseAdmin.from('profiles').select('id, in_game_alias').in('id', captainIds);
    (profs || []).forEach((p: any) => { aliasById[p.id] = p.in_game_alias; });
  }
  // Co-captains share the captain's draft powers.
  const coBySquad: Record<string, string[]> = {};
  if (rows.length > 0) {
    const { data: cos } = await supabaseAdmin
      .from('squad_members')
      .select('squad_id, player_id')
      .in('squad_id', rows.map((r) => r.squad_id))
      .eq('status', 'active')
      .eq('role', 'co_captain');
    (cos || []).forEach((m: any) => { (coBySquad[m.squad_id] ||= []).push(m.player_id); });
  }
  return rows.map((r) => ({
    id: r.id,
    squad_id: r.squad_id,
    pick_order: r.pick_order,
    squad_name: r.squads?.name || 'Unknown squad',
    squad_tag: r.squads?.tag || null,
    captain_id: r.squads?.captain_id || null,
    captain_alias: r.squads?.captain_id ? aliasById[r.squads.captain_id] || null : null,
    co_captain_ids: coBySquad[r.squad_id] || [],
  }));
}

export async function loadPicks(draftId: string): Promise<DraftPick[]> {
  const { data } = await supabaseAdmin
    .from('ctfdl_draft_picks')
    .select('id, overall, round, team_id, player_id, pick_type, created_at')
    .eq('draft_id', draftId)
    .order('overall');
  return (data || []) as DraftPick[];
}

/** A CTF staff member for Staff ADP: a site admin or anyone holding a CTF role. */
export const hasStaffRole = (p: { is_admin?: boolean | null; ctf_role?: string | null }) =>
  p.is_admin === true || (!!p.ctf_role && p.ctf_role !== 'none');

/**
 * Staff ADP — the staff ranking. Since 2026-09-27 it is no longer hand-ordered: it is the average
 * predicted pick across every mock-draft board posted by staff (see hasStaffRole), no minimum.
 * Drafting captains' boards are private and never counted, even if the captain holds a staff role.
 * Positions are recounted per board after dropping players who left the pool and the author
 * themself. Returns rank 1..n (players on no staff board get no rank) and how many boards counted.
 * Boards lock when the draft leaves setup, so the ranking can't move mid-draft.
 */
export async function staffAdpRanks(seasonId: string, poolIds: Set<string>, excludeAuthors: Set<string>): Promise<{ rankById: Record<string, number>; boards: number }> {
  const { data: rows, error } = await supabaseAdmin.from('ctfdl_mock_boards').select('user_id, player_ids').eq('league_season_id', seasonId);
  if (error || !rows?.length) return { rankById: {}, boards: 0 };
  const authorIds = [...new Set(rows.map((r: any) => r.user_id as string))].filter((id) => !excludeAuthors.has(id));
  if (authorIds.length === 0) return { rankById: {}, boards: 0 };
  const { data: profs } = await supabaseAdmin.from('profiles').select('id, is_admin, ctf_role').in('id', authorIds);
  const staffIds = new Set(((profs || []) as any[]).filter(hasStaffRole).map((p) => p.id as string));
  const staffRows = (rows as any[]).filter((r) => staffIds.has(r.user_id));

  const acc: Record<string, number[]> = {};
  for (const r of staffRows) {
    (r.player_ids as string[]).filter((id) => poolIds.has(id) && id !== r.user_id).forEach((id, i) => { (acc[id] ||= []).push(i + 1); });
  }
  const ordered = Object.entries(acc)
    .map(([id, pos]) => ({ id, avg: pos.reduce((a, b) => a + b, 0) / pos.length, n: pos.length }))
    .sort((a, b) => a.avg - b.avg || b.n - a.n || a.id.localeCompare(b.id));
  const rankById: Record<string, number> = {};
  ordered.forEach((r, i) => { rankById[r.id] = i + 1; });
  return { rankById, boards: staffRows.length };
}

/** Everyone registered for the season, minus participating captains; picked ones flagged. */
export async function loadPlayers(draftId: string, seasonNumber: number, teams: DraftTeam[], picks: DraftPick[], seasonId: string | null = null): Promise<DraftPlayer[]> {
  return (await loadPlayersWithStaffAdp(draftId, seasonNumber, teams, picks, seasonId)).players;
}

export async function loadPlayersWithStaffAdp(draftId: string, seasonNumber: number, teams: DraftTeam[], picks: DraftPick[], seasonId: string | null): Promise<{ players: DraftPlayer[]; staffBoards: number }> {
  const captainIds = new Set([...teams.map((t) => t.captain_id).filter(Boolean), ...teams.flatMap((t) => t.co_captain_ids)] as string[]);
  const pickByPlayer: Record<string, DraftPick> = {};
  picks.forEach((p) => { if (p.player_id) pickByPlayer[p.player_id] = p; });
  const pickedIds = Object.keys(pickByPlayer);

  // Registration rows for the season. Undrafted players must be active; drafted
  // players are included whatever their is_active flag, because joining a squad
  // can deactivate the pool row and their card still needs to render.
  const [{ data: activeRows }, { data: pickedRows }] = await Promise.all([
    supabaseAdmin
      .from('free_agents')
      .select('*, profiles!free_agents_player_id_fkey(in_game_alias)')
      .eq('is_active', true)
      .eq('league_slug', 'ctfdl')
      .eq('season_number', seasonNumber)
      .order('created_at'),
    pickedIds.length
      ? supabaseAdmin
          .from('free_agents')
          .select('*, profiles!free_agents_player_id_fkey(in_game_alias)')
          .in('player_id', pickedIds)
          .eq('league_slug', 'ctfdl')
          .eq('season_number', seasonNumber)
      : Promise.resolve({ data: [] as any[] }),
  ]);

  const byId: Record<string, any> = {};
  [...((activeRows || []) as any[]), ...((pickedRows || []) as any[])].forEach((r) => { if (!byId[r.player_id]) byId[r.player_id] = r; });

  // If a drafted player's registration row was deleted outright, fall back to
  // a bare profile so the board still shows their name.
  const missing = pickedIds.filter((id) => !byId[id]);
  if (missing.length > 0) {
    const { data: profs } = await supabaseAdmin.from('profiles').select('id, in_game_alias').in('id', missing);
    (profs || []).forEach((p: any) => {
      byId[p.id] = { player_id: p.id, profiles: { in_game_alias: p.in_game_alias }, preferred_roles: [], secondary_roles: [], classes_to_try: [], class_ratings: {}, availability_days: [], availability_times: {}, created_at: pickByPlayer[p.id]?.created_at };
    });
  }

  // Captains and co-captains aren't draftable, so they stay out of the pool. A player who was drafted
  // and made co-captain afterwards is still a pick: they stay on the board with their name.
  const pool = Object.values(byId).filter((r) => !captainIds.has(r.player_id) || !!pickByPlayer[r.player_id]);

  // Staff ADP (averaged staff mock-draft boards) is the staff ranking. The draft row knows its
  // season when the caller doesn't pass one.
  let sid = seasonId;
  if (!sid && draftId) {
    const { data: d } = await supabaseAdmin.from('ctfdl_drafts').select('league_season_id').eq('id', draftId).maybeSingle();
    sid = d?.league_season_id || null;
  }
  const { rankById, boards: staffBoards } = sid
    ? await staffAdpRanks(sid, new Set(pool.map((r) => r.player_id as string)), captainIds)
    : { rankById: {} as Record<string, number>, boards: 0 };

  const players = pool
    .map((r) => ({
      player_id: r.player_id,
      alias: r.profiles?.in_game_alias || 'Unknown',
      preferred_roles: r.preferred_roles || [],
      secondary_roles: r.secondary_roles || [],
      classes_to_try: r.classes_to_try || [],
      class_ratings: r.class_ratings || {},
      availability_days: r.availability_days || [],
      availability_times: r.availability_times || {},
      timezone: r.timezone || null,
      contact_info: r.contact_info || null,
      notes: r.notes || null,
      registered_at: r.created_at,
      staff_rank: rankById[r.player_id] ?? null,
      picked_team_id: pickByPlayer[r.player_id]?.team_id || null,
      picked_overall: pickByPlayer[r.player_id]?.overall ?? null,
    }));
  return { players, staffBoards };
}

export async function loadQueue(draftId: string, teamId: string): Promise<string[]> {
  const { data } = await supabaseAdmin
    .from('ctfdl_draft_queues')
    .select('player_id, rank')
    .eq('draft_id', draftId)
    .eq('team_id', teamId)
    .order('rank');
  return (data || []).map((r: any) => r.player_id);
}

/** The board every viewer shares: teams, picks, the pool. Nothing here depends on who is asking. */
export async function loadBoard(draft: DraftRow | null): Promise<DraftBoard> {
  const leagueOf = (l: Awaited<ReturnType<typeof ctfdlLeague>>) => (l ? { id: l.id, slug: l.slug, name: l.name } : null);
  if (!draft) {
    return { draft: null, teams: [], picks: [], players: [], season: null, league: leagueOf(await ctfdlLeague()), server_time: new Date().toISOString() };
  }
  const [league, { data: season }, teams, picks] = await Promise.all([
    ctfdlLeague(),
    supabaseAdmin.from('league_seasons').select('id, season_number, season_name, status').eq('id', draft.league_season_id).maybeSingle(),
    loadTeams(draft.id),
    loadPicks(draft.id),
  ]);
  const { players, staffBoards } = season
    ? await loadPlayersWithStaffAdp(draft.id, season.season_number, teams, picks, season.id)
    : { players: [] as DraftPlayer[], staffBoards: 0 };
  return {
    draft,
    teams,
    picks,
    players,
    season: season as DraftBundle['season'],
    league: leagueOf(league),
    server_time: new Date().toISOString(),
    staff_adp_boards: staffBoards,
  };
}

/** Who this user is in the draft: alias, staff flag, the team they lead (if any). */
export async function loadViewer(viewerId: string | null, teams: DraftTeam[]): Promise<DraftBundle['viewer']> {
  const viewer = { user_id: viewerId, alias: null as string | null, is_staff: false, my_team_id: null as string | null };
  if (!viewerId) return viewer;
  const { data: me } = await supabaseAdmin.from('profiles').select('in_game_alias, is_admin, ctf_role').eq('id', viewerId).maybeSingle();
  viewer.alias = me?.in_game_alias || null;
  viewer.is_staff = !!me && (me.is_admin === true || me.ctf_role === 'ctf_admin');
  viewer.my_team_id = teams.find((t) => leadsTeam(t, viewerId))?.id || null;
  return viewer;
}

export async function loadBundle(draft: DraftRow | null, viewerId: string | null): Promise<DraftBundle> {
  const board = await loadBoard(draft);
  const viewer = await loadViewer(viewerId, board.teams);
  const bundle: DraftBundle = { ...board, viewer };
  if (draft && viewer.my_team_id) bundle.my_queue = await loadQueue(draft.id, viewer.my_team_id);
  return bundle;
}

// ---- Shared reads ----------------------------------------------------------------------------
// A live draft has everyone in the room asking the same questions at the same moment. These
// answers don't depend on who is asking, so one read is shared by everybody who asks within a
// short window (and by everybody waiting on a read that is already running).

const STATE_TTL_MS = 1000;
const BOARD_TTL_MS = 5000;
/** A forced fresh read is skipped when the copy we have is this new, so a burst of forced reads shares one. */
const FRESH_GAP_MS = 200;

const shared = new Map<string, { at: number; value: Promise<any> }>();

function sharedRead<T>(key: string, ttl: number, load: () => Promise<T>, fresh = false): Promise<T> {
  const hit = shared.get(key);
  if (hit && Date.now() - hit.at < (fresh ? FRESH_GAP_MS : ttl)) return hit.value;
  const value: Promise<T> = load().catch((e) => {
    if (shared.get(key)?.value === value) shared.delete(key);
    throw e;
  });
  shared.set(key, { at: Date.now(), value });
  return value;
}

/** Forget the shared copies after something changed a draft (best effort: this server instance only). */
export function forgetShared(draftId: string) {
  for (const key of [...shared.keys()]) {
    if (key === `state:${draftId}` || key === `teams:${draftId}` || key.startsWith('board:') || key.startsWith('resolve:')) shared.delete(key);
  }
}

const draftKey = (draftId?: string | null, seasonId?: string | null) => (draftId ? `d:${draftId}` : seasonId ? `s:${seasonId}` : 'open');

export function resolveDraftShared(draftId?: string | null, seasonId?: string | null): Promise<DraftRow | null> {
  return sharedRead(`resolve:${draftKey(draftId, seasonId)}`, BOARD_TTL_MS, () => resolveDraft(draftId, seasonId));
}

export function loadTeamsShared(draftId: string): Promise<DraftTeam[]> {
  return sharedRead(`teams:${draftId}`, BOARD_TTL_MS, () => loadTeams(draftId));
}

export function loadBoardShared(draftId?: string | null, seasonId?: string | null, fresh = false): Promise<DraftBoard> {
  return sharedRead(`board:${draftKey(draftId, seasonId)}`, BOARD_TTL_MS, async () => loadBoard(await resolveDraft(draftId, seasonId)), fresh);
}

// ---- Who's in the room (captains + staff) ------------------------------------------------------
// Captains and staff check in every few seconds while the draft page is open (/api/ctfdl/draft/me).
// The lights in the room come from these rows, so they don't depend on a live connection staying up.

/** A check-in counts as "in the room" for this long (a background tab may only check in once a minute). */
const HERE_WINDOW_MS = 90_000;
/** Set when ctfdl_draft_presence isn't installed yet (add-ctfdl-draft-presence.sql); retried after a minute. */
let presenceMissingUntil = 0;

export async function loadHere(draftId: string): Promise<DraftPresence[] | null> {
  if (Date.now() < presenceMissingUntil) return null;
  const { data, error } = await supabaseAdmin
    .from('ctfdl_draft_presence')
    .select('user_id, alias, is_staff, team_id')
    .eq('draft_id', draftId)
    .gt('seen_at', new Date(Date.now() - HERE_WINDOW_MS).toISOString());
  if (error) { presenceMissingUntil = Date.now() + 60_000; return null; }
  return ((data || []) as any[]).map((r) => ({ user_id: r.user_id, alias: r.alias || null, is_staff: !!r.is_staff, team_id: r.team_id || null }));
}

export async function checkIn(draftId: string, viewer: DraftBundle['viewer']): Promise<boolean> {
  if (!viewer.user_id || Date.now() < presenceMissingUntil) return false;
  const { error } = await supabaseAdmin
    .from('ctfdl_draft_presence')
    .upsert({ draft_id: draftId, user_id: viewer.user_id, alias: viewer.alias, is_staff: viewer.is_staff, team_id: viewer.my_team_id, seen_at: new Date().toISOString() }, { onConflict: 'draft_id,user_id' });
  if (error) { presenceMissingUntil = Date.now() + 60_000; return false; }
  return true;
}

/** The draft row and its picks, read fresh. */
export async function loadState(draftId: string): Promise<DraftState> {
  const read = () => Promise.all([
    supabaseAdmin.from('ctfdl_drafts').select('*').eq('id', draftId).maybeSingle(),
    loadPicks(draftId),
  ]);
  const [first, here] = await Promise.all([read(), loadHere(draftId)]);
  let [{ data: draft }, picks] = first;
  // The row and the picks are two reads. If a pick landed between them they disagree (every turn
  // taken has one pick row): read once more so viewers never get a half-applied pick.
  if (draft && picks.length !== (draft as DraftRow).current_pick - 1) [{ data: draft }, picks] = await read();
  return { draft: (draft as DraftRow) || null, picks: draft ? picks : [], here, server_time: new Date().toISOString() };
}

/**
 * The state every viewer polls. `newerThan` is the change a viewer has just heard about (the draft
 * row's updated_at, in ms): if the shared copy is older than that, it is read again rather than
 * handing back a copy from before the pick.
 */
export async function loadStateShared(draftId: string, newerThan = 0): Promise<DraftState> {
  const key = `state:${draftId}`;
  const s = await sharedRead(key, STATE_TTL_MS, () => loadState(draftId));
  if (newerThan && draftStamp(s.draft) < newerThan) return sharedRead(key, STATE_TTL_MS, () => loadState(draftId), true);
  return s;
}

/** Viewer identity + private queue for one user. Shares the draft and team lookups with everyone else. */
export async function loadMe(draftId: string | null, seasonId: string | null, userId: string | null, recordCheckIn: boolean): Promise<DraftMe> {
  const draft = await resolveDraftShared(draftId, seasonId);
  const teams = draft ? await loadTeamsShared(draft.id) : [];
  const viewer = await loadViewer(userId, teams);
  const me: DraftMe = { viewer, draft_id: draft?.id || null };
  if (draft && viewer.my_team_id) me.my_queue = await loadQueue(draft.id, viewer.my_team_id);
  if (recordCheckIn && draft && draft.status !== 'complete' && (viewer.is_staff || viewer.my_team_id)) await checkIn(draft.id, viewer);
  return me;
}

/** Can this user see the private draft chat? Staff, or captain / co-captain of a team in the draft. */
export async function canUseChat(draftId: string, userId: string): Promise<boolean> {
  if (await isStaff(userId)) return true;
  const teams = await loadTeams(draftId);
  return teams.some((t) => leadsTeam(t, userId));
}

/** Drop a system line into the draft chat (picks, pauses, undo…). Never throws. */
export async function postSystemMessage(draftId: string, body: string) {
  try {
    await supabaseAdmin.from('ctfdl_draft_messages').insert({ draft_id: draftId, sender_id: null, kind: 'system', body: body.slice(0, 1000) });
  } catch (e) {
    console.warn('draft chat system message failed:', e);
  }
}

/** Set when the pick function doesn't take p_expected_pick yet (add-ctfdl-draft-pick-guard.sql); retried after 5 minutes. */
let pickGuardMissingUntil = 0;

/**
 * Make the pick for whichever team is on the clock. `expectedPick` is the overall pick number the
 * caller believes it is making: if the draft has moved on since (another auto-pick got there first,
 * or the captain picked at the buzzer), the pick is refused instead of landing on the NEXT team.
 * The check runs inside the pick function when it supports it, otherwise just before the call.
 */
export async function makePick(draftId: string, playerId: string | null, pickType: string, actorId: string | null, expectedPick?: number | null) {
  const args = { p_draft_id: draftId, p_player_id: playerId, p_pick_type: pickType, p_actor: actorId };
  if (expectedPick != null) {
    if (Date.now() >= pickGuardMissingUntil) {
      const { data, error } = await supabaseAdmin.rpc('ctfdl_draft_make_pick', { ...args, p_expected_pick: expectedPick });
      if (!error) { forgetShared(draftId); return data; }
      if (error.code !== 'PGRST202') throw new Error(error.message);
      pickGuardMissingUntil = Date.now() + 5 * 60_000;
    }
    const { data: now } = await supabaseAdmin.from('ctfdl_drafts').select('current_pick').eq('id', draftId).maybeSingle();
    if (now && now.current_pick !== expectedPick) throw new Error('That pick has already been made');
  }
  const { data, error } = await supabaseAdmin.rpc('ctfdl_draft_make_pick', args);
  if (error) throw new Error(error.message);
  forgetShared(draftId);
  return data;
}

export async function undoPick(draftId: string) {
  const { data, error } = await supabaseAdmin.rpc('ctfdl_draft_undo_pick', { p_draft_id: draftId });
  if (error) throw new Error(error.message);
  forgetShared(draftId);
  return data;
}
