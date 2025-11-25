import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Use admin client for RPC calls
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const alias = searchParams.get('alias');
    const limit = parseInt(searchParams.get('limit') || '20');
    const seriesId = searchParams.get('series_id');
    
    // If series_id is provided (with or without alias), get series stats
    if (seriesId) {
      const { data, error } = await supabaseAdmin
        .rpc('get_series_stats', {
          p_series_id: seriesId
        });

      if (error) {
        console.error('Error fetching series stats:', error);
        return NextResponse.json({ 
          error: 'Failed to fetch series stats',
          details: error.message 
        }, { status: 500 });
      }

      return NextResponse.json({ 
        success: true,
        series_id: seriesId,
        games: data || []
      });
    }
    
    if (!alias) {
      return NextResponse.json({ 
        error: 'Missing required parameter: alias or series_id' 
      }, { status: 400 });
    }

    // Otherwise get player's game history
    const { data, error } = await supabaseAdmin
      .rpc('get_player_game_history', {
        p_player_alias: alias,
        p_limit: limit
      });

    if (error) {
      console.error('Error fetching player game history:', error);
      return NextResponse.json({ 
        error: 'Failed to fetch game history',
        details: error.message 
      }, { status: 500 });
    }

    return NextResponse.json({ 
      success: true,
      player_alias: alias,
      games: data || [],
      count: data?.length || 0
    });

  } catch (error: any) {
    console.error('Error in player games API:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error', message: error.message },
      { status: 500 }
    );
  }
}

