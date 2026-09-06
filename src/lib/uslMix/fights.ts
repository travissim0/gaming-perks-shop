import { aliasKey } from './types';

/**
 * Opening kills (Travis, 2026-09-06). A "fight" is a run of enemy kills where each comes within
 * OPENING_LULL_MS of the previous one; the first kill of every fight is the opening kill, which
 * covers the start of the game automatically. Measured on the first recorded games, gaps under
 * ~25s are the same fight, 30-59s is a fight dragging on with uneven numbers (deliberately NOT a
 * new opening), and 60s+ are genuine resets with both teams regrouped - about two per game.
 * Derived purely from kill event timestamps, so the zone script needs nothing extra.
 */
export const OPENING_LULL_MS = 60_000;

export interface FightEventInput {
  t_ms: number;
  killer: string | null;
  victim: string;
  killer_side: string | null;
  victim_side: string | null;
  team_kill: boolean;
  killer_class?: string | null;
  victim_class?: string | null;
}

export interface Fight {
  no: number;
  start_ms: number;
  end_ms: number;
  kills: number;
  kills_t: number;
  kills_c: number;
  opener: string | null;
  opener_side: string | null;
  opened_on: string;
  opened_on_side: string | null;
  opener_class: string | null;
  opened_on_class: string | null;
  /** side with more kills in the fight; null on a tie or when sides are unknown */
  winner_side: 'T' | 'C' | null;
}

export type TaggedEvent<E> = E & { fight_no: number | null; is_opening: boolean };

/** Sorts by time and tags every event with its fight number and whether it opened that fight. */
export function splitFights<E extends FightEventInput>(events: E[]): { fights: Fight[]; tagged: TaggedEvent<E>[] } {
  const sorted = events
    .map((e, i) => ({ e, i }))
    .sort((a, b) => a.e.t_ms - b.e.t_ms || a.i - b.i)
    .map((x) => x.e);
  const fights: Fight[] = [];
  const tagged: TaggedEvent<E>[] = [];
  let current: Fight | null = null;
  let lastKillMs = -Infinity;
  for (const e of sorted) {
    const enemyKill = !!e.killer && !e.team_kill;
    const withinLull = e.t_ms - lastKillMs < OPENING_LULL_MS;
    if (!enemyKill) {
      // team kills and killer-less deaths belong to whatever fight is running but never open one
      tagged.push({ ...e, fight_no: current && withinLull ? current.no : null, is_opening: false });
      continue;
    }
    let opening = false;
    if (!current || !withinLull) {
      current = {
        no: fights.length + 1,
        start_ms: e.t_ms,
        end_ms: e.t_ms,
        kills: 0,
        kills_t: 0,
        kills_c: 0,
        opener: e.killer,
        opener_side: e.killer_side,
        opened_on: e.victim,
        opened_on_side: e.victim_side,
        opener_class: e.killer_class ?? null,
        opened_on_class: e.victim_class ?? null,
        winner_side: null,
      };
      fights.push(current);
      opening = true;
    }
    current.kills++;
    if (e.killer_side === 'T') current.kills_t++;
    else if (e.killer_side === 'C') current.kills_c++;
    current.end_ms = e.t_ms;
    lastKillMs = e.t_ms;
    tagged.push({ ...e, fight_no: current.no, is_opening: opening });
  }
  for (const f of fights) f.winner_side = f.kills_t > f.kills_c ? 'T' : f.kills_c > f.kills_t ? 'C' : null;
  return { fights, tagged };
}

export interface OpeningStats {
  opening_kills: number;
  opening_deaths: number;
  /** fights this player opened that their side then won on kills */
  opening_fights_won: number;
}

/** Per-player opening totals for one game, keyed by aliasKey. */
export function openingStatsByPlayer(fights: Fight[]): Map<string, OpeningStats> {
  const out = new Map<string, OpeningStats>();
  const get = (alias: string) => {
    const k = aliasKey(alias);
    let s = out.get(k);
    if (!s) out.set(k, (s = { opening_kills: 0, opening_deaths: 0, opening_fights_won: 0 }));
    return s;
  };
  for (const f of fights) {
    if (f.opener) {
      const s = get(f.opener);
      s.opening_kills++;
      if (f.winner_side && f.winner_side === f.opener_side) s.opening_fights_won++;
    }
    get(f.opened_on).opening_deaths++;
  }
  return out;
}
