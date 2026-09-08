/**
 * CTFDL draft — server-side helpers (service role). Import only from API routes.
 */
import { createClient } from '@supabase/supabase-js';
import type { NextRequest } from 'next/server';
import { supabase } from '@/lib/supabase';
import { getLeagues, getOpenSeason, getLatestSeason } from '@/lib/leagues';
import type { DraftBundle, DraftPick, DraftPlayer, DraftRow, DraftTeam } from '@/lib/ctfdl-draft';

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
  return rows.map((r) => ({
    id: r.id,
    squad_id: r.squad_id,
    pick_order: r.pick_order,
    squad_name: r.squads?.name || 'Unknown squad',
    squad_tag: r.squads?.tag || null,
    captain_id: r.squads?.captain_id || null,
    captain_alias: r.squads?.captain_id ? aliasById[r.squads.captain_id] || null : null,
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

/** Everyone registered for the season, minus participating captains; picked ones flagged. */
export async function loadPlayers(draftId: string, seasonNumber: number, teams: DraftTeam[], picks: DraftPick[]): Promise<DraftPlayer[]> {
  const captainIds = new Set(teams.map((t) => t.captain_id).filter(Boolean) as string[]);
  const [{ data: rows }, { data: ranks }] = await Promise.all([
    supabaseAdmin
      .from('free_agents')
      .select('*, profiles!free_agents_player_id_fkey(in_game_alias)')
      .eq('is_active', true)
      .eq('league_slug', 'ctfdl')
      .eq('season_number', seasonNumber)
      .order('created_at'),
    supabaseAdmin.from('ctfdl_draft_rankings').select('player_id, rank').eq('draft_id', draftId),
  ]);
  const rankById: Record<string, number> = {};
  (ranks || []).forEach((r: any) => { rankById[r.player_id] = r.rank; });
  const pickByPlayer: Record<string, DraftPick> = {};
  picks.forEach((p) => { if (p.player_id) pickByPlayer[p.player_id] = p; });

  return ((rows || []) as any[])
    .filter((r) => !captainIds.has(r.player_id))
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
  const viewer = { user_id: viewerId, is_staff: viewerId ? await isStaff(viewerId) : false, my_team_id: null as string | null };

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
  const players = season ? await loadPlayers(draft.id, season.season_number, teams, picks) : [];

  if (viewerId) {
    const mine = teams.find((t) => t.captain_id === viewerId);
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
  };
  if (viewer.my_team_id) bundle.my_queue = await loadQueue(draft.id, viewer.my_team_id);
  return bundle;
}

/** Can this user see the private draft chat? Staff, or captain of a team in the draft. */
export async function canUseChat(draftId: string, userId: string): Promise<boolean> {
  if (await isStaff(userId)) return true;
  const teams = await loadTeams(draftId);
  return teams.some((t) => t.captain_id === userId);
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
