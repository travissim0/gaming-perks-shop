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
    const seriesId = searchParams.get('series_id');
    
    if (!alias || !seriesId) {
      return NextResponse.json({ 
        error: 'Missing required parameters: alias and series_id' 
      }, { status: 400 });
    }

    // Get series averages for the player
    const { data, error } = await supabaseAdmin
      .rpc('get_player_series_averages', {
        p_player_alias: alias,
        p_series_id: seriesId
      });

    if (error) {
      console.error('Error fetching series averages:', error);
      return NextResponse.json({ 
        error: 'Failed to fetch series averages',
        details: error.message 
      }, { status: 500 });
    }

    return NextResponse.json({ 
      success: true,
      player_alias: alias,
      series_id: seriesId,
      averages: data && data.length > 0 ? data[0] : null
    });

  } catch (error: any) {
    console.error('Error in series analysis API:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error', message: error.message },
      { status: 500 }
    );
  }
}

