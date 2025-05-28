import { NextRequest, NextResponse } from 'next/server';

// In-memory storage for demo purposes
// In production, you might want to use Redis or a database
let gameData: any = null;

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

    // Store the game data with timestamp
    gameData = {
      ...data,
      lastUpdated: new Date().toISOString()
    };

    console.log('Received game data:', gameData);

    return NextResponse.json({ 
      success: true, 
      message: 'Game data received successfully' 
    });

  } catch (error: any) {
    console.error('Error processing game data:', error);
    
    return NextResponse.json(
      { error: 'Failed to process game data' },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    if (!gameData) {
      return NextResponse.json({
        arenaName: null,
        gameType: null,
        baseUsed: null,
        players: [],
        lastUpdated: null
      });
    }

    return NextResponse.json(gameData);

  } catch (error: any) {
    console.error('Error fetching game data:', error);
    
    return NextResponse.json(
      { 
        error: 'Failed to fetch game data',
        arenaName: null,
        gameType: null,
        baseUsed: null,
        players: [],
        lastUpdated: null
      },
      { status: 500 }
    );
  }
} 