import { NextRequest } from 'next/server';
import { getServiceSupabase } from '@/lib/supabase';
import { clampInt, corsError, corsJson, corsPreflight } from '@/lib/uslMix/cors';
import { aliasKey } from '@/lib/uslMix/types';

/**
 * GET /api/usl-mix/players/{alias} - one player: rating, career totals, class breakdown,
 * weapon kills, rating history and recent games. ?games=20 (max 100) recent games.
 */
export const runtime = 'nodejs';

export async function OPTIONS() {
  return corsPreflight();
}

export async function GET(request: NextRequest, context: { params: Promise<{ alias: string }> }) {
  try {
    const { alias } = await context.params;
    const key = aliasKey(decodeURIComponent(alias));
    if (!key) return corsError('alias required', 400);
    const gamesLimit = clampInt(new URL(request.url).searchParams.get('games'), 20, 1, 100);
    const supabase = getServiceSupabase();

    const [{ data: rating }, { data: career }, { data: rows }, { data: history }] = await Promise.all([
      supabase.from('usl_mix_player_ratings').select('*').eq('alias_key', key).maybeSingle(),
      supabase.from('usl_mix_v_player_career').select('*').eq('alias_key', key).maybeSingle(),
      supabase
        .from('usl_mix_game_players')
        .select(
          'game_id, alias, side, team_name, result, is_captain, primary_class, classes, kills, deaths, team_kills, shots_fired, shots_landed, accuracy, bio_dart_hits, heal_amount, play_seconds, weapon_kills, weapon_deaths, rating_before, rating_after, rating_delta, performance, ' +
            'usl_mix_games!inner(id, ended_at, map_key, level_file, game_kind, rated, duration_seconds, end_reason, team_a_name, team_a_kills, team_b_name, team_b_kills, winner_team)'
        )
        .eq('alias_key', key)
        .order('ended_at', { referencedTable: 'usl_mix_games', ascending: false })
        .limit(500),
      supabase
        .from('usl_mix_rating_history')
        .select('game_id, rating_before, rating_after, delta, team_expected, performance, k_factor, created_at')
        .eq('alias_key', key)
        .order('created_at', { ascending: true })
        .limit(500),
    ]);

    if (!rating && !career && (!rows || rows.length === 0)) return corsError('Player not found', 404);

    // Real games (mix + pub) drive everything. A player seen only in *mixstats sendnow test
    // snapshots still gets a profile, flagged test_only, so testers can click through.
    const realRows = ((rows ?? []) as any[]).filter((r) => r.usl_mix_games?.game_kind !== 'test');
    const testOnly = realRows.length === 0 && (rows ?? []).length > 0;
    const all = testOnly ? ((rows ?? []) as any[]) : realRows;
    // recent games sorted by end time (the join order is best-effort)
    const recent = all
      .slice()
      .sort((a, b) => new Date(b.usl_mix_games?.ended_at).getTime() - new Date(a.usl_mix_games?.ended_at).getTime())
      .slice(0, gamesLimit)
      .map((r) => ({
        game_id: r.game_id,
        ended_at: r.usl_mix_games?.ended_at,
        map_key: r.usl_mix_games?.map_key,
        game_kind: r.usl_mix_games?.game_kind,
        rated: r.usl_mix_games?.rated === true,
        duration_seconds: r.usl_mix_games?.duration_seconds,
        end_reason: r.usl_mix_games?.end_reason,
        team_a_name: r.usl_mix_games?.team_a_name,
        team_a_kills: r.usl_mix_games?.team_a_kills,
        team_b_name: r.usl_mix_games?.team_b_name,
        team_b_kills: r.usl_mix_games?.team_b_kills,
        side: r.side,
        team_name: r.team_name,
        result: r.result,
        is_captain: r.is_captain,
        primary_class: r.primary_class,
        kills: r.kills,
        deaths: r.deaths,
        accuracy: r.accuracy,
        heal_amount: r.heal_amount,
        rating_delta: r.rating_delta,
        url: `/usl-mix/games/${r.game_id}`,
      }));

    // class breakdown across all games
    const classes = new Map<string, { class_name: string; games: number; wins: number; kills: number; deaths: number; seconds: number }>();
    const weapons = new Map<string, { weapon: string; weapon_id: number; kills: number }>();
    const maps = new Map<string, { map_key: string; games: number; wins: number }>();
    for (const r of all) {
      const cls = r.primary_class || 'Unknown';
      const c = classes.get(cls) ?? { class_name: cls, games: 0, wins: 0, kills: 0, deaths: 0, seconds: 0 };
      c.games++;
      if (r.result === 'win') c.wins++;
      c.kills += r.kills ?? 0;
      c.deaths += r.deaths ?? 0;
      c.seconds += Number((r.classes ?? {})[cls] ?? 0);
      classes.set(cls, c);
      for (const [id, wc] of Object.entries((r.weapon_kills ?? {}) as Record<string, any>)) {
        const name = wc?.name || `Item ${id}`;
        const w = weapons.get(name) ?? { weapon: name, weapon_id: Number(id), kills: 0 };
        w.kills += Number(wc?.count ?? 0);
        weapons.set(name, w);
      }
      const mk = r.usl_mix_games?.map_key || 'unknown';
      const m = maps.get(mk) ?? { map_key: mk, games: 0, wins: 0 };
      m.games++;
      if (r.result === 'win') m.wins++;
      maps.set(mk, m);
    }

    return corsJson(
      {
        success: true,
        alias: rating?.alias ?? career?.alias ?? all[0]?.alias ?? alias,
        alias_key: key,
        test_only: testOnly,
        rating: rating
          ? { ...rating, rating: Number(rating.rating), peak_rating: Number(rating.peak_rating), win_rate: rating.games ? Math.round((rating.wins / rating.games) * 1000) / 10 : null }
          : null,
        career: career
          ? {
              ...career,
              kd_ratio: Number(career.deaths) > 0 ? Math.round((Number(career.kills) / Number(career.deaths)) * 100) / 100 : Number(career.kills),
              accuracy: Number(career.shots_fired) > 0 ? Math.round((Number(career.shots_landed) / Number(career.shots_fired)) * 1000) / 10 : null,
            }
          : null,
        classes: Array.from(classes.values()).sort((a, b) => b.games - a.games),
        weapons: Array.from(weapons.values()).sort((a, b) => b.kills - a.kills),
        maps: Array.from(maps.values()).sort((a, b) => b.games - a.games),
        rating_history: history ?? [],
        recent_games: recent,
      },
      { cache: 30 }
    );
  } catch (e: any) {
    return corsError(e?.message || 'Internal error', 500);
  }
}
