/**
 * USL Mix rating formula - the SKELETON, deliberately simple and fully tunable from this file.
 *
 * Team Elo with a per-player performance adjustment:
 *
 *   1. Team strength = mean rating of its players. Expected score
 *      E = 1 / (1 + 10^((R_opp - R_team) / 400)).
 *   2. Actual score S = 1 (win), 0 (loss), 0.5 (draw).
 *   3. Margin-of-victory multiplier: mov = 1 + MOV_MAX_BONUS * min(1, |killDiff| / MOV_FULL_AT) * surprise,
 *      where surprise fades from 1 at a 50/50 matchup to 0 once the WINNER was expected to score
 *      0.5 + MOV_FADE_AT. A 40+ kill blowout between even teams moves ratings 50% more than a
 *      1-kill game; a favourite stomping an underdog earns no bonus at all (Travis, 2026-09-08:
 *      otherwise the margin bonus rewards stacking). Nobody ever gains by killing less.
 *   4. Base team delta for a player = K * (S - E) * mov, where K is larger while the
 *      player is provisional (< PROVISIONAL_GAMES games).
 *   5. Captain bonus: a flat CAPTAIN_BONUS on top of a rated game's delta for both captains,
 *      win or lose. Deliberately tiny - a nudge for stepping up when nobody wants to, not a
 *      reason to captain. Shotcaller tags are NOT an input here by design.
 *   6. Fairness for the "the team with the worst player loses" problem: each player's
 *      delta is scaled by their performance relative to their OWN team:
 *        impact_i = kills_i - deaths_i + heal_amount_i / HEAL_PER_KILL
 *        perf_i   = clamp(1 + PERF_WEIGHT * (impact_i - teamMean) / scale, PERF_MIN, PERF_MAX)
 *      On a gain (S > E) delta is multiplied by perf_i (the carry gains more, the
 *      passenger gains less); on a loss it is multiplied by (2 - perf_i) (the carry
 *      loses less, the player who fed loses more). PERF_WEIGHT = 0 turns this off and
 *      you are back to plain team Elo.
 *
 * Every constant lives in ELO below. Changing one and calling POST /api/usl-mix/admin/recompute
 * replays every recorded mix game from scratch, so the formula can evolve as data comes in.
 */

import type { RatingInputPlayer, Result } from './types';

export const ELO = {
  BASE_RATING: 1200,
  K_BASE: 32,
  K_PROVISIONAL: 48,
  PROVISIONAL_GAMES: 10,
  /** 0 disables the individual performance adjustment */
  PERF_WEIGHT: 0.35,
  PERF_MIN: 0.6,
  PERF_MAX: 1.4,
  /** HP of heal output that counts like one kill in the impact score (medics) */
  HEAL_PER_KILL: 150,
  MOV_MAX_BONUS: 0.5,
  MOV_FULL_AT: 40,
  /**
   * How far above 50/50 the winner's expected score has to be before the margin bonus is gone.
   * 0.25 => no bonus once the winner was a 75% favourite (about a 190-point average-rating gap).
   * Same idea as FiveThirtyEight's NBA Elo margin adjustment.
   */
  MOV_FADE_AT: 0.25,
  /** flat rating points for each captain of a rated mix, win or lose (very mild by request) */
  CAPTAIN_BONUS: 1,
  /** teams smaller than this are not rated */
  MIN_PLAYERS_PER_TEAM: 2,
} as const;

export interface RatingState {
  rating: number;
  games: number;
}

export interface PlayerRatingChange {
  alias: string;
  alias_key: string;
  rating_before: number;
  rating_after: number;
  delta: number;
  team_expected: number;
  performance: number;
  k_factor: number;
  result: Result;
}

export function expectedScore(teamRating: number, opponentRating: number): number {
  return 1 / (1 + Math.pow(10, (opponentRating - teamRating) / 400));
}

export function kFactorFor(games: number): number {
  return games < ELO.PROVISIONAL_GAMES ? ELO.K_PROVISIONAL : ELO.K_BASE;
}

export function movMultiplier(killDiff: number, winnerExpected = 0.5): number {
  if (killDiff <= 0) return 1;
  const surprise = clamp(1 - (winnerExpected - 0.5) / ELO.MOV_FADE_AT, 0, 1);
  return 1 + ELO.MOV_MAX_BONUS * Math.min(1, killDiff / ELO.MOV_FULL_AT) * surprise;
}

function impactOf(p: RatingInputPlayer): number {
  return p.kills - p.deaths + (p.heal_amount || 0) / ELO.HEAL_PER_KILL;
}

/** Performance multipliers for one team, centred on 1.0. */
export function performanceMultipliers(team: RatingInputPlayer[]): Map<string, number> {
  const out = new Map<string, number>();
  if (team.length === 0) return out;
  const impacts = team.map(impactOf);
  const mean = impacts.reduce((a, b) => a + b, 0) / impacts.length;
  const mad = impacts.reduce((a, b) => a + Math.abs(b - mean), 0) / impacts.length;
  const scale = Math.max(3, mad * 2);
  team.forEach((p, i) => {
    const raw = 1 + ELO.PERF_WEIGHT * ((impacts[i] - mean) / scale);
    out.set(p.alias_key, clamp(raw, ELO.PERF_MIN, ELO.PERF_MAX));
  });
  return out;
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

function round2(v: number): number {
  return Math.round(v * 100) / 100;
}

export interface TeamInput {
  name: string;
  kills: number;
  result: Result;
  players: RatingInputPlayer[];
}

/**
 * Computes every player's rating change for one game. `ratings` supplies the current
 * state per alias_key (missing = fresh player at BASE_RATING). Pure - no I/O.
 */
export function computeGameRatings(
  teams: [TeamInput, TeamInput],
  ratings: Map<string, RatingState>
): PlayerRatingChange[] {
  const [a, b] = teams;
  if (a.players.length < ELO.MIN_PLAYERS_PER_TEAM || b.players.length < ELO.MIN_PLAYERS_PER_TEAM) {
    return [];
  }
  const stateOf = (key: string): RatingState => ratings.get(key) ?? { rating: ELO.BASE_RATING, games: 0 };
  const avg = (t: TeamInput) => t.players.reduce((s, p) => s + stateOf(p.alias_key).rating, 0) / t.players.length;
  const avgA = avg(a);
  const avgB = avg(b);
  const eA = expectedScore(avgA, avgB);
  const eB = expectedScore(avgB, avgA);
  const winnerExpected = a.result === 'win' ? eA : b.result === 'win' ? eB : 0.5;
  const mov = movMultiplier(Math.abs(a.kills - b.kills), winnerExpected);

  const changes: PlayerRatingChange[] = [];
  const sides: Array<[TeamInput, number]> = [
    [a, eA],
    [b, eB],
  ];
  for (const [team, expected] of sides) {
    const actual = team.result === 'win' ? 1 : team.result === 'loss' ? 0 : 0.5;
    const perf = performanceMultipliers(team.players);
    const gain = actual - expected >= 0;
    for (const p of team.players) {
      const st = stateOf(p.alias_key);
      const k = kFactorFor(st.games);
      const perfMult = perf.get(p.alias_key) ?? 1;
      const adj = gain ? perfMult : 2 - perfMult;
      const captainBonus = p.is_captain ? ELO.CAPTAIN_BONUS : 0;
      const delta = round2(k * (actual - expected) * (team.result === 'draw' ? 1 : mov) * adj + captainBonus);
      changes.push({
        alias: p.alias,
        alias_key: p.alias_key,
        rating_before: round2(st.rating),
        rating_after: round2(st.rating + delta),
        delta,
        team_expected: Math.round(expected * 10000) / 10000,
        performance: Math.round(perfMult * 1000) / 1000,
        k_factor: k,
        result: p.result,
      });
    }
  }
  return changes;
}
