/**
 * CTF community ratings - plain pairwise Elo over head-to-head votes.
 *
 * Deliberately simpler than the USL mix formula (src/lib/uslMix/elo.ts): there is no
 * margin of victory and no performance term, because a vote carries no scoreline. One
 * vote is one match, the picked player scores 1, the other scores 0.
 *
 * Every constant is tunable from this file. Recorded votes keep the ratings that were
 * in force when they were cast, so changing a constant here and replaying
 * ctf_rating_votes in order reproduces the whole leaderboard from scratch.
 */

export const CTF_RATING = {
  BASE_RATING: 1500,
  /** points a 50/50 matchup moves */
  K: 24,
  /** recorded games before a player enters the voting pool */
  MIN_GAMES: 5,
  /** votes one account may cast per calendar day (UTC) */
  DAILY_VOTE_LIMIT: 50,
  /**
   * Prefer pairing players within this many rating points. A vote between two players
   * of similar standing carries far more information than one between the top and
   * bottom of the board, where the answer is obvious and the Elo barely moves.
   */
  PAIR_RATING_WINDOW: 150,
} as const;

/** Probability that `a` beats `b` under standard Elo. */
export function expectedScore(a: number, b: number): number {
  return 1 / (1 + Math.pow(10, (b - a) / 400));
}

/**
 * Apply one vote. `winner` is the rating of the player who was picked.
 * Returns both new ratings and the size of the swing.
 */
export function applyVote(
  winner: number,
  loser: number,
  k: number = CTF_RATING.K,
): { winner: number; loser: number; delta: number } {
  const delta = k * (1 - expectedScore(winner, loser));
  return {
    winner: round2(winner + delta),
    loser: round2(loser - delta),
    delta: round2(delta),
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Pick a matchup out of the pool, biased toward players of similar rating.
 *
 * `exclude` skips pairs the voter has already been shown this session, so hitting
 * "skip" does not hand back the same two players again.
 */
export function pickMatchup<T extends { player_key: string; rating: number }>(
  pool: T[],
  exclude: Set<string> = new Set(),
): [T, T] | null {
  if (pool.length < 2) return null;

  // A few attempts at a fresh pair before settling for a repeat.
  for (let attempt = 0; attempt < 12; attempt++) {
    const a = pool[Math.floor(Math.random() * pool.length)];

    const near = pool.filter(
      (p) =>
        p.player_key !== a.player_key &&
        Math.abs(p.rating - a.rating) <= CTF_RATING.PAIR_RATING_WINDOW,
    );
    const candidates = near.length > 0 ? near : pool.filter((p) => p.player_key !== a.player_key);
    if (candidates.length === 0) continue;

    const b = candidates[Math.floor(Math.random() * candidates.length)];
    if (!exclude.has(pairKey(a.player_key, b.player_key))) return [a, b];
  }

  // Everything nearby has been seen - fall back to any two distinct players.
  const a = pool[Math.floor(Math.random() * pool.length)];
  const others = pool.filter((p) => p.player_key !== a.player_key);
  if (others.length === 0) return null;
  return [a, others[Math.floor(Math.random() * others.length)]];
}

/** Order-independent key for a pair of players. */
export function pairKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

/** Start of the current UTC day, as an ISO string - the daily vote cap window. */
export function startOfUtcDay(now: Date = new Date()): string {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())).toISOString();
}
