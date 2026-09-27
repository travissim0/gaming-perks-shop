/**
 * CTFDL draft — server-side helpers (service role). Import only from API routes.
 */
import { createClient } from '@supabase/supabase-js';
import type { NextRequest } from 'next/server';
import { supabase } from '@/lib/supabase';
import { getLeagues, getOpenSeason, getLatestSeason } from '@/lib/leagues';
import { leadsTeam, type DraftBundle, type DraftPick, type DraftPlayer, type DraftRow, type DraftTeam } from '@/lib/ctfdl-draft';

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

  const pool = Object.values(byId).filter((r) => !captainIds.has(r.player_id));

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

export async function loadBundle(draft: DraftRow | null, viewerId: string | null): Promise<DraftBundle> {
  const league = await ctfdlLeague();
  const viewer = { user_id: viewerId, alias: null as string | null, is_staff: viewerId ? await isStaff(viewerId) : false, my_team_id: null as string | null };
  if (viewerId) {
    const { data: me } = await supabaseAdmin.from('profiles').select('in_game_alias').eq('id', viewerId).maybeSingle();
    viewer.alias = me?.in_game_alias || null;
  }

  if (!draft) {
    return { draft: null, teams: [], picks: [], players: [], season: null, league: league ? { id: league.id, slug: league.slug, name: league.name } : null, server_time: new Date().toISOString(), viewer };
  }

  const { data: season } = await supabaseAdmin
    .from('league_seasons')
    .select('id, season_number, season_name, status')
    .eq('id', draft.league_season_id)
    .maybeSingle();

  const teams = await loadTeams(draft.id);
  const picks = await loadPicks(draft.id);
  const { players, staffBoards } = season
    ? await loadPlayersWithStaffAdp(draft.id, season.season_number, teams, picks, season.id)
    : { players: [] as DraftPlayer[], staffBoards: 0 };

  if (viewerId) {
    const mine = teams.find((t) => leadsTeam(t, viewerId));
    if (mine) viewer.my_team_id = mine.id;
  }
  const bundle: DraftBundle = {
    draft,
    teams,
    picks,
    players,
    season: season as DraftBundle['season'],
    league: league ? { id: league.id, slug: league.slug, name: league.name } : null,
    server_time: new Date().toISOString(),
    viewer,
    staff_adp_boards: staffBoards,
  };
  if (viewer.my_team_id) bundle.my_queue = await loadQueue(draft.id, viewer.my_team_id);
  return bundle;
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

export async function makePick(draftId: string, playerId: string | null, pickType: string, actorId: string | null) {
  const { data, error } = await supabaseAdmin.rpc('ctfdl_draft_make_pick', {
    p_draft_id: draftId,
    p_player_id: playerId,
    p_pick_type: pickType,
    p_actor: actorId,
  });
  if (error) throw new Error(error.message);
  return data;
}

export async function undoPick(draftId: string) {
  const { data, error } = await supabaseAdmin.rpc('ctfdl_draft_undo_pick', { p_draft_id: draftId });
  if (error) throw new Error(error.message);
  return data;
}
