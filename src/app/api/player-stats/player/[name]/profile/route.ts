import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getEloTier } from '@/utils/eloTiers';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ name: string }> }
) {
  try {
    const resolvedParams = await params;
    const playerName = decodeURIComponent(resolvedParams.name);

    // Step 1: Try to find profile via profile_aliases (case-insensitive)
    let profileId: string | null = null;

    const { data: aliasMatch } = await supabase
      .from('profile_aliases')
      .select('profile_id')
      .ilike('alias', playerName)
      .limit(1)
      .single();

    if (aliasMatch) {
      profileId = aliasMatch.profile_id;
    } else {
      // Fallback: look directly in profiles.in_game_alias
      const { data: profileMatch } = await supabase
        .from('profiles')
        .select('id')
        .ilike('in_game_alias', playerName)
        .limit(1)
        .single();

      if (profileMatch) {
        profileId = profileMatch.id;
      }
    }

    // If no profile found, return minimal response (unregistered player)
    if (!profileId) {
      // Still try ELO data — the leaderboard view can match on player_name
      const { data: eloData } = await supabase
        .from('elo_leaderboard_agg_with_aliases')
        .select('*')
        .ilike('player_name', playerName)
        .eq('game_mode', 'Combined')
        .limit(1)
        .single();

      return NextResponse.json({
        profile: null,
        aliases: [],
        squad: null,
        freeAgent: null,
        elo: eloData ? formatEloData(eloData) : null,
        isRegistered: false,
      });
    }

    // Step 2: Fetch all data in parallel
    const [profileResult, squadResult, freeAgentResult, eloResult, aliasesResult] = await Promise.all([
      // Profile data
      supabase
        .from('profiles')
        .select('id, in_game_alias, avatar_url, created_at, is_league_banned, ctf_role')
        .eq('id', profileId)
        .single(),

      // Squad membership (active, non-legacy)
      supabase
        .from('squad_members')
        .select(`
          role,
          squads!inner(
            id, name, tag, banner_url, is_legacy
          )
        `)
        .eq('player_id', profileId)
        .eq('status', 'active')
        .eq('squads.is_legacy', false)
        .limit(1),

      // Free agent status
      supabase
        .from('free_agents')
        .select('preferred_roles, skill_level, availability')
        .eq('player_id', profileId)
        .eq('is_active', true)
        .limit(1)
        .single(),

      // ELO data (Combined mode)
      supabase
        .from('elo_leaderboard_agg_with_aliases')
        .select('*')
        .eq('profile_id', profileId)
        .eq('game_mode', 'Combined')
        .limit(1)
        .single(),

      // Aliases
      supabase
        .from('profile_aliases')
        .select('alias, is_primary')
        .eq('profile_id', profileId),
    ]);

    // Format profile
    const profile = profileResult.data ? {
      id: profileResult.data.id,
      in_game_alias: profileResult.data.in_game_alias,
      avatar_url: profileResult.data.avatar_url,
      created_at: profileResult.data.created_at,
      is_league_banned: profileResult.data.is_league_banned,
      ctf_role: profileResult.data.ctf_role,
    } : null;

    // Format squad
    const squadData = squadResult.data;
    const squad = squadData && squadData.length > 0 && squadData[0].squads
      ? {
          id: (squadData[0].squads as any).id,
          name: (squadData[0].squads as any).name,
          tag: (squadData[0].squads as any).tag,
          banner_url: (squadData[0].squads as any).banner_url,
          role: squadData[0].role,
        }
      : null;

    // Format free agent
    const freeAgent = freeAgentResult.data ? {
      preferred_roles: freeAgentResult.data.preferred_roles,
      skill_level: freeAgentResult.data.skill_level,
      availability: freeAgentResult.data.availability,
    } : null;

    // Format aliases (exclude the current in_game_alias to avoid duplication)
    const aliases = aliasesResult.data
      ?.map(a => a.alias)
      .filter(a => a.toLowerCase() !== playerName.toLowerCase()) || [];

    return NextResponse.json({
      profile,
      aliases,
      squad,
      freeAgent,
      elo: eloResult.data ? formatEloData(eloResult.data) : null,
      isRegistered: true,
    });

  } catch (error) {
    console.error('Error fetching player profile:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

function formatEloData(data: any) {
  const weightedElo = Math.round(Number(data.weighted_elo || 0));
  return {
    weighted_elo: weightedElo,
    elo_rating: Math.round(Number(data.elo_rating || 0)),
    elo_peak: Math.round(Number(data.elo_peak || 0)),
    elo_confidence: Number(data.elo_confidence || 0),
    total_games: data.total_games || 0,
    win_rate: Number(data.win_rate || 0),
    kill_death_ratio: Number(data.kill_death_ratio || 0),
    tier: getEloTier(weightedElo),
  };
}
