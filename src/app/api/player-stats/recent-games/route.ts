import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

/*
 * Recent games, one entry per game_id, newest first. Consumed by /stats (rail), /league (home) and
 * the recorded-games strip. Each game carries its players (name, team, side, class, result, K/D,
 * captain flag) plus a small summary so a list can show "Defense held A7 · 18:24 · 10 players"
 * without fetching the game page.
 *
 * Players are always listed; side is "N/A" on a Pub game and on rows older than the 2026-09-06 side
 * fix, so a list must group by team when it has no side to group by.
 */

const ROW_COLUMNS = `
  game_id,
  game_date,
  game_mode,
  arena_name,
  base_used,
  game_length_minutes,
  player_name,
  team,
  side,
  main_class,
  result,
  kills,
  deaths,
  captures,
  carrier_kills,
  is_captain
`;

type Row = Record<string, any>;

export interface RecentGame {
  gameId: string;
  gameDate: string;
  gameMode: string;
  mapName: string;
  arenaName: string;
  baseUsed: string | null;
  durationSeconds: number;
  players: Array<{
    player_name: string; team: string; side: string; main_class: string; result: string;
    kills: number; deaths: number; flag_captures: number; carrier_kills: number; is_captain: boolean;
  }>;
  teams: string[];
  totalPlayers: number;
  decided: boolean;
  /** Winner as the script recorded it: a side for an OvD, a team otherwise, null when nobody won. */
  winner: { type: 'side' | 'team'; name: string } | null;
}

function groupGames(rows: Row[] | null | undefined): Map<string, RecentGame> {
  const games = new Map<string, RecentGame>();
  for (const stat of rows || []) {
    if (!stat.game_id) continue;
    let game = games.get(stat.game_id);
    if (!game) {
      game = {
        gameId: stat.game_id,
        gameDate: stat.game_date,
        gameMode: stat.game_mode,
        mapName: stat.arena_name,
        arenaName: stat.arena_name,
        baseUsed: stat.base_used && stat.base_used !== 'Unknown' ? stat.base_used : null,
        durationSeconds: Math.round((Number(stat.game_length_minutes) || 0) * 60),
        players: [],
        teams: [],
        totalPlayers: 0,
        decided: false,
        winner: null,
      };
      games.set(stat.game_id, game);
    }
    if (!game.players.some((p) => p.player_name === stat.player_name)) {
      game.players.push({
        player_name: stat.player_name,
        team: stat.team,
        side: stat.side,
        main_class: stat.main_class,
        result: stat.result,
        kills: stat.kills || 0,
        deaths: stat.deaths || 0,
        flag_captures: stat.captures || 0,
        carrier_kills: stat.carrier_kills || 0,
        is_captain: stat.is_captain === true,
      });
      game.totalPlayers = game.players.length;
    }
    if (stat.team && !game.teams.includes(stat.team)) game.teams.push(stat.team);
  }
  for (const game of games.values()) {
    const winners = game.players.filter((p) => p.result === 'Win');
    game.decided = winners.length > 0;
    if (!game.decided) continue;
    // Side-based winner only when the two teams took OPPOSITE sides (an OvD). A Mix tags the
    // most-summoned players on each team as offense, so both teams would read "defense".
    const majority = (team: string) => {
      const rows = game.players.filter((p) => p.team === team);
      const o = rows.filter((p) => p.side === 'offense').length, d = rows.filter((p) => p.side === 'defense').length;
      return o === 0 && d === 0 ? null : o > d ? 'offense' : d > o ? 'defense' : null;
    };
    const teamSides = game.teams.map(majority);
    const ovdShape = game.teams.length === 2 && !!teamSides[0] && !!teamSides[1] && teamSides[0] !== teamSides[1];
    const sides = new Set(winners.map((p) => p.side).filter((s) => s === 'offense' || s === 'defense'));
    if (ovdShape && sides.size === 1) {
      game.winner = { type: 'side', name: [...sides][0] };
    } else {
      const byTeam: Record<string, number> = {};
      winners.forEach((p) => { byTeam[p.team] = (byTeam[p.team] || 0) + 1; });
      const best = Object.entries(byTeam).sort((a, b) => b[1] - a[1])[0];
      if (best) game.winner = { type: 'team', name: best[0] };
    }
  }
  return games;
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const limit = Math.min(parseInt(searchParams.get('limit') || '20'), 50);
    const withRecordings = searchParams.get('with_recordings') === 'true';

    // If requesting recorded games, query matches with YouTube URLs directly
    if (withRecordings) {
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

      if (!matchesWithVideos || matchesWithVideos.length === 0) {
        return NextResponse.json({ success: true, games: [], count: 0 });
      }

      const gameIds = matchesWithVideos.map((match) => match.game_id).filter(Boolean);
      const { data: playerStats, error: statsError } = await supabase
        .from('player_stats')
        .select(ROW_COLUMNS)
        .in('game_id', gameIds);

      if (statsError) {
        console.error('Error fetching player stats for recorded games:', statsError);
        return NextResponse.json({ error: statsError.message }, { status: 500 });
      }

      const gamesMap = groupGames(playerStats as Row[] | null);

      const recordedGames = matchesWithVideos
        .map((match) => {
          const videoInfo = {
            has_video: true,
            youtube_url: match.youtube_url,
            vod_url: match.vod_url,
            video_title: match.video_title || match.title,
            thumbnail_url: match.video_thumbnail_url,
          };
          const gameData = gamesMap.get(match.game_id);
          if (!gameData) {
            // No player stats for this match: minimal entry so the recording still lists.
            return {
              gameId: match.game_id,
              gameDate: match.scheduled_at || match.actual_start_time,
              gameMode: 'Unknown',
              mapName: 'Unknown',
              players: [],
              teams: [],
              totalPlayers: 0,
              duration: 1800,
              videoInfo,
              winningInfo: null,
            };
          }
          return {
            ...gameData,
            duration: gameData.durationSeconds || 1200,
            videoInfo,
            winningInfo: gameData.winner
              ? { type: gameData.winner.type, winner: gameData.winner.name, side: gameData.winner.type === 'side' ? gameData.winner.name : undefined }
              : null,
          };
        })
        .filter((game) => game.gameId)
        .sort((a, b) => new Date(b.gameDate).getTime() - new Date(a.gameDate).getTime())
        .slice(0, limit);

      return NextResponse.json({ success: true, games: recordedGames, count: recordedGames.length });
    }

    // Regular games logic (no recordings filter)
    const lookbackDays = 30;
    const lookbackDate = new Date();
    lookbackDate.setDate(lookbackDate.getDate() - lookbackDays);

    const { data: recentStats, error } = await supabase
      .from('player_stats')
      .select(ROW_COLUMNS)
      .not('game_id', 'is', null)
      .gte('game_date', lookbackDate.toISOString().split('T')[0])
      .order('game_date', { ascending: false })
      .limit(limit * 15);

    if (error) {
      console.error('Error fetching recent games:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const uniqueGames = Array.from(groupGames(recentStats as Row[] | null).values())
      .sort((a, b) => new Date(b.gameDate).getTime() - new Date(a.gameDate).getTime())
      .slice(0, limit);

    return NextResponse.json({ success: true, games: uniqueGames, count: uniqueGames.length });

  } catch (error) {
    console.error('Error in recent games API:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
