import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { createClient } from '@supabase/supabase-js';
import type { MatchReport, MatchReportWithDetails } from '@/types/database';

// Service client for bypassing RLS when needed
const serviceSupabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(request: NextRequest) {
  try {

    const url = new URL(request.url);
    const season = url.searchParams.get('season');
    const limit = url.searchParams.get('limit');

    // Use the RPC function to get match reports with details
    let query = supabase.rpc('get_match_reports_with_details');

    const { data, error } = await query;

    if (error) {
      console.error('Error fetching match reports:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    let filteredData = data as MatchReportWithDetails[];

    // Apply filters
    if (season) {
      filteredData = filteredData.filter(report => 
        report.season_name.toLowerCase() === season.toLowerCase()
      );
    }

    if (limit) {
      const limitNum = parseInt(limit);
      if (!isNaN(limitNum) && limitNum > 0) {
        filteredData = filteredData.slice(0, limitNum);
      }
    }

    return NextResponse.json({ 
      reports: filteredData,
      count: filteredData.length 
    });

  } catch (error) {
    console.error('Error in match reports API:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
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

    // Check if user has permission to create match reports
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('is_admin, ctf_role, email, in_game_alias')
      .eq('id', user.id)
      .single();

    if (profileError || !profile) {
      console.error('Profile fetch error:', profileError);
      console.error('User ID:', user.id);
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
    }

    console.log('User profile:', profile);

    const hasPermission = profile.is_admin || 
                         profile.ctf_role === 'ctf_admin' || 
                         (profile.ctf_role && profile.ctf_role.includes('analyst'));

    console.log('Permission check:', {
      is_admin: profile.is_admin,
      ctf_role: profile.ctf_role,
      hasPermission
    });

    if (!hasPermission) {
      return NextResponse.json({ 
        error: 'Insufficient permissions', 
        debug: {
          is_admin: profile.is_admin,
          ctf_role: profile.ctf_role,
          required_roles: ['admin', 'ctf_admin', 'any role containing "analyst"']
        }
      }, { status: 403 });
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

    // Validate required fields
    if (!title || !squad_a_name || !squad_b_name || !match_summary || !season_name) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    // Create authenticated supabase client with user's session
    const authSupabase = createClient(
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

    // Create the match report using authenticated client
    const { data: newReport, error: insertError } = await authSupabase
      .from('match_reports')
      .insert({
        title,
        squad_a_id: squad_a_id || null,
        squad_b_id: squad_b_id || null,
        squad_a_name,
        squad_b_name,
        match_summary,
        match_highlights_video_url: match_highlights_video_url || null,
        match_date: match_date || new Date().toISOString().split('T')[0],
        season_name,
        created_by: user.id
      })
      .select()
      .single();

    if (insertError) {
      console.error('Error creating match report:', insertError);
      return NextResponse.json({ error: insertError.message }, { status: 500 });
    }

    return NextResponse.json({ report: newReport }, { status: 201 });

  } catch (error) {
    console.error('Error in match reports POST:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
