import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Initialize Supabase client with service role key for write access
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export interface PlayerStatData {
  playerName: string;
  team: string;
  gameMode: string;
  arenaName: string;
  baseUsed: string;
  side: string;
  result: string;
  mainClass: string;
  kills: number;
  deaths: number;
  captures: number;
  carrierKills: number;
  carryTimeSeconds: number;
  classSwaps: number;
  turretDamage: number;
  ebHits: number;
  accuracy: number;
  avgResourceUnusedPerDeath: number;
  avgExplosiveUnusedPerDeath: number;
  gameLengthMinutes: number;
}

export interface PlayerStatsPayload {
  gameId?: string;
  gameDate?: string;
  players: PlayerStatData[];
}

export async function POST(request: NextRequest) {
  try {
    // Parse the incoming JSON data
    const data: PlayerStatsPayload = await request.json();
    
    console.log('Received player stats data:', {
      playerCount: data.players?.length,
      gameDate: data.gameDate
    });

    // Validate required data
    if (!data.players || !Array.isArray(data.players) || data.players.length === 0) {
      return NextResponse.json(
        { error: 'Invalid data: players array is required and must not be empty' },
        { status: 400 }
      );
    }

    // Prepare data for insertion
    const playersToInsert = data.players.map(player => ({
      game_id: data.gameId || null, // Add game_id to link to matches
      player_name: player.playerName?.replace(/,/g, '') || 'Unknown', // Remove commas for safety
      team: player.team || 'Unknown',
      game_mode: player.gameMode || 'Unknown',
      arena_name: player.arenaName || 'Unknown',
      base_used: player.baseUsed || 'Unknown',
      side: player.side || 'N/A',
      result: player.result || 'Loss',
      main_class: player.mainClass || 'Unknown',
      kills: Math.max(0, player.kills || 0),
      deaths: Math.max(0, player.deaths || 0),
      captures: Math.max(0, player.captures || 0),
      carrier_kills: Math.max(0, player.carrierKills || 0),
      carry_time_seconds: Math.max(0, player.carryTimeSeconds || 0),
      class_swaps: Math.max(0, player.classSwaps || 0),
      turret_damage: Math.max(0, player.turretDamage || 0),
      eb_hits: Math.max(0, player.ebHits || 0),
      accuracy: Math.min(1, Math.max(0, player.accuracy || 0)),
      avg_resource_unused_per_death: Math.max(0, player.avgResourceUnusedPerDeath || 0),
      avg_explosive_unused_per_death: Math.max(0, player.avgExplosiveUnusedPerDeath || 0),
      game_length_minutes: Math.max(0, player.gameLengthMinutes || 0),
      game_date: data.gameDate ? new Date(data.gameDate).toISOString() : new Date().toISOString()
    }));

    // Insert all player stats in a single batch
    const { data: insertResult, error: insertError } = await supabase
      .from('player_stats')
      .insert(playersToInsert);

    if (insertError) {
      console.error('Database insertion error:', insertError);
      return NextResponse.json(
        { error: 'Failed to save player stats', details: insertError.message },
        { status: 500 }
      );
    }

    console.log(`Successfully inserted ${playersToInsert.length} player stat records`);

    // Auto-create match entry if game_id is provided and no match exists yet
    let matchCreated = false;
    if (data.gameId) {
      try {
        // Check if a match already exists for this game_id
        const { data: existingMatch, error: checkError } = await supabase
          .from('matches')
          .select('id')
          .eq('game_id', data.gameId)
          .single();

        if (checkError && checkError.code === 'PGRST116') {
          // No match found, create one
          const { data: matchId, error: createError } = await supabase.rpc('create_match_from_game_stats', {
            game_id_param: data.gameId
          });

          if (createError) {
            console.error('Error auto-creating match:', createError);
          } else {
            console.log(`Auto-created match ${matchId} for game ${data.gameId}`);
            matchCreated = true;
          }
        } else if (!checkError) {
          console.log(`Match already exists for game ${data.gameId}`);
        } else {
          console.error('Error checking for existing match:', checkError);
        }
      } catch (error) {
        console.error('Error in match auto-creation:', error);
      }
    }

    return NextResponse.json({
      success: true,
      message: `Successfully saved stats for ${playersToInsert.length} players`,
      playersProcessed: playersToInsert.length,
      matchAutoCreated: matchCreated
    });

  } catch (error) {
    console.error('Error processing player stats:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

// GET endpoint for testing
export async function GET() {
  return NextResponse.json({
    message: 'Player Stats API endpoint is active',
    endpoints: {
      'POST /api/player-stats': 'Submit player statistics',
      'GET /api/player-stats/leaderboard': 'Get leaderboard data',
      'GET /api/player-stats/player/{name}': 'Get individual player stats'
    }
  });
} 