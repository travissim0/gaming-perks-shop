/**
 * Shared loading of the CTF ratings pool: the aggregated card stats from
 * ctf_player_card_stats joined to whatever rating each player currently holds.
 *
 * The pool is small (a few hundred players over ~950 recorded games), so it is fetched
 * whole and cached in module scope for a short spell rather than queried per matchup.
 */

import { getServiceSupabase } from '@/lib/supabase';
import { CTF_RATING } from './elo';

export interface PlayerCard {
  player_key: string;
  player_name: string;
  games: number;
  kills: number;
  deaths: number;
  kd: number;
  win_rate: number | null;
  decided_games: number;
  captures: number;
  carrier_kills: number;
  carry_time_seconds: number;
  accuracy: number | null;
  explosives_left_per_death: number | null;
  resources_left_per_death: number | null;
  main_class: string | null;
  last_played: string | null;
  rating: number;
  wins: number;
  losses: number;
}

const CACHE_TTL_MS = 30_000;
let cache: { at: number; players: PlayerCard[] } | null = null;

/** Drop the cache so the next read reflects a vote that just landed. */
export function invalidatePool(): void {
  cache = null;
}

export async function loadPool(force = false): Promise<PlayerCard[]> {
  if (!force && cache && Date.now() - cache.at < CACHE_TTL_MS) return cache.players;

  const supabase = getServiceSupabase();

  const [cardsRes, ratingsRes] = await Promise.all([
    supabase
      .from('ctf_player_card_stats')
      .select(
        'player_key, player_name, games, kills, deaths, kd, win_rate, decided_games, captures, carrier_kills, carry_time_seconds, accuracy, explosives_left_per_death, resources_left_per_death, main_class, last_played',
      )
      .gte('games', CTF_RATING.MIN_GAMES),
    supabase.from('ctf_player_ratings').select('player_key, rating, wins, losses'),
  ]);

  if (cardsRes.error) throw new Error(`card stats: ${cardsRes.error.message}`);
  if (ratingsRes.error) throw new Error(`ratings: ${ratingsRes.error.message}`);

  const ratings = new Map<string, { rating: number; wins: number; losses: number }>();
  for (const r of ratingsRes.data ?? []) {
    ratings.set(r.player_key, {
      rating: Number(r.rating),
      wins: r.wins ?? 0,
      losses: r.losses ?? 0,
    });
  }

  const players: PlayerCard[] = (cardsRes.data ?? []).map((c: any) => {
    const r = ratings.get(c.player_key);
    return {
      player_key: c.player_key,
      player_name: c.player_name,
      games: c.games ?? 0,
      kills: c.kills ?? 0,
      deaths: c.deaths ?? 0,
      kd: Number(c.kd ?? 0),
      win_rate: c.win_rate === null || c.win_rate === undefined ? null : c.win_rate,
      decided_games: c.decided_games ?? 0,
      captures: c.captures ?? 0,
      carrier_kills: c.carrier_kills ?? 0,
      carry_time_seconds: c.carry_time_seconds ?? 0,
      accuracy: c.accuracy === null ? null : Number(c.accuracy),
      explosives_left_per_death:
        c.explosives_left_per_death === null ? null : Number(c.explosives_left_per_death),
      resources_left_per_death:
        c.resources_left_per_death === null ? null : Number(c.resources_left_per_death),
      main_class: c.main_class ?? null,
      last_played: c.last_played ?? null,
      rating: r?.rating ?? CTF_RATING.BASE_RATING,
      wins: r?.wins ?? 0,
      losses: r?.losses ?? 0,
    };
  });

  cache = { at: Date.now(), players };
  return players;
}

/**
 * Resolve the signed-in user to a player in the pool via their in-game alias,
 * so the page can show them their own standing. Returns null when the alias
 * matches nobody with enough recorded games.
 */
export async function resolveViewerKey(userId: string): Promise<string | null> {
  const supabase = getServiceSupabase();
  const { data } = await supabase
    .from('profiles')
    .select('in_game_alias')
    .eq('id', userId)
    .maybeSingle();

  const alias = data?.in_game_alias?.trim().toLowerCase();
  return alias ? alias : null;
}
