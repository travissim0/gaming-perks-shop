import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ name: string }> }
) {
  try {
    const resolvedParams = await params;
    const playerName = decodeURIComponent(resolvedParams.name);
    const { searchParams } = new URL(request.url);
    
    const gameMode = searchParams.get('gameMode') || 'all';
    const dateFilter = searchParams.get('dateFilter') || 'all';
    const limit = Math.min(parseInt(searchParams.get('limit') || '20'), 100);

    console.log('Player stats query:', { playerName, gameMode, dateFilter, limit });

    // Get aggregate stats for the player - using case-insensitive comparison
    let aggregateQuery = supabase
      .from('player_aggregate_stats')
      .select('*')
      .ilike('player_name', playerName);

    if (gameMode && gameMode !== 'all') {
      aggregateQuery = aggregateQuery.eq('game_mode', gameMode);
    }

    const { data: aggregateStats, error: aggregateError } = await aggregateQuery;

    if (aggregateError) {
      console.error('Aggregate stats error:', aggregateError);
      return NextResponse.json(
        { error: 'Failed to fetch aggregate stats', details: aggregateError.message },
        { status: 500 }
      );
    }

    // Get recent individual game stats - using case-insensitive comparison
    let recentGamesQuery = supabase
      .from('player_stats')
      .select('*')
      .ilike('player_name', playerName)
      .order('game_date', { ascending: false })
      .limit(limit);

    if (gameMode && gameMode !== 'all') {
      recentGamesQuery = recentGamesQuery.eq('game_mode', gameMode);
    }

    // Apply date filter to recent games
    if (dateFilter && dateFilter !== 'all') {
      const now = new Date();
      let startDate: Date;

      switch (dateFilter) {
        case 'day':
          startDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
          break;
        case 'week':
          startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
          break;
        case 'month':
          startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
          break;
        case 'year':
          startDate = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
          break;
        default:
          startDate = new Date(0);
      }

      if (dateFilter !== 'all') {
        recentGamesQuery = recentGamesQuery.gte('game_date', startDate.toISOString());
      }
    }

    const { data: recentGames, error: recentGamesError } = await recentGamesQuery;

    if (recentGamesError) {
      console.error('Recent games error:', recentGamesError);
      return NextResponse.json(
        { error: 'Failed to fetch recent games', details: recentGamesError.message },
        { status: 500 }
      );
    }

    // Get game mode breakdown - using case-insensitive comparison
    const { data: gameModeStats, error: gameModeError } = await supabase
      .from('player_aggregate_stats')
      .select('*')
      .ilike('player_name', playerName);

    if (gameModeError) {
      console.error('Game mode stats error:', gameModeError);
    }

    // Calculate additional stats from recent games
    const recentStats = recentGames?.reduce((acc, game) => {
      acc.totalGames++;
      acc.totalKills += game.kills || 0;
      acc.totalDeaths += game.deaths || 0;
      acc.totalCaptures += game.captures || 0;
      if (game.result === 'Win') acc.wins++;
      if (game.accuracy > 0) {
        acc.accuracySum += game.accuracy;
        acc.accuracyCount++;
      }
      return acc;
    }, {
      totalGames: 0,
      totalKills: 0,
      totalDeaths: 0,
      totalCaptures: 0,
      wins: 0,
      accuracySum: 0,
      accuracyCount: 0
    });

    const calculatedStats = recentStats ? {
      avgKillsPerGame: recentStats.totalGames > 0 ? recentStats.totalKills / recentStats.totalGames : 0,
      avgDeathsPerGame: recentStats.totalGames > 0 ? recentStats.totalDeaths / recentStats.totalGames : 0,
      avgCapturesPerGame: recentStats.totalGames > 0 ? recentStats.totalCaptures / recentStats.totalGames : 0,
      killDeathRatio: recentStats.totalDeaths > 0 ? recentStats.totalKills / recentStats.totalDeaths : recentStats.totalKills,
      winRate: recentStats.totalGames > 0 ? recentStats.wins / recentStats.totalGames : 0,
      avgAccuracy: recentStats.accuracyCount > 0 ? recentStats.accuracySum / recentStats.accuracyCount : 0
    } : null;

    // Check if player exists
    if (!aggregateStats?.length && !recentGames?.length) {
      return NextResponse.json(
        { error: 'Player not found', message: `No stats found for player: ${playerName}` },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      player: {
        name: playerName,
        aggregateStats: aggregateStats || [],
        recentGames: recentGames || [],
        gameModeBreakdown: gameModeStats || [],
        calculatedStats,
        filters: {
          gameMode,
          dateFilter,
          limit
        }
      }
    });

  } catch (error) {
    console.error('Error fetching player stats:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
} 