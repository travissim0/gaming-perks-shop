/**
 * Live arena snapshot - the shape both zone scripts (USL and CTF) POST to /api/live/ingest
 * about once a minute, and the shape /api/live and /api/usl-mix/live hand back to the home
 * page panel and to third-party sites (uslzone.com).
 *
 * Producer: LiveSnapshotPublisher in the zone scripts (USLLiveSnapshot.cs / CTFLiveSnapshot.cs).
 * Keep this in step with SCHEMA_VERSION there.
 */

export const LIVE_SCHEMA_VERSION = 1;

export type LiveGame = 'usl' | 'ctf';

/** Side of a team. T = Titan (green), C = Collective (red); spec / np are the two non-playing teams. */
export type LiveSide = 'T' | 'C' | 'spec' | 'np' | 'other';

export interface LivePlayer {
  alias: string;
  /** Class / skill name as the zone reports it ("Marine", "Field Medic", "Unknown"). */
  class: string;
  /** True when the player is spectating (spectator vehicle), regardless of the team they sit on. */
  spec: boolean;
  dead?: boolean;
  captain?: boolean;
  squad?: string;
}

export interface LiveTeam {
  name: string;
  side: LiveSide;
  kills: number;
  deaths: number;
  players: LivePlayer[];
}

/** One in-game ticker line ("bubble"), resolved from a spectator's point of view. */
export interface LiveTicker {
  idx: number;
  colour: number;
  text: string;
  /** Countdown the client appends to the text, in centiseconds; 0 = static text. */
  remaining_cs: number;
}

export interface LiveScore {
  team: string;
  side: LiveSide;
  kills: number;
}

export interface LiveState {
  running: boolean;
  /** idle | pub | mix | draft | ovd | tt */
  mode: string;
  phase?: string | null;
  label?: string | null;
  time_left_ms: number | null;
  clock_total_ms: number | null;
  elapsed_ms: number | null;
  winning_team?: string | null;
  victory_in_ms?: number | null;
  score: LiveScore[];
}

export interface LiveMix {
  label: string;
  phase: string;
  team_size: number;
  rated: boolean;
  captains: Array<string | null>;
  turn?: string | null;
  pool?: string[];
  teams: Array<string | null>;
  kills: number[];
  remaining_ms: number;
  clock_total_ms: number;
  phase_remaining_ms: number;
  base?: string;
  offense?: string;
  defense?: string;
}

export interface LiveTT {
  round: number;
  teams: Array<string | null>;
  wins: number[];
  members: string[];
}

export interface LiveFlag {
  name: string;
  team: string | null;
  carrier: string | null;
}

export interface LiveArenaSnapshot {
  schema_version: number;
  script_version: string;
  game: LiveGame;
  zone: string;
  arena: string;
  level: string;
  map: string;
  /** Zone clock at build time (ISO 8601 UTC). */
  timestamp: string;
  interval_s: number;
  players_total: number;
  players_playing: number;
  players_spectating: number;
  state: LiveState;
  tickers: LiveTicker[];
  teams: LiveTeam[];
  mix?: LiveMix | null;
  mix2?: LiveMix | null;
  tt?: LiveTT | null;
  flags?: LiveFlag[];
}

/** A stored snapshot as the GET endpoints return it. */
export interface LiveArenaRow extends LiveArenaSnapshot {
  key: string;
  /** Site clock when the snapshot arrived (ISO 8601). Use this, not `timestamp`, for freshness. */
  updated_at: string;
  /** Seconds since `updated_at` at response time. */
  age_s: number;
}

export interface LiveResponse {
  success: true;
  generated_at: string;
  fresh_window_s: number;
  arenas: LiveArenaRow[];
}

export function liveArenaKey(game: string, zone: string, arena: string): string {
  return `${game}|${zone}|${arena}`;
}
