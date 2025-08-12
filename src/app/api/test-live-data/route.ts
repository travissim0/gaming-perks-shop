import { NextRequest, NextResponse } from 'next/server';
import { getLiveGameData, setLiveGameData } from '@/server/liveGameDataStore';

export async function GET() {
  const data = getLiveGameData();
  if (!data) {
    return NextResponse.json({ status: 'no-data' }, { status: 200 });
  }
  return NextResponse.json({ status: 'ok', data });
}

export async function POST(request: NextRequest) {
  try {
    const incoming = await request.json();
    if (!incoming?.arenaName || !Array.isArray(incoming?.players)) {
      return NextResponse.json({ error: 'Invalid data structure' }, { status: 400 });
    }

    const normalizedPlayers = (incoming.players as any[]).map((p: any) => ({
      ...p,
      className: p.className ?? p.class ?? 'Unknown',
    }));
    const totalPlayers = normalizedPlayers.length;
    const playingPlayers = normalizedPlayers.filter((p: any) => 
      p.teamType !== 'Spectator' && !String(p.team || '').toLowerCase().includes('spec') && !String(p.team || '').toLowerCase().includes('np')
    ).length;
    const spectators = totalPlayers - playingPlayers;

    setLiveGameData({
      ...incoming,
      players: normalizedPlayers,
      lastUpdated: new Date().toISOString(),
      totalPlayers,
      playingPlayers,
      spectators,
      serverStatus: totalPlayers > 0 ? 'active' : 'idle'
    });

    return NextResponse.json({ success: true });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Failed to process' }, { status: 500 });
  }
}
import { NextRequest, NextResponse } from 'next/server';

// Simple endpoint to test CTF server integration
export async function GET(request: NextRequest) {
  return NextResponse.json({
    status: 'ready',
    endpoint: '/api/live-game-data',
    message: 'Live game data endpoint is ready to receive data',
    timestamp: new Date().toISOString(),
    expectedFormat: {
      arenaName: 'string',
      gameType: 'string (OvD/Mix)',
      baseUsed: 'string',
      players: [
        {
          alias: 'string',
          team: 'string',
          teamType: 'string (Titan/Collective/Spectator)',
          className: 'string',
          isOffense: 'boolean',
          weapon: 'string',
          classPlayTimes: 'object with className: milliseconds',
          totalPlayTime: 'number (milliseconds)',
          isDueling: 'boolean',
          duelOpponent: 'string or null',
          duelType: 'string or null',
          currentHealth: 'number',
          currentEnergy: 'number',
          isAlive: 'boolean'
        }
      ]
    }
  });
}

// Test endpoint that CTF server can hit to verify connectivity
export async function POST(request: NextRequest) {
  try {
    const data = await request.json();
    
    console.log('[Test] Received data from CTF server:', data);
    
    // Forward to actual live data endpoint
    const liveDataResponse = await fetch(`${request.nextUrl.origin}/api/live-game-data`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data)
    });
    
    if (liveDataResponse.ok) {
      return NextResponse.json({
        success: true,
        message: 'Test data received and forwarded successfully',
        dataReceived: {
          arenaName: data.arenaName,
          gameType: data.gameType,
          playerCount: data.players?.length || 0,
          timestamp: new Date().toISOString()
        }
      });
    } else {
      const error = await liveDataResponse.text();
      return NextResponse.json({
        success: false,
        message: 'Test data received but forwarding failed',
        error: error
      }, { status: 500 });
    }
    
  } catch (error: any) {
    console.error('[Test] Error processing test data:', error);
    
    return NextResponse.json({
      success: false,
      message: 'Error processing test data',
      error: error.message
    }, { status: 500 });
  }
}