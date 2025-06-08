import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Initialize Supabase client
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ gameId: string }> }
) {
  try {
    const { gameId } = await params;

    if (!gameId) {
      return NextResponse.json(
        { error: 'Game ID is required' },
        { status: 400 }
      );
    }

    // Fetch player stats for the specific game
    const { data: gameStats, error } = await supabase
      .from('player_stats')
      .select(`
        *
      `)
      .eq('game_id', gameId)
      .order('kills', { ascending: false });

    if (error) {
      console.error('Error fetching game stats:', error);
      return NextResponse.json(
        { error: 'Failed to fetch game stats', details: error.message },
        { status: 500 }
      );
    }

    if (!gameStats || gameStats.length === 0) {
      return NextResponse.json(
        { error: 'No stats found for this game ID' },
        { status: 404 }
      );
    }

    // Calculate some summary stats for the game
    const totalKills = gameStats.reduce((sum, player) => sum + (player.kills || 0), 0);
    const totalDeaths = gameStats.reduce((sum, player) => sum + (player.deaths || 0), 0);
    const totalCaptures = gameStats.reduce((sum, player) => sum + (player.captures || 0), 0);
    const gameLength = gameStats[0]?.game_length_minutes || 0;
    const gameMode = gameStats[0]?.game_mode || 'Unknown';
    const arenaName = gameStats[0]?.arena_name || 'Unknown';
    const gameDate = gameStats[0]?.game_date;

    // Separate players by team if available
    const teamStats = gameStats.reduce((acc, player) => {
      const team = player.team || 'Unknown';
      if (!acc[team]) {
        acc[team] = [];
      }
      acc[team].push(player);
      return acc;
    }, {} as Record<string, any[]>);

    return NextResponse.json({
      success: true,
      data: {
        gameId,
        gameMode,
        arenaName,
        gameDate,
        gameLength,
        summary: {
          totalKills,
          totalDeaths,
          totalCaptures,
          playerCount: gameStats.length
        },
        players: gameStats,
        teamStats
      }
    });

  } catch (error) {
    console.error('Error in game stats API:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
} 