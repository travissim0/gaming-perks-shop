// Shared store for live game data.
//
// This used to be a module-scope variable. That works perfectly on a single local dev
// server and almost never in production: on Vercel each request gets its own serverless
// instance, so the zone's POST landed in one instance's memory and the browser's GET read
// a different instance's empty memory. Six consecutive requests to /api/live-game-data
// came back with six distinct x-vercel-id values.
//
// State now lives in one Supabase row that every instance shares. A short in-process
// read cache keeps the 5s client polling from turning into a query per request per
// instance; writes always go straight through so a class change is never held back.

import { getServiceSupabase } from '@/lib/supabase';

export interface LivePlayerData {
  alias: string;
  team: string;
  teamType: string;
  className: string;
  isOffense: boolean;
  weapon: string;
  classPlayTimes?: Record<string, number>;
  totalPlayTime?: number;
  isDueling?: boolean;
  duelOpponent?: string | null;
  duelType?: string | null;
  currentHealth?: number;
  currentEnergy?: number;
  isAlive?: boolean;
}

export interface LiveGameData {
  arenaName: string | null;
  gameType: string | null;
  baseUsed: string | null;
  players: LivePlayerData[];
  lastUpdated: string | null;
  winningTeam?: string | null;
  gameStartTime?: string | null;
  gameDurationMs?: number;
  participantData?: any[];
  serverStatus?: 'active' | 'idle' | 'unknown';
  totalPlayers?: number;
  playingPlayers?: number;
  spectators?: number;
}

const ROW_ID = 1;
/** Shorter than the 5s client poll, so a class swap surfaces on the next tick. */
const READ_CACHE_MS = 2_000;

let cache: { at: number; data: LiveGameData | null } | null = null;

/**
 * Set once the table is found to be missing, so this deploy stops retrying it and
 * behaves exactly as it did before - per-instance memory. That keeps the code safe to
 * ship before supabase-live-game-state.sql has been run: the feed is no worse than it
 * already was, and starts working properly the moment the table exists.
 */
let tableMissing = false;

function isMissingTable(error: { code?: string; message?: string }): boolean {
  return error.code === '42P01' || /relation .* does not exist/i.test(error.message ?? '');
}

export async function setLiveGameData(data: LiveGameData): Promise<void> {
  cache = { at: Date.now(), data };
  if (tableMissing) return;

  const { error } = await getServiceSupabase()
    .from('live_game_state')
    .upsert({ id: ROW_ID, data, updated_at: new Date().toISOString() }, { onConflict: 'id' });

  if (error) {
    if (isMissingTable(error)) {
      tableMissing = true;
      console.warn('[liveGameData] live_game_state missing - falling back to in-memory');
      return;
    }
    // Not fatal: the value is cached locally, and the zone re-sends within seconds.
    console.error('[liveGameData] write failed:', error.message);
  }
}

export async function getLiveGameData(): Promise<LiveGameData | null> {
  if (cache && Date.now() - cache.at < READ_CACHE_MS) return cache.data;
  if (tableMissing) return cache?.data ?? null;

  const { data, error } = await getServiceSupabase()
    .from('live_game_state')
    .select('data')
    .eq('id', ROW_ID)
    .maybeSingle();

  if (error) {
    if (isMissingTable(error)) {
      tableMissing = true;
      console.warn('[liveGameData] live_game_state missing - falling back to in-memory');
    } else {
      console.error('[liveGameData] read failed:', error.message);
    }
    // Serve the last known value rather than blanking the panel on a transient error.
    return cache?.data ?? null;
  }

  const value = (data?.data as LiveGameData) ?? null;
  cache = { at: Date.now(), data: value };
  return value;
}
