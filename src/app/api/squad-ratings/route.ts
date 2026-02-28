import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';

// Use service role client for admin operations
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(request: NextRequest) {
  try {
    // Call the RPC function to get squad ratings with joined data
    const { data: ratings, error } = await supabase
      .rpc('get_squad_ratings');

    if (error) {
      console.error('Error fetching squad ratings:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ratings });
  } catch (error) {
    console.error('Unexpected error fetching squad ratings:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    // Get the Authorization header
    const authHeader = request.headers.get('authorization');
    
    if (!authHeader) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Create Supabase client with the user's access token
    const supabaseUser = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        global: {
          headers: {
            Authorization: authHeader,
          },
        },
      }
    );
    
    // Get the authenticated user
    const { data: { user }, error: userError } = await supabaseUser.auth.getUser();
    
    if (userError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get user profile for permission checks
    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('is_admin, is_media_manager, ctf_role')
      .eq('id', user.id)
      .single();

    // Parse request body early to check if it's an official rating
    const body = await request.json();
    const isOfficialRating = body.is_official === true;

    // Check permissions based on rating type
    if (isOfficialRating) {
      // Only admins and CTF admins can create official ratings
      const canCreateOfficial = profile?.is_admin || profile?.ctf_role === 'ctf_admin';
      if (!canCreateOfficial) {
        return NextResponse.json({ error: 'Only admins and CTF admins can create official ratings' }, { status: 403 });
      }
    }
    // For unofficial ratings, anyone can create them (no additional permission check needed)

    const {
      squad_id,
      season_name,
      league_slug = 'ctfpl',
      analysis_date,
      analyst_commentary,
      analyst_quote,
      breakdown_summary,
      is_official = false,
      player_ratings
    } = body;

    // Validate required fields
    if (!squad_id || !season_name) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // Insert squad rating using admin client
    const { data: squadRating, error: squadRatingError } = await supabaseAdmin
      .from('squad_ratings')
      .insert({
        squad_id,
        analyst_id: user.id,
        season_name,
        league_slug,
        analysis_date: analysis_date || new Date().toISOString().split('T')[0],
        analyst_commentary,
        analyst_quote,
        breakdown_summary,
        is_official
      })
      .select()
      .single();

    if (squadRatingError) {
      console.error('Error creating squad rating:', squadRatingError);
      return NextResponse.json({ error: squadRatingError.message }, { status: 500 });
    }

    // Insert player ratings if provided
    if (player_ratings && Array.isArray(player_ratings) && player_ratings.length > 0) {
      const playerRatingsData = player_ratings.map(pr => ({
        squad_rating_id: squadRating.id,
        player_id: pr.player_id,
        rating: pr.rating,
        notes: pr.notes
      }));

      const { error: playerRatingsError } = await supabaseAdmin
        .from('player_ratings')
        .insert(playerRatingsData);

      if (playerRatingsError) {
        console.error('Error creating player ratings:', playerRatingsError);
        // Delete the squad rating if player ratings failed
        await supabaseAdmin.from('squad_ratings').delete().eq('id', squadRating.id);
        return NextResponse.json({ error: playerRatingsError.message }, { status: 500 });
      }
    }

    return NextResponse.json({ success: true, squad_rating: squadRating });
  } catch (error) {
    console.error('Unexpected error creating squad rating:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}