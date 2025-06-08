import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export async function POST(req: NextRequest) {
  try {
    const { gameId } = await req.json();

    if (gameId) {
      // Create match for specific game
      const { data, error } = await supabase.rpc('create_match_from_game_stats', {
        game_id_param: gameId
      });

      if (error) {
        console.error('Error creating match for game:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      return NextResponse.json({
        success: true,
        matchId: data,
        message: `Match created for game ${gameId}`
      });
    } else {
      // Auto-create matches for all unlinked games
      const { data: matchesCreated, error } = await supabase.rpc('auto_create_matches_for_unlinked_games');

      if (error) {
        console.error('Error auto-creating matches:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      return NextResponse.json({
        success: true,
        matchesCreated,
        message: `Created ${matchesCreated} matches from unlinked games`
      });
    }
  } catch (error) {
    console.error('Error in auto-create matches API:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function GET(req: NextRequest) {
  try {
    // Get list of unlinked games
    const { data: unlinkedGames, error } = await supabase
      .from('player_stats')
      .select(`
        game_id,
        game_date,
        game_mode,
        arena_name,
        player_name
      `)
      .not('game_id', 'is', null)
      .order('game_date', { ascending: false });

    if (error) {
      console.error('Error fetching unlinked games:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Check which games already have matches
    const { data: existingMatches, error: matchError } = await supabase
      .from('matches')
      .select('game_id')
      .not('game_id', 'is', null);

    if (matchError) {
      console.error('Error fetching existing matches:', error);
      return NextResponse.json({ error: matchError.message }, { status: 500 });
    }

    const existingGameIds = new Set(existingMatches?.map(m => m.game_id) || []);

    // Group unlinked games by game_id
    const gameGroups = new Map();
    unlinkedGames?.forEach(stat => {
      if (!existingGameIds.has(stat.game_id)) {
        if (!gameGroups.has(stat.game_id)) {
          gameGroups.set(stat.game_id, {
            gameId: stat.game_id,
            gameDate: stat.game_date,
            gameMode: stat.game_mode,
            arenaName: stat.arena_name,
            players: []
          });
        }
        gameGroups.get(stat.game_id).players.push(stat.player_name);
      }
    });

    const unlinkedGamesList = Array.from(gameGroups.values())
      .sort((a, b) => new Date(b.gameDate).getTime() - new Date(a.gameDate).getTime())
      .slice(0, 50); // Limit to recent 50

    return NextResponse.json({
      success: true,
      unlinkedGames: unlinkedGamesList,
      count: unlinkedGamesList.length
    });

  } catch (error) {
    console.error('Error in get unlinked games API:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
} 