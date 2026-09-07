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
}

export interface LeagueSeason {
  id: string;
  season_number: number;
  season_name: string | null;
  status: string;
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
  const full = await supabase
    .from('leagues')
    .select(REGISTRY_COLS)
    .order('display_order', { ascending: true })
    .order('slug', { ascending: true });

  if (!full.error && full.data) {
    return (full.data as any[]).map((l) => ({
      ...l,
      data_source: (l.data_source === 'ctfpl' ? 'ctfpl' : 'generic') as LeagueDataSource,
    }));
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

export async function getActiveSeason(league: LeagueInfo): Promise<LeagueSeason | null> {
  if (league.data_source === 'ctfpl') {
    const { data } = await supabase
      .from('ctfpl_seasons')
      .select(SEASON_COLS)
      .eq('status', 'active')
      .order('season_number', { ascending: false })
      .limit(1)
      .maybeSingle();
    return (data as LeagueSeason) || null;
  }
  const { data } = await supabase
    .from('league_seasons')
    .select(SEASON_COLS)
    .eq('league_id', league.id)
    .eq('status', 'active')
    .order('season_number', { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data as LeagueSeason) || null;
}

export async function getLatestSeason(league: LeagueInfo): Promise<LeagueSeason | null> {
  if (league.data_source === 'ctfpl') {
    const { data } = await supabase
      .from('ctfpl_seasons')
      .select(SEASON_COLS)
      .order('season_number', { ascending: false })
      .limit(1)
      .maybeSingle();
    return (data as LeagueSeason) || null;
  }
  const { data } = await supabase
    .from('league_seasons')
    .select(SEASON_COLS)
    .eq('league_id', league.id)
    .order('season_number', { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data as LeagueSeason) || null;
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

export const leagueStandingsHref = (l: LeagueInfo) => `/league/standings?league=${l.slug}`;
export const leagueRulesHref = (l: LeagueInfo) => `/rules?league=${l.slug}`;
