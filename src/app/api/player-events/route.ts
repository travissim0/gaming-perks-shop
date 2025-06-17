import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const eventType = searchParams.get('event_type');
    const dateRange = searchParams.get('date_range');
    const playerId = searchParams.get('player_id');
    const squadId = searchParams.get('squad_id');
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '25');
    const offset = (page - 1) * limit;

    let query = supabase
      .from('player_events')
      .select(`
        *,
        profiles!player_events_player_id_fkey(in_game_alias, avatar_url),
        related_player_profiles:profiles!player_events_related_player_id_fkey(in_game_alias),
        squads(name)
      `)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    // Apply filters
    if (eventType && eventType !== 'all') {
      query = query.eq('event_type', eventType);
    }

    if (playerId) {
      query = query.eq('player_id', playerId);
    }

    if (squadId) {
      query = query.eq('squad_id', squadId);
    }

    if (dateRange && dateRange !== 'all') {
      const daysAgo = new Date();
      daysAgo.setDate(daysAgo.getDate() - parseInt(dateRange));
      query = query.gte('created_at', daysAgo.toISOString());
    }

    const { data, error, count } = await query;

    if (error) {
      throw error;
    }

    return NextResponse.json({
      success: true,
      data: data || [],
      pagination: {
        page,
        limit,
        total: count || 0,
        totalPages: Math.ceil((count || 0) / limit)
      }
    });

  } catch (error: any) {
    console.error('Error fetching player events:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { 
      player_id, 
      event_type, 
      description, 
      event_data = {}, 
      squad_id = null, 
      related_player_id = null 
    } = body;

    // Validate required fields
    if (!player_id || !event_type || !description) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields: player_id, event_type, description' },
        { status: 400 }
      );
    }

    // Call the database function to log the event
    const { data, error } = await supabase.rpc('log_player_event', {
      p_player_id: player_id,
      p_event_type: event_type,
      p_description: description,
      p_event_data: event_data,
      p_squad_id: squad_id,
      p_related_player_id: related_player_id
    });

    if (error) {
      throw error;
    }

    return NextResponse.json({
      success: true,
      data: { event_id: data },
      message: 'Event logged successfully'
    });

  } catch (error: any) {
    console.error('Error creating player event:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
} 