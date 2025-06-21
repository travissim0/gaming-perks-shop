import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const limit = Math.min(parseInt(searchParams.get('limit') || '20'), 50);

    // Get recent unique games by fetching player stats and grouping by game_id
    const { data: recentStats, error } = await supabase
      .from('player_stats')
      .select(`
        game_id,
        game_date,
        game_mode,
        arena_name,
        player_name,
        team,
        side,
        main_class,
        result
      `)
      .not('game_id', 'is', null)
      .order('game_date', { ascending: false })
      .limit(limit * 10); // Get more to ensure unique games

    if (error) {
      console.error('Error fetching recent games:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Group by game_id to get unique games
    const gamesMap = new Map();
    recentStats?.forEach(stat => {
      if (!gamesMap.has(stat.game_id)) {
        gamesMap.set(stat.game_id, {
          gameId: stat.game_id,
          gameDate: stat.game_date,
          gameMode: stat.game_mode,
          mapName: stat.arena_name,
          playerDetails: [{
            name: stat.player_name,
            team: stat.team,
            side: stat.side,
            main_class: stat.main_class,
            result: stat.result
          }],
          teams: [stat.team].filter(Boolean)
        });
      } else {
        const game = gamesMap.get(stat.game_id);
        const existingPlayer = game.playerDetails.find((p: any) => p.name === stat.player_name);
        if (!existingPlayer) {
          game.playerDetails.push({
            name: stat.player_name,
            team: stat.team,
            side: stat.side,
            main_class: stat.main_class,
            result: stat.result
          });
        }
        if (stat.team && !game.teams.includes(stat.team)) {
          game.teams.push(stat.team);
        }
      }
    });

    // Convert to array and sort by date, then limit
    const uniqueGames = Array.from(gamesMap.values())
      .sort((a, b) => new Date(b.gameDate).getTime() - new Date(a.gameDate).getTime())
      .slice(0, limit)
      .map(game => ({
        ...game,
        players: game.playerDetails.length // For backward compatibility
      }));

    return NextResponse.json({
      success: true,
      data: uniqueGames,
      count: uniqueGames.length
    });

  } catch (error) {
    console.error('Error in recent games API:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
} 