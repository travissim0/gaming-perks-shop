import { NextRequest } from 'next/server';
import { getServiceSupabase } from '@/lib/supabase';
import { clampInt, corsError, corsJson, corsPreflight } from '@/lib/uslMix/cors';

/**
 * GET /api/usl-mix/players - the rating leaderboard (mix games) merged with career totals (mix + pub).
 *   ?limit=50 (max 200) &offset=0
 *   ?minGames=3        minimum rated mix games (ignored while searching)
 *   ?sort=rating|games|kd|winrate|kills   (default rating)
 *   ?q=partial alias
 */
export const runtime = 'nodejs';

export async function OPTIONS() {
  return corsPreflight();
}

export async function GET(request: NextRequest) {
  try {
    const sp = new URL(request.url).searchParams;
    const limit = clampInt(sp.get('limit'), 50, 1, 200);
    const offset = clampInt(sp.get('offset'), 0, 0, 10000);
    const minGames = clampInt(sp.get('minGames'), 3, 0, 1000);
    const sort = (sp.get('sort') || 'rating').toLowerCase();
    const q = (sp.get('q') || '').trim();

    const supabase = getServiceSupabase();
    let query = supabase.from('usl_mix_player_ratings').select('*', { count: 'exact' });
    if (q) query = query.ilike('alias', `%${q.replace(/[%_]/g, '')}%`);
    else if (minGames > 0) query = query.gte('games', minGames);

    const sortCol = sort === 'games' ? 'games' : sort === 'kills' ? 'kills' : 'rating';
    query = query.order(sortCol, { ascending: false }).order('alias', { ascending: true }).range(offset, offset + limit - 1);
    const { data: ratings, error, count } = await query;
    if (error) return corsError(error.message, 500);

    const keys = (ratings ?? []).map((r: any) => r.alias_key);
    const careerByKey = new Map<string, any>();
    if (keys.length) {
      const { data: career } = await supabase.from('usl_mix_v_player_career').select('*').in('alias_key', keys);
      for (const c of career ?? []) careerByKey.set(c.alias_key, c);
    }

    let data = (ratings ?? []).map((r: any, i: number) => {
      const c = careerByKey.get(r.alias_key);
      const kills = Number(c?.kills ?? r.kills ?? 0);
      const deaths = Number(c?.deaths ?? r.deaths ?? 0);
      const shots = Number(c?.shots_fired ?? 0);
      return {
        rank: offset + i + 1,
        alias: r.alias,
        alias_key: r.alias_key,
        rating: Number(r.rating),
        peak_rating: Number(r.peak_rating),
        rated_games: r.games,
        wins: r.wins,
        losses: r.losses,
        draws: r.draws,
        win_rate: r.games > 0 ? Math.round((r.wins / r.games) * 1000) / 10 : null,
        kills,
        deaths,
        kd_ratio: deaths > 0 ? Math.round((kills / deaths) * 100) / 100 : kills,
        accuracy: shots > 0 ? Math.round((Number(c.shots_landed) / shots) * 1000) / 10 : null,
        heal_amount: Number(c?.heal_amount ?? 0),
        total_games: Number(c?.games ?? r.games),
        last_game_at: r.last_game_at,
        url: `/usl-mix/players/${encodeURIComponent(r.alias)}`,
      };
    });
    if (sort === 'kd') data = data.sort((a, b) => b.kd_ratio - a.kd_ratio);
    if (sort === 'winrate') data = data.sort((a, b) => (b.win_rate ?? 0) - (a.win_rate ?? 0));

    return corsJson(
      { success: true, data, pagination: { limit, offset, total: count ?? data.length, hasMore: offset + data.length < (count ?? 0) }, filters: { minGames, sort, q } },
      { cache: 30 }
    );
  } catch (e: any) {
    return corsError(e?.message || 'Internal error', 500);
  }
}
