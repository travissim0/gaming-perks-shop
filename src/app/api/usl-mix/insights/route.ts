import { NextRequest } from 'next/server';
import { getServiceSupabase } from '@/lib/supabase';
import { corsError, corsJson, corsPreflight } from '@/lib/uslMix/cors';

/**
 * GET /api/usl-mix/insights - aggregate insights for charts.
 *   ?map=els          restrict class/weapon/side stats to one map (default: all maps)
 *   ?kind=mix|pub|all (default all = mix + pub)
 * Returns side win rates per map (always all maps, so the per-map chart can render),
 * class stats and weapon kill shares (filtered by ?map), plus headline totals.
 */
export const runtime = 'nodejs';

export async function OPTIONS() {
  return corsPreflight();
}

type SideRow = { map_key: string; game_kind: string; games: number; titan_wins: number; collective_wins: number; draws: number; titan_kills: number; collective_kills: number };
type ClassRow = { map_key: string; game_kind: string; class_name: string; appearances: number; wins: number; losses: number; kills: number; deaths: number; shots_fired: number; shots_landed: number; heal_amount: number; play_seconds: number };
type WeaponRow = { map_key: string; game_kind: string; weapon: string; weapon_id: number | null; kills: number; kills_matched: number };

const n = (v: unknown) => Number(v ?? 0);

export async function GET(request: NextRequest) {
  try {
    const sp = new URL(request.url).searchParams;
    const map = (sp.get('map') || '').toLowerCase();
    const kind = (sp.get('kind') || 'all').toLowerCase();
    const kinds = kind === 'mix' ? ['mix'] : kind === 'pub' ? ['pub'] : ['mix', 'pub'];

    const supabase = getServiceSupabase();
    const [{ data: sideRows, error: e1 }, { data: classRows, error: e2 }, { data: weaponRows, error: e3 }, { count: playersRated }, { data: durations }] = await Promise.all([
      supabase.from('usl_mix_v_side_winrates').select('*').in('game_kind', kinds),
      supabase.from('usl_mix_v_class_stats').select('*').in('game_kind', kinds),
      supabase.from('usl_mix_v_weapon_stats').select('*').in('game_kind', kinds),
      supabase.from('usl_mix_player_ratings').select('alias_key', { count: 'exact', head: true }),
      supabase.from('usl_mix_games').select('duration_seconds, map_key').in('game_kind', kinds).limit(5000),
    ]);
    if (e1 || e2 || e3) return corsError((e1 || e2 || e3)!.message, 500);

    const sides = (sideRows ?? []) as SideRow[];
    const classes = ((classRows ?? []) as ClassRow[]).filter((r) => !map || r.map_key === map);
    const weapons = ((weaponRows ?? []) as WeaponRow[]).filter((r) => !map || r.map_key === map);

    // side win rates: per map + overall
    const perMap = new Map<string, { map_key: string; games: number; titan_wins: number; collective_wins: number; draws: number; titan_kills: number; collective_kills: number }>();
    for (const r of sides) {
      const m = perMap.get(r.map_key) ?? { map_key: r.map_key, games: 0, titan_wins: 0, collective_wins: 0, draws: 0, titan_kills: 0, collective_kills: 0 };
      m.games += n(r.games); m.titan_wins += n(r.titan_wins); m.collective_wins += n(r.collective_wins); m.draws += n(r.draws);
      m.titan_kills += n(r.titan_kills); m.collective_kills += n(r.collective_kills);
      perMap.set(r.map_key, m);
    }
    const withRates = (m: { games: number; titan_wins: number; collective_wins: number }) => ({
      titan_win_rate: m.games ? Math.round((m.titan_wins / m.games) * 1000) / 10 : null,
      collective_win_rate: m.games ? Math.round((m.collective_wins / m.games) * 1000) / 10 : null,
    });
    const sideByMap = Array.from(perMap.values()).map((m) => ({ ...m, ...withRates(m) })).sort((a, b) => b.games - a.games);
    const overallSide = sideByMap.reduce(
      (acc, m) => ({ games: acc.games + m.games, titan_wins: acc.titan_wins + m.titan_wins, collective_wins: acc.collective_wins + m.collective_wins, draws: acc.draws + m.draws, titan_kills: acc.titan_kills + m.titan_kills, collective_kills: acc.collective_kills + m.collective_kills }),
      { games: 0, titan_wins: 0, collective_wins: 0, draws: 0, titan_kills: 0, collective_kills: 0 }
    );

    // class stats (aggregate across the selected maps)
    const byClass = new Map<string, ClassRow>();
    for (const r of classes) {
      const c = byClass.get(r.class_name) ?? { ...r, appearances: 0, wins: 0, losses: 0, kills: 0, deaths: 0, shots_fired: 0, shots_landed: 0, heal_amount: 0, play_seconds: 0 };
      c.appearances += n(r.appearances); c.wins += n(r.wins); c.losses += n(r.losses); c.kills += n(r.kills); c.deaths += n(r.deaths);
      c.shots_fired += n(r.shots_fired); c.shots_landed += n(r.shots_landed); c.heal_amount += n(r.heal_amount); c.play_seconds += n(r.play_seconds);
      byClass.set(r.class_name, c);
    }
    const classStats = Array.from(byClass.values())
      .map((c) => ({
        class_name: c.class_name,
        appearances: c.appearances,
        wins: c.wins,
        losses: c.losses,
        win_rate: c.wins + c.losses ? Math.round((c.wins / (c.wins + c.losses)) * 1000) / 10 : null,
        kills: c.kills,
        deaths: c.deaths,
        kd_ratio: c.deaths ? Math.round((c.kills / c.deaths) * 100) / 100 : c.kills,
        kills_per_game: c.appearances ? Math.round((c.kills / c.appearances) * 10) / 10 : 0,
        deaths_per_game: c.appearances ? Math.round((c.deaths / c.appearances) * 10) / 10 : 0,
        accuracy: c.shots_fired ? Math.round((c.shots_landed / c.shots_fired) * 1000) / 10 : null,
        heal_per_game: c.appearances ? Math.round(c.heal_amount / c.appearances) : 0,
      }))
      .sort((a, b) => b.appearances - a.appearances);

    // class x map win-rate matrix (for the per-map class chart)
    const classByMap = new Map<string, Map<string, { wins: number; losses: number; appearances: number }>>();
    for (const r of (classRows ?? []) as ClassRow[]) {
      const mm = classByMap.get(r.map_key) ?? new Map();
      const c = mm.get(r.class_name) ?? { wins: 0, losses: 0, appearances: 0 };
      c.wins += n(r.wins); c.losses += n(r.losses); c.appearances += n(r.appearances);
      mm.set(r.class_name, c);
      classByMap.set(r.map_key, mm);
    }
    const classWinRateByMap = Array.from(classByMap.entries()).map(([map_key, mm]) => ({
      map_key,
      classes: Array.from(mm.entries()).map(([class_name, c]) => ({
        class_name,
        appearances: c.appearances,
        win_rate: c.wins + c.losses ? Math.round((c.wins / (c.wins + c.losses)) * 1000) / 10 : null,
      })),
    }));

    // weapons
    const byWeapon = new Map<string, { weapon: string; weapon_id: number | null; kills: number; kills_matched: number }>();
    for (const r of weapons) {
      const w = byWeapon.get(r.weapon) ?? { weapon: r.weapon, weapon_id: r.weapon_id, kills: 0, kills_matched: 0 };
      w.kills += n(r.kills); w.kills_matched += n(r.kills_matched);
      byWeapon.set(r.weapon, w);
    }
    const totalWeaponKills = Array.from(byWeapon.values()).reduce((s, w) => s + w.kills, 0);
    const weaponStats = Array.from(byWeapon.values())
      .map((w) => ({ ...w, share: totalWeaponKills ? Math.round((w.kills / totalWeaponKills) * 1000) / 10 : 0 }))
      .sort((a, b) => b.kills - a.kills);

    const durs = (durations ?? []) as { duration_seconds: number; map_key: string | null }[];
    const filteredDurs = durs.filter((d) => !map || (d.map_key || 'unknown') === map);
    const totals = {
      games: overallSide.games,
      games_selected: filteredDurs.length,
      players_rated: playersRated ?? 0,
      kills: totalWeaponKills,
      avg_duration_seconds: filteredDurs.length ? Math.round(filteredDurs.reduce((s, d) => s + n(d.duration_seconds), 0) / filteredDurs.length) : 0,
      maps: sideByMap.map((m) => m.map_key),
    };

    return corsJson(
      {
        success: true,
        filters: { map: map || null, kind },
        totals,
        side_win_rates: { overall: { ...overallSide, ...withRates(overallSide) }, by_map: sideByMap },
        class_stats: classStats,
        class_win_rate_by_map: classWinRateByMap,
        weapon_stats: weaponStats,
      },
      { cache: 60 }
    );
  } catch (e: any) {
    return corsError(e?.message || 'Internal error', 500);
  }
}
