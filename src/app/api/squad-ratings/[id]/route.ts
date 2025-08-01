import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';

// Use service role client for admin operations
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;

    // Get squad rating details
    const { data: squadRating, error: squadError } = await supabase
      .rpc('get_squad_ratings')
      .eq('id', id)
      .single();

    if (squadError) {
      console.error('Error fetching squad rating:', squadError);
      return NextResponse.json({ error: squadError.message }, { status: 500 });
    }

    if (!squadRating) {
      return NextResponse.json({ error: 'Squad rating not found' }, { status: 404 });
    }

    // Get player ratings for this squad rating
    const { data: playerRatings, error: playersError } = await supabase
      .rpc('get_player_ratings_for_squad', { squad_rating_uuid: id });

    if (playersError) {
      console.error('Error fetching player ratings:', playersError);
      return NextResponse.json({ error: playersError.message }, { status: 500 });
    }



    return NextResponse.json({ 
      squad_rating: squadRating, 
      player_ratings: playerRatings || [] 
    });
  } catch (error) {
    console.error('Unexpected error fetching squad rating:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;
    
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

    // Check if user has permissions to edit ratings
    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('is_admin, is_media_manager, ctf_role')
      .eq('id', user.id)
      .single();

    const isAdmin = profile?.is_admin === true;
    const isMediaManager = profile?.is_media_manager === true;
    const isCTFAdmin = profile?.ctf_role === 'ctf_admin';

    // Allow access for admins, media managers, or CTF admins
    if (!isAdmin && !isMediaManager && !isCTFAdmin) {
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 });
    }

    // Check if user is the original analyst for this rating (only for non-admins)
    if (!isAdmin && !isCTFAdmin) {
      const { data: existingRating } = await supabaseAdmin
        .from('squad_ratings')
        .select('analyst_id')
        .eq('id', id)
        .single();

      if (existingRating && existingRating.analyst_id !== user.id) {
        return NextResponse.json({ error: 'You can only edit ratings you created' }, { status: 403 });
      }
    }

    const body = await request.json();
    const { 
      season_name, 
      analysis_date, 
      analyst_commentary, 
      analyst_quote, 
      breakdown_summary,
      is_official,
      analyst_id,
      player_ratings 
    } = body;

    // Update squad rating using admin client
    const { data: squadRating, error: squadRatingError } = await supabaseAdmin
      .from('squad_ratings')
      .update({
        season_name,
        analysis_date,
        analyst_commentary,
        analyst_quote,
        breakdown_summary,
        ...(is_official !== undefined && { is_official }),
        ...(analyst_id !== undefined && { analyst_id })
      })
      .eq('id', id)
      .select()
      .single();

    if (squadRatingError) {
      console.error('Error updating squad rating:', squadRatingError);
      return NextResponse.json({ error: squadRatingError.message }, { status: 500 });
    }

    // Update player ratings if provided
    if (player_ratings && Array.isArray(player_ratings)) {
      // Delete existing player ratings
      await supabaseAdmin
        .from('player_ratings')
        .delete()
        .eq('squad_rating_id', id);

      // Insert new player ratings
      if (player_ratings.length > 0) {
        const playerRatingsData = player_ratings.map(pr => ({
          squad_rating_id: id,
          player_id: pr.player_id,
          rating: pr.rating,
          notes: pr.notes
        }));

        const { error: playerRatingsError } = await supabaseAdmin
          .from('player_ratings')
          .insert(playerRatingsData);

        if (playerRatingsError) {
          console.error('Error updating player ratings:', playerRatingsError);
          return NextResponse.json({ error: playerRatingsError.message }, { status: 500 });
        }
      }
    }

    return NextResponse.json({ success: true, squad_rating: squadRating });
  } catch (error) {
    console.error('Unexpected error updating squad rating:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;
    
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

    // Check if user is admin or media manager
    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('is_admin, is_media_manager')
      .eq('id', user.id)
      .single();

    if (!profile?.is_admin && !profile?.is_media_manager) {
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 });
    }

    // Check if user is the original analyst for this rating
    const { data: existingRating } = await supabaseAdmin
      .from('squad_ratings')
      .select('analyst_id')
      .eq('id', id)
      .single();

    if (existingRating && existingRating.analyst_id !== user.id) {
      return NextResponse.json({ error: 'You can only delete ratings you created' }, { status: 403 });
    }

    // Delete squad rating using admin client (player ratings will be deleted via CASCADE)
    const { error } = await supabaseAdmin
      .from('squad_ratings')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('Error deleting squad rating:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Unexpected error deleting squad rating:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}