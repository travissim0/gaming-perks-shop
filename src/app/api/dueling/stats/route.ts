import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const sortBy = searchParams.get('sortBy') || 'win_rate';
    const filterType = searchParams.get('filterType') || 'all';
    const limit = parseInt(searchParams.get('limit') || '50');

    // Check if tables exist
    const { data: tables, error: tableError } = await supabase
      .rpc('check_table_exists', { table_name: 'dueling_aggregate_stats' });

    if (tableError || !tables) {
      return NextResponse.json({
        success: false,
        message: 'Dueling system not yet initialized',
        data: []
      });
    }

    // Build query based on filter type
    let query = supabase
      .from('dueling_aggregate_stats')
      .select('*');

    // Apply sorting
    const validSortFields = ['win_rate', 'total_duels', 'total_wins', 'tournaments_won'];
    if (validSortFields.includes(sortBy)) {
      query = query.order(sortBy, { ascending: false });
    }

    query = query.limit(limit);

    const { data, error } = await query;

    if (error) {
      throw error;
    }

    return NextResponse.json({
      success: true,
      data: data || []
    });

  } catch (error: any) {
    console.error('Error fetching dueling stats:', error);
    return NextResponse.json(
      { error: 'Failed to fetch dueling statistics', details: error.message },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const duelData = await request.json();
    
    // Validate required fields
    const requiredFields = ['player1_id', 'player1_alias', 'player2_id', 'player2_alias', 'winner_id', 'winner_alias'];
    for (const field of requiredFields) {
      if (!duelData[field]) {
        return NextResponse.json(
          { error: `Missing required field: ${field}` },
          { status: 400 }
        );
      }
    }

    // Generate unique duel ID
    const duelId = `duel_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    // Determine loser
    const loserId = duelData.winner_id === duelData.player1_id ? duelData.player2_id : duelData.player1_id;
    const loserAlias = duelData.winner_id === duelData.player1_id ? duelData.player2_alias : duelData.player1_alias;

    // Insert duel record
    const { data: duelRecord, error: duelError } = await supabase
      .from('dueling_stats')
      .insert([{
        duel_id: duelId,
        player1_id: duelData.player1_id,
        player1_alias: duelData.player1_alias,
        player2_id: duelData.player2_id,
        player2_alias: duelData.player2_alias,
        winner_id: duelData.winner_id,
        winner_alias: duelData.winner_alias,
        loser_id: loserId,
        loser_alias: loserAlias,
        arena_name: duelData.arena_name || 'Unknown',
        game_mode: duelData.game_mode || 'Duel',
        duel_type: duelData.duel_type || 'pickup',
        tournament_id: duelData.tournament_id || null,
        round_name: duelData.round_name || null,
        bracket_type: duelData.bracket_type || 'main',
        player1_score: duelData.player1_score || 0,
        player2_score: duelData.player2_score || 0,
        total_rounds: duelData.total_rounds || 1,
        duel_length_minutes: duelData.duel_length_minutes || 0,
        duel_date: duelData.duel_date || new Date().toISOString()
      }])
      .select()
      .single();

    if (duelError) {
      throw duelError;
    }

    return NextResponse.json({
      success: true,
      message: 'Duel recorded successfully',
      data: duelRecord
    });

  } catch (error: any) {
    console.error('Error recording duel:', error);
    return NextResponse.json(
      { error: 'Failed to record duel', details: error.message },
      { status: 500 }
    );
  }
} 