import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Initialize Supabase client
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

/*
 * One recorded game: every player_stats row for the game_id plus a per-team summary.
 *
 * The response is ADDITIVE over the original shape (mapName/serverName/duration/winningInfo/
 * summary/players/teamStats are still there, unchanged) because /matches/[id], GameStatsViewer and
 * /api/matches read it too. New: arenaName, baseUsed, decided, teams[], schemaVersion, scriptVersion.
 *
 * Sides: the script records side = "N/A" for a Pub game (and for games older than the 2026-09-06
 * side fix). The old game page silently dropped every N/A player, which is why a Pub game showed
 * "PT T (0 players)". Nothing here depends on side being known: teams are grouped by the `team`
 * column and a side is attached only when the rows carry one.
 */

type Row = Record<string, any>;

const winsOf = (rows: Row[]) => rows.filter((p) => p.result === 'Win').length;
const majoritySide = (rows: Row[]): 'offense' | 'defense' | null => {
  const o = rows.filter((p) => p.side === 'offense').length;
  const d = rows.filter((p) => p.side === 'defense').length;
  if (o === 0 && d === 0) return null;
  return o > d ? 'offense' : d > o ? 'defense' : null;
};
const faction = (team: string): 'T' | 'C' | null => {
  const t = (team || '').trim();
  if (/\sT$/.test(t) || /titan/i.test(t)) return 'T';
  if (/\sC$/.test(t) || /collective/i.test(t)) return 'C';
  return null;
};

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
      .select('*')
      .eq('game_id', gameId)
      .order('kills', { ascending: false });

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

    // Video information if this game is linked to a match
    let videoInfo = null;
    const { data: linkedMatches } = await supabase
      .from('matches')
      .select('id, title, youtube_url, vod_url, highlight_url, video_title, video_description, video_thumbnail_url')
      .eq('game_id', gameId);

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

    // Normalize field names expected by the frontend while preserving originals
    const normalizedPlayers: Row[] = gameStats.map((p: Row) => ({
      ...p,
      flag_captures: p.flag_captures ?? p.captures ?? 0,
      resource_unused_per_death: p.resource_unused_per_death ?? p.avg_resource_unused_per_death ?? 0,
      explosive_unused_per_death: p.explosive_unused_per_death ?? p.avg_explosive_unused_per_death ?? 0,
    }));

    const first = gameStats[0];
    const totalKills = normalizedPlayers.reduce((sum, p) => sum + (p.kills || 0), 0);
    const totalDeaths = normalizedPlayers.reduce((sum, p) => sum + (p.deaths || 0), 0);
    const totalCaptures = normalizedPlayers.reduce((sum, p) => sum + (p.flag_captures || 0), 0);
    const gameLength = Number(first.game_length_minutes) || 0;
    const durationSeconds = Math.round(gameLength * 60);
    const gameMode = first.game_mode || 'Unknown';
    const arenaName = first.arena_name || 'Unknown';
    const baseUsed = first.base_used && first.base_used !== 'Unknown' ? first.base_used : null;
    const gameDate = first.game_date;

    // A game whose winner was never captured has every row marked 'Loss'. Those exist (hand-ended
    // games, the 2026-09-11 regression) and must read as "undecided", not as a loss for everybody.
    const decided = winsOf(gameStats) > 0;

    // Group by team (never by side - see the header comment).
    const teamStats = normalizedPlayers.reduce((acc: Record<string, Row[]>, player) => {
      const team = player.team || 'Unknown';
      (acc[team] ||= []).push(player);
      return acc;
    }, {});

    // A team-level side only means something when the two teams took OPPOSITE sides (an OvD). In a
    // Mix the script tags the most-summoned players on EACH team as offense, so both teams would
    // otherwise read "defense" and the winner would be decided by side instead of by team.
    const teamSides = Object.entries(teamStats).map(([name, rows]) => [name, majoritySide(rows)] as const);
    const ovdShape = teamSides.length === 2 && !!teamSides[0][1] && !!teamSides[1][1] && teamSides[0][1] !== teamSides[1][1];

    const teams = Object.entries(teamStats)
      .map(([name, rows]) => {
        const wins = winsOf(rows);
        return {
          name,
          faction: faction(name),
          side: ovdShape ? majoritySide(rows) : null,
          result: !decided ? null : wins > rows.length - wins ? 'win' : wins === 0 ? 'loss' : null,
          players: rows.length,
          kills: rows.reduce((s, p) => s + (p.kills || 0), 0),
          deaths: rows.reduce((s, p) => s + (p.deaths || 0), 0),
          captures: rows.reduce((s, p) => s + (p.flag_captures || 0), 0),
          carrierKills: rows.reduce((s, p) => s + (p.carrier_kills || 0), 0),
          ebHits: rows.reduce((s, p) => s + (p.eb_hits || 0), 0),
          turretDamage: rows.reduce((s, p) => s + (p.turret_damage || 0), 0),
          captains: rows.filter((p) => p.is_captain).map((p) => p.player_name),
        };
      })
      // Biggest team first; defense before offense when equal so an OvD reads defense / offense.
      .sort((a, b) => b.players - a.players || (a.side === 'defense' ? -1 : 1));

    // Winner: by side when both sides are known (OvD), otherwise by team.
    let winningInfo: { type: 'side' | 'team'; winner: string; side?: string; team?: string } | null = null;
    if (decided) {
      const offense = gameStats.filter((p) => p.side === 'offense');
      const defense = gameStats.filter((p) => p.side === 'defense');
      if (ovdShape && offense.length > 0 && defense.length > 0) {
        const ow = winsOf(offense), dw = winsOf(defense);
        if (ow > dw) winningInfo = { type: 'side', winner: 'Offense', side: 'offense' };
        else if (dw > ow) winningInfo = { type: 'side', winner: 'Defense', side: 'defense' };
      }
      if (!winningInfo) {
        const best = teams.filter((t) => t.result === 'win').sort((a, b) => b.players - a.players)[0];
        if (best) winningInfo = { type: 'team', winner: best.name, team: best.name };
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        gameId,
        gameMode,
        arenaName,
        mapName: arenaName, // legacy name, kept for /matches and GameStatsViewer
        serverName: arenaName,
        baseUsed,
        gameDate,
        duration: durationSeconds,
        gameLength,
        season: first.season ?? null,
        schemaVersion: first.schema_version ?? 1,
        scriptVersion: first.script_version ?? null,
        decided,
        winningInfo,
        videoInfo,
        summary: {
          totalKills,
          totalDeaths,
          totalCaptures,
          playerCount: gameStats.length
        },
        teams,
        players: normalizedPlayers,
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
