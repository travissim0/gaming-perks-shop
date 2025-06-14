import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Use service role client for database operations
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// GET - Retrieve recent dueling matches
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    
    // Parse query parameters
    const limit = Math.min(parseInt(searchParams.get('limit') || '20'), 50);
    const offset = Math.max(parseInt(searchParams.get('offset') || '0'), 0);
    const matchType = searchParams.get('matchType');
    const playerName = searchParams.get('playerName');
    const matchStatus = searchParams.get('matchStatus') || 'completed';

    console.log('Recent matches query:', { limit, offset, matchType, playerName, matchStatus });

    // Build the base query
    let query = supabaseAdmin
      .from('recent_dueling_matches')
      .select('*');

    // Apply filters
    if (matchType && matchType !== 'all') {
      query = query.eq('match_type', matchType);
    }

    if (matchStatus && matchStatus !== 'all') {
      query = query.eq('match_status', matchStatus);
    }

    if (playerName && playerName.trim()) {
      query = query.or(`player1_name.ilike.%${playerName.trim()}%,player2_name.ilike.%${playerName.trim()}%`);
    }

    // Apply pagination and ordering
    const { data, error, count } = await query
      .order('completed_at', { ascending: false, nullsFirst: false })
      .order('started_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      console.error('Supabase query error:', error);
      return NextResponse.json(
        { error: 'Failed to fetch recent matches', details: error.message },
        { status: 500 }
      );
    }

    // Format the response data
    const formattedData = data?.map(match => ({
      ...match,
      // Parse rounds data if it's a JSON string
      rounds_data: typeof match.rounds_data === 'string' 
        ? JSON.parse(match.rounds_data) 
        : match.rounds_data,
      // Add formatted duration
      formatted_duration: match.duration_seconds 
        ? formatDuration(match.duration_seconds)
        : null
    })) || [];

    return NextResponse.json({
      success: true,
      data: formattedData,
      pagination: {
        total: count || 0,
        offset,
        limit,
        hasMore: (offset + limit) < (count || 0)
      }
    });

  } catch (error) {
    console.error('Error fetching recent matches:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

// GET specific match details
export async function GET_MATCH(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const matchId = parseInt(params.id);

    if (isNaN(matchId)) {
      return NextResponse.json(
        { error: 'Invalid match ID' },
        { status: 400 }
      );
    }

    // Get match details
    const { data: matchData, error: matchError } = await supabaseAdmin
      .from('dueling_matches')
      .select('*')
      .eq('id', matchId)
      .single();

    if (matchError || !matchData) {
      return NextResponse.json(
        { error: 'Match not found' },
        { status: 404 }
      );
    }

    // Get rounds for this match
    const { data: roundsData, error: roundsError } = await supabaseAdmin
      .from('dueling_rounds')
      .select('*')
      .eq('match_id', matchId)
      .order('round_number');

    // Get kills for this match
    const { data: killsData, error: killsError } = await supabaseAdmin
      .from('dueling_kills')
      .select('*')
      .eq('match_id', matchId)
      .order('kill_timestamp');

    if (roundsError || killsError) {
      console.error('Error fetching match details:', { roundsError, killsError });
    }

    // Group kills by round
    const killsByRound = (killsData || []).reduce((acc, kill) => {
      const roundId = kill.round_id || 'unassigned';
      if (!acc[roundId]) {
        acc[roundId] = [];
      }
      acc[roundId].push(kill);
      return acc;
    }, {} as Record<string, any[]>);

    // Add kills to rounds
    const roundsWithKills = (roundsData || []).map(round => ({
      ...round,
      kills: killsByRound[round.id] || []
    }));

    return NextResponse.json({
      success: true,
      data: {
        match: matchData,
        rounds: roundsWithKills,
        kills: killsData || [],
        killsByRound
      }
    });

  } catch (error) {
    console.error('Error fetching match details:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

// Helper function to format duration
function formatDuration(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  
  if (minutes > 0) {
    return `${minutes}m ${remainingSeconds}s`;
  } else {
    return `${remainingSeconds}s`;
  }
}

// OPTIONS handler for CORS
export async function OPTIONS(request: NextRequest) {
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  });
} 