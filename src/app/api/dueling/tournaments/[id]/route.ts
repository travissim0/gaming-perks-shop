import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const tournamentId = params.id;

    // Fetch tournament details
    const { data: tournament, error: tournamentError } = await supabase
      .from('tournaments')
      .select(`
        *,
        creator:created_by(in_game_alias),
        winner:winner_id(in_game_alias),
        runner_up:runner_up_id(in_game_alias),
        third_place:third_place_id(in_game_alias)
      `)
      .eq('id', tournamentId)
      .single();

    if (tournamentError) {
      throw tournamentError;
    }

    // Fetch participants
    const { data: participants, error: participantsError } = await supabase
      .from('tournament_participants')
      .select('*')
      .eq('tournament_id', tournamentId)
      .order('registration_date');

    if (participantsError) {
      throw participantsError;
    }

    // Fetch matches
    const { data: matches, error: matchesError } = await supabase
      .from('tournament_matches')
      .select('*')
      .eq('tournament_id', tournamentId)
      .order('round_name, match_number');

    if (matchesError) {
      throw matchesError;
    }

    return NextResponse.json({
      success: true,
      data: {
        ...tournament,
        participants: participants || [],
        matches: matches || []
      }
    });

  } catch (error: any) {
    console.error('Error fetching tournament:', error);
    return NextResponse.json(
      { error: 'Failed to fetch tournament', details: error.message },
      { status: 500 }
    );
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const tournamentId = params.id;
    const { action, ...data } = await request.json();

    switch (action) {
      case 'register':
        return await registerPlayer(tournamentId, data);
      case 'generate_bracket':
        return await generateBracket(tournamentId);
      case 'update_match':
        return await updateMatch(tournamentId, data);
      case 'update_status':
        return await updateTournamentStatus(tournamentId, data.status);
      default:
        return NextResponse.json(
          { error: 'Invalid action' },
          { status: 400 }
        );
    }

  } catch (error: any) {
    console.error('Error updating tournament:', error);
    return NextResponse.json(
      { error: 'Failed to update tournament', details: error.message },
      { status: 500 }
    );
  }
}

async function registerPlayer(tournamentId: string, data: any) {
  const { player_id, player_alias } = data;

  if (!player_id || !player_alias) {
    return NextResponse.json(
      { error: 'Missing player_id or player_alias' },
      { status: 400 }
    );
  }

  // Check if tournament is accepting registrations
  const { data: tournament, error: tournamentError } = await supabase
    .from('tournaments')
    .select('status, max_participants')
    .eq('id', tournamentId)
    .single();

  if (tournamentError) {
    throw tournamentError;
  }

  if (tournament.status !== 'registration') {
    return NextResponse.json(
      { error: 'Tournament is not accepting registrations' },
      { status: 400 }
    );
  }

  // Check current participant count
  const { count } = await supabase
    .from('tournament_participants')
    .select('*', { count: 'exact' })
    .eq('tournament_id', tournamentId);

  if (count && count >= tournament.max_participants) {
    return NextResponse.json(
      { error: 'Tournament is full' },
      { status: 400 }
    );
  }

  // Register player
  const { data: participant, error: registrationError } = await supabase
    .from('tournament_participants')
    .insert([{
      tournament_id: tournamentId,
      player_id,
      player_alias,
      seed_position: (count || 0) + 1
    }])
    .select()
    .single();

  if (registrationError) {
    if (registrationError.code === '23505') { // Unique constraint violation
      return NextResponse.json(
        { error: 'Player already registered for this tournament' },
        { status: 400 }
      );
    }
    throw registrationError;
  }

  return NextResponse.json({
    success: true,
    message: 'Player registered successfully',
    data: participant
  });
}

async function generateBracket(tournamentId: string) {
  // Use the database function to generate bracket
  const { data: result, error } = await supabase
    .rpc('generate_tournament_bracket', { tournament_uuid: tournamentId });

  if (error) {
    throw error;
  }

  // Update tournament status
  await supabase
    .from('tournaments')
    .update({ status: 'in_progress' })
    .eq('id', tournamentId);

  return NextResponse.json({
    success: true,
    message: 'Bracket generated successfully',
    data: result
  });
}

async function updateMatch(tournamentId: string, data: any) {
  const { match_id, winner_id, winner_alias, loser_id, loser_alias, duel_id } = data;

  if (!match_id || !winner_id) {
    return NextResponse.json(
      { error: 'Missing match_id or winner_id' },
      { status: 400 }
    );
  }

  const { data: match, error: updateError } = await supabase
    .from('tournament_matches')
    .update({
      winner_id,
      winner_alias,
      loser_id,
      loser_alias,
      duel_id,
      status: 'completed',
      completed_at: new Date().toISOString()
    })
    .eq('id', match_id)
    .eq('tournament_id', tournamentId)
    .select()
    .single();

  if (updateError) {
    throw updateError;
  }

  return NextResponse.json({
    success: true,
    message: 'Match updated successfully',
    data: match
  });
}

async function updateTournamentStatus(tournamentId: string, status: string) {
  const validStatuses = ['registration', 'in_progress', 'completed', 'cancelled'];
  
  if (!validStatuses.includes(status)) {
    return NextResponse.json(
      { error: 'Invalid status' },
      { status: 400 }
    );
  }

  const { data: tournament, error } = await supabase
    .from('tournaments')
    .update({ 
      status,
      ...(status === 'completed' ? { end_time: new Date().toISOString() } : {})
    })
    .eq('id', tournamentId)
    .select()
    .single();

  if (error) {
    throw error;
  }

  return NextResponse.json({
    success: true,
    message: 'Tournament status updated successfully',
    data: tournament
  });
} 