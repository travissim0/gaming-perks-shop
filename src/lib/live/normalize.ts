import {
  LIVE_SCHEMA_VERSION,
  LiveArenaSnapshot,
  LiveFlag,
  LiveGame,
  LiveMix,
  LivePlayer,
  LiveScore,
  LiveSide,
  LiveState,
  LiveTT,
  LiveTeam,
  LiveTicker,
} from './types';

/**
 * Validate + sanitise an incoming snapshot. The zone scripts are trusted (keyed), but the
 * payload is stored verbatim and rendered on the home page, so every string is capped and
 * every array bounded - a runaway arena can never grow a row past a few tens of KB.
 */

const MAX_TEAMS = 64;
const MAX_PLAYERS_PER_TEAM = 128;
const MAX_TICKERS = 5;
const MAX_POOL = 64;
const MAX_FLAGS = 32;
const MAX_SCORE = 8;

const SIDES: LiveSide[] = ['T', 'C', 'spec', 'np', 'other'];

function str(v: unknown, max: number, dflt = ''): string {
  if (typeof v !== 'string') return dflt;
  // Strip control characters; the strings end up in the DOM and in JSON responses.
  const s = v.replace(/[\u0000-\u001f\u007f]/g, '').trim();
  return s.length > max ? s.slice(0, max) : s;
}

function strOrNull(v: unknown, max: number): string | null {
  return typeof v === 'string' ? str(v, max) : null;
}

function int(v: unknown, dflt = 0): number {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN;
  return Number.isFinite(n) ? Math.trunc(n) : dflt;
}

function intOrNull(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  const n = typeof v === 'number' ? v : NaN;
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

function side(v: unknown): LiveSide {
  return typeof v === 'string' && (SIDES as string[]).includes(v) ? (v as LiveSide) : 'other';
}

function player(p: any): LivePlayer | null {
  const alias = str(p?.alias, 32);
  if (!alias) return null;
  const out: LivePlayer = {
    alias,
    class: str(p?.class ?? p?.className, 40, 'Unknown') || 'Unknown',
    spec: !!p?.spec,
  };
  if (p?.dead) out.dead = true;
  if (p?.captain) out.captain = true;
  const squad = strOrNull(p?.squad, 32);
  if (squad) out.squad = squad;
  return out;
}

function team(t: any): LiveTeam | null {
  const name = str(t?.name, 48);
  if (!name) return null;
  const players = Array.isArray(t?.players)
    ? (t.players as any[]).slice(0, MAX_PLAYERS_PER_TEAM).map(player).filter((p): p is LivePlayer => !!p)
    : [];
  return { name, side: side(t?.side), kills: int(t?.kills), deaths: int(t?.deaths), players };
}

function ticker(t: any): LiveTicker | null {
  const idx = int(t?.idx, -1);
  if (idx < 0 || idx > 4) return null;
  const text = str(t?.text, 160);
  const remaining_cs = Math.max(0, int(t?.remaining_cs));
  if (!text && remaining_cs === 0) return null;
  return { idx, colour: int(t?.colour), text, remaining_cs };
}

function score(s: any): LiveScore | null {
  const name = str(s?.team, 48);
  if (!name) return null;
  return { team: name, side: side(s?.side), kills: int(s?.kills) };
}

function state(s: any): LiveState {
  return {
    running: !!s?.running,
    mode: str(s?.mode, 16, 'idle') || 'idle',
    phase: strOrNull(s?.phase, 32),
    label: strOrNull(s?.label, 120),
    time_left_ms: intOrNull(s?.time_left_ms),
    clock_total_ms: intOrNull(s?.clock_total_ms),
    elapsed_ms: intOrNull(s?.elapsed_ms),
    winning_team: strOrNull(s?.winning_team, 48),
    victory_in_ms: intOrNull(s?.victory_in_ms),
    score: Array.isArray(s?.score) ? (s.score as any[]).slice(0, MAX_SCORE).map(score).filter((x): x is LiveScore => !!x) : [],
  };
}

function aliasList(v: unknown, max: number): Array<string | null> {
  if (!Array.isArray(v)) return [];
  return (v as unknown[]).slice(0, max).map((a) => (typeof a === 'string' ? str(a, 32) : null));
}

function mix(m: any): LiveMix | null {
  if (!m || typeof m !== 'object') return null;
  const out: LiveMix = {
    label: str(m.label, 16, 'MIX') || 'MIX',
    phase: str(m.phase, 32, 'Idle') || 'Idle',
    team_size: int(m.team_size),
    rated: !!m.rated,
    captains: aliasList(m.captains, 2),
    turn: strOrNull(m.turn, 32),
    teams: aliasList(m.teams, 2).map((t) => (t ? str(t, 48) : null)),
    kills: Array.isArray(m.kills) ? (m.kills as unknown[]).slice(0, 2).map((k) => int(k)) : [],
    remaining_ms: int(m.remaining_ms),
    clock_total_ms: int(m.clock_total_ms),
    phase_remaining_ms: int(m.phase_remaining_ms),
  };
  if (Array.isArray(m.pool)) out.pool = aliasList(m.pool, MAX_POOL).filter((a): a is string => !!a);
  const base = strOrNull(m.base, 48);
  if (base) out.base = base;
  const off = strOrNull(m.offense, 48);
  if (off) out.offense = off;
  const def = strOrNull(m.defense, 48);
  if (def) out.defense = def;
  return out;
}

function tt(t: any): LiveTT | null {
  if (!t || typeof t !== 'object') return null;
  return {
    round: int(t.round, 1),
    teams: aliasList(t.teams, 2).map((x) => (x ? str(x, 48) : null)),
    wins: Array.isArray(t.wins) ? (t.wins as unknown[]).slice(0, 2).map((w) => int(w)) : [],
    members: aliasList(t.members, MAX_POOL).filter((a): a is string => !!a),
  };
}

function flags(v: unknown): LiveFlag[] | undefined {
  if (!Array.isArray(v)) return undefined;
  const out = (v as any[])
    .slice(0, MAX_FLAGS)
    .map((f) => ({ name: str(f?.name, 32, 'flag') || 'flag', team: strOrNull(f?.team, 48), carrier: strOrNull(f?.carrier, 32) }));
  return out.length ? out : undefined;
}

export type NormalizeResult = { ok: true; snapshot: LiveArenaSnapshot } | { ok: false; error: string };

export function normalizeSnapshot(body: any): NormalizeResult {
  if (!body || typeof body !== 'object') return { ok: false, error: 'Body must be a JSON object' };
  const game = str(body.game, 8).toLowerCase();
  if (game !== 'usl' && game !== 'ctf') return { ok: false, error: 'game must be "usl" or "ctf"' };
  const zone = str(body.zone ?? body.zone_name, 80);
  const arena = str(body.arena ?? body.arena_name, 64);
  if (!zone || !arena) return { ok: false, error: 'zone and arena are required' };
  if (!Array.isArray(body.teams)) return { ok: false, error: 'teams must be an array' };

  const teams = (body.teams as any[]).slice(0, MAX_TEAMS).map(team).filter((t): t is LiveTeam => !!t);
  const counted = teams.reduce(
    (acc, t) => {
      for (const p of t.players) {
        acc.total++;
        if (p.spec) acc.spec++;
      }
      return acc;
    },
    { total: 0, spec: 0 },
  );

  const snapshot: LiveArenaSnapshot = {
    schema_version: int(body.schema_version, LIVE_SCHEMA_VERSION),
    script_version: str(body.script_version, 24, '?') || '?',
    game: game as LiveGame,
    zone,
    arena,
    level: str(body.level, 64),
    map: str(body.map, 48),
    timestamp: str(body.timestamp, 40) || new Date().toISOString(),
    interval_s: Math.max(0, int(body.interval_s, 60)),
    // Trust the counted roster over the zone's own totals - the two only differ if a payload is malformed.
    players_total: counted.total,
    players_playing: counted.total - counted.spec,
    players_spectating: counted.spec,
    state: state(body.state),
    tickers: Array.isArray(body.tickers)
      ? (body.tickers as any[]).slice(0, MAX_TICKERS).map(ticker).filter((t): t is LiveTicker => !!t)
      : [],
    teams,
    mix: mix(body.mix),
    mix2: mix(body.mix2),
    tt: tt(body.tt),
  };
  const fl = flags(body.flags);
  if (fl) snapshot.flags = fl;
  return { ok: true, snapshot };
}
