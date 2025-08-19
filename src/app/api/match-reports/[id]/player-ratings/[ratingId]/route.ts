import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import type { MatchPlayerRating } from '@/types/database';

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; ratingId: string }> }
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

    // Check if user has permission to update player ratings
    const { data: profile, error: profileError } = await supabase
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

    const { ratingId } = await params;
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

    // Validate rating values
    if (rating_before !== undefined && (rating_before < 1.0 || rating_before > 6.0)) {
      return NextResponse.json({ error: 'Invalid rating_before value' }, { status: 400 });
    }
    if (rating_after !== undefined && (rating_after < 1.0 || rating_after > 6.0)) {
      return NextResponse.json({ error: 'Invalid rating_after value' }, { status: 400 });
    }
    if (rating_adjustment !== undefined && (rating_adjustment < -2.0 || rating_adjustment > 2.0)) {
      return NextResponse.json({ error: 'Invalid rating_adjustment value' }, { status: 400 });
    }

    // If all rating values are provided, validate the calculation
    if (rating_before !== undefined && rating_adjustment !== undefined && rating_after !== undefined) {
      const calculatedAfter = Math.round((rating_before + rating_adjustment) * 2) / 2;
      if (Math.abs(calculatedAfter - rating_after) > 0.01) {
        return NextResponse.json({ error: 'Rating calculation mismatch' }, { status: 400 });
      }
    }

    // Update the player rating
    const { data: updatedRating, error: updateError } = await supabase
      .from('match_player_ratings')
      .update({
        ...(player_alias !== undefined && { player_alias }),
        ...(player_id !== undefined && { player_id: player_id || null }),
        ...(class_position !== undefined && { class_position }),
        ...(performance_description !== undefined && { performance_description }),
        ...(highlight_clip_url !== undefined && { highlight_clip_url: highlight_clip_url || null }),
        ...(kills !== undefined && { kills: kills || 0 }),
        ...(deaths !== undefined && { deaths: deaths || 0 }),
        ...(turret_damage !== undefined && { turret_damage: turret_damage || null }),
        ...(rating_before !== undefined && { rating_before }),
        ...(rating_adjustment !== undefined && { rating_adjustment }),
        ...(rating_after !== undefined && { rating_after }),
        ...(display_order !== undefined && { display_order }),
        updated_at: new Date().toISOString()
      })
      .eq('id', ratingId)
      .select()
      .single();

    if (updateError) {
      console.error('Error updating player rating:', updateError);
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    return NextResponse.json({ playerRating: updatedRating });

  } catch (error) {
    console.error('Error in player rating PUT:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; ratingId: string }> }
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

    // Check if user has permission to delete player ratings (only admins and CTF admins)
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('is_admin, ctf_role')
      .eq('id', user.id)
      .single();

    if (profileError || !profile) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
    }

    const hasPermission = profile.is_admin || profile.ctf_role === 'ctf_admin';

    if (!hasPermission) {
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 });
    }

    const { ratingId } = await params;

    // Delete the player rating
    const { error: deleteError } = await supabase
      .from('match_player_ratings')
      .delete()
      .eq('id', ratingId);

    if (deleteError) {
      console.error('Error deleting player rating:', deleteError);
      return NextResponse.json({ error: deleteError.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });

  } catch (error) {
    console.error('Error in player rating DELETE:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
