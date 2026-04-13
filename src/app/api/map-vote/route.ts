import { NextRequest, NextResponse } from 'next/server';
import { getCachedSupabase, getServiceSupabase } from '@/lib/supabase';
import { createClient } from '@supabase/supabase-js';

// GET: Fetch presets and current vote tallies (public)
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const action = searchParams.get('action');

  const supabaseService = getServiceSupabase();

  switch (action) {
    case 'presets': {
      const zone_key = searchParams.get('zone_key') || 'usl';
      // Fetch presets - filter by cfg_file pattern if needed
      const { data, error } = await supabaseService
        .from('map_presets')
        .select('id, display_name, zone_name, cfg_file, lvl_file, lio_file, preview_image_url')
        .order('display_name');

      if (error) {
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
      }
      return NextResponse.json({ success: true, data: data || [] });
    }

    case 'active-vote': {
      // Get the currently active vote session
      const { data, error } = await supabaseService
        .from('map_vote_sessions')
        .select('*')
        .eq('status', 'active')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) {
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
      }
      if (!data) {
        return NextResponse.json({ success: true, data: null });
      }

      // Get vote tallies for this session
      const { data: tallies, error: tallyError } = await supabaseService
        .from('map_votes')
        .select('preset_id')
        .eq('session_id', data.id);

      if (tallyError) {
        return NextResponse.json({ success: false, error: tallyError.message }, { status: 500 });
      }

      // Count votes per preset
      const voteCounts: Record<string, number> = {};
      (tallies || []).forEach((v: any) => {
        voteCounts[v.preset_id] = (voteCounts[v.preset_id] || 0) + 1;
      });

      return NextResponse.json({
        success: true,
        data: {
          session: data,
          voteCounts,
          totalVotes: tallies?.length || 0,
        },
      });
    }

    case 'my-vote': {
      // Check if user has already voted in the active session
      const authHeader = request.headers.get('authorization');
      if (!authHeader) {
        return NextResponse.json({ success: true, data: null });
      }

      const token = authHeader.replace('Bearer ', '');
      const supabaseAuth = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      );
      const { data: { user } } = await supabaseAuth.auth.getUser(token);
      if (!user) {
        return NextResponse.json({ success: true, data: null });
      }

      // Get active session
      const { data: session } = await supabaseService
        .from('map_vote_sessions')
        .select('id')
        .eq('status', 'active')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!session) {
        return NextResponse.json({ success: true, data: null });
      }

      const { data: vote } = await supabaseService
        .from('map_votes')
        .select('preset_id')
        .eq('session_id', session.id)
        .eq('user_id', user.id)
        .maybeSingle();

      return NextResponse.json({ success: true, data: vote });
    }

    case 'current-map': {
      // Get current zone status from DB
      const { data, error } = await supabaseService
        .from('zone_status')
        .select('*')
        .eq('zone_key', 'usl')
        .maybeSingle();

      if (error) {
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
      }
      return NextResponse.json({ success: true, data });
    }

    default:
      return NextResponse.json({ success: false, error: 'Invalid action' }, { status: 400 });
  }
}

// POST: Cast a vote (requires auth)
export async function POST(request: NextRequest) {
  const body = await request.json();
  const { action } = body;

  const supabaseService = getServiceSupabase();

  // Authenticate user
  const authHeader = request.headers.get('authorization');
  if (!authHeader) {
    return NextResponse.json({ success: false, error: 'Authentication required' }, { status: 401 });
  }

  const token = authHeader.replace('Bearer ', '');
  const supabaseAuth = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
  const { data: { user } } = await supabaseAuth.auth.getUser(token);
  if (!user) {
    return NextResponse.json({ success: false, error: 'Invalid token' }, { status: 401 });
  }

  // Get user alias
  const { data: profile } = await supabaseService
    .from('profiles')
    .select('in_game_alias')
    .eq('id', user.id)
    .single();

  switch (action) {
    case 'cast-vote': {
      const { preset_id } = body;
      if (!preset_id) {
        return NextResponse.json({ success: false, error: 'Missing preset_id' }, { status: 400 });
      }

      // Get active session
      const { data: session } = await supabaseService
        .from('map_vote_sessions')
        .select('id')
        .eq('status', 'active')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!session) {
        return NextResponse.json({ success: false, error: 'No active vote session' }, { status: 400 });
      }

      // Upsert vote (one vote per user per session)
      const { data, error } = await supabaseService
        .from('map_votes')
        .upsert(
          {
            session_id: session.id,
            user_id: user.id,
            preset_id,
            voter_alias: profile?.in_game_alias || 'Unknown',
          },
          { onConflict: 'session_id,user_id' }
        )
        .select()
        .single();

      if (error) {
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
      }
      return NextResponse.json({ success: true, data });
    }

    default:
      return NextResponse.json({ success: false, error: 'Invalid action' }, { status: 400 });
  }
}
