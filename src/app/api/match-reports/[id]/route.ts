import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import type { MatchReport, MatchReportWithDetails } from '@/types/database';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    // Get match report with details
    const { data: reportsData, error: reportError } = await supabase
      .rpc('get_match_reports_with_details');

    if (reportError) {
      console.error('Error fetching match report:', reportError);
      return NextResponse.json({ error: reportError.message }, { status: 500 });
    }

    const report = (reportsData as MatchReportWithDetails[])?.find(r => r.id === id);

    if (!report) {
      return NextResponse.json({ error: 'Match report not found' }, { status: 404 });
    }

    // Get player ratings for this match report
    const { data: playerRatings, error: ratingsError } = await supabase
      .rpc('get_match_player_ratings_with_details', { match_report_id_param: id });

    if (ratingsError) {
      console.error('Error fetching player ratings:', ratingsError);
      return NextResponse.json({ error: ratingsError.message }, { status: 500 });
    }

    return NextResponse.json({ 
      report,
      playerRatings: playerRatings || []
    });

  } catch (error) {
    console.error('Error in match report GET:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function PUT(
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

    const { id } = await params;

    // Check if user has permission to edit match reports
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('is_admin, ctf_role')
      .eq('id', user.id)
      .single();

    if (profileError || !profile) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
    }

    // Check if match report exists and get creator
    const { data: existingReport, error: fetchError } = await supabase
      .from('match_reports')
      .select('created_by')
      .eq('id', id)
      .single();

    if (fetchError || !existingReport) {
      return NextResponse.json({ error: 'Match report not found' }, { status: 404 });
    }

    // Check permissions - admins, CTF admins, analysts, and original creators can update
    const hasPermission = profile.is_admin || 
                         profile.ctf_role === 'ctf_admin' || 
                         profile.ctf_role === 'ctf_analyst' ||
                         existingReport.created_by === user.id;

    if (!hasPermission) {
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 });
    }

    const body = await request.json();
    const {
      title,
      squad_a_id,
      squad_b_id,
      squad_a_name,
      squad_b_name,
      match_summary,
      match_highlights_video_url,
      match_date,
      season_name
    } = body;

    // Update the match report
    const { data: updatedReport, error: updateError } = await supabase
      .from('match_reports')
      .update({
        title,
        squad_a_id: squad_a_id || null,
        squad_b_id: squad_b_id || null,
        squad_a_name,
        squad_b_name,
        match_summary,
        match_highlights_video_url: match_highlights_video_url || null,
        match_date,
        season_name,
        updated_at: new Date().toISOString()
      })
      .eq('id', id)
      .select()
      .single();

    if (updateError) {
      console.error('Error updating match report:', updateError);
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    return NextResponse.json({ report: updatedReport });

  } catch (error) {
    console.error('Error in match report PUT:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function DELETE(
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

    const { id } = await params;

    // Check if user has permission to delete match reports (only admins and CTF admins)
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

    // Delete the match report (player ratings will be cascaded)
    const { error: deleteError } = await supabase
      .from('match_reports')
      .delete()
      .eq('id', id);

    if (deleteError) {
      console.error('Error deleting match report:', deleteError);
      return NextResponse.json({ error: deleteError.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });

  } catch (error) {
    console.error('Error in match report DELETE:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
