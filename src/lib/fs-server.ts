import { createClient } from '@supabase/supabase-js';
import { weekStart, weekEnd, type ScoringRules } from '@/lib/scoring';

/**
 * Free-scheduled (FS) match caps, checked when a captain proposes one and
 * again when staff record its result. Counts FS fixtures on the schedule
 * (pending or accepted) plus any FS results recorded without a fixture, so a
 * squad can't slip past the caps by mixing the two.
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
): Promise<FsCount> {
  const ws = weekStart(new Date(at));
  const we = weekEnd(ws);

  let fq = supabaseAdmin
    .from('matches')
    .select('id, squad_a_id, squad_b_id, fs_week_start')
    .eq('league_slug', leagueSlug)
    .eq('season_number', seasonNumber)
    .eq('stage', 'fs')
    .in('fs_status', ['pending', 'accepted'])
    .or(`squad_a_id.eq.${squadId},squad_b_id.eq.${squadId}`);
  if (excludeFixtureId) fq = fq.neq('id', excludeFixtureId);
  const { data: fixtures } = await fq;

  const { data: loose } = await supabaseAdmin
    .from('league_matches')
    .select('id, team_a_squad_id, team_b_squad_id, match_date')
    .eq('league_season_id', leagueSeasonId)
    .eq('match_kind', 'fs')
    .is('fixture_id', null)
    .or(`team_a_squad_id.eq.${squadId},team_b_squad_id.eq.${squadId}`);

  const items = [
    ...(fixtures || []).map((f: any) => ({ a: f.squad_a_id, b: f.squad_b_id, ws: f.fs_week_start as string | null })),
    ...(loose || []).map((m: any) => ({ a: m.team_a_squad_id, b: m.team_b_squad_id, ws: weekStart(new Date(m.match_date)) })),
  ];
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
): Promise<string | null> {
  if (!rules.fs.enabled) return 'This season does not use free-scheduled matches';
  const { data: season } = await supabaseAdmin.from('league_seasons').select('playoffs_start_on, end_date').eq('id', leagueSeasonId).maybeSingle();
  const cutoff = (season as any)?.playoffs_start_on || (season as any)?.end_date || null;
  if (cutoff && at.slice(0, 10) >= cutoff) return 'FS closes when the regular season ends. There is no FS in the playoffs.';

  const label = names || { a: 'that squad', b: 'the other squad' };
  for (const [me, opp, myName] of [[aId, bId, label.a], [bId, aId, label.b]] as const) {
    const c = await fsCountsFor(leagueSeasonId, leagueSlug, seasonNumber, me, opp, at, excludeFixtureId);
    if (c.week >= rules.fs.per_week) return `${myName} already has ${rules.fs.per_week} FS match${rules.fs.per_week === 1 ? '' : 'es'} that week (Mon–Sun).`;
    if (c.vsOpponentWeek >= rules.fs.per_opponent_week) return `${myName} already has an FS match against this opponent that week.`;
    if (c.vsOpponentSeason >= rules.fs.per_opponent_season) return `These two squads have already met ${rules.fs.per_opponent_season} times in FS this season.`;
  }
  return null;
}
