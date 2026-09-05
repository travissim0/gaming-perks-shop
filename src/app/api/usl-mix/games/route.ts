import { NextRequest } from 'next/server';
import { getServiceSupabase } from '@/lib/supabase';
import { clampInt, corsError, corsJson, corsPreflight } from '@/lib/uslMix/cors';
import { aliasKey } from '@/lib/uslMix/types';

/**
 * GET /api/usl-mix/games - recent games, newest first.
 *   ?limit=25 (max 100) &offset=0
 *   ?kind=mix|pub|test|all   (default: mix + pub)
 *   ?map=els                 (map_key)
 *   ?alias=Name              only games this player was in
 *   ?since=2026-09-01        ISO date lower bound on ended_at
 *   ?rated=true|false        only ELO-rated (or only unrated) games
 * Each game carries a compact player list (alias, side, class, K/D, result).
 */
export const runtime = 'nodejs';

export async function OPTIONS() {
  return corsPreflight();
}

const GAME_COLUMNS =
  'id, match_id, zone_name, arena_name, level_file, map_key, game_kind, team_size, started_at, ended_at, duration_seconds, end_reason, ' +
  'team_a_name, team_a_side, team_a_kills, team_a_deaths, team_a_result, team_a_captain, team_a_players, ' +
  'team_b_name, team_b_side, team_b_kills, team_b_deaths, team_b_result, team_b_captain, team_b_players, ' +
  'winner_side, winner_team, loser_team, unattributed_deaths, elo_applied, rated';

export async function GET(request: NextRequest) {
  try {
    const sp = new URL(request.url).searchParams;
    const limit = clampInt(sp.get('limit'), 25, 1, 100);
    const offset = clampInt(sp.get('offset'), 0, 0, 10000);
    const kind = (sp.get('kind') || '').toLowerCase();
    const map = (sp.get('map') || '').toLowerCase();
    const alias = sp.get('alias');
    const since = sp.get('since');
    const rated = sp.get('rated');

    const supabase = getServiceSupabase();
    let gameIds: string[] | null = null;
    if (alias) {
      const { data: rows } = await supabase
        .from('usl_mix_game_players')
        .select('game_id')
        .eq('alias_key', aliasKey(alias))
        .limit(2000);
      gameIds = Array.from(new Set((rows ?? []).map((r: any) => r.game_id)));
      if (gameIds.length === 0) return corsJson({ success: true, data: [], pagination: { limit, offset, total: 0, hasMore: false } }, { cache: 30 });
    }

    let q = supabase.from('usl_mix_games').select(GAME_COLUMNS, { count: 'exact' });
    if (kind === 'mix' || kind === 'pub' || kind === 'test') q = q.eq('game_kind', kind);
    else if (kind !== 'all') q = q.in('game_kind', ['mix', 'pub']);
    if (map) q = q.eq('map_key', map);
    if (since) q = q.gte('ended_at', since);
    if (rated === 'true' || rated === 'false') q = q.eq('rated', rated === 'true');
    if (gameIds) q = q.in('id', gameIds);
    q = q.order('ended_at', { ascending: false }).range(offset, offset + limit - 1);

    const { data: games, error, count } = await q;
    if (error) return corsError(error.message, 500);

    const ids = (games ?? []).map((g: any) => g.id);
    let playersByGame = new Map<string, any[]>();
    if (ids.length) {
      const { data: players } = await supabase
        .from('usl_mix_game_players')
        .select('game_id, alias, side, team_name, result, is_captain, primary_class, kills, deaths, accuracy, heal_amount, rating_delta')
        .in('game_id', ids)
        .order('kills', { ascending: false });
      for (const p of players ?? []) {
        const list = playersByGame.get(p.game_id) ?? [];
        list.push(p);
        playersByGame.set(p.game_id, list);
      }
    }

    const data = (games ?? []).map((g: any) => ({
      ...g,
      players: playersByGame.get(g.id) ?? [],
      url: `/usl-mix/games/${g.id}`,
    }));
    return corsJson(
      { success: true, data, pagination: { limit, offset, total: count ?? data.length, hasMore: offset + data.length < (count ?? 0) } },
      { cache: 30 }
    );
  } catch (e: any) {
    return corsError(e?.message || 'Internal error', 500);
  }
}
