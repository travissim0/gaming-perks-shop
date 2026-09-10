/**
 * League adapters.
 *
 * The site hosts several CTF leagues that deliberately keep SEPARATE
 * backends (CTFPL uses ctfpl_* tables; CTFDL/OVDL use league_seasons /
 * league_standings). This module is the one place that knows which tables
 * back which league, so the UI can ask "give me this league's active season
 * and standings" without the databases knowing about each other.
 *
 * The `leagues` table is the registry (see create-league-registry.sql).
 */
import { supabase } from '@/lib/supabase';

export type LeagueDataSource = 'ctfpl' | 'generic';
export type SeasonStatus = 'active' | 'upcoming' | 'off-season';

export interface LeagueInfo {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  tagline: string | null;
  format: string | null;
  accent_color: string | null;
  rules_pdf_url: string | null;
  is_featured: boolean;
  display_order: number;
  data_source: LeagueDataSource;
  /** Discord invite for the league (add-season-dates.sql). */
  discord_url?: string | null;
}

export interface LeagueSeason {
  id: string;
  season_number: number;
  season_name: string | null;
  status: string;
  // Milestones (all optional; add-season-dates.sql). ISO dates, "YYYY-MM-DD".
  start_date?: string | null;
  end_date?: string | null;
  registration_closes_on?: string | null;
  draft_on?: string | null;
  playoffs_start_on?: string | null;
}

export interface StandingRow {
  squad_id: string;
  squad_name: string;
  squad_tag: string | null;
  rank: number;
  wins: number;
  losses: number;
  points: number;
  win_percentage: number;
}

const REGISTRY_COLS =
  'id, slug, name, description, tagline, format, accent_color, rules_pdf_url, is_featured, display_order, data_source';
const BASIC_COLS = 'id, slug, name, description';

/**
 * All leagues, ordered for display. Falls back gracefully if the registry
 * migration hasn't been applied yet (treats CTFPL as the ctfpl source and
 * everything else as generic).
 */
export async function getLeagues(): Promise<LeagueInfo[]> {
  // discord_url arrived later (add-season-dates.sql) — try with it, then without.
  for (const cols of [`${REGISTRY_COLS}, discord_url`, REGISTRY_COLS]) {
    const full = await supabase
      .from('leagues')
      .select(cols)
      .order('display_order', { ascending: true })
      .order('slug', { ascending: true });

    if (!full.error && full.data) {
      return (full.data as any[]).map((l) => ({
        discord_url: null,
        ...l,
        data_source: (l.data_source === 'ctfpl' ? 'ctfpl' : 'generic') as LeagueDataSource,
      }));
    }
  }

  // Registry columns missing — basic fallback.
  const basic = await supabase.from('leagues').select(BASIC_COLS).order('slug');
  return ((basic.data as any[]) || []).map((l) => ({
    ...l,
    tagline: null,
    format: null,
    accent_color: null,
    rules_pdf_url: null,
    is_featured: l.slug === 'ctfpl',
    display_order: 0,
    data_source: (l.slug === 'ctfpl' ? 'ctfpl' : 'generic') as LeagueDataSource,
  }));
}

/** The featured league, else CTFPL, else the first league. */
export function pickFeatured(leagues: LeagueInfo[]): LeagueInfo | null {
  return (
    leagues.find((l) => l.is_featured) ||
    leagues.find((l) => l.slug === 'ctfpl') ||
    leagues[0] ||
    null
  );
}

const SEASON_COLS = 'id, season_number, season_name, status';
const SEASON_DATE_COLS = `${SEASON_COLS}, start_date, end_date, registration_closes_on, draft_on, playoffs_start_on`;

/** Which table holds a league's seasons. */
export const seasonTable = (league: LeagueInfo) =>
  league.data_source === 'ctfpl' ? 'ctfpl_seasons' : 'league_seasons';

/**
 * Newest season for a league, optionally filtered by status. Selects the
 * milestone dates when the columns exist and falls back to the basic set.
 */
async function fetchSeason(league: LeagueInfo, status?: string): Promise<LeagueSeason | null> {
  for (const cols of [SEASON_DATE_COLS, SEASON_COLS]) {
    let q = supabase.from(seasonTable(league)).select(cols);
    if (league.data_source !== 'ctfpl') q = q.eq('league_id', league.id);
    if (status) q = q.eq('status', status);
    const { data, error } = await q.order('season_number', { ascending: false }).limit(1).maybeSingle();
    if (!error) return (data as unknown as LeagueSeason) || null;
  }
  return null;
}

export async function getActiveSeason(league: LeagueInfo): Promise<LeagueSeason | null> {
  return fetchSeason(league, 'active');
}

export async function getLatestSeason(league: LeagueInfo): Promise<LeagueSeason | null> {
  return fetchSeason(league);
}

/**
 * The season players can register for: the active season, else an upcoming
 * one. Null means registration is closed (off-season).
 */
export async function getOpenSeason(league: LeagueInfo): Promise<LeagueSeason | null> {
  const active = await getActiveSeason(league);
  if (active) return active;
  const latest = await getLatestSeason(league);
  if (latest && latest.status === 'upcoming') return latest;
  return null;
}

/** "CTFDL Season 5" / "CTFDL · Fall 2026" style label for headers. */
export function seasonLabel(league: LeagueInfo, season: LeagueSeason | null): string {
  if (!season) return league.name;
  const name = season.season_name?.trim();
  const generic = `Season ${season.season_number}`;
  if (name && name.toLowerCase() !== generic.toLowerCase()) return `${league.name} ${generic} · ${name}`;
  return `${league.name} ${generic}`;
}

/** How the pool is used, worded per league format (draft vs squad vs OvD). */
export function poolBlurb(league: LeagueInfo): string {
  switch (league.format) {
    case 'draft':
      return 'Captains draft their teams from this pool once registration closes.';
    case 'ovd':
      return 'Staff build the offense and defense rosters from this pool.';
    case 'squad':
    default:
      return 'Squad captains recruit from this pool and can invite you directly.';
  }
}

// ---- Season phase ----------------------------------------------------------

export interface SeasonMilestone {
  label: string;
  /** "YYYY-MM-DD" */
  date: string;
  past: boolean;
}

export interface SeasonPhase {
  /** "Recruiting" · "Week 3" · "Playoffs" · "Off-season" … */
  label: string;
  /** Upcoming and recent milestones, in date order. */
  milestones: SeasonMilestone[];
}

/** Parse "YYYY-MM-DD" as local midnight so day math isn't skewed by UTC. */
export function parseDateOnly(d: string): Date {
  const [y, m, day] = d.slice(0, 10).split('-').map(Number);
  return new Date(y, (m || 1) - 1, day || 1);
}

/** "Sep 27" (adds the year when it isn't this year). */
export function formatDateOnly(d: string, now = new Date()): string {
  const dt = parseDateOnly(d);
  return dt.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    ...(dt.getFullYear() !== now.getFullYear() ? { year: 'numeric' } : {}),
  });
}

/**
 * Where a season is right now, derived from its status and milestone dates.
 * Weeks are seven days from start_date; playoffs override the week counter.
 * `draftDone` lets a draft league report "Draft complete" from the live
 * ctfdl_drafts row even when no draft_on date was entered.
 */
export function seasonPhase(
  league: LeagueInfo,
  season: LeagueSeason | null,
  status: SeasonStatus,
  opts: { draftDone?: boolean; now?: Date } = {},
): SeasonPhase {
  const now = opts.now ?? new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const days = (d: string) => Math.floor((today.getTime() - parseDateOnly(d).getTime()) / 86_400_000);
  const isDraft = league.format === 'draft';

  const milestones: SeasonMilestone[] = [];
  const add = (label: string, date: string | null | undefined) => {
    if (date) milestones.push({ label, date, past: days(date) > 0 });
  };
  if (season) {
    add('Registration closes', season.registration_closes_on);
    if (isDraft) add(opts.draftDone ? 'Drafted' : 'Draft', season.draft_on);
    add('Season starts', season.start_date);
    add('Playoffs', season.playoffs_start_on);
    add('Season ends', season.end_date);
  }
  milestones.sort((a, b) => a.date.localeCompare(b.date));

  if (!season || status === 'off-season') {
    return { label: 'Off-season', milestones: milestones.filter((m) => m.label === 'Season ends') };
  }

  if (status === 'upcoming') {
    const regOpen = !season.registration_closes_on || days(season.registration_closes_on) <= 0;
    if (isDraft && opts.draftDone) return { label: 'Teams set', milestones };
    if (isDraft && season.draft_on && days(season.draft_on) >= 0) return { label: 'Draft day', milestones };
    return { label: regOpen ? 'Recruiting' : 'Pre-season', milestones };
  }

  // active — but a draft league can't be underway until its draft has run
  // (seasons are often flagged active early so registration and the draft room work).
  if (isDraft && opts.draftDone === false) {
    const regOpen = !season.registration_closes_on || days(season.registration_closes_on) <= 0;
    if (season.draft_on && days(season.draft_on) >= 0) return { label: 'Draft day', milestones };
    return { label: regOpen ? 'Recruiting' : 'Pre-season', milestones };
  }
  if (season.start_date && days(season.start_date) < 0) {
    return { label: 'Starts soon', milestones };
  }
  if (season.playoffs_start_on && days(season.playoffs_start_on) >= 0) {
    return { label: 'Playoffs', milestones };
  }
  if (season.start_date) {
    const week = Math.floor(days(season.start_date) / 7) + 1;
    return { label: `Week ${week}`, milestones };
  }
  return { label: 'In progress', milestones };
}

/** Active season if there is one; otherwise the latest season and whether it's upcoming or off-season. */
export async function getSeasonStatus(
  league: LeagueInfo,
): Promise<{ season: LeagueSeason | null; status: SeasonStatus }> {
  const active = await getActiveSeason(league);
  if (active) return { season: active, status: 'active' };
  const latest = await getLatestSeason(league);
  if (latest && latest.status === 'upcoming') return { season: latest, status: 'upcoming' };
  return { season: latest, status: 'off-season' };
}

const STANDING_COLS = 'squad_id, squad_name, squad_tag, rank, wins, losses, points, win_percentage';

export async function getStandings(
  league: LeagueInfo,
  season: LeagueSeason,
  limit = 5,
): Promise<StandingRow[]> {
  if (league.data_source === 'ctfpl') {
    const { data } = await supabase
      .from('ctfpl_standings_with_rankings')
      .select(STANDING_COLS)
      .eq('season_number', season.season_number)
      .order('rank', { ascending: true })
      .limit(limit);
    return (data as StandingRow[]) || [];
  }
  const { data } = await supabase
    .from('league_standings_with_rankings')
    .select(STANDING_COLS)
    .eq('league_season_id', season.id)
    .order('rank', { ascending: true })
    .limit(limit);
  return (data as StandingRow[]) || [];
}

// ---- Champions ------------------------------------------------------------

export interface SquadRef {
  id: string;
  name: string;
  tag: string | null;
}

export interface SeasonChampions {
  season_id: string;
  season_number: number;
  season_name: string | null;
  end_date: string | null;
  champions: SquadRef[];
  runners_up: SquadRef[];
  third: SquadRef[];
}

const CHAMPION_COLS =
  'id, season_number, season_name, end_date, champion_squad_ids, runner_up_squad_ids, third_place_squad_ids';

/** Completed seasons (newest first) with their placing squads resolved to names. */
export async function getRecentChampions(league: LeagueInfo, limit = 5): Promise<SeasonChampions[]> {
  let rows: any[] = [];
  if (league.data_source === 'ctfpl') {
    const { data } = await supabase
      .from('ctfpl_seasons')
      .select(CHAMPION_COLS)
      .eq('status', 'completed')
      .order('season_number', { ascending: false })
      .limit(limit);
    rows = data || [];
  } else {
    const { data } = await supabase
      .from('league_seasons')
      .select(CHAMPION_COLS)
      .eq('league_id', league.id)
      .eq('status', 'completed')
      .order('season_number', { ascending: false })
      .limit(limit);
    rows = data || [];
  }

  const ids = new Set<string>();
  for (const r of rows) {
    for (const k of ['champion_squad_ids', 'runner_up_squad_ids', 'third_place_squad_ids']) {
      (r[k] || []).forEach((id: string) => ids.add(id));
    }
  }
  const squadMap = new Map<string, SquadRef>();
  if (ids.size) {
    const { data: squads } = await supabase.from('squads').select('id, name, tag').in('id', Array.from(ids));
    (squads || []).forEach((s: any) => squadMap.set(s.id, { id: s.id, name: s.name, tag: s.tag ?? null }));
  }
  const resolve = (arr: string[] | null) =>
    (arr || []).map((id) => squadMap.get(id) || { id, name: 'Unknown squad', tag: null });

  return rows.map((r) => ({
    season_id: r.id,
    season_number: r.season_number,
    season_name: r.season_name ?? null,
    end_date: r.end_date ?? null,
    champions: resolve(r.champion_squad_ids),
    runners_up: resolve(r.runner_up_squad_ids),
    third: resolve(r.third_place_squad_ids),
  }));
}

// ---- Draft teams ------------------------------------------------------------

export interface DraftTeamRef {
  id: string;
  name: string;
  tag: string | null;
  captain_alias: string;
  member_count: number;
  pick_order: number;
}

export interface SeasonDraft {
  id: string;
  status: 'setup' | 'live' | 'paused' | 'complete';
  teams: DraftTeamRef[];
}

/**
 * The CTFDL draft for a season (if staff created one) and the teams they added
 * to it, in pick order. These are the only "official" teams before standings
 * exist; squads people create on their own don't count until staff add them.
 */
export async function getSeasonDraft(seasonId: string): Promise<SeasonDraft | null> {
  const { data: draft } = await supabase
    .from('ctfdl_drafts')
    .select('id, status')
    .eq('league_season_id', seasonId)
    .maybeSingle();
  if (!draft) return null;

  const { data, error } = await supabase
    .from('ctfdl_draft_teams')
    .select('squad_id, pick_order, squads(id, name, tag, captain_id, profiles!squads_captain_id_fkey(in_game_alias))')
    .eq('draft_id', draft.id)
    .order('pick_order', { ascending: true });
  const rows = (error ? [] : data || []) as any[];

  const counts = new Map<string, number>();
  if (rows.length) {
    const { data: members } = await supabase
      .from('squad_members')
      .select('squad_id')
      .in('squad_id', rows.map((t) => t.squad_id))
      .eq('status', 'active');
    (members || []).forEach((m: any) => counts.set(m.squad_id, (counts.get(m.squad_id) || 0) + 1));
  }

  return {
    id: draft.id,
    status: draft.status,
    teams: rows
      .filter((t) => t.squads)
      .map((t) => ({
        id: t.squads.id,
        name: t.squads.name,
        tag: t.squads.tag ?? null,
        captain_alias: t.squads.profiles?.in_game_alias || 'Unknown',
        member_count: counts.get(t.squad_id) || 0,
        pick_order: t.pick_order,
      })),
  };
}

export const leagueStandingsHref = (l: LeagueInfo) => `/league/standings?league=${l.slug}`;
export const leagueRulesHref = (l: LeagueInfo) => `/rules?league=${l.slug}`;
