import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { createClient } from '@supabase/supabase-js';
import type { MatchPlayerRating } from '@/types/database';

// Service client for bypassing RLS when needed
const serviceSupabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {

    const { id: matchReportId } = await params;

    // Get player ratings for this match report
    const { data, error } = await supabase
      .rpc('get_match_player_ratings_with_details', { 
        match_report_id_param: matchReportId 
      });

    if (error) {
      console.error('Error fetching player ratings:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ 
      playerRatings: data || []
    });

  } catch (error) {
    console.error('Error in player ratings GET:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Get the authorization header
    const authHeader = request.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const token = authHeader.split(' ')[1];
    
    // Verify the user with the token
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check if user has permission to create player ratings using service client
    const { data: profile, error: profileError } = await serviceSupabase
      .from('profiles')
      .select('is_admin, ctf_role')
      .eq('id', user.id)
      .single();

    if (profileError || !profile) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
    }

    const hasPermission = profile.is_admin || 
                         profile.ctf_role === 'ctf_admin' || 
                         profile.ctf_role === 'ctf_analyst';

    if (!hasPermission) {
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 });
    }

    const { id: matchReportId } = await params;
    const body = await request.json();
    const {
      player_alias,
      player_id,
      class_position,
      performance_description,
      highlight_clip_url,
      kills,
      deaths,
      turret_damage,
      rating_before,
      rating_adjustment,
      rating_after,
      display_order
    } = body;

    // Validate required fields
    if (!player_alias || !class_position || !performance_description || 
        rating_before === undefined || rating_adjustment === undefined || rating_after === undefined) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    // Validate rating values
    if (rating_before < 1.0 || rating_before > 6.0 || 
        rating_after < 1.0 || rating_after > 6.0 ||
        rating_adjustment < -2.0 || rating_adjustment > 2.0) {
      return NextResponse.json(
        { error: 'Invalid rating values' },
        { status: 400 }
      );
    }

    // Validate that rating_before + rating_adjustment = rating_after
    const calculatedAfter = Math.round((rating_before + rating_adjustment) * 2) / 2;
    if (Math.abs(calculatedAfter - rating_after) > 0.01) {
      return NextResponse.json(
        { error: 'Rating calculation mismatch' },
        { status: 400 }
      );
    }

    // Create the player rating using service client to bypass RLS
    const { data: newRating, error: insertError } = await serviceSupabase
      .from('match_player_ratings')
      .insert({
        match_report_id: matchReportId,
        player_alias,
        player_id: player_id || null,
        class_position,
        performance_description,
        highlight_clip_url: highlight_clip_url || null,
        kills: kills || 0,
        deaths: deaths || 0,
        turret_damage: turret_damage || null,
        rating_before,
        rating_adjustment,
        rating_after,
        display_order: display_order || 0
      })
      .select()
      .single();

    if (insertError) {
      console.error('Error creating player rating:', insertError);
      return NextResponse.json({ error: insertError.message }, { status: 500 });
    }

    return NextResponse.json({ playerRating: newRating }, { status: 201 });

  } catch (error) {
    console.error('Error in player ratings POST:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
