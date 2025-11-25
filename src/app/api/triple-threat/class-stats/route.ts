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
    
    if (!alias) {
      return NextResponse.json({ 
        error: 'Missing required parameter: alias' 
      }, { status: 400 });
    }

    // Get class statistics for the player
    const { data, error } = await supabaseAdmin
      .rpc('get_player_class_stats', {
        p_player_alias: alias
      });

    if (error) {
      console.error('Error fetching class stats:', error);
      return NextResponse.json({ 
        error: 'Failed to fetch class stats',
        details: error.message 
      }, { status: 500 });
    }

    return NextResponse.json({ 
      success: true,
      player_alias: alias,
      class_stats: data || []
    });

  } catch (error: any) {
    console.error('Error in class stats API:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error', message: error.message },
      { status: 500 }
    );
  }
}

