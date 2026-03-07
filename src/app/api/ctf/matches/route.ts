import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function verifyAdmin(request: NextRequest) {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }
  const token = authHeader.split(' ')[1];
  const { data: { user }, error } = await supabase.auth.getUser(token);
  if (error || !user) return null;

  const { data: profile } = await supabaseAdmin
    .from('profiles')
    .select('is_admin, ctf_role')
    .eq('id', user.id)
    .single();

  if (!profile || (!profile.is_admin && profile.ctf_role !== 'ctf_admin')) {
    return null;
  }
  return user;
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const seasonNumber = searchParams.get('season_number');
    const league = searchParams.get('league') || 'ctfpl';

    if (!seasonNumber) {
      return NextResponse.json({ error: 'season_number is required' }, { status: 400 });
    }

    const seasonNum = parseInt(seasonNumber);

    // Fetch matches for this season
    const { data: rawMatches, error: matchesError } = await supabaseAdmin
      .from('ctfpl_matches')
      .select('*')
      .eq('season_number', seasonNum)
      .order('match_date', { ascending: false });

    if (matchesError) {
      console.error('Error fetching matches:', matchesError);
    }

    // Transform DB columns to frontend format
    const matches = (rawMatches || []).map((m: Record<string, unknown>) => ({
      id: m.id,
      title: `${m.team_a_name} vs ${m.team_b_name}`,
      squad_a_name: m.team_a_name,
      squad_b_name: m.team_b_name,
      squad_a_score: m.team_a_kills,
      squad_b_score: m.team_b_kills,
      played_at: m.match_date,
      status: m.match_type || 'Season',
      season_number: m.season_number,
      game_id: m.game_id,
      team_a_result: m.team_a_result,
      team_b_result: m.team_b_result,
      arena_name: m.arena_name,
      game_length_minutes: m.game_length_minutes,
      mvp_player_name: m.mvp_player_name,
      match_length: m.match_length,
      mvp: m.mvp,
    }));

    // Fetch standings — different view depending on league
    let standings = null;
    if (league === 'ctfpl') {
      const { data, error } = await supabaseAdmin
        .from('ctfpl_standings_with_rankings')
        .select('*')
        .eq('season_number', seasonNum)
        .order('rank', { ascending: true });
      if (error) console.error('Error fetching ctfpl standings:', error);
      standings = data;
    } else {
      // For non-CTFPL leagues, find the league_season_id first
      const { data: leagueData } = await supabaseAdmin
        .from('leagues')
        .select('id')
        .eq('slug', league)
        .single();

      if (leagueData) {
        const { data: leagueSeason } = await supabaseAdmin
          .from('league_seasons')
          .select('id')
          .eq('league_id', leagueData.id)
          .eq('season_number', seasonNum)
          .single();

        if (leagueSeason) {
          const { data, error } = await supabaseAdmin
            .from('league_standings_with_rankings')
            .select('*')
            .eq('league_season_id', leagueSeason.id)
            .order('rank', { ascending: true });
          if (error) console.error('Error fetching league standings:', error);
          standings = data;
        }
      }
    }

    return NextResponse.json({
      matches,
      standings: standings || [],
    });
  } catch (error) {
    console.error('Error in GET /api/ctf/matches:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await verifyAdmin(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized: CTF Admin access required' }, { status: 401 });
    }

    const body = await request.json();
    const {
      league: leagueSlug = 'ctfpl',
      season_number,
      squad_a_name,
      squad_b_name,
      squad_a_id,
      squad_b_id,
      squad_a_score,
      squad_b_score,
      played_at,
      is_overtime,
      squad_a_no_show,
      squad_b_no_show,
      player_stats: playerStatsData,
      game_id: existingGameId,
      arena_name,
      match_length,
      mvp,
    } = body;

    // Validate required fields
    if (!season_number || !squad_a_name || !squad_b_name) {
      return NextResponse.json({ error: 'season_number, squad_a_name, and squad_b_name are required' }, { status: 400 });
    }
    if (squad_a_score == null || squad_b_score == null) {
      return NextResponse.json({ error: 'Scores are required' }, { status: 400 });
    }

    // Resolve squad IDs - look up by name if IDs not provided
    let resolvedSquadAId = squad_a_id;
    let resolvedSquadBId = squad_b_id;

    if (!resolvedSquadAId) {
      resolvedSquadAId = await resolveSquadId(squad_a_name);
    }
    if (!resolvedSquadBId) {
      resolvedSquadBId = await resolveSquadId(squad_b_name);
    }

    if (!resolvedSquadAId || !resolvedSquadBId) {
      const failed = [];
      if (!resolvedSquadAId) failed.push(`Squad A: "${squad_a_name}"`);
      if (!resolvedSquadBId) failed.push(`Squad B: "${squad_b_name}"`);
      return NextResponse.json({ error: `Could not resolve squad IDs for: ${failed.join(', ')}` }, { status: 400 });
    }

    // Generate game_id for linking
    const gameId = existingGameId || `CTF_Match_${Date.now()}`;

    // Determine results (capitalized to match DB convention: 'Win', 'Loss')
    let team1Result: string;
    let team2Result: string;

    if (squad_a_no_show) {
      team1Result = 'No Show';
    } else if (parseInt(squad_a_score) > parseInt(squad_b_score)) {
      team1Result = 'Win';
    } else {
      team1Result = 'Loss';
    }

    if (squad_b_no_show) {
      team2Result = 'No Show';
    } else if (parseInt(squad_b_score) > parseInt(squad_a_score)) {
      team2Result = 'Win';
    } else {
      team2Result = 'Loss';
    }

    // Parse match length — accept "22:45" (mm:ss) or "22" (minutes)
    let gameLengthMinutes: number | null = null;
    if (match_length) {
      if (match_length.includes(':')) {
        const [mins, secs] = match_length.split(':').map(Number);
        gameLengthMinutes = mins + (secs || 0) / 60;
      } else {
        gameLengthMinutes = parseFloat(match_length) || null;
      }
    }

    // Insert match record using actual ctfpl_matches column names
    const matchInsert: Record<string, unknown> = {
      team_a_name: squad_a_name,
      team_b_name: squad_b_name,
      team_a_squad_id: resolvedSquadAId,
      team_b_squad_id: resolvedSquadBId,
      team_a_result: team1Result,
      team_b_result: team2Result,
      team_a_kills: parseInt(squad_a_score) || 0,
      team_b_kills: parseInt(squad_b_score) || 0,
      match_date: played_at || new Date().toISOString(),
      season_number: parseInt(season_number),
      game_id: gameId,
      match_type: 'Season',
    };
    if (arena_name) matchInsert.arena_name = arena_name;
    if (gameLengthMinutes !== null) matchInsert.game_length_minutes = gameLengthMinutes;
    if (mvp) matchInsert.mvp_player_name = mvp;

    const { data: match, error: matchError } = await supabaseAdmin
      .from('ctfpl_matches')
      .insert(matchInsert)
      .select()
      .single();

    if (matchError) {
      console.error('Error inserting match:', matchError);
      return NextResponse.json({ error: 'Failed to create match', details: matchError.message }, { status: 500 });
    }

    // Update standings via RPC — different function for CTFPL vs other leagues
    // RPC expects lowercase: 'win', 'loss', 'no_show'
    const rpcTeam1Result = squad_a_no_show ? 'no_show' : (parseInt(squad_a_score) > parseInt(squad_b_score) ? 'win' : 'loss');
    const rpcTeam2Result = squad_b_no_show ? 'no_show' : (parseInt(squad_b_score) > parseInt(squad_a_score) ? 'win' : 'loss');

    let standingsError = null;
    if (leagueSlug === 'ctfpl') {
      const result = await supabaseAdmin.rpc('update_ctfpl_standings', {
        p_season_number: parseInt(season_number),
        p_team1_squad_id: resolvedSquadAId,
        p_team2_squad_id: resolvedSquadBId,
        p_team1_result: rpcTeam1Result,
        p_team2_result: rpcTeam2Result,
        p_team1_overtime: is_overtime && rpcTeam1Result === 'win' ? true : false,
        p_team2_overtime: is_overtime && rpcTeam2Result === 'win' ? true : false,
        p_team1_kills: parseInt(squad_a_score) || 0,
        p_team2_kills: parseInt(squad_b_score) || 0,
      });
      standingsError = result.error;
    } else {
      // For non-CTFPL leagues, find league_season_id and use update_league_standings
      const { data: leagueData } = await supabaseAdmin
        .from('leagues')
        .select('id')
        .eq('slug', leagueSlug)
        .single();

      if (leagueData) {
        const { data: leagueSeason } = await supabaseAdmin
          .from('league_seasons')
          .select('id')
          .eq('league_id', leagueData.id)
          .eq('season_number', parseInt(season_number))
          .single();

        if (leagueSeason) {
          const result = await supabaseAdmin.rpc('update_league_standings', {
            p_league_season_id: leagueSeason.id,
            p_team1_squad_id: resolvedSquadAId,
            p_team2_squad_id: resolvedSquadBId,
            p_team1_result: rpcTeam1Result,
            p_team2_result: rpcTeam2Result,
            p_team1_overtime: is_overtime && rpcTeam1Result === 'win' ? true : false,
            p_team2_overtime: is_overtime && rpcTeam2Result === 'win' ? true : false,
            p_team1_kills: parseInt(squad_a_score) || 0,
            p_team2_kills: parseInt(squad_b_score) || 0,
          });
          standingsError = result.error;
        } else {
          standingsError = { message: `No season found for ${leagueSlug} season ${season_number}` };
        }
      } else {
        standingsError = { message: `League '${leagueSlug}' not found` };
      }
    }

    if (standingsError) {
      console.error('Error updating standings:', standingsError);
      return NextResponse.json({
        match,
        game_id: gameId,
        warning: `Match created but standings update failed: ${standingsError.message}`,
      });
    }

    // Insert player stats if provided
    let statsInserted = 0;
    if (playerStatsData && Array.isArray(playerStatsData) && playerStatsData.length > 0) {
      // Stamp each stat row with the match game_id and season
      const seasonLabel = `Season ${season_number}`;
      const statsToInsert = playerStatsData.map((stat: Record<string, unknown>) => ({
        ...stat,
        game_id: gameId,
        season: stat.season || seasonLabel,
        arena_name: stat.arena_name || arena_name || 'Unknown',
      }));

      const { error: statsError } = await supabaseAdmin
        .from('player_stats')
        .insert(statsToInsert);

      if (statsError) {
        console.error('Error inserting player stats:', statsError);
        return NextResponse.json({
          match,
          game_id: gameId,
          warning: `Match and standings updated, but stats import failed: ${statsError.message}`,
        });
      }
      statsInserted = statsToInsert.length;
    }

    return NextResponse.json({
      match,
      game_id: gameId,
      standings_updated: true,
      stats_inserted: statsInserted,
    });
  } catch (error) {
    console.error('Error in POST /api/ctf/matches:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

async function resolveSquadId(name: string): Promise<string | null> {
  // Try exact name match
  const { data: byName } = await supabaseAdmin
    .from('squads')
    .select('id')
    .ilike('name', name)
    .limit(1)
    .single();

  if (byName) return byName.id;

  // Try tag match
  const { data: byTag } = await supabaseAdmin
    .from('squads')
    .select('id')
    .ilike('tag', name)
    .limit(1)
    .single();

  if (byTag) return byTag.id;

  // Create historical squad
  const tag = name.slice(0, 4).toUpperCase();
  const SYSTEM_USER_ID = '7066f090-a1a1-4f5f-bf1a-374d0e06130c';

  const { data: newSquad, error } = await supabaseAdmin
    .from('squads')
    .insert({
      name,
      tag,
      is_active: false,
      captain_id: SYSTEM_USER_ID,
      description: 'Historical squad created for season records',
      is_legacy: true,
    })
    .select('id')
    .single();

  if (error) {
    // Tag conflict — try with number suffix
    for (let i = 1; i <= 9; i++) {
      const altTag = tag.slice(0, 3) + i;
      const { data: retrySquad, error: retryError } = await supabaseAdmin
        .from('squads')
        .insert({
          name,
          tag: altTag,
          is_active: false,
          captain_id: SYSTEM_USER_ID,
          description: 'Historical squad created for season records',
          is_legacy: true,
        })
        .select('id')
        .single();

      if (!retryError && retrySquad) return retrySquad.id;
    }
    console.error('Failed to create squad:', name, error);
    return null;
  }

  return newSquad?.id || null;
}
