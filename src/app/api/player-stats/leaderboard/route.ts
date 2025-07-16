import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    
    // Parse query parameters
    const gameMode = searchParams.get('gameMode') || 'Combined';
    const sortBy = searchParams.get('sortBy') || 'total_kills';
    const sortOrder = searchParams.get('sortOrder') || 'desc';
    const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 1000);
    const offset = Math.max(parseInt(searchParams.get('offset') || '0'), 0);
    const dateFilter = searchParams.get('dateFilter') || 'all';
    const playerName = searchParams.get('playerName');
    const minGames = Math.max(parseInt(searchParams.get('minGames') || '1'), 1);

    console.log('Leaderboard query:', { gameMode, sortBy, sortOrder, limit, offset, dateFilter, playerName, minGames });

    // Build the base query
    let query = supabase
      .from('player_stats_normalized_by_mode_all_aliases')
      .select('*');

    // Apply game mode filter
    if (gameMode && gameMode !== 'Combined') {
      query = query.eq('game_mode', gameMode);
    } else if (gameMode === 'Combined') {
      query = query.eq('game_mode', 'Combined');
    }

    // Apply player name search filter
    if (playerName && playerName.trim()) {
      query = query.ilike('player_name', `%${playerName.trim()}%`);
    }

    // Apply minimum games filter
    query = query.gte('total_games', minGames);

    // Apply date filter
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
          startDate = new Date(0); // All time
      }

      if (dateFilter !== 'all') {
        query = query.gte('last_game_date', startDate.toISOString());
      }
    }

    // Validate sort column
    const validSortColumns = [
      'total_kills', 'total_deaths', 'total_captures', 'total_games',
      'kill_death_ratio', 'win_rate', 'avg_kills_per_game', 'avg_deaths_per_game',
      'avg_captures_per_game', 'total_eb_hits', 'total_turret_damage',
      'last_game_date', 'player_name'
    ];

    const sortColumn = validSortColumns.includes(sortBy) ? sortBy : 'total_kills';
    const order = sortOrder === 'asc' ? 'asc' : 'desc';

    // Apply sorting, pagination, and execute query
    const { data, error, count } = await query
      .order(sortColumn, { ascending: order === 'asc' })
      .range(offset, offset + limit - 1);

    if (error) {
      console.error('Supabase query error:', error);
      return NextResponse.json(
        { error: 'Failed to fetch leaderboard data', details: error.message },
        { status: 500 }
      );
    }

    // Get total count for pagination (separate query for performance)
    let totalCountQuery = supabase
      .from('player_stats_normalized_by_mode_all_aliases')
      .select('*', { count: 'exact', head: true });

    if (gameMode && gameMode !== 'Combined') {
      totalCountQuery = totalCountQuery.eq('game_mode', gameMode);
    } else if (gameMode === 'Combined') {
      totalCountQuery = totalCountQuery.eq('game_mode', 'Combined');
    }
    if (playerName && playerName.trim()) {
      totalCountQuery = totalCountQuery.ilike('player_name', `%${playerName.trim()}%`);
    }
    totalCountQuery = totalCountQuery.gte('total_games', minGames);

    const { count: totalCount, error: countError } = await totalCountQuery;

    if (countError) {
      console.error('Count query error:', countError);
    }

    // Get available game modes for filter dropdown
    const { data: gameModes, error: gameModesError } = await supabase
      .from('player_stats_normalized_by_mode_all_aliases')
      .select('game_mode')
      .order('game_mode');

    const uniqueGameModes = gameModes ? [...new Set(gameModes.map(gm => gm.game_mode))] : [];

    return NextResponse.json({
      success: true,
      data: data || [],
      pagination: {
        total: totalCount || 0,
        offset,
        limit,
        hasMore: (offset + limit) < (totalCount || 0)
      },
      filters: {
        gameMode,
        sortBy: sortColumn,
        sortOrder: order,
        dateFilter,
        playerName: playerName || '',
        availableGameModes: uniqueGameModes
      }
    });

  } catch (error) {
    console.error('Error fetching leaderboard:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
} 