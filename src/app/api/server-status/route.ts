import { NextRequest, NextResponse } from 'next/server';
import { getServiceSupabase } from '@/lib/supabase';
import { listLiveArenas } from '@/server/liveArenaStore';
import { DEFAULT_FRESH_S } from '@/lib/live/query';

// How stale a reported count may be before we ignore it (reporter runs ~1/min).
const FRESH_MS = 5 * 60 * 1000;

export async function GET(request: NextRequest) {
  try {
    // Live per-zone counts come from the on-host reporter (see
    // scripts/zone-daemon/zone-pop-reporter.py), stored in zone_population_live.
    const supabase = getServiceSupabase();
    const since = new Date(Date.now() - FRESH_MS).toISOString();
    const { data, error } = await supabase
      .from('zone_population_live')
      .select('zone_title, player_count, updated_at')
      .gte('updated_at', since);

    if (error) {
      throw new Error(`Failed to read zone population: ${error.message}`);
    }

    // Zones whose script posts arena snapshots (/api/live) get their count from those
    // instead, summed across arenas, so Zone Activity and Live Arenas agree exactly.
    // The reporter and the snapshots run on separate clocks, which used to leave the
    // two panels a player apart for a minute at a time. Zones without a snapshot keep
    // the reporter's number. (Agreed with Travis, 2026-09-18.)
    const liveByZone = new Map<string, number>();
    try {
      for (const a of await listLiveArenas(DEFAULT_FRESH_S * 1000)) {
        liveByZone.set(a.zone, (liveByZone.get(a.zone) || 0) + (a.players_total || 0));
      }
    } catch (e) {
      console.error('[server-status] live arenas unavailable, using reporter counts only', e);
    }

    const counts = new Map<string, number>();
    for (const zone of data || []) {
      if (typeof zone.player_count !== 'number') continue;
      counts.set(zone.zone_title || 'Unknown Zone', zone.player_count);
    }
    for (const [zone, n] of liveByZone) counts.set(zone, n);

    const activeZones = Array.from(counts, ([title, playerCount]) => ({ title, playerCount, live: liveByZone.has(title) }))
      .filter((zone) => zone.playerCount > 0)
      .sort((a, b) => b.playerCount - a.playerCount);

    const totalPlayers = activeZones.reduce((sum, zone) => sum + zone.playerCount, 0);
    const activeGames = activeZones.length;

    return NextResponse.json({
      zones: activeZones,
      stats: {
        totalPlayers,
        activeGames,
        serverStatus: totalPlayers > 0 ? 'online' : 'offline',
      },
      lastUpdated: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error('Error fetching server status:', error);
    
    // More specific error handling
    let errorMessage = 'Failed to fetch server status';
    if (error.name === 'AbortError') {
      errorMessage = 'Server request timed out';
    } else if (error.message.includes('JSON')) {
      errorMessage = 'Invalid server response format';
    }
    
    return NextResponse.json(
      { 
        error: errorMessage,
        zones: [],
        stats: {
          totalPlayers: 0,
          activeGames: 0,
          serverStatus: 'offline'
        },
        lastUpdated: new Date().toISOString()
      },
      { status: 500 }
    );
  }
} 