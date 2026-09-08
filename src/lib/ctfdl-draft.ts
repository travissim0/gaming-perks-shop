/**
 * CTFDL live draft — shared types and pure helpers (safe for client + server).
 *
 * CTFDL-only. The draft lives in ctfdl_draft_* tables (see create-ctfdl-draft.sql)
 * and is never used by CTFPL or OVDL.
 */

export type DraftStatus = 'setup' | 'live' | 'paused' | 'complete';
export type OrderType = 'snake' | 'straight';
export type PickType = 'captain' | 'staff' | 'auto' | 'skip';

export interface DraftRow {
  id: string;
  league_season_id: string;
  status: DraftStatus;
  order_type: OrderType;
  roster_size: number;
  pick_seconds: number | null;
  auto_pick: boolean;
  current_pick: number;
  turn_started_at: string | null;
  paused_remaining: number | null;
  started_at: string | null;
  completed_at: string | null;
}

export interface DraftTeam {
  id: string;
  squad_id: string;
  pick_order: number;
  squad_name: string;
  squad_tag: string | null;
  captain_id: string | null;
  captain_alias: string | null;
}

export interface DraftPick {
  id: string;
  overall: number;
  round: number;
  team_id: string;
  player_id: string | null;
  pick_type: PickType;
  created_at: string;
}

export interface DraftPlayer {
  player_id: string;
  alias: string;
  preferred_roles: string[];
  secondary_roles: string[];
  classes_to_try: string[];
  class_ratings: Record<string, number>;
  availability_days: string[];
  availability_times: Record<string, { start: string; end: string }>;
  timezone: string | null;
  contact_info: string | null;
  notes: string | null;
  registered_at: string;
  staff_rank: number | null;
  /** Set when drafted. */
  picked_team_id: string | null;
  picked_overall: number | null;
}

export interface DraftBundle {
  draft: DraftRow | null;
  teams: DraftTeam[];
  picks: DraftPick[];
  players: DraftPlayer[];
  season: { id: string; season_number: number; season_name: string | null; status: string } | null;
  league: { id: string; slug: string; name: string } | null;
  /** ISO timestamp from the server, so clients can offset their clocks. */
  server_time: string;
  viewer: { user_id: string | null; is_staff: boolean; my_team_id: string | null };
  /** Only present for the viewer's own team (captain) — ordered player ids. */
  my_queue?: string[];
}

export interface DraftChatMessage {
  id: string;
  sender_id: string | null;
  sender_alias: string | null;
  sender_is_staff: boolean;
  sender_tag: string | null;
  kind: 'chat' | 'system';
  body: string;
  created_at: string;
}

/** Which team (0-based index into pick-order-sorted teams) makes overall pick k. */
export function teamIndexForPick(k: number, teamCount: number, orderType: OrderType): number {
  if (teamCount <= 0) return -1;
  const round = Math.floor((k - 1) / teamCount) + 1;
  let idx = (k - 1) % teamCount;
  if (orderType === 'snake' && round % 2 === 0) idx = teamCount - 1 - idx;
  return idx;
}

export function roundOf(k: number, teamCount: number): number {
  return teamCount > 0 ? Math.floor((k - 1) / teamCount) + 1 : 0;
}

export function totalPicks(draft: DraftRow, teamCount: number): number {
  return teamCount * draft.roster_size;
}

export function teamOnClock(draft: DraftRow | null, teams: DraftTeam[]): DraftTeam | null {
  if (!draft || (draft.status !== 'live' && draft.status !== 'paused')) return null;
  const sorted = [...teams].sort((a, b) => a.pick_order - b.pick_order);
  const idx = teamIndexForPick(draft.current_pick, sorted.length, draft.order_type);
  return idx >= 0 ? sorted[idx] : null;
}

/** Seconds left on the clock as of `now` (ms). Null when there is no clock. */
export function secondsLeft(draft: DraftRow | null, nowMs: number): number | null {
  if (!draft || draft.pick_seconds == null) return null;
  if (draft.status === 'paused') return draft.paused_remaining ?? draft.pick_seconds;
  if (draft.status !== 'live' || !draft.turn_started_at) return null;
  const elapsed = (nowMs - new Date(draft.turn_started_at).getTime()) / 1000;
  return Math.max(0, Math.ceil(draft.pick_seconds - elapsed));
}

export function formatClock(seconds: number | null): string {
  if (seconds == null) return '—';
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

/** Average of a player's self-ratings across preferred classes (fallback ordering). */
export function avgRating(p: DraftPlayer): number {
  const vals = p.preferred_roles.map((r) => p.class_ratings?.[r]).filter((v): v is number => typeof v === 'number');
  if (vals.length === 0) return 0;
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}

/**
 * Auto-pick order for a team: captain's queue first, then staff ranking, then
 * best self-rating, then earliest registration.
 */
export function autoPickCandidate(players: DraftPlayer[], queue: string[]): DraftPlayer | null {
  const available = players.filter((p) => !p.picked_team_id);
  if (available.length === 0) return null;
  for (const id of queue) {
    const hit = available.find((p) => p.player_id === id);
    if (hit) return hit;
  }
  const ranked = available.filter((p) => p.staff_rank != null).sort((a, b) => (a.staff_rank! - b.staff_rank!));
  if (ranked.length > 0) return ranked[0];
  return [...available].sort((a, b) => {
    const d = avgRating(b) - avgRating(a);
    if (d !== 0) return d;
    return new Date(a.registered_at).getTime() - new Date(b.registered_at).getTime();
  })[0];
}
