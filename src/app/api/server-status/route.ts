import { NextRequest, NextResponse } from 'next/server';
import { getServiceSupabase } from '@/lib/supabase';

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

    const activeZones = (data || [])
      .filter((zone) => typeof zone.player_count === 'number' && zone.player_count > 0)
      .map((zone) => ({ title: zone.zone_title || 'Unknown Zone', playerCount: zone.player_count }))
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