import { createClient } from '@supabase/supabase-js';
import { weekStart, weekEnd, leagueDate, fsColorOf, type FsColor, type ScoringRules } from '@/lib/scoring';

/**
 * Free-scheduled (FS) match caps, checked when a captain proposes one and
 * again when staff record its result. Counts FS fixtures on the schedule
 * (pending or accepted) plus any FS results recorded without a fixture, so a
 * squad can't slip past the caps by mixing the two.
 *
 * When the season splits FS into Red and Green (rules.fs.colors), the caps apply
 * to each colour separately: a squad can play the same opponent Red and Green in
 * the same week. Rows with no colour count as red.
 */

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

export interface FsCount { week: number; vsOpponentWeek: number; vsOpponentSeason: number }

export async function fsCountsFor(
  leagueSeasonId: string,
  leagueSlug: string,
  seasonNumber: number,
  squadId: string,
  opponentId: string,
  at: string,
  excludeFixtureId: string | null,
  /** Count only this colour; null counts every FS (seasons without the Red/Green split). */
  color: FsColor | null = null,
): Promise<FsCount> {
  const ws = weekStart(new Date(at));
  const we = weekEnd(ws);

  const fixturesQ = (cols: string) => {
    let fq = supabaseAdmin
      .from('matches')
      .select(cols)
      .eq('league_slug', leagueSlug)
      .eq('season_number', seasonNumber)
      .eq('stage', 'fs')
      .in('fs_status', ['pending', 'accepted'])
      .or(`squad_a_id.eq.${squadId},squad_b_id.eq.${squadId}`);
    if (excludeFixtureId) fq = fq.neq('id', excludeFixtureId);
    return fq;
  };
  const looseQ = (cols: string) =>
    supabaseAdmin
      .from('league_matches')
      .select(cols)
      .eq('league_season_id', leagueSeasonId)
      .eq('match_kind', 'fs')
      .is('fixture_id', null)
      .or(`team_a_squad_id.eq.${squadId},team_b_squad_id.eq.${squadId}`);

  // fs_color arrives with add-fs-colors.sql; without it every FS is red.
  let fx = await fixturesQ('id, squad_a_id, squad_b_id, fs_week_start, fs_color');
  if (fx.error && /fs_color/.test(fx.error.message)) fx = await fixturesQ('id, squad_a_id, squad_b_id, fs_week_start');
  let lo = await looseQ('id, team_a_squad_id, team_b_squad_id, match_date, fs_color');
  if (lo.error && /fs_color/.test(lo.error.message)) lo = await looseQ('id, team_a_squad_id, team_b_squad_id, match_date');

  const items = [
    ...((fx.data || []) as any[]).map((f) => ({ a: f.squad_a_id, b: f.squad_b_id, ws: f.fs_week_start as string | null, color: f.fs_color === 'green' ? 'green' : 'red' })),
    ...((lo.data || []) as any[]).map((m) => ({ a: m.team_a_squad_id, b: m.team_b_squad_id, ws: weekStart(new Date(m.match_date)), color: m.fs_color === 'green' ? 'green' : 'red' })),
  ].filter((i) => !color || i.color === color);
  const inWeek = items.filter((i) => i.ws && i.ws >= ws && i.ws <= we);
  const vsOpp = (list: typeof items) => list.filter((i) => i.a === opponentId || i.b === opponentId).length;
  return { week: inWeek.length, vsOpponentWeek: vsOpp(inWeek), vsOpponentSeason: vsOpp(items) };
}

/** Human-readable cap violation for an FS between a and b at `at`, or null if allowed. */
export async function fsCapCheck(
  leagueSeasonId: string,
  leagueSlug: string,
  seasonNumber: number,
  rules: ScoringRules,
  aId: string,
  bId: string,
  at: string,
  excludeFixtureId: string | null,
  names?: { a: string; b: string },
  colorRaw?: unknown,
): Promise<string | null> {
  if (!rules.fs.enabled) return 'This season does not use free-scheduled matches';
  if (rules.fs.closes_on) {
    // The last day FS may be played, in league time.
    if (leagueDate(new Date(at)) > rules.fs.closes_on) return `FS closed when the regular season ended (${rules.fs.closes_on}). There is no FS in the playoffs.`;
  } else {
    const { data: season } = await supabaseAdmin.from('league_seasons').select('playoffs_start_on, end_date').eq('id', leagueSeasonId).maybeSingle();
    const cutoff = (season as any)?.playoffs_start_on || (season as any)?.end_date || null;
    if (cutoff && at.slice(0, 10) >= cutoff) return 'FS closes when the regular season ends. There is no FS in the playoffs.';
  }

  const color: FsColor | null = rules.fs.colors ? fsColorOf(rules, colorRaw) : null;
  const kind = color ? `FS ${color === 'green' ? 'Green' : 'Red'}` : 'FS';
  const label = names || { a: 'that squad', b: 'the other squad' };
  for (const [me, opp, myName] of [[aId, bId, label.a], [bId, aId, label.b]] as const) {
    const c = await fsCountsFor(leagueSeasonId, leagueSlug, seasonNumber, me, opp, at, excludeFixtureId, color);
    if (c.week >= rules.fs.per_week) return `${myName} already has ${rules.fs.per_week} ${kind} match${rules.fs.per_week === 1 ? '' : 'es'} that week (Mon–Sun).`;
    if (c.vsOpponentWeek >= rules.fs.per_opponent_week) return `${myName} already has ${rules.fs.per_opponent_week === 1 ? 'an' : rules.fs.per_opponent_week} ${kind} match${rules.fs.per_opponent_week === 1 ? '' : 'es'} against this opponent that week.`;
    if (c.vsOpponentSeason >= rules.fs.per_opponent_season) return `These two squads have already met ${rules.fs.per_opponent_season} times in ${kind} this season.`;
  }
  return null;
}
