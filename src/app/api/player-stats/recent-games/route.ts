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
    const withRecordings = searchParams.get('with_recordings') === 'true';

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
        result,
        kills,
        deaths,
        captures,
        carrier_kills
      `)
      .not('game_id', 'is', null)
      .order('game_date', { ascending: false })
      .limit(limit * 15); // Get more to ensure unique games with recordings

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
          players: [{
            player_name: stat.player_name,
            team: stat.team,
            side: stat.side,
            main_class: stat.main_class,
            result: stat.result,
            kills: stat.kills || 0,
            deaths: stat.deaths || 0,
            flag_captures: stat.captures || 0,
            carrier_kills: stat.carrier_kills || 0
          }],
          teams: [stat.team].filter(Boolean),
          totalPlayers: 1
        });
      } else {
        const game = gamesMap.get(stat.game_id);
        const existingPlayer = game.players.find((p: any) => p.player_name === stat.player_name);
        if (!existingPlayer) {
          game.players.push({
            player_name: stat.player_name,
            team: stat.team,
            side: stat.side,
            main_class: stat.main_class,
            result: stat.result,
            kills: stat.kills || 0,
            deaths: stat.deaths || 0,
            flag_captures: stat.captures || 0,
            carrier_kills: stat.carrier_kills || 0
          });
          game.totalPlayers = game.players.length;
        }
        if (stat.team && !game.teams.includes(stat.team)) {
          game.teams.push(stat.team);
        }
      }
    });

    // Convert to array and add video information
    let uniqueGames = Array.from(gamesMap.values());

    // If we need recordings, fetch video information
    if (withRecordings || uniqueGames.length > 0) {
      const gameIds = uniqueGames.map(game => game.gameId);
      console.log('🎬 Looking for videos for game IDs:', gameIds.slice(0, 5)); // Show first 5
      
      // Fetch video information from featured_videos table
      const { data: videosData } = await supabase
        .from('featured_videos')
        .select('match_id, youtube_url, vod_url, title, thumbnail_url')
        .in('match_id', gameIds);
      
      console.log('🎬 Videos found in featured_videos:', videosData?.length || 0);

      // Fetch video information from matches table (using game_id field)
      const { data: matchesData } = await supabase
        .from('matches')
        .select('game_id, youtube_url, vod_url, title, video_title, video_thumbnail_url')
        .in('game_id', gameIds);
        
      console.log('🎬 Videos found in matches:', matchesData?.length || 0);

      // Add video information to games
      uniqueGames = uniqueGames.map(game => {
        const videoFromFeatured = videosData?.find(v => v.match_id === game.gameId);
        const videoFromMatches = matchesData?.find(m => m.game_id === game.gameId);
        
        const hasVideo = !!(videoFromFeatured?.youtube_url || videoFromFeatured?.vod_url || 
                           videoFromMatches?.youtube_url || videoFromMatches?.vod_url);
        
        // Calculate duration (estimate based on game mode)
        const estimatedDuration = game.gameMode === 'CTF' ? 1800 : 1200; // 30min for CTF, 20min for others
        
        // Determine winning info from player results
        const teamResults = game.teams.map((team: string) => {
          const teamPlayers = game.players.filter((p: any) => p.team === team);
          const wins = teamPlayers.filter((p: any) => p.result === 'win').length;
          const losses = teamPlayers.filter((p: any) => p.result === 'loss').length;
          return { team, wins, losses, players: teamPlayers.length };
        });
        
        const winningTeam = teamResults.find((t: any) => t.wins > t.losses);
        
        return {
          ...game,
          duration: estimatedDuration,
          videoInfo: {
            has_video: hasVideo,
            youtube_url: videoFromFeatured?.youtube_url || videoFromMatches?.youtube_url || null,
            vod_url: videoFromFeatured?.vod_url || videoFromMatches?.vod_url || null,
            video_title: videoFromFeatured?.title || videoFromMatches?.video_title || videoFromMatches?.title || null,
            thumbnail_url: videoFromFeatured?.thumbnail_url || videoFromMatches?.video_thumbnail_url || null
          },
          winningInfo: winningTeam ? {
            type: 'team',
            side: winningTeam.team.includes('TI') ? 'titan' : 'collective',
            winner: winningTeam.team
          } : null
        };
      });

      // Filter for recordings if requested
      if (withRecordings) {
        const gamesWithVideos = uniqueGames.filter(game => game.videoInfo.has_video);
        console.log('🎬 Games with videos after filtering:', gamesWithVideos.length);
        console.log('🎬 Sample video info:', gamesWithVideos[0]?.videoInfo);
        uniqueGames = gamesWithVideos;
      }
    }

    // Sort by date and limit
    const finalGames = uniqueGames
      .sort((a, b) => new Date(b.gameDate).getTime() - new Date(a.gameDate).getTime())
      .slice(0, limit);

    return NextResponse.json({
      success: true,
      games: finalGames, // Changed from 'data' to 'games' for consistency
      count: finalGames.length
    });

  } catch (error) {
    console.error('Error in recent games API:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
} 