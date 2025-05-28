import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  try {
    // Fetch data from the Infantry Online zone population API
    const response = await fetch('https://jovan-s.com/zonepop-raw.php', {
      next: { revalidate: 60 }, // Cache for 60 seconds
    });

    if (!response.ok) {
      throw new Error('Failed to fetch server data');
    }

    const zones = await response.json();
    
    // Filter zones with players > 0, extract Title and PlayerCount, and sort by player count (high to low)
    const activeZones = zones
      .filter((zone: any) => zone.PlayerCount > 0)
      .map((zone: any) => ({
        title: zone.Title,
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
    
    return NextResponse.json(
      { 
        error: 'Failed to fetch server status',
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