import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { createClient } from '@supabase/supabase-js';

// Use service role key for admin operations
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { gameId, matchId, userId } = body;

    if (!gameId || !matchId || !userId) {
      return NextResponse.json(
        { error: 'Game ID, Match ID, and User ID are required' },
        { status: 400 }
      );
    }

    // Check if user can link this match (creator or admin)
    const { data: match, error: fetchError } = await supabase
      .from('matches')
      .select('created_by, title, status')
      .eq('id', matchId)
      .single();

    if (fetchError) {
      return NextResponse.json({ error: 'Match not found' }, { status: 404 });
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('is_admin')
      .eq('id', userId)
      .single();

    const isAdmin = profile?.is_admin || false;
    const isCreator = match.created_by === userId;

    if (!isCreator && !isAdmin) {
      return NextResponse.json({ error: 'Only the match creator or admin can link game stats' }, { status: 403 });
    }

    // Check if game_id exists in player_stats
    const { data: gameStats, error: statsError } = await supabase
      .from('player_stats')
      .select('game_id, game_date, arena, game_mode')
      .eq('game_id', gameId)
      .limit(1);

    if (statsError || !gameStats || gameStats.length === 0) {
      return NextResponse.json({ error: 'Game stats not found for this game ID' }, { status: 404 });
    }

    // Link the game to the match
    const { error: updateError } = await supabaseAdmin
      .from('matches')
      .update({ 
        game_id: gameId,
        status: 'completed',
        actual_start_time: gameStats[0].game_date,
        actual_end_time: gameStats[0].game_date // We'll improve this when we have better timing data
      })
      .eq('id', matchId);

    if (updateError) {
      console.error('Error linking game to match:', updateError);
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    return NextResponse.json({ 
      success: true, 
      message: `Game ${gameId} successfully linked to match "${match.title}"`,
      gameStats: gameStats[0]
    });

  } catch (error: any) {
    console.error('Game linking error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const gameId = searchParams.get('gameId');
    const suggestMatches = searchParams.get('suggest') === 'true';

    if (!gameId) {
      return NextResponse.json({ error: 'Game ID is required' }, { status: 400 });
    }

    // Get game stats info
    const { data: gameStats, error: statsError } = await supabase
      .from('player_stats')
      .select('game_id, game_date, arena, game_mode, player_name, team')
      .eq('game_id', gameId)
      .order('game_date', { ascending: true });

    if (statsError || !gameStats || gameStats.length === 0) {
      return NextResponse.json({ error: 'Game stats not found' }, { status: 404 });
    }

    const gameInfo = {
      gameId,
      gameDate: gameStats[0].game_date,
      arena: gameStats[0].arena,
      gameMode: gameStats[0].game_mode,
      totalPlayers: gameStats.length,
      teams: [...new Set(gameStats.map(s => s.team))],
      players: gameStats.map(s => s.player_name)
    };

    // Check if already linked
    const { data: existingMatch } = await supabase
      .from('matches')
      .select('id, title')
      .eq('game_id', gameId)
      .single();

    if (existingMatch) {
      return NextResponse.json({
        gameInfo,
        isLinked: true,
        linkedMatch: existingMatch,
        suggestedMatches: []
      });
    }

    let suggestedMatches: any[] = [];

    if (suggestMatches) {
      // Find potential matches to link to based on date proximity and participants
      const gameDate = new Date(gameStats[0].game_date);
      const beforeDate = new Date(gameDate.getTime() - 4 * 60 * 60 * 1000); // 4 hours before
      const afterDate = new Date(gameDate.getTime() + 2 * 60 * 60 * 1000);  // 2 hours after

      const { data: potentialMatches } = await supabase
        .from('matches')
        .select(`
          id,
          title,
          scheduled_at,
          status,
          match_type,
          squad_a_name:squads!matches_squad_a_id_fkey(name),
          squad_b_name:squads!matches_squad_b_id_fkey(name),
          match_participants(
            profiles!match_participants_player_id_fkey(in_game_alias)
          )
        `)
        .gte('scheduled_at', beforeDate.toISOString())
        .lte('scheduled_at', afterDate.toISOString())
        .is('game_id', null)
        .in('status', ['scheduled', 'expired', 'in_progress']);

      if (potentialMatches) {
        suggestedMatches = potentialMatches.map((match: any) => {
          const matchPlayers = match.match_participants?.map((p: any) => p.profiles?.in_game_alias) || [];
          const playerMatches = gameInfo.players.filter(player => 
            matchPlayers.some((mp: any) => mp?.toLowerCase() === player.toLowerCase())
          );

          return {
            id: match.id,
            title: match.title,
            scheduledAt: match.scheduled_at,
            status: match.status,
            matchType: match.match_type,
            squadAName: match.squad_a_name?.name,
            squadBName: match.squad_b_name?.name,
            playerMatches: playerMatches.length,
            totalRegistered: matchPlayers.length,
            matchScore: (playerMatches.length / Math.max(matchPlayers.length, 1)) * 100,
            timeDifference: Math.abs(gameDate.getTime() - new Date(match.scheduled_at).getTime()) / (1000 * 60) // minutes
          };
        }).sort((a: any, b: any) => b.matchScore - a.matchScore || a.timeDifference - b.timeDifference);
      }
    }

    return NextResponse.json({
      gameInfo,
      isLinked: false,
      linkedMatch: null,
      suggestedMatches
    });

  } catch (error: any) {
    console.error('Game lookup error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
} 