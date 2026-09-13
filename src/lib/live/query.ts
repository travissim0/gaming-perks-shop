import { NextRequest } from 'next/server';
import { listLiveArenas } from '@/server/liveArenaStore';
import { NextResponse } from 'next/server';
import { CORS_HEADERS, clampInt } from '@/lib/uslMix/cors';
import { LiveGame, LiveResponse } from './types';

/** Zones post every ~60s; 2.5 misses in a row and the arena is considered gone. */
export const DEFAULT_FRESH_S = 150;
/** CDN cache for the public feed. Short, and with only a short stale window: the panel counts the
 * clocks down from the snapshot's age, so a response served minutes stale would put it minutes off. */
export const LIVE_CACHE_S = 10;

/**
 * Shared handler for GET /api/live and GET /api/usl-mix/live.
 *   game   usl | ctf | all      (the alias route forces usl)
 *   fresh  seconds of silence tolerated, 30..600 (default 150)
 *   empty  1 to include arenas with nobody in them (default: only arenas with players)
 */
export async function buildLiveResponse(request: NextRequest, forceGame?: LiveGame) {
  const q = request.nextUrl.searchParams;
  const gameParam = (forceGame ?? q.get('game') ?? 'all').toLowerCase();
  const game: LiveGame | 'all' = gameParam === 'usl' || gameParam === 'ctf' ? gameParam : 'all';
  const freshS = clampInt(q.get('fresh'), DEFAULT_FRESH_S, 30, 600);
  const includeEmpty = q.get('empty') === '1' || q.get('empty') === 'true';

  const rows = await listLiveArenas(freshS * 1000);
  const arenas = rows
    .filter((r) => game === 'all' || r.game === game)
    .filter((r) => includeEmpty || r.players_total > 0)
    // Busiest arena first; on a tie USL before CTF, then recency (rows already come newest first).
    .sort((a, b) => b.players_total - a.players_total || (a.game === b.game ? 0 : a.game === 'usl' ? -1 : 1));

  const body: LiveResponse = {
    success: true,
    generated_at: new Date().toISOString(),
    fresh_window_s: freshS,
    arenas,
  };
  return NextResponse.json(body, {
    status: 200,
    headers: { ...CORS_HEADERS, 'Cache-Control': `public, s-maxage=${LIVE_CACHE_S}, stale-while-revalidate=${LIVE_CACHE_S}` },
  });
}
