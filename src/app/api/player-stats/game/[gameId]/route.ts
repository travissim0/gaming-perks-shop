import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Initialize Supabase client
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ gameId: string }> }
) {
  try {
    const { gameId } = await params;

    if (!gameId) {
      return NextResponse.json(
        { error: 'Game ID is required' },
        { status: 400 }
      );
    }

    // Fetch player stats for the specific game
    const { data: gameStats, error } = await supabase
      .from('player_stats')
      .select(`
        *
      `)
      .eq('game_id', gameId)
      .order('kills', { ascending: false });

    // Also try to fetch video information if this game is linked to matches
    let videoInfo = null;
    if (gameStats && gameStats.length > 0) {
      const { data: linkedMatches } = await supabase
        .from('matches')
        .select(`
          id,
          title,
          youtube_url,
          vod_url,
          highlight_url,
          video_title,
          video_description,
          video_thumbnail_url
        `)
        .eq('linked_game_id', gameId);
      
      if (linkedMatches && linkedMatches.length > 0) {
        const match = linkedMatches[0]; // Use first linked match
        videoInfo = {
          matchId: match.id,
          matchTitle: match.title,
          youtube_url: match.youtube_url,
          vod_url: match.vod_url,
          highlight_url: match.highlight_url,
          video_title: match.video_title,
          video_description: match.video_description,
          video_thumbnail_url: match.video_thumbnail_url,
          has_video: !!(match.youtube_url || match.vod_url || match.highlight_url)
        };
      }
    }

    if (error) {
      console.error('Error fetching game stats:', error);
      return NextResponse.json(
        { error: 'Failed to fetch game stats', details: error.message },
        { status: 500 }
      );
    }

    if (!gameStats || gameStats.length === 0) {
      return NextResponse.json(
        { error: 'No stats found for this game ID' },
        { status: 404 }
      );
    }

    // Calculate some summary stats for the game
    const totalKills = gameStats.reduce((sum, player) => sum + (player.kills || 0), 0);
    const totalDeaths = gameStats.reduce((sum, player) => sum + (player.deaths || 0), 0);
    const totalCaptures = gameStats.reduce((sum, player) => sum + (player.captures || 0), 0);
    const gameLength = gameStats[0]?.game_length_minutes || 0;
    const durationSeconds = Math.round(gameLength * 60); // Convert minutes to seconds
    const gameMode = gameStats[0]?.game_mode || 'Unknown';
    const arenaName = gameStats[0]?.arena_name || 'Unknown';
    const gameDate = gameStats[0]?.game_date;

    // Determine winning team/side
    let winningInfo = null;
    if (gameMode === 'OvD') {
      // For OvD, check if offense won by looking at captures or explicit results
      const offensePlayers = gameStats.filter(p => p.side === 'offense');
      const defensePlayers = gameStats.filter(p => p.side === 'defense');
      
      if (offensePlayers.length > 0 && defensePlayers.length > 0) {
        const offenseWins = offensePlayers.filter(p => p.result === 'Win').length;
        const defenseWins = defensePlayers.filter(p => p.result === 'Win').length;
        
        if (offenseWins > defenseWins) {
          winningInfo = { type: 'side', winner: 'Offense', side: 'offense' };
        } else if (defenseWins > offenseWins) {
          winningInfo = { type: 'side', winner: 'Defense', side: 'defense' };
        }
      }
    } else {
      // For other modes, determine by team
      const teamWins: Record<string, number> = {};
      gameStats.forEach(player => {
        if (player.result === 'Win' && player.team) {
          teamWins[player.team] = (teamWins[player.team] || 0) + 1;
        }
      });
      
      const teams = Object.keys(teamWins);
      const winningTeam = teams.length > 0 ? teams.reduce((a, b) => 
        teamWins[a] > teamWins[b] ? a : b
      ) : null;
      
      if (winningTeam) {
        winningInfo = { type: 'team', winner: winningTeam, team: winningTeam };
      }
    }

    // Separate players by team if available
    const teamStats = gameStats.reduce((acc, player) => {
      const team = player.team || 'Unknown';
      if (!acc[team]) {
        acc[team] = [];
      }
      acc[team].push(player);
      return acc;
    }, {} as Record<string, any[]>);

    return NextResponse.json({
      success: true,
      data: {
        gameId,
        gameMode,
        mapName: arenaName, // Rename for consistency
        serverName: arenaName, // Keep both for compatibility
        gameDate,
        duration: durationSeconds, // Duration in seconds
        gameLength, // Keep original for backward compatibility
        winningInfo,
        videoInfo, // Add video information
        summary: {
          totalKills,
          totalDeaths,
          totalCaptures,
          playerCount: gameStats.length
        },
        players: gameStats,
        teamStats
      }
    });

  } catch (error) {
    console.error('Error in game stats API:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
} 