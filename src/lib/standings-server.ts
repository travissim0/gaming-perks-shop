import { createClient } from '@supabase/supabase-js';
import { computeStandings, normalizeRules, type ScoredMatch, type ScoringRules } from '@/lib/scoring';

/**
 * Server-side standings rebuild for generic leagues (league_seasons /
 * league_matches / league_standings). Reads the season's scoring_rules,
 * re-derives every row from the recorded matches, and writes the table
 * including computed_rank. Idempotent: run it after any result change.
 */

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

export async function loadSeasonRules(leagueSeasonId: string): Promise<ScoringRules> {
  const { data } = await supabaseAdmin.from('league_seasons').select('scoring_rules').eq('id', leagueSeasonId).maybeSingle();
  return normalizeRules((data as any)?.scoring_rules);
}

export async function rebuildStandings(leagueSeasonId: string): Promise<{ rows: number; error: string | null }> {
  const rules = await loadSeasonRules(leagueSeasonId);
  const [{ data: matches, error: mErr }, { data: existing }] = await Promise.all([
    supabaseAdmin
      .from('league_matches')
      .select('id, match_type, match_kind, win_type, no_contest, verified, game_length_minutes, team_a_squad_id, team_b_squad_id, team_a_result, team_b_result, team_a_kills, team_b_kills, match_date')
      .eq('league_season_id', leagueSeasonId),
    supabaseAdmin.from('league_standings').select('squad_id').eq('league_season_id', leagueSeasonId),
  ]);
  if (mErr) return { rows: 0, error: mErr.message };

  // Keep zero rows for squads already in the table (e.g. seeded at draft time).
  const seeded = (existing || []).map((r: any) => r.squad_id as string);
  const computed = computeStandings((matches || []) as ScoredMatch[], rules, seeded);
  const now = new Date().toISOString();
  const rows = computed.map((r) => ({
    league_season_id: leagueSeasonId,
    squad_id: r.squad_id,
    matches_played: r.matches_played,
    wins: r.wins,
    losses: r.losses,
    no_shows: r.no_shows,
    overtime_wins: r.overtime_wins,
    overtime_losses: r.overtime_losses,
    points: r.points,
    kills_for: r.kills_for,
    deaths_against: r.deaths_against,
    rs_wins: r.rs_wins,
    rs_losses: r.rs_losses,
    fs_wins: r.fs_wins,
    fs_losses: r.fs_losses,
    forfeits: r.forfeits,
    avg_rs_win_minutes: r.avg_rs_win_minutes,
    computed_rank: r.computed_rank,
    updated_at: now,
  }));
  if (rows.length === 0) return { rows: 0, error: null };
  const { error } = await supabaseAdmin.from('league_standings').upsert(rows, { onConflict: 'league_season_id,squad_id' });
  return { rows: rows.length, error: error ? error.message : null };
}
