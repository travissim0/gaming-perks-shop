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
  /** Bumped by every change to the draft (pick, undo, pause…): the room uses it to tell newer from older. */
  updated_at?: string;
}

export interface DraftTeam {
  id: string;
  squad_id: string;
  pick_order: number;
  squad_name: string;
  squad_tag: string | null;
  captain_id: string | null;
  captain_alias: string | null;
  /** Co-captains run the draft for their squad too (pick, queue, chat). */
  co_captain_ids: string[];
}

/** Captain or co-captain of this team? */
export const leadsTeam = (t: DraftTeam, userId: string | null | undefined) =>
  !!userId && (t.captain_id === userId || t.co_captain_ids.includes(userId));

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
  /** Staff ADP rank: average of staff members' mock-draft boards (null if no staff board places them). */
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
  viewer: { user_id: string | null; alias: string | null; is_staff: boolean; my_team_id: string | null };
  /** Only present for the viewer's own team (captain) — ordered player ids. */
  my_queue?: string[];
  /** How many staff mock-draft boards the staff ranking (Staff ADP) is averaged from. */
  staff_adp_boards?: number;
}

/** The part of the board that is the same for every viewer (served from a shared, briefly cached copy). */
export type DraftBoard = Omit<DraftBundle, 'viewer' | 'my_queue'>;

/**
 * The small part that changes during a draft: the draft row (status, pick number, clock) and the picks.
 * Every viewer gets the same copy, so the room polls this instead of reloading the whole board.
 */
export interface DraftState {
  draft: DraftRow | null;
  picks: DraftPick[];
  /** Captains and staff who checked in recently. Null when the check-in table isn't installed. */
  here: DraftPresence[] | null;
  server_time: string;
  /** Set when `picks` only holds the picks AFTER this many (the viewer already has the earlier ones). */
  base?: number;
}

/**
 * Trim a state down to the picks a viewer doesn't have yet. The viewer says how many picks it holds
 * and the start of the last one's id; if that still matches (no undo since), only the later picks go
 * out. Anything else gets the full list.
 */
export function stateSince(state: DraftState, after: number, lastId: string): DraftState {
  if (!Number.isInteger(after) || after <= 0 || !lastId || !state.picks[after - 1]?.id.startsWith(lastId)) return state;
  return { ...state, picks: state.picks.slice(after), base: after };
}

/** Who the viewer is in this draft, and their private queue. Asked for separately from the shared board. */
export interface DraftMe {
  viewer: DraftBundle['viewer'];
  my_queue?: string[];
  draft_id: string | null;
}

/** When this copy of the draft was last changed, in ms (0 if unknown). */
export const draftStamp = (d: DraftRow | null | undefined): number => {
  const t = d?.updated_at ? Date.parse(d.updated_at) : NaN;
  return Number.isFinite(t) ? t : 0;
};

/** The pool with each player's drafted flags worked out from the picks. */
export function applyPicks(players: DraftPlayer[], picks: DraftPick[]): DraftPlayer[] {
  const byPlayer: Record<string, DraftPick> = {};
  picks.forEach((p) => { if (p.player_id) byPlayer[p.player_id] = p; });
  return players.map((p) => {
    const pk = byPlayer[p.player_id];
    const team = pk?.team_id || null;
    const overall = pk?.overall ?? null;
    return p.picked_team_id === team && p.picked_overall === overall ? p : { ...p, picked_team_id: team, picked_overall: overall };
  });
}

/** Someone in the draft room (from Realtime presence, or a captain/staff check-in). */
export interface DraftPresence {
  user_id: string | null;
  alias: string | null;
  is_staff: boolean;
  team_id: string | null;
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
