import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { createClient } from '@supabase/supabase-js';

// Use service role key for admin operations
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const status = searchParams.get('status') || 'scheduled';
    const limit = parseInt(searchParams.get('limit') || '10');
    const matchId = searchParams.get('id');

    let query = supabase
      .from('matches')
      .select(`
        id,
        title,
        description,
        match_type,
        status,
        scheduled_at,
        duration_minutes,
        max_participants,
        map_name,
        game_mode,
        server_info,
        rules,
        prize_info,
        squad_a_score,
        squad_b_score,
        completed_at,
        created_at,
        created_by,
        profiles!matches_created_by_fkey(in_game_alias),
        squad_a:squads!matches_squad_a_id_fkey(name, tag),
        squad_b:squads!matches_squad_b_id_fkey(name, tag),
        winner_squad:squads!matches_winner_squad_id_fkey(name, tag),
        match_participants(
          id,
          player_id,
          role,
          status,
          signed_up_at,
          profiles!match_participants_player_id_fkey(in_game_alias)
        )
      `);

    if (matchId) {
      query = query.eq('id', matchId);
    } else {
      query = query.eq('status', status);
    }

    let finalQuery = query;
    
    if (!matchId) {
      finalQuery = finalQuery.order('scheduled_at', { ascending: status === 'scheduled' });
    }
    
    const { data, error } = await finalQuery.limit(limit);

    if (error) {
      console.error('Error fetching matches:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }



    const matches = data.map((match: any) => ({
      ...match,
      created_by_alias: match.profiles?.in_game_alias || 'Unknown',
      squad_a_name: match.squad_a?.name,
      squad_a_tag: match.squad_a?.tag,
      squad_b_name: match.squad_b?.name,
      squad_b_tag: match.squad_b?.tag,
      winner_name: match.winner_squad?.name,
      participant_count: match.match_participants?.length || 0,
      participants: match.match_participants?.map((p: any) => ({
        id: p.id,
        player_id: p.player_id,
        in_game_alias: p.profiles?.in_game_alias || 'Unknown',
        role: p.role,
        status: p.status,
        joined_at: p.signed_up_at || new Date().toISOString()
      })) || []
    }));

    return NextResponse.json({ matches });
  } catch (error: any) {
    console.error('Match API error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const matchId = searchParams.get('id');
    const userId = searchParams.get('userId');

    if (!matchId || !userId) {
      return NextResponse.json(
        { error: 'Match ID and User ID are required' },
        { status: 400 }
      );
    }

    // Check if user is the creator of the match
    const { data: match, error: fetchError } = await supabase
      .from('matches')
      .select('created_by, status')
      .eq('id', matchId)
      .single();

    if (fetchError) {
      return NextResponse.json({ error: 'Match not found' }, { status: 404 });
    }

    if (match.created_by !== userId) {
      return NextResponse.json({ error: 'Only the match creator can delete this match' }, { status: 403 });
    }

    if (match.status !== 'scheduled') {
      return NextResponse.json({ error: 'Only scheduled matches can be deleted' }, { status: 400 });
    }

    // Delete match participants first
    await supabaseAdmin
      .from('match_participants')
      .delete()
      .eq('match_id', matchId);

    // Delete the match
    const { error: deleteError } = await supabaseAdmin
      .from('matches')
      .delete()
      .eq('id', matchId);

    if (deleteError) {
      console.error('Error deleting match:', deleteError);
      return NextResponse.json({ error: deleteError.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, message: 'Match deleted successfully' });

  } catch (error: any) {
    console.error('Match deletion error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      title,
      description,
      matchType,
      scheduledAt,
      durationMinutes,
      maxParticipants,
      mapName,
      gameMode,
      serverInfo,
      rules,
      prizeInfo,
      squadAId,
      squadBId,
      createdBy
    } = body;

    // Validate required fields
    if (!title || !matchType || !scheduledAt || !createdBy) {
      return NextResponse.json(
        { error: 'Title, match type, scheduled time, and creator are required' },
        { status: 400 }
      );
    }

    // Validate scheduled time is in the future
    const scheduledDate = new Date(scheduledAt);
    if (scheduledDate <= new Date()) {
      return NextResponse.json(
        { error: 'Scheduled time must be in the future' },
        { status: 400 }
      );
    }

    // Create the match
    const { data: newMatch, error: matchError } = await supabaseAdmin
      .from('matches')
      .insert([
        {
          title,
          description,
          match_type: matchType,
          status: 'scheduled',
          scheduled_at: scheduledAt,
          duration_minutes: durationMinutes || 60,
          max_participants: maxParticipants || 20,
          map_name: mapName,
          game_mode: gameMode,
          server_info: serverInfo,
          rules,
          prize_info: prizeInfo,
          squad_a_id: squadAId,
          squad_b_id: squadBId,
          created_by: createdBy
        }
      ])
      .select()
      .single();

    if (matchError) {
      console.error('Error creating match:', matchError);
      return NextResponse.json({ error: matchError.message }, { status: 500 });
    }

    // If squads are specified, automatically add them as participants
    if (squadAId) {
      // Get squad A members
      const { data: squadAMembers } = await supabase
        .from('squad_members')
        .select('player_id')
        .eq('squad_id', squadAId)
        .eq('status', 'active');

      if (squadAMembers) {
        const squadAParticipants = squadAMembers.map(member => ({
          match_id: newMatch.id,
          player_id: member.player_id,
          role: 'player',
          squad_id: squadAId
        }));

        await supabaseAdmin
          .from('match_participants')
          .insert(squadAParticipants);
      }
    }

    if (squadBId) {
      // Get squad B members
      const { data: squadBMembers } = await supabase
        .from('squad_members')
        .select('player_id')
        .eq('squad_id', squadBId)
        .eq('status', 'active');

      if (squadBMembers) {
        const squadBParticipants = squadBMembers.map(member => ({
          match_id: newMatch.id,
          player_id: member.player_id,
          role: 'player',
          squad_id: squadBId
        }));

        await supabaseAdmin
          .from('match_participants')
          .insert(squadBParticipants);
      }
    }

    return NextResponse.json({ 
      success: true, 
      match: newMatch,
      message: 'Match created successfully!'
    });

  } catch (error: any) {
    console.error('Match creation error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
} 