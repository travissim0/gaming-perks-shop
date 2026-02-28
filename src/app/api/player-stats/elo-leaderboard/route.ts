import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getEloTier } from '@/utils/eloTiers';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    
    // Parse query parameters
    const gameMode = searchParams.get('gameMode') || 'Combined';
    const sortBy = searchParams.get('sortBy') || 'weighted_elo';
    const sortOrder = searchParams.get('sortOrder') || 'desc';
    const limit = parseInt(searchParams.get('limit') || '50');
    const offset = parseInt(searchParams.get('offset') || '0');
    const minGames = parseInt(searchParams.get('minGames') || '3');
    const playerName = searchParams.get('playerName') || '';

    console.log('ELO Leaderboard query:', {
      gameMode,
      sortBy,
      sortOrder,
      limit,
      offset,
      minGames,
      playerName
    });

    // Build the query using the new view with aliases
    // Use DISTINCT to prevent duplicates at the database level
    let query = supabase
      .from('elo_leaderboard_agg_with_aliases')
      .select('*');

    // Apply game mode filter
    if (gameMode && gameMode !== 'Combined') {
      query = query.eq('game_mode', gameMode);
    } else if (gameMode === 'Combined') {
      query = query.eq('game_mode', 'Combined');
    }

    // Apply minimum games filter
    if (minGames > 0) {
      query = query.gte('total_games', minGames);
    }

    // Apply player name search filter (search both main name and aliases)
    if (playerName && playerName.trim()) {
      const searchTerm = playerName.trim();
      query = query.or(`player_name.ilike.%${searchTerm}%,all_aliases.ilike.%${searchTerm}%`);
    }

    // Apply sorting
    const validSortColumns = [
      'weighted_elo', 'elo_rating', 'elo_confidence', 'elo_peak',
      'total_games', 'win_rate', 'kill_death_ratio', 'last_game_date',
      'elo_rank', 'overall_elo_rank'
    ];

    if (validSortColumns.includes(sortBy)) {
      query = query.order(sortBy, { ascending: sortOrder === 'asc' });
    } else {
      // Default sort by weighted ELO
      query = query.order('weighted_elo', { ascending: false });
    }

    // Apply pagination
    query = query.range(offset, offset + limit - 1);

    const { data, error } = await query;

    if (error) {
      console.error('ELO leaderboard query error:', error);
      return NextResponse.json(
        { error: 'Failed to fetch ELO leaderboard' },
        { status: 500 }
      );
    }

    // Get total count for pagination
    let countQuery = supabase
      .from('elo_leaderboard_agg_with_aliases')
      .select('*', { count: 'exact', head: true });

    if (gameMode && gameMode !== 'Combined') {
      countQuery = countQuery.eq('game_mode', gameMode);
    } else if (gameMode === 'Combined') {
      countQuery = countQuery.eq('game_mode', 'Combined');
    }
    if (minGames > 0) {
      countQuery = countQuery.gte('total_games', minGames);
    }
    if (playerName && playerName.trim()) {
      const searchTerm = playerName.trim();
      countQuery = countQuery.or(`player_name.ilike.%${searchTerm}%,all_aliases.ilike.%${searchTerm}%`);
    }

    const { count } = await countQuery;

    // Get available game modes for filter dropdown
    const { data: gameModes } = await supabase
      .from('elo_leaderboard_agg_with_aliases')
      .select('game_mode')
      .order('game_mode');

    const uniqueGameModes = gameModes ? [...new Set(gameModes.map(gm => gm.game_mode))] : [];

    // Format the response data
    const formattedData = data?.map((player, index) => ({
      ...player,
      display_rank: offset + index + 1,
      elo_rating: Math.round(Number(player.elo_rating || 0)),
      weighted_elo: Math.round(Number(player.weighted_elo || 0)),
      elo_peak: Math.round(Number(player.elo_peak || 0)),
      elo_confidence: Number(player.elo_confidence || 0).toFixed(3), // keep as string with 3 decimals
      win_rate: Number(player.win_rate || 0).toFixed(3),
      kill_death_ratio: Number(player.kill_death_ratio || 0).toFixed(2),
      elo_tier: getEloTier(Math.round(Number(player.weighted_elo)))
    }));

    return NextResponse.json({
      data: formattedData,
      pagination: {
        total: count || 0,
        limit,
        offset,
        hasMore: (offset + limit) < (count || 0)
      },
      filters: {
        gameMode,
        sortBy,
        sortOrder,
        minGames,
        playerName,
        availableGameModes: uniqueGameModes
      }
    });

  } catch (error) {
    console.error('ELO leaderboard API error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// getEloTier imported from @/utils/eloTiers

// Also handle POST for ELO recalculation (admin only)
export async function POST(request: NextRequest) {
  try {
    const { action } = await request.json();

    if (action === 'recalculate') {
      // Call the recalculation function
      const { data, error } = await supabase.rpc('recalculate_all_elo_ratings');

      if (error) {
        console.error('ELO recalculation error:', error);
        return NextResponse.json(
          { error: 'Failed to recalculate ELO ratings' },
          { status: 500 }
        );
      }

      return NextResponse.json({
        success: true,
        message: data || 'ELO ratings recalculated successfully'
      });
    }

    return NextResponse.json(
      { error: 'Invalid action' },
      { status: 400 }
    );

  } catch (error) {
    console.error('ELO recalculation API error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
} 