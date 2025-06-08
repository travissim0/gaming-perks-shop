import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status') || 'all';
    const limit = parseInt(searchParams.get('limit') || '20');
    const includeParticipants = searchParams.get('includeParticipants') === 'true';

    // Base query
    let query = supabase
      .from('tournaments')
      .select(`
        *,
        creator:created_by(in_game_alias),
        winner:winner_id(in_game_alias),
        runner_up:runner_up_id(in_game_alias),
        third_place:third_place_id(in_game_alias)
      `);

    // Apply status filter
    if (status !== 'all') {
      query = query.eq('status', status);
    }

    query = query
      .order('created_at', { ascending: false })
      .limit(limit);

    const { data: tournaments, error } = await query;

    if (error) {
      throw error;
    }

    // Include participants if requested
    if (includeParticipants && tournaments) {
      for (const tournament of tournaments) {
        const { data: participants, error: participantsError } = await supabase
          .from('tournament_participants')
          .select('*')
          .eq('tournament_id', tournament.id)
          .order('registration_date');

        if (!participantsError) {
          tournament.participants = participants;
        }
      }
    }

    return NextResponse.json({
      success: true,
      data: tournaments || []
    });

  } catch (error: any) {
    console.error('Error fetching tournaments:', error);
    return NextResponse.json(
      { error: 'Failed to fetch tournaments', details: error.message },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const tournamentData = await request.json();
    
    // Validate required fields
    const requiredFields = ['name', 'created_by'];
    for (const field of requiredFields) {
      if (!tournamentData[field]) {
        return NextResponse.json(
          { error: `Missing required field: ${field}` },
          { status: 400 }
        );
      }
    }

    // Set defaults
    const tournament = {
      name: tournamentData.name,
      description: tournamentData.description || '',
      tournament_type: tournamentData.tournament_type || 'single_elimination',
      max_participants: tournamentData.max_participants || 16,
      entry_fee: tournamentData.entry_fee || 0,
      prize_pool: tournamentData.prize_pool || 0,
      status: 'registration',
      registration_deadline: tournamentData.registration_deadline || null,
      start_time: tournamentData.start_time || null,
      created_by: tournamentData.created_by
    };

    // Insert tournament
    const { data: newTournament, error: tournamentError } = await supabase
      .from('tournaments')
      .insert([tournament])
      .select()
      .single();

    if (tournamentError) {
      throw tournamentError;
    }

    return NextResponse.json({
      success: true,
      message: 'Tournament created successfully',
      data: newTournament
    });

  } catch (error: any) {
    console.error('Error creating tournament:', error);
    return NextResponse.json(
      { error: 'Failed to create tournament', details: error.message },
      { status: 500 }
    );
  }
} 