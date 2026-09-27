/**
 * CTFDL mock drafts ("predict the draft order") — shared types and pure rules,
 * safe for client and server. Data lives in ctfdl_mock_boards (server only).
 *
 * A board is the list of registered players in the order the author expects them
 * to be drafted: position 1 = predicted first overall pick.
 */

/** A board must place at least this share of the pool (the author excluded). */
export const REQUIRED_SHARE = 0.9;
/** Public ADP stays hidden until this many public boards exist. */
export const MIN_PUBLIC_BOARDS = 5;

export const requiredCount = (poolSize: number) => Math.ceil(poolSize * REQUIRED_SHARE);

export interface MockPoolPlayer {
  player_id: string;
  alias: string;
  preferred_roles: string[];
  secondary_roles: string[];
}

export interface MockAdpRow {
  player_id: string;
  alias: string;
  /** Average predicted pick number across public boards that placed them. */
  adp: number;
  best: number;
  worst: number;
  boards: number;
}

export interface MockBoardView {
  id: string;
  /** Alias, or "Anonymous #n". */
  label: string;
  anonymous: boolean;
  /** Staff only: the real author behind an anonymous board. */
  author_alias?: string | null;
  player_ids: string[];
  updated_at: string;
}

export interface MockScoreRow {
  board_id: string;
  label: string;
  points: number;
  exact: number;
  placed: number;
}

export interface MockResponse {
  season: { id: string; season_number: number; season_name: string | null } | null;
  draft: { id: string; status: string } | null;
  /** Boards lock when the draft leaves setup. */
  locked: boolean;
  /** Squads in the draft = picks in round 1. */
  teams: number;
  pool: MockPoolPlayer[];
  public_board_count: number;
  adp: MockAdpRow[] | null;
  boards: MockBoardView[];
  /** Filled once the draft is complete: public boards scored against the real order. */
  scoreboard: MockScoreRow[] | null;
  viewer: {
    signed_in: boolean;
    is_staff: boolean;
    /** Drafting captain / co-captain: their board is private to them. */
    is_captain: boolean;
    in_pool: boolean;
    /** Holds a CTF role (and isn't a captain): their board also feeds the private Staff ADP. */
    feeds_staff_adp: boolean;
    /** How many players this viewer must place (pool minus themselves, 90%). */
    required: number;
  };
  mine: { player_ids: string[]; anonymous: boolean; updated_at: string; private: boolean } | null;
  /** True until create-ctfdl-mock-drafts.sql has been run. */
  needs_setup?: boolean;
}

/**
 * Score one board against the real draft: 10 points for the exact pick, 2 fewer for
 * each spot off, never below zero. Players who weren't drafted don't count.
 */
export function scoreBoard(order: string[], actualOverall: Record<string, number>): { points: number; exact: number; placed: number } {
  let points = 0, exact = 0, placed = 0;
  order.forEach((id, i) => {
    const actual = actualOverall[id];
    if (actual == null) return;
    placed++;
    const off = Math.abs(i + 1 - actual);
    if (off === 0) exact++;
    points += Math.max(0, 10 - 2 * off);
  });
  return { points, exact, placed };
}
