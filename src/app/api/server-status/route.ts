import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  try {
    // Fetch data from the Free Infantry zone population API with timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout

    const response = await fetch('https://jovan-s.com/zonepop-raw.php', {
      next: { revalidate: 60 }, // Cache for 60 seconds
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`Failed to fetch server data: ${response.status} ${response.statusText}`);
    }

    const text = await response.text();
    
    // Validate that we have content before parsing
    if (!text || text.trim().length === 0) {
      throw new Error('Empty response from server API');
    }

    let zones;
    try {
      zones = JSON.parse(text);
    } catch (parseError) {
      console.error('JSON Parse Error:', parseError);
      console.error('Response text:', text.substring(0, 500)); // Log first 500 chars
      throw new Error('Invalid JSON response from server API');
    }

    // Ensure zones is an array
    if (!Array.isArray(zones)) {
      throw new Error('Server API returned non-array data');
    }
    
    // Filter zones with players > 0, extract Title and PlayerCount, and sort by player count (high to low)
    const activeZones = zones
      .filter((zone: any) => zone && typeof zone.PlayerCount === 'number' && zone.PlayerCount > 0)
      .map((zone: any) => ({
        title: zone.Title || 'Unknown Zone',
        playerCount: zone.PlayerCount
      }))
      .sort((a: any, b: any) => b.playerCount - a.playerCount);

    // Calculate totals
    const totalPlayers = activeZones.reduce((sum: number, zone: any) => sum + zone.playerCount, 0);
    const activeGames = activeZones.length;

    return NextResponse.json({
      zones: activeZones,
      stats: {
        totalPlayers,
        activeGames,
        serverStatus: totalPlayers > 0 ? 'online' : 'offline'
      },
      lastUpdated: new Date().toISOString()
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