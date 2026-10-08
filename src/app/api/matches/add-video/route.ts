import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';


export async function POST(request: NextRequest) {
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // The signed-in user's token comes from the page (Authorization: Bearer). A service-role client has
    // no session of its own, so getUser() without the token was null for everyone, admins included.
    const authHeader = request.headers.get('Authorization');
    const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
    const { data: { user } } = token ? await supabase.auth.getUser(token) : { data: { user: null } };
    if (!user) {
      return NextResponse.json({ error: 'Sign in first' }, { status: 401 });
    }
    // Who may attach a video: site admins, CTF admins, and the match crew roles that would have one
    // (referees, commentators, recorders).
    const { data: profile } = await supabase.from('profiles').select('is_admin, ctf_role').eq('id', user.id).maybeSingle();
    const role = String((profile as any)?.ctf_role || '').toLowerCase();
    const allowed = (profile as any)?.is_admin === true || role === 'ctf_admin'
      || role.includes('referee') || role.includes('commentator') || role.includes('recorder');
    if (!allowed) {
      return NextResponse.json({ error: 'Only admins, referees, commentators and recorders can add a video' }, { status: 403 });
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
