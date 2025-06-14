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
    const includeStats = searchParams.get('includeStats') === 'true';

    // Update match statuses first
    await updateMatchStatuses();

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
        game_id,
        winner_squad_id,
        vod_url,
        video_title,
        actual_start_time,
        actual_end_time,
        match_notes,
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
      // Handle multiple statuses (comma-separated)
      const statuses = status.split(',');
      if (statuses.length > 1) {
        query = query.in('status', statuses);
      } else {
        query = query.eq('status', status);
      }
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

    const matches = await Promise.all(data.map(async (match: any) => {
      const baseMatch = {
        ...match,
        created_by_alias: match.profiles?.in_game_alias || 'Unknown',
        squad_a_name: match.squad_a?.name,
        squad_a_tag: match.squad_a?.tag,
        squad_b_name: match.squad_b?.name,
        squad_b_tag: match.squad_b?.tag,
        winner_name: match.winner_squad?.name,
        winner_tag: match.winner_squad?.tag,
        participant_count: match.match_participants?.length || 0,
        participants: match.match_participants?.map((p: any) => ({
          id: p.id,
          player_id: p.player_id,
          in_game_alias: p.profiles?.in_game_alias || 'Unknown',
          role: p.role,
          status: p.status,
          joined_at: p.signed_up_at || new Date().toISOString()
        })) || []
      };

      // If this match has game stats, fetch them
      if (includeStats && match.game_id) {
        try {
          const statsResponse = await fetch(`${process.env.NEXT_PUBLIC_SITE_URL}/api/player-stats/game/${match.game_id}`);
          if (statsResponse.ok) {
            const statsData = await statsResponse.json();
            baseMatch.gameStats = statsData;
          }
        } catch (error) {
          console.error('Error fetching game stats for match:', error);
        }
      }

      return baseMatch;
    }));

    return NextResponse.json({ matches });
  } catch (error: any) {
    console.error('Match API error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// Helper function to update match statuses
async function updateMatchStatuses() {
  try {
    const now = new Date();
    const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000);

    // Mark expired scheduled matches as 'expired'
    await supabaseAdmin
      .from('matches')
      .update({ status: 'expired' })
      .eq('status', 'scheduled')
      .lt('scheduled_at', twoHoursAgo.toISOString())
      .is('game_id', null);

    // Mark matches with game_id as 'completed' if they're still 'scheduled'
    await supabaseAdmin
      .from('matches')
      .update({ status: 'completed' })
      .eq('status', 'scheduled')
      .not('game_id', 'is', null);

  } catch (error) {
    console.error('Error updating match statuses:', error);
  }
}

export async function PUT(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      matchId,
      userId,
      gameId,
      winnerSquadId,
      squadAScore,
      squadBScore,
      vodUrl,
      vodTitle,
      actualStartTime,
      actualEndTime,
      matchNotes,
      status
    } = body;

    if (!matchId || !userId) {
      return NextResponse.json(
        { error: 'Match ID and User ID are required' },
        { status: 400 }
      );
    }

    // Check if user can update this match (creator or admin)
    const { data: match, error: fetchError } = await supabase
      .from('matches')
      .select('created_by')
      .eq('id', matchId)
      .single();

    if (fetchError) {
      return NextResponse.json({ error: 'Match not found' }, { status: 404 });
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('is_admin')
      .eq('id', userId)
      .single();

    const isAdmin = profile?.is_admin || false;
    const isCreator = match.created_by === userId;

    if (!isCreator && !isAdmin) {
      return NextResponse.json({ error: 'Only the match creator or admin can update match results' }, { status: 403 });
    }

    // Build update object with only provided fields
    const updateData: any = {};
    if (gameId !== undefined) updateData.game_id = gameId;
    if (winnerSquadId !== undefined) updateData.winner_squad_id = winnerSquadId;
    if (squadAScore !== undefined) updateData.squad_a_score = squadAScore;
    if (squadBScore !== undefined) updateData.squad_b_score = squadBScore;
    if (vodUrl !== undefined) updateData.vod_url = vodUrl;
    if (vodTitle !== undefined) updateData.vod_title = vodTitle;
    if (actualStartTime !== undefined) updateData.actual_start_time = actualStartTime;
    if (actualEndTime !== undefined) updateData.actual_end_time = actualEndTime;
    if (matchNotes !== undefined) updateData.match_notes = matchNotes;
    if (status !== undefined) updateData.status = status;

    const { error: updateError } = await supabaseAdmin
      .from('matches')
      .update(updateData)
      .eq('id', matchId);

    if (updateError) {
      console.error('Error updating match:', updateError);
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, message: 'Match updated successfully' });

  } catch (error: any) {
    console.error('Match update error:', error);
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
          scheduled_at: scheduledAt,
          duration_minutes: durationMinutes,
          max_participants: maxParticipants,
          map_name: mapName,
          game_mode: gameMode,
          server_info: serverInfo,
          rules,
          prize_info: prizeInfo,
          squad_a_id: squadAId,
          squad_b_id: squadBId,
          created_by: createdBy,
          status: 'scheduled'
        }
      ])
      .select()
      .single();

    if (matchError) {
      console.error('Error creating match:', matchError);
      return NextResponse.json({ error: matchError.message }, { status: 500 });
    }

    return NextResponse.json({ match: newMatch }, { status: 201 });

  } catch (error: any) {
    console.error('Match creation error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
} 