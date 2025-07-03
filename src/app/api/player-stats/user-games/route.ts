import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export async function GET(req: NextRequest) {
  try {
    // Get user from auth token
    const authHeader = req.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const token = authHeader.substring(7);
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get user's profile to get their in_game_alias
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('in_game_alias')
      .eq('id', user.id)
      .single();

    if (profileError || !profile?.in_game_alias) {
      return NextResponse.json({ error: 'User profile not found' }, { status: 404 });
    }

    const { searchParams } = new URL(req.url);
    const limit = Math.min(parseInt(searchParams.get('limit') || '20'), 100);
    const withRecordings = searchParams.get('with_recordings') === 'true';

    // Get games where this player participated
    const { data: playerStats, error: statsError } = await supabase
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
      .ilike('player_name', profile.in_game_alias) // Case-insensitive match
      .not('game_id', 'is', null)
      .order('game_date', { ascending: false })
      .limit(limit * 10); // Get more to find unique games

    if (statsError) {
      console.error('Error fetching player games:', statsError);
      return NextResponse.json({ error: 'Failed to fetch games' }, { status: 500 });
    }

    // Group by game_id to get unique games and include all players
    const gamesMap = new Map();
    const userGameIds = new Set();
    
    // First pass: collect all game IDs where the user participated
    playerStats?.forEach(stat => {
      if (stat.player_name.toLowerCase() === profile.in_game_alias.toLowerCase()) {
        userGameIds.add(stat.game_id);
      }
    });

    // Second pass: get all player data for games where user participated
    if (userGameIds.size > 0) {
      const { data: allGameStats, error: allStatsError } = await supabase
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
        .in('game_id', Array.from(userGameIds))
        .order('game_date', { ascending: false });

      if (!allStatsError && allGameStats) {
        // Group all stats by game_id
        allGameStats.forEach(stat => {
          if (!gamesMap.has(stat.game_id)) {
            gamesMap.set(stat.game_id, {
              gameId: stat.game_id,
              gameDate: stat.game_date,
              gameMode: stat.game_mode,
              mapName: stat.arena_name,
              players: [],
              teams: [],
              totalPlayers: 0,
              userParticipated: false
            });
          }
          
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
          
          if (stat.player_name.toLowerCase() === profile.in_game_alias.toLowerCase()) {
            game.userParticipated = true;
          }
        });
      }
    }

    // Convert to array and add video information
    let userGames = Array.from(gamesMap.values()).filter(game => game.userParticipated);

    // Fetch video information
    if (userGames.length > 0) {
      const gameIds = userGames.map(game => game.gameId);
      
      // Fetch video information from featured_videos table
      const { data: videosData } = await supabase
        .from('featured_videos')
        .select('match_id, youtube_url, vod_url, title, thumbnail_url')
        .in('match_id', gameIds);

      // Fetch video information from matches table
      const { data: matchesData } = await supabase
        .from('matches')
        .select('game_id, youtube_url, vod_url, title, video_title, video_thumbnail_url')
        .in('game_id', gameIds);

      // Add video information and other details to games
      userGames = userGames.map(game => {
        const videoFromFeatured = videosData?.find(v => v.match_id === game.gameId);
        const videoFromMatches = matchesData?.find(m => m.game_id === game.gameId);
        
        const hasVideo = !!(videoFromFeatured?.youtube_url || videoFromFeatured?.vod_url || 
                           videoFromMatches?.youtube_url || videoFromMatches?.vod_url);
        
        // Calculate duration estimate
        const estimatedDuration = game.gameMode === 'CTF' ? 1800 : 1200;
        
        // Determine winning info
        const teamResults = game.teams.map((team: string) => {
          const teamPlayers = game.players.filter((p: any) => p.team === team);
          const wins = teamPlayers.filter((p: any) => p.result === 'win').length;
          const losses = teamPlayers.filter((p: any) => p.result === 'loss').length;
          return { team, wins, losses, players: teamPlayers.length };
        });
        
        const winningTeam = teamResults.find((t: any) => t.wins > t.losses);
        
        // Get user's performance in this game
        const userPlayer = game.players.find((p: any) => 
          p.player_name.toLowerCase() === profile.in_game_alias.toLowerCase()
        );
        
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
          } : null,
          userStats: userPlayer ? {
            kills: userPlayer.kills,
            deaths: userPlayer.deaths,
            captures: userPlayer.flag_captures,
            carrier_kills: userPlayer.carrier_kills,
            team: userPlayer.team,
            class: userPlayer.main_class,
            result: userPlayer.result,
            side: userPlayer.side
          } : null
        };
      });

      // Filter for recordings if requested
      if (withRecordings) {
        userGames = userGames.filter(game => game.videoInfo.has_video);
      }
    }

    // Sort by date and limit
    const finalGames = userGames
      .sort((a, b) => new Date(b.gameDate).getTime() - new Date(a.gameDate).getTime())
      .slice(0, limit);

    return NextResponse.json({
      success: true,
      games: finalGames,
      count: finalGames.length,
      playerName: profile.in_game_alias
    });

  } catch (error) {
    console.error('Error in user games API:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
} 