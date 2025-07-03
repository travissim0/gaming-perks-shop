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

    // If requesting recorded games, query matches with YouTube URLs directly
    if (withRecordings) {
      console.log('🎬 Fetching matches with YouTube recordings...');
      
      // Get matches that have YouTube URLs, ordered by most recent
      const { data: matchesWithVideos, error: matchesError } = await supabase
        .from('matches')
        .select('game_id, youtube_url, vod_url, title, video_title, video_thumbnail_url, scheduled_at, actual_start_time, actual_end_time')
        .not('youtube_url', 'is', null)
        .neq('youtube_url', '')
        .order('scheduled_at', { ascending: false })
        .limit(limit * 2); // Get extra to ensure we have enough after filtering

      if (matchesError) {
        console.error('Error fetching matches with videos:', matchesError);
        return NextResponse.json({ error: matchesError.message }, { status: 500 });
      }

      console.log('🎬 Found matches with videos:', matchesWithVideos?.length || 0);

      if (!matchesWithVideos || matchesWithVideos.length === 0) {
        return NextResponse.json({
          success: true,
          games: [],
          count: 0
        });
      }

      // Get player stats for these specific games
      const gameIds = matchesWithVideos.map(match => match.game_id).filter(Boolean);
      console.log('🎬 Looking for player stats for game IDs:', gameIds);

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
        .in('game_id', gameIds);

      if (statsError) {
        console.error('Error fetching player stats for recorded games:', statsError);
        return NextResponse.json({ error: statsError.message }, { status: 500 });
      }

      console.log('🎬 Found player stats entries:', playerStats?.length || 0);

      // Group player stats by game_id and combine with match video info
      const gamesMap = new Map();
      
      playerStats?.forEach(stat => {
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

      // Convert to array and add video information from matches
      let recordedGames = matchesWithVideos
        .map(match => {
          const gameData = gamesMap.get(match.game_id);
          if (!gameData) {
            // If no player stats found, create minimal game data
            return {
              gameId: match.game_id,
              gameDate: match.scheduled_at || match.actual_start_time,
              gameMode: 'Unknown',
              mapName: 'Unknown',
              players: [],
              teams: [],
              totalPlayers: 0,
              duration: 1800, // Default 30 minutes
              videoInfo: {
                has_video: true,
                youtube_url: match.youtube_url,
                vod_url: match.vod_url,
                video_title: match.video_title || match.title,
                thumbnail_url: match.video_thumbnail_url
              },
              winningInfo: null
            };
          }

          // Calculate duration (estimate based on game mode)
          const estimatedDuration = gameData.gameMode === 'CTF' ? 1800 : 1200; // 30min for CTF, 20min for others
          
          // Determine winning info from player results
          const teamResults = gameData.teams.map((team: string) => {
            const teamPlayers = gameData.players.filter((p: any) => p.team === team);
            const wins = teamPlayers.filter((p: any) => p.result === 'win').length;
            const losses = teamPlayers.filter((p: any) => p.result === 'loss').length;
            return { team, wins, losses, players: teamPlayers.length };
          });
          
          const winningTeam = teamResults.find((t: any) => t.wins > t.losses);
          
          return {
            ...gameData,
            duration: estimatedDuration,
            videoInfo: {
              has_video: true,
              youtube_url: match.youtube_url,
              vod_url: match.vod_url,
              video_title: match.video_title || match.title,
              thumbnail_url: match.video_thumbnail_url
            },
            winningInfo: winningTeam ? {
              type: 'team',
              side: winningTeam.team.includes('TI') ? 'titan' : 'collective',
              winner: winningTeam.team
            } : null
          };
        })
        .filter(game => game.gameId) // Remove any null game IDs
        .sort((a, b) => new Date(b.gameDate).getTime() - new Date(a.gameDate).getTime())
        .slice(0, limit);

      console.log('🎬 Final recorded games:', recordedGames.length);
      
      return NextResponse.json({
        success: true,
        games: recordedGames,
        count: recordedGames.length
      });
    }

    // Regular games logic (no recordings filter)
    const lookbackDays = 30;
    const lookbackDate = new Date();
    lookbackDate.setDate(lookbackDate.getDate() - lookbackDays);
    
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
      .gte('game_date', lookbackDate.toISOString().split('T')[0])
      .order('game_date', { ascending: false })
      .limit(limit * 15);

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

    // Convert to array
    const uniqueGames = Array.from(gamesMap.values())
      .sort((a, b) => new Date(b.gameDate).getTime() - new Date(a.gameDate).getTime())
      .slice(0, limit);

    return NextResponse.json({
      success: true,
      games: uniqueGames,
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