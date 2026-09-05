/**
 * Wire types for the USL Mix stats pipeline.
 *
 * The zone script (bin/scripts/GameTypes/USL/USLMixStats.cs) POSTs a GameResultPayload to
 * /api/usl-mix/ingest at Game.End. Field names here are the contract - keep them in sync
 * with BuildPayload() in that file and with the docs page at /usl-mix/api.
 */

export type GameKind = 'mix' | 'pub' | 'test';
export type Side = 'T' | 'C';
export type Result = 'win' | 'loss' | 'draw';

export interface TeamPayload {
  name: string;
  side: Side | null;
  kills: number;
  deaths: number;
  result: Result;
  captain: string | null;
  player_count: number;
}

export interface WeaponCount {
  name: string | null;
  count: number;
}

export interface PlayerPayload {
  alias: string;
  side: Side | null;
  team_name: string;
  result: Result;
  is_captain: boolean;
  primary_class: string;
  /** class name -> seconds played as that class */
  classes: Record<string, number>;
  kills: number;
  deaths: number;
  team_kills: number;
  kills_scoreboard: number | null;
  deaths_scoreboard: number | null;
  shots_fired: number;
  shots_landed: number;
  accuracy: number | null;
  bio_dart_hits: number;
  heal_amount: number;
  heal_uses: number;
  play_seconds: number;
  /** root weapon id (as string key) -> {name, count} */
  weapon_kills: Record<string, WeaponCount>;
  weapon_deaths: Record<string, WeaponCount>;
}

export interface KillEventPayload {
  t: number;
  killer: string | null;
  victim: string;
  killer_side: Side | null;
  victim_side: Side | null;
  killer_class: string | null;
  victim_class: string | null;
  weapon_id: number;
  weapon_name: string | null;
  root_weapon_id: number;
  root_weapon_name: string | null;
  team_kill: boolean;
  kill_type: string;
  attribution: 'matched' | 'fallback' | 'unknown' | 'none';
  x: number;
  y: number;
}

export interface GameResultPayload {
  action: 'game_result';
  schema_version: number;
  script_version?: string;
  match_id: string;
  zone_name?: string;
  arena_name?: string;
  level_file?: string;
  map_key?: string;
  game_kind: GameKind;
  team_size?: number;
  /** ELO opt-in: both captains typed ?rated (or a ref forced it). Ratings move only when true AND game_kind is mix. */
  rated?: boolean;
  started_at?: string;
  ended_at?: string;
  duration_seconds: number;
  end_reason?: string;
  unattributed_deaths?: number;
  teams: TeamPayload[];
  players: PlayerPayload[];
  kill_events: KillEventPayload[];
}

/** Row shape of usl_mix_game_players as the ELO pass needs it. */
export interface RatingInputPlayer {
  alias: string;
  alias_key: string;
  team_name: string;
  result: Result;
  kills: number;
  deaths: number;
  heal_amount: number;
}

export function aliasKey(alias: string): string {
  return (alias || '').trim().toLowerCase();
}
