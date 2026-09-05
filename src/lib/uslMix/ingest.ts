import type { SupabaseClient } from '@supabase/supabase-js';
import type { GameResultPayload, PlayerPayload, KillEventPayload, TeamPayload, Result, Side } from './types';
import { aliasKey } from './types';
import { computeGameRatings, ELO, type RatingState, type TeamInput } from './elo';

/** Sanity limits so a buggy script cannot flood the tables. */
const LIMITS = {
  MAX_PLAYERS: 64,
  MAX_KILL_EVENTS: 5000,
  MAX_DURATION_SECONDS: 4 * 3600,
  INSERT_CHUNK: 500,
};

export class IngestError extends Error {
  status: number;
  details?: string[];
  constructor(message: string, status = 400, details?: string[]) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

const isStr = (v: unknown): v is string => typeof v === 'string';
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const numOr = (v: unknown, d: number) => (isNum(v) ? v : d);
const strOrNull = (v: unknown) => (isStr(v) && v.length > 0 ? v : null);
const sideOf = (v: unknown): Side | null => (v === 'T' || v === 'C' ? v : null);
const resultOf = (v: unknown): Result | null => (v === 'win' || v === 'loss' || v === 'draw' ? v : null);

/** Validates + normalises an incoming payload. Throws IngestError(400) with a list of problems. */
export function validatePayload(body: any): GameResultPayload {
  const problems: string[] = [];
  if (!body || typeof body !== 'object') throw new IngestError('Body must be a JSON object');
  if (body.action !== 'game_result') problems.push("action must be 'game_result'");
  if (!isStr(body.match_id) || body.match_id.length < 8 || body.match_id.length > 64) problems.push('match_id (8-64 chars) required');
  if (!['mix', 'pub', 'test'].includes(body.game_kind)) problems.push("game_kind must be mix|pub|test");
  if (!Array.isArray(body.teams) || body.teams.length !== 2) problems.push('teams must be an array of exactly 2');
  if (!Array.isArray(body.players) || body.players.length === 0) problems.push('players must be a non-empty array');
  if (Array.isArray(body.players) && body.players.length > LIMITS.MAX_PLAYERS) problems.push(`too many players (>${LIMITS.MAX_PLAYERS})`);
  if (body.kill_events !== undefined && !Array.isArray(body.kill_events)) problems.push('kill_events must be an array');
  if (Array.isArray(body.kill_events) && body.kill_events.length > LIMITS.MAX_KILL_EVENTS) problems.push(`too many kill_events (>${LIMITS.MAX_KILL_EVENTS})`);
  if (problems.length) throw new IngestError('Invalid payload', 400, problems);

  const teams: TeamPayload[] = body.teams.map((t: any, i: number) => {
    if (!isStr(t?.name)) problems.push(`teams[${i}].name required`);
    const result = resultOf(t?.result);
    if (!result) problems.push(`teams[${i}].result must be win|loss|draw`);
    return {
      name: String(t?.name ?? ''),
      side: sideOf(t?.side),
      kills: numOr(t?.kills, 0),
      deaths: numOr(t?.deaths, 0),
      result: result ?? 'draw',
      captain: strOrNull(t?.captain),
      player_count: numOr(t?.player_count, 0),
    };
  });
  if (teams[0]?.name && teams[0].name === teams[1]?.name) problems.push('the two teams must have different names');

  const players: PlayerPayload[] = body.players.map((p: any, i: number) => {
    if (!isStr(p?.alias) || p.alias.trim().length === 0) problems.push(`players[${i}].alias required`);
    const result = resultOf(p?.result);
    if (!result) problems.push(`players[${i}].result must be win|loss|draw`);
    if (!isStr(p?.team_name)) problems.push(`players[${i}].team_name required`);
    return {
      alias: String(p?.alias ?? '').trim().slice(0, 64),
      side: sideOf(p?.side),
      team_name: String(p?.team_name ?? ''),
      result: result ?? 'draw',
      is_captain: p?.is_captain === true,
      primary_class: strOrNull(p?.primary_class) ?? 'Unknown',
      classes: sanitizeNumberMap(p?.classes),
      kills: numOr(p?.kills, 0),
      deaths: numOr(p?.deaths, 0),
      team_kills: numOr(p?.team_kills, 0),
      kills_scoreboard: isNum(p?.kills_scoreboard) ? p.kills_scoreboard : null,
      deaths_scoreboard: isNum(p?.deaths_scoreboard) ? p.deaths_scoreboard : null,
      shots_fired: numOr(p?.shots_fired, 0),
      shots_landed: numOr(p?.shots_landed, 0),
      accuracy: isNum(p?.accuracy) ? Math.round(p.accuracy * 100) / 100 : null,
      bio_dart_hits: numOr(p?.bio_dart_hits, 0),
      heal_amount: numOr(p?.heal_amount, 0),
      heal_uses: numOr(p?.heal_uses, 0),
      play_seconds: numOr(p?.play_seconds, 0),
      weapon_kills: sanitizeWeaponMap(p?.weapon_kills),
      weapon_deaths: sanitizeWeaponMap(p?.weapon_deaths),
    };
  });
  // duplicate aliases would violate the unique constraint - merge is wrong, reject is right
  const seen = new Set<string>();
  for (const p of players) {
    const k = aliasKey(p.alias);
    if (seen.has(k)) problems.push(`duplicate player alias '${p.alias}'`);
    seen.add(k);
  }

  const kill_events: KillEventPayload[] = (body.kill_events ?? []).map((e: any, i: number) => {
    if (!isStr(e?.victim)) problems.push(`kill_events[${i}].victim required`);
    return {
      t: numOr(e?.t, 0),
      killer: strOrNull(e?.killer),
      victim: String(e?.victim ?? ''),
      killer_side: sideOf(e?.killer_side),
      victim_side: sideOf(e?.victim_side),
      killer_class: strOrNull(e?.killer_class),
      victim_class: strOrNull(e?.victim_class),
      weapon_id: numOr(e?.weapon_id, 0),
      weapon_name: strOrNull(e?.weapon_name),
      root_weapon_id: numOr(e?.root_weapon_id, 0),
      root_weapon_name: strOrNull(e?.root_weapon_name),
      team_kill: e?.team_kill === true,
      kill_type: strOrNull(e?.kill_type) ?? 'Unknown',
      attribution: ['matched', 'fallback', 'unknown', 'none'].includes(e?.attribution) ? e.attribution : 'unknown',
      x: numOr(e?.x, 0),
      y: numOr(e?.y, 0),
    };
  });

  if (problems.length) throw new IngestError('Invalid payload', 400, problems.slice(0, 25));

  const duration = Math.min(LIMITS.MAX_DURATION_SECONDS, Math.max(0, numOr(body.duration_seconds, 0)));
  return {
    action: 'game_result',
    schema_version: numOr(body.schema_version, 1),
    script_version: strOrNull(body.script_version) ?? undefined,
    match_id: body.match_id,
    zone_name: strOrNull(body.zone_name) ?? undefined,
    arena_name: strOrNull(body.arena_name) ?? undefined,
    level_file: strOrNull(body.level_file) ?? undefined,
    map_key: strOrNull(body.map_key)?.toLowerCase() ?? undefined,
    game_kind: body.game_kind,
    team_size: numOr(body.team_size, 0),
    rated: body.game_kind === 'mix' && body.rated === true,
    started_at: parseDate(body.started_at) ?? undefined,
    ended_at: parseDate(body.ended_at) ?? new Date().toISOString(),
    duration_seconds: duration,
    end_reason: strOrNull(body.end_reason) ?? undefined,
    unattributed_deaths: numOr(body.unattributed_deaths, 0),
    teams,
    players,
    kill_events,
  };
}

function parseDate(v: unknown): string | null {
  if (!isStr(v)) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function sanitizeNumberMap(v: unknown): Record<string, number> {
  const out: Record<string, number> = {};
  if (!v || typeof v !== 'object') return out;
  for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
    if (isNum(val)) out[String(k).slice(0, 64)] = val;
  }
  return out;
}

function sanitizeWeaponMap(v: unknown): Record<string, { name: string | null; count: number }> {
  const out: Record<string, { name: string | null; count: number }> = {};
  if (!v || typeof v !== 'object') return out;
  for (const [k, val] of Object.entries(v as Record<string, any>)) {
    if (!/^\d+$/.test(k)) continue;
    out[k] = { name: strOrNull(val?.name), count: numOr(val?.count, 0) };
  }
  return out;
}

export interface StoreResult {
  gameId: string;
  duplicate: boolean;
  players: number;
  killEvents: number;
}

/** Inserts the game, its players and kill events. Re-posting the same match_id is a no-op. */
export async function storeGame(supabase: SupabaseClient, payload: GameResultPayload, raw: unknown): Promise<StoreResult> {
  const [a, b] = payload.teams;
  const winner = a.result === 'win' ? a : b.result === 'win' ? b : null;
  const loser = winner ? (winner === a ? b : a) : null;

  const { data: existing } = await supabase
    .from('usl_mix_games')
    .select('id')
    .eq('match_id', payload.match_id)
    .maybeSingle();
  if (existing?.id) {
    return { gameId: existing.id, duplicate: true, players: 0, killEvents: 0 };
  }

  const gameRow = {
    match_id: payload.match_id,
    schema_version: payload.schema_version,
    script_version: payload.script_version ?? null,
    zone_name: payload.zone_name ?? null,
    arena_name: payload.arena_name ?? null,
    level_file: payload.level_file ?? null,
    map_key: payload.map_key ?? null,
    game_kind: payload.game_kind,
    team_size: payload.team_size ?? 0,
    rated: payload.rated === true,
    started_at: payload.started_at ?? null,
    ended_at: payload.ended_at,
    duration_seconds: payload.duration_seconds,
    end_reason: payload.end_reason ?? null,
    team_a_name: a.name, team_a_side: a.side, team_a_kills: a.kills, team_a_deaths: a.deaths, team_a_result: a.result, team_a_captain: a.captain, team_a_players: a.player_count,
    team_b_name: b.name, team_b_side: b.side, team_b_kills: b.kills, team_b_deaths: b.deaths, team_b_result: b.result, team_b_captain: b.captain, team_b_players: b.player_count,
    winner_side: winner?.side ?? null,
    winner_team: winner?.name ?? null,
    loser_team: loser?.name ?? null,
    unattributed_deaths: payload.unattributed_deaths ?? 0,
    elo_applied: false,
    raw: stripAuth(raw),
  };

  let { data: game, error: gameErr } = await supabase.from('usl_mix_games').insert(gameRow).select('id').single();
  if (gameErr && /column .*rated.* does not exist/i.test(gameErr.message || '')) {
    // schema not migrated yet (usl-mix-add-rated.sql) - store without the flag rather than lose the game
    console.warn('[usl-mix] usl_mix_games.rated column missing; inserting without it');
    const { rated: _r, ...legacyRow } = gameRow;
    ({ data: game, error: gameErr } = await supabase.from('usl_mix_games').insert(legacyRow).select('id').single());
  }
  if (gameErr || !game) {
    // unique violation = a concurrent duplicate; report it as such instead of failing
    if ((gameErr as any)?.code === '23505') {
      const { data: again } = await supabase.from('usl_mix_games').select('id').eq('match_id', payload.match_id).single();
      if (again?.id) return { gameId: again.id, duplicate: true, players: 0, killEvents: 0 };
    }
    throw new IngestError(`Failed to insert game: ${gameErr?.message ?? 'unknown'}`, 500);
  }

  const playerRows = payload.players.map((p) => ({
    game_id: game.id,
    alias: p.alias,
    alias_key: aliasKey(p.alias),
    side: p.side,
    team_name: p.team_name,
    result: p.result,
    is_captain: p.is_captain,
    primary_class: p.primary_class,
    classes: p.classes,
    kills: p.kills,
    deaths: p.deaths,
    team_kills: p.team_kills,
    kills_scoreboard: p.kills_scoreboard,
    deaths_scoreboard: p.deaths_scoreboard,
    shots_fired: p.shots_fired,
    shots_landed: p.shots_landed,
    accuracy: p.accuracy,
    bio_dart_hits: p.bio_dart_hits,
    heal_amount: p.heal_amount,
    heal_uses: p.heal_uses,
    play_seconds: p.play_seconds,
    weapon_kills: p.weapon_kills,
    weapon_deaths: p.weapon_deaths,
  }));
  const { error: playersErr } = await supabase.from('usl_mix_game_players').insert(playerRows);
  if (playersErr) {
    await supabase.from('usl_mix_games').delete().eq('id', game.id);
    throw new IngestError(`Failed to insert players: ${playersErr.message}`, 500);
  }

  const eventRows = payload.kill_events.map((e) => ({
    game_id: game.id,
    t_ms: e.t,
    killer: e.killer,
    killer_key: e.killer ? aliasKey(e.killer) : null,
    victim: e.victim,
    victim_key: aliasKey(e.victim),
    killer_side: e.killer_side,
    victim_side: e.victim_side,
    killer_class: e.killer_class,
    victim_class: e.victim_class,
    weapon_id: e.weapon_id || null,
    weapon_name: e.weapon_name,
    root_weapon_id: e.root_weapon_id || null,
    root_weapon_name: e.root_weapon_name,
    team_kill: e.team_kill,
    kill_type: e.kill_type,
    attribution: e.attribution,
    x: e.x,
    y: e.y,
  }));
  for (let i = 0; i < eventRows.length; i += LIMITS.INSERT_CHUNK) {
    const { error: evErr } = await supabase.from('usl_mix_kill_events').insert(eventRows.slice(i, i + LIMITS.INSERT_CHUNK));
    if (evErr) {
      // players are the important part; keep the game and report the partial failure
      console.error('[usl-mix] kill_events insert failed:', evErr.message);
      break;
    }
  }

  return { gameId: game.id, duplicate: false, players: playerRows.length, killEvents: eventRows.length };
}

function stripAuth(raw: unknown): unknown {
  if (!raw || typeof raw !== 'object') return raw;
  const copy: Record<string, unknown> = { ...(raw as Record<string, unknown>) };
  delete copy.auth_key;
  return copy;
}

export interface ApplyResult {
  applied: boolean;
  reason?: string;
  changes: number;
}

/**
 * Runs the ELO pass for one stored game (mix games only, once). Updates the player rows,
 * the ratings table and the history table.
 */
export async function applyRatingsForGame(supabase: SupabaseClient, gameId: string): Promise<ApplyResult> {
  const { data: game, error: gErr } = await supabase
    .from('usl_mix_games')
    .select('id, game_kind, rated, elo_applied, ended_at, team_a_name, team_a_kills, team_a_result, team_b_name, team_b_kills, team_b_result')
    .eq('id', gameId)
    .single();
  if (gErr || !game) return { applied: false, reason: 'game not found', changes: 0 };
  if (game.game_kind !== 'mix') return { applied: false, reason: `game_kind ${game.game_kind} is never rated`, changes: 0 };
  if (!game.rated) return { applied: false, reason: 'unrated mix (captains did not both ?rated)', changes: 0 };
  if (game.elo_applied) return { applied: false, reason: 'already applied', changes: 0 };

  const { data: players, error: pErr } = await supabase
    .from('usl_mix_game_players')
    .select('id, alias, alias_key, team_name, result, kills, deaths, heal_amount')
    .eq('game_id', gameId);
  if (pErr || !players) return { applied: false, reason: 'players not found', changes: 0 };

  const teamOf = (name: string): TeamInput => ({
    name,
    kills: name === game.team_a_name ? game.team_a_kills ?? 0 : game.team_b_kills ?? 0,
    result: (name === game.team_a_name ? game.team_a_result : game.team_b_result) as Result,
    players: players.filter((p: any) => p.team_name === name),
  });
  const teams: [TeamInput, TeamInput] = [teamOf(game.team_a_name), teamOf(game.team_b_name)];
  if (teams[0].players.length < ELO.MIN_PLAYERS_PER_TEAM || teams[1].players.length < ELO.MIN_PLAYERS_PER_TEAM) {
    await supabase.from('usl_mix_games').update({ elo_applied: true }).eq('id', gameId);
    return { applied: false, reason: 'a team was too small to rate', changes: 0 };
  }

  const keys = players.map((p: any) => p.alias_key);
  const { data: ratingRows } = await supabase
    .from('usl_mix_player_ratings')
    .select('alias_key, alias, rating, peak_rating, games, wins, losses, draws, kills, deaths')
    .in('alias_key', keys);
  const current = new Map<string, RatingState>();
  const full = new Map<string, any>();
  for (const r of ratingRows ?? []) {
    current.set(r.alias_key, { rating: Number(r.rating), games: r.games });
    full.set(r.alias_key, r);
  }

  const changes = computeGameRatings(teams, current);
  if (changes.length === 0) {
    await supabase.from('usl_mix_games').update({ elo_applied: true }).eq('id', gameId);
    return { applied: false, reason: 'no rateable players', changes: 0 };
  }

  const byKey = new Map(players.map((p: any) => [p.alias_key, p]));
  const upserts = changes.map((c) => {
    const prev = full.get(c.alias_key);
    const p = byKey.get(c.alias_key)!;
    return {
      alias_key: c.alias_key,
      alias: c.alias,
      rating: c.rating_after,
      peak_rating: Math.max(Number(prev?.peak_rating ?? ELO.BASE_RATING), c.rating_after),
      games: (prev?.games ?? 0) + 1,
      wins: (prev?.wins ?? 0) + (c.result === 'win' ? 1 : 0),
      losses: (prev?.losses ?? 0) + (c.result === 'loss' ? 1 : 0),
      draws: (prev?.draws ?? 0) + (c.result === 'draw' ? 1 : 0),
      kills: (prev?.kills ?? 0) + (p.kills ?? 0),
      deaths: (prev?.deaths ?? 0) + (p.deaths ?? 0),
      last_game_at: game.ended_at,
      updated_at: new Date().toISOString(),
    };
  });
  const { error: upErr } = await supabase.from('usl_mix_player_ratings').upsert(upserts, { onConflict: 'alias_key' });
  if (upErr) throw new IngestError(`ratings upsert failed: ${upErr.message}`, 500);

  const history = changes.map((c) => ({
    game_id: gameId,
    alias_key: c.alias_key,
    alias: c.alias,
    rating_before: c.rating_before,
    rating_after: c.rating_after,
    delta: c.delta,
    team_expected: c.team_expected,
    performance: c.performance,
    k_factor: c.k_factor,
  }));
  const { error: hErr } = await supabase.from('usl_mix_rating_history').insert(history);
  if (hErr) throw new IngestError(`history insert failed: ${hErr.message}`, 500);

  // per-row rating snapshot (one small update per player; games are <= ~20 players)
  await Promise.all(
    changes.map((c) =>
      supabase
        .from('usl_mix_game_players')
        .update({ rating_before: c.rating_before, rating_after: c.rating_after, rating_delta: c.delta, performance: c.performance })
        .eq('id', byKey.get(c.alias_key)!.id)
    )
  );
  await supabase.from('usl_mix_games').update({ elo_applied: true }).eq('id', gameId);
  return { applied: true, changes: changes.length };
}

/** Wipes ratings + history and replays every mix game in order. Used after tuning ELO constants. */
export async function recomputeAllRatings(supabase: SupabaseClient): Promise<{ games: number; rated: number }> {
  await supabase.from('usl_mix_rating_history').delete().gte('id', 0);
  await supabase.from('usl_mix_player_ratings').delete().neq('alias_key', '');
  await supabase.from('usl_mix_game_players').update({ rating_before: null, rating_after: null, rating_delta: null, performance: null }).gte('id', 0);
  await supabase.from('usl_mix_games').update({ elo_applied: false }).eq('game_kind', 'mix');

  const { data: games } = await supabase
    .from('usl_mix_games')
    .select('id')
    .eq('game_kind', 'mix')
    .eq('rated', true)
    .order('ended_at', { ascending: true });
  let rated = 0;
  for (const g of games ?? []) {
    const r = await applyRatingsForGame(supabase, g.id);
    if (r.applied) rated++;
  }
  return { games: games?.length ?? 0, rated };
}
