import { NextRequest } from 'next/server';
import { getServiceSupabase } from '@/lib/supabase';
import { corsError, corsJson, corsPreflight } from '@/lib/uslMix/cors';
import { normalizeWeaponName } from '@/lib/uslMix/types';

/**
 * GET /api/usl-mix/games/{id} - one game in full: teams, every player row, every kill event.
 * `id` is the game UUID or the script's match_id.
 */
export const runtime = 'nodejs';

export async function OPTIONS() {
  return corsPreflight();
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const supabase = getServiceSupabase();
    const col = UUID_RE.test(id) ? 'id' : 'match_id';
    const { data: gameRow, error } = await supabase
      .from('usl_mix_games')
      .select(
        'id, match_id, schema_version, script_version, zone_name, arena_name, level_file, map_key, game_kind, team_size, started_at, ended_at, duration_seconds, end_reason, ' +
          'team_a_name, team_a_side, team_a_kills, team_a_deaths, team_a_result, team_a_captain, team_a_players, ' +
          'team_b_name, team_b_side, team_b_kills, team_b_deaths, team_b_result, team_b_captain, team_b_players, ' +
          'winner_side, winner_team, loser_team, unattributed_deaths, elo_applied, rated, created_at'
      )
      .eq(col, id)
      .maybeSingle();
    if (error) return corsError(error.message, 500);
    if (!gameRow) return corsError('Game not found', 404);
    const game: any = gameRow;

    const [{ data: players }, { data: events }, { data: history }] = await Promise.all([
      supabase
        .from('usl_mix_game_players')
        .select('*')
        .eq('game_id', game.id)
        .order('kills', { ascending: false }),
      supabase
        .from('usl_mix_kill_events')
        .select('t_ms, killer, victim, killer_side, victim_side, killer_class, victim_class, weapon_id, weapon_name, root_weapon_id, root_weapon_name, team_kill, kill_type, attribution, x, y')
        .eq('game_id', game.id)
        .order('t_ms', { ascending: true })
        .limit(5000),
      supabase
        .from('usl_mix_rating_history')
        .select('alias, alias_key, rating_before, rating_after, delta, team_expected, performance, k_factor')
        .eq('game_id', game.id),
    ]);

    // weapon roll-up for the whole game (enemy kills only)
    const weapons = new Map<string, { weapon: string; weapon_id: number | null; kills: number; matched: number }>();
    for (const e of events ?? []) {
      if (!e.killer || e.team_kill) continue;
      const name = normalizeWeaponName(e.root_weapon_name) || 'Unknown';
      const w = weapons.get(name) ?? { weapon: name, weapon_id: e.root_weapon_id, kills: 0, matched: 0 };
      w.kills++;
      if (e.attribution === 'matched') w.matched++;
      weapons.set(name, w);
    }

    return corsJson(
      {
        success: true,
        game,
        players: players ?? [],
        kill_events: (events ?? []).map((e) => ({ ...e, weapon_name: normalizeWeaponName(e.weapon_name), root_weapon_name: normalizeWeaponName(e.root_weapon_name) })),
        rating_changes: history ?? [],
        weapon_summary: Array.from(weapons.values()).sort((a, b) => b.kills - a.kills),
      },
      { cache: 60 }
    );
  } catch (e: any) {
    return corsError(e?.message || 'Internal error', 500);
  }
}
