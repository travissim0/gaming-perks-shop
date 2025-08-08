import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';


export async function POST(request: NextRequest) {
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // Check authentication
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { gameId, youtube_url, vod_url } = await request.json();

    if (!gameId || (!youtube_url && !vod_url)) {
      return NextResponse.json({ error: 'Game ID and at least one video URL required' }, { status: 400 });
    }

    // First check if a match exists for this game
    const { data: existingMatch } = await supabase
      .from('matches')
      .select('id')
      .eq('game_id', gameId)
      .single();

    let error;
    
    if (existingMatch) {
      // Update existing match
      const { error: updateError } = await supabase
        .from('matches')
        .update({
          youtube_url: youtube_url || undefined,
          vod_url: vod_url || undefined
        })
        .eq('game_id', gameId);
      error = updateError;
    } else {
      // Create new match record
      const { error: insertError } = await supabase
        .from('matches')
        .insert({
          game_id: gameId,
          title: `Game ${gameId}`,
          youtube_url: youtube_url || null,
          vod_url: vod_url || null,
          status: 'scheduled'
        });
      error = insertError;
    }

    if (error) {
      console.error('Error updating video URLs:', error);
      return NextResponse.json({ error: 'Failed to update video URLs' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error in add-video route:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
