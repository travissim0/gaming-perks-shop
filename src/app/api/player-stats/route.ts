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
  // ---- schema 2 (CTF script ctf-2026.09.11+). All optional: schema-1 scripts omit them.
  classPlayTimes?: Record<string, number>;                    // class name -> seconds played
  weapons?: Record<string, { fired: number; landed: number }>; // weapon name -> shots
  playSeconds?: number;
  timesSummoned?: number;
  summonsPerformed?: number;
  minedTso?: number;
  minedTox?: number;
  isCaptain?: boolean;
  leftEarly?: boolean;   // recorded from a leave-time snapshot rather than at Game.End
}

export interface PlayerStatsPayload {
  gameId?: string;
  gameDate?: string;
  schemaVersion?: number;  // absent = 1
  scriptVersion?: string;
  players: PlayerStatData[];
}

// Columns added by the schema-2 migration. Kept as a list so the insert can fall back to the
// schema-1 shape if the migration has not been applied yet, instead of dropping the whole game.
const SCHEMA2_COLUMNS = [
  'class_play_times', 'weapon_stats', 'play_seconds', 'times_summoned', 'summons_performed',
  'mined_tso', 'mined_tox', 'is_captain', 'schema_version', 'script_version',
] as const;

const nonNegInt = (v: unknown) => Math.max(0, Math.trunc(Number(v) || 0));

// Only accept the exact shapes the script emits; anything else becomes null rather than
// letting arbitrary JSON into a jsonb column.
function cleanClassPlayTimes(v: unknown): Record<string, number> | null {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return null;
  const out: Record<string, number> = {};
  for (const [k, secs] of Object.entries(v as Record<string, unknown>)) {
    if (typeof secs === 'number' && isFinite(secs) && secs > 0) out[k] = Math.trunc(secs);
  }
  return Object.keys(out).length ? out : null;
}

function cleanWeapons(v: unknown): Record<string, { fired: number; landed: number }> | null {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return null;
  const out: Record<string, { fired: number; landed: number }> = {};
  for (const [k, cell] of Object.entries(v as Record<string, unknown>)) {
    if (!cell || typeof cell !== 'object') continue;
    const fired = nonNegInt((cell as { fired?: unknown }).fired);
    const landed = Math.min(fired, nonNegInt((cell as { landed?: unknown }).landed));
    if (fired > 0) out[k] = { fired, landed };
  }
  return Object.keys(out).length ? out : null;
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
      game_date: data.gameDate ? new Date(data.gameDate).toISOString() : new Date().toISOString(),
      // schema 2
      class_play_times: cleanClassPlayTimes(player.classPlayTimes),
      weapon_stats: cleanWeapons(player.weapons),
      play_seconds: nonNegInt(player.playSeconds),
      times_summoned: nonNegInt(player.timesSummoned),
      summons_performed: nonNegInt(player.summonsPerformed),
      mined_tso: nonNegInt(player.minedTso),
      mined_tox: nonNegInt(player.minedTox),
      is_captain: player.isCaptain === true,
      left_early: player.leftEarly === true,
      schema_version: nonNegInt(data.schemaVersion) || 1,
      script_version: typeof data.scriptVersion === 'string' ? data.scriptVersion.slice(0, 64) : null,
    }));

    // Insert all player stats in a single batch
    let { data: insertResult, error: insertError } = await supabase
      .from('player_stats')
      .insert(playersToInsert);

    // Migration not applied yet? PostgREST reports the missing column as PGRST204. Strip the
    // schema-2 columns and save the schema-1 row rather than losing the game.
    if (insertError && (insertError.code === 'PGRST204' || /column .* does not exist|Could not find the '.*' column/i.test(insertError.message || ''))) {
      console.warn(`player_stats insert rejected schema-2 columns (${insertError.message}); retrying with schema-1 shape`);
      const legacyRows = playersToInsert.map(row => {
        const copy: Record<string, unknown> = { ...row };
        for (const col of SCHEMA2_COLUMNS) delete copy[col];
        return copy;
      });
      ({ data: insertResult, error: insertError } = await supabase.from('player_stats').insert(legacyRows));
    }

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