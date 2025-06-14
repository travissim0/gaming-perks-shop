import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Use service role client for database operations
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// GET - Retrieve dueling leaderboards and stats
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    
    // Parse query parameters
    const matchType = searchParams.get('matchType') || 'all';
    const sortBy = searchParams.get('sortBy') || 'win_rate';
    const sortOrder = searchParams.get('sortOrder') || 'desc';
    const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 100);
    const offset = Math.max(parseInt(searchParams.get('offset') || '0'), 0);
    const playerName = searchParams.get('playerName');

    console.log('Dueling stats query:', { matchType, sortBy, sortOrder, limit, offset, playerName });

    // Build the base query
    let query = supabaseAdmin
      .from('dueling_leaderboard')
      .select('*');

    // Apply match type filter
    if (matchType && matchType !== 'all') {
      query = query.eq('match_type', matchType);
    }

    // Apply player name search filter
    if (playerName && playerName.trim()) {
      query = query.ilike('player_name', `%${playerName.trim()}%`);
    }

    // Validate sort column
    const validSortColumns = [
      'win_rate', 'total_matches', 'matches_won', 'total_kills', 'total_deaths',
      'kill_death_ratio', 'overall_accuracy', 'current_elo', 'peak_elo',
      'double_hits', 'triple_hits', 'burst_damage_ratio', 'rank'
    ];

    const sortColumn = validSortColumns.includes(sortBy) ? sortBy : 'win_rate';
    const order = sortOrder === 'asc' ? 'asc' : 'desc';

    // Apply sorting and pagination
    const { data, error, count } = await query
      .order(sortColumn, { ascending: order === 'asc' })
      .range(offset, offset + limit - 1);

    if (error) {
      console.error('Supabase query error:', error);
      return NextResponse.json(
        { error: 'Failed to fetch dueling leaderboard', details: error.message },
        { status: 500 }
      );
    }

    // Get available match types for filter dropdown
    const { data: matchTypes, error: matchTypesError } = await supabaseAdmin
      .from('dueling_player_stats')
      .select('match_type')
      .order('match_type');

    const uniqueMatchTypes = matchTypes ? [...new Set(matchTypes.map(mt => mt.match_type))] : [];

    return NextResponse.json({
      success: true,
      data: data || [],
      pagination: {
        total: count || 0,
        offset,
        limit,
        hasMore: (offset + limit) < (count || 0)
      },
      filters: {
        matchType,
        sortBy: sortColumn,
        sortOrder: order,
        playerName: playerName || '',
        availableMatchTypes: uniqueMatchTypes
      }
    });

  } catch (error) {
    console.error('Error fetching dueling leaderboard:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

// POST - Submit match results from the game
export async function POST(request: NextRequest) {
  try {
    const matchData = await request.json();

    console.log('Received dueling match data:', matchData);

    // Validate required fields
    const requiredFields = ['matchType', 'player1Name', 'player2Name', 'winnerName'];
    for (const field of requiredFields) {
      if (!matchData[field]) {
        return NextResponse.json(
          { error: `Missing required field: ${field}` },
          { status: 400 }
        );
      }
    }

    // Validate match type
    const validMatchTypes = ['unranked', 'ranked_bo3', 'ranked_bo6'];
    if (!validMatchTypes.includes(matchData.matchType)) {
      return NextResponse.json(
        { error: `Invalid match type: ${matchData.matchType}` },
        { status: 400 }
      );
    }

    // Start a new dueling match
    const { data: matchResult, error: matchError } = await supabaseAdmin
      .rpc('start_dueling_match', {
        p_match_type: matchData.matchType,
        p_player1_name: matchData.player1Name,
        p_player2_name: matchData.player2Name,
        p_arena_name: matchData.arenaName || null
      });

    if (matchError) {
      console.error('Error starting dueling match:', matchError);
      return NextResponse.json(
        { error: 'Failed to start dueling match', details: matchError.message },
        { status: 500 }
      );
    }

    const matchId = matchResult;

    // Process rounds if provided
    if (matchData.rounds && Array.isArray(matchData.rounds)) {
      for (let i = 0; i < matchData.rounds.length; i++) {
        const round = matchData.rounds[i];
        
        // Complete the round
        const { error: roundError } = await supabaseAdmin
          .rpc('complete_dueling_round', {
            p_match_id: matchId,
            p_round_number: i + 1,
            p_winner_name: round.winnerName,
            p_loser_name: round.loserName,
            p_winner_hp_left: round.winnerHpLeft || 0,
            p_loser_hp_left: round.loserHpLeft || 0,
            p_round_duration_seconds: round.durationSeconds || null
          });

        if (roundError) {
          console.error('Error completing round:', roundError);
          // Continue with other rounds
        }

        // Process kills in this round
        if (round.kills && Array.isArray(round.kills)) {
          for (const kill of round.kills) {
            const { error: killError } = await supabaseAdmin
              .rpc('record_dueling_kill', {
                p_match_id: matchId,
                p_round_id: null, // Will be updated when round is completed
                p_killer_name: kill.killerName,
                p_victim_name: kill.victimName,
                p_weapon_used: kill.weaponUsed || null,
                p_damage_dealt: kill.damageDealt || 0,
                p_victim_hp_before: kill.victimHpBefore || 100,
                p_victim_hp_after: kill.victimHpAfter || 0,
                p_shots_fired: kill.shotsFired || 0,
                p_shots_hit: kill.shotsHit || 0,
                p_is_double_hit: kill.isDoubleHit || false,
                p_is_triple_hit: kill.isTripleHit || false
              });

            if (killError) {
              console.error('Error recording kill:', killError);
              // Continue with other kills
            }
          }
        }
      }
    }

    // Complete the match
    const { error: completeError } = await supabaseAdmin
      .rpc('complete_dueling_match', {
        p_match_id: matchId,
        p_winner_name: matchData.winnerName
      });

    if (completeError) {
      console.error('Error completing dueling match:', completeError);
      return NextResponse.json(
        { error: 'Failed to complete dueling match', details: completeError.message },
        { status: 500 }
      );
    }

    console.log('✅ Dueling match completed successfully:', matchId);

    return NextResponse.json({
      success: true,
      message: 'Dueling match recorded successfully',
      matchId: matchId
    });

  } catch (error) {
    console.error('Error processing dueling match:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

// OPTIONS handler for CORS
export async function OPTIONS(request: NextRequest) {
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  });
} 