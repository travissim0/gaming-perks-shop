import { NextRequest, NextResponse } from 'next/server';

// Enhanced interface for live game monitoring
interface LivePlayerData {
  alias: string;
  team: string;
  teamType: string;
  className: string;
  isOffense: boolean;
  weapon: string;
  classPlayTimes?: { [className: string]: number }; // milliseconds
  totalPlayTime?: number; // milliseconds
  isDueling?: boolean;
  duelOpponent?: string;
  duelType?: string;
  currentHealth?: number;
  currentEnergy?: number;
  isAlive?: boolean;
}

interface LiveGameData {
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

// In-memory storage for enhanced live data
let liveGameData: LiveGameData | null = null;

export async function POST(request: NextRequest) {
  try {
    const data = await request.json();
    
    // Validate the incoming data structure
    if (!data.arenaName || !data.players || !Array.isArray(data.players)) {
      return NextResponse.json(
        { error: 'Invalid data structure' },
        { status: 400 }
      );
    }

    // Calculate additional metrics
    const totalPlayers = data.players.length;
    const playingPlayers = data.players.filter((p: any) => 
      p.teamType !== 'Spectator' && 
      !p.team.toLowerCase().includes('spec') && 
      !p.team.toLowerCase().includes('np')
    ).length;
    const spectators = totalPlayers - playingPlayers;

    // Store the enhanced game data with timestamp and metrics
    liveGameData = {
      ...data,
      lastUpdated: new Date().toISOString(),
      totalPlayers,
      playingPlayers,
      spectators,
      serverStatus: totalPlayers > 0 ? 'active' : 'idle'
    };

    console.log(`[LiveGameData] Updated: ${data.arenaName} | ${totalPlayers} total, ${playingPlayers} playing, ${spectators} spectating`);

    return NextResponse.json({ 
      success: true, 
      message: 'Live game data updated successfully',
      metrics: {
        totalPlayers,
        playingPlayers,
        spectators
      }
    });

  } catch (error: any) {
    console.error('Error processing live game data:', error);
    
    return NextResponse.json(
      { error: 'Failed to process live game data' },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    // Check if data is stale (older than 2 minutes)
    const isDataStale = liveGameData?.lastUpdated ? 
      (Date.now() - new Date(liveGameData.lastUpdated).getTime()) > 120000 : true;

    if (!liveGameData || isDataStale) {
      return NextResponse.json({
        arenaName: null,
        gameType: null,
        baseUsed: null,
        players: [],
        lastUpdated: null,
        serverStatus: 'unknown',
        totalPlayers: 0,
        playingPlayers: 0,
        spectators: 0,
        dataStale: isDataStale,
        message: isDataStale ? 'Data is stale (no updates in 2+ minutes)' : 'No active game data'
      });
    }

    // Add staleness indicator
    const responseData = {
      ...liveGameData,
      dataStale: isDataStale,
      dataAge: liveGameData.lastUpdated ? 
        Math.floor((Date.now() - new Date(liveGameData.lastUpdated).getTime()) / 1000) : null
    };

    return NextResponse.json(responseData);

  } catch (error: any) {
    console.error('Error fetching live game data:', error);
    
    return NextResponse.json(
      { 
        error: 'Failed to fetch live game data',
        arenaName: null,
        gameType: null,
        baseUsed: null,
        players: [],
        lastUpdated: null,
        serverStatus: 'unknown',
        totalPlayers: 0,
        playingPlayers: 0,
        spectators: 0
      },
      { status: 500 }
    );
  }
}

// Additional endpoint for quick server status check
export async function HEAD(request: NextRequest) {
  const hasActiveData = liveGameData?.lastUpdated && 
    (Date.now() - new Date(liveGameData.lastUpdated).getTime()) < 120000;
  
  return new NextResponse(null, {
    status: hasActiveData ? 200 : 204,
    headers: {
      'X-Server-Status': hasActiveData ? 'active' : 'idle',
      'X-Last-Update': liveGameData?.lastUpdated || 'never',
      'X-Player-Count': liveGameData?.totalPlayers?.toString() || '0'
    }
  });
}