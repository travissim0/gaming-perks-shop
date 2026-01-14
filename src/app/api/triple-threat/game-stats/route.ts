import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { createClient } from '@supabase/supabase-js';

// Use service role key for server-to-server communication
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Handle OPTIONS preflight requests
export async function OPTIONS(request: NextRequest) {
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, apikey, x-api-key',
    },
  });
}

export async function POST(request: NextRequest) {
  try {
    // Parse body first so we can check for auth_key in body
    const body = await request.json();

    // Verify the request is from the game server using the service role key
    // Check headers first, then fall back to body (for edge networks that strip headers)
    const authHeader = request.headers.get('Authorization');
    const apiKeyHeader = request.headers.get('apikey');
    const bodyAuthKey = body.auth_key;

    // Debug logging
    console.log('=== Triple Threat Game Stats Request ===');
    console.log('Auth sources:', {
      authHeader: !!authHeader,
      apiKeyHeader: !!apiKeyHeader,
      bodyAuthKey: !!bodyAuthKey
    });

    // Get the expected key
    const expectedKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!expectedKey) {
      console.error('SUPABASE_SERVICE_ROLE_KEY not configured');
      return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
    }

    // Try to authenticate from multiple sources
    let authenticated = false;

    // Method 1: Headers (preferred)
    if (authHeader && apiKeyHeader) {
      const providedKey = authHeader.replace('Bearer ', '');
      if (providedKey === expectedKey && apiKeyHeader === expectedKey) {
        authenticated = true;
        console.log('Authenticated via headers');
      }
    }

    // Method 2: Body auth_key (fallback for edge networks)
    if (!authenticated && bodyAuthKey) {
      if (bodyAuthKey === expectedKey) {
        authenticated = true;
        console.log('Authenticated via body auth_key');
      }
    }

    if (!authenticated) {
      console.log('Authentication failed - no valid credentials found');
      return NextResponse.json({ error: 'Missing or invalid authentication' }, { status: 401 });
    }
    console.log('Received game stats payload:', JSON.stringify(body, null, 2));

    const { 
      action, 
      winner_team, 
      loser_team, 
      winner_players, 
      loser_players, 
      arena_name, 
      timestamp, 
      series_length,
      series_id,
      game_number,
      game_duration_seconds
    } = body;

    if (!action || !winner_team || !loser_team || !winner_players || !loser_players) {
      return NextResponse.json({ 
        error: 'Missing required fields', 
        required: ['action', 'winner_team', 'loser_team', 'winner_players', 'loser_players']
      }, { status: 400 });
    }

    if (action === 'game_result') {
      // Process individual game results
      await processGameResult(
        winner_team,
        loser_team, 
        winner_players, 
        loser_players, 
        arena_name, 
        timestamp,
        series_id,
        game_number,
        game_duration_seconds
      );
      
      return NextResponse.json({ 
        success: true, 
        message: `Game stats processed: ${winner_team} defeated ${loser_team}`,
        processed_winners: winner_players.length,
        processed_losers: loser_players.length,
        series_id: series_id || 'none',
        game_number: game_number || 1
      });
    }

    if (action === 'series_result') {
      // Process series results
      await processSeriesResult(winner_players, loser_players, arena_name, timestamp, series_length);
      
      return NextResponse.json({ 
        success: true, 
        message: `Series stats processed: ${winner_team} won series against ${loser_team}`,
        processed_winners: winner_players.length,
        processed_losers: loser_players.length,
        series_length: series_length
      });
    }

    if (action === 'test') {
      return NextResponse.json({ 
        success: true, 
        message: 'Test connection successful',
        timestamp: new Date().toISOString()
      });
    }

    return NextResponse.json({ error: 'Invalid action. Supported: game_result, series_result, test' }, { status: 400 });

  } catch (error: any) {
    console.error('Error in Triple Threat game stats API:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error', message: error.message },
      { status: 500 }
    );
  }
}

interface EnhancedPlayerStats {
  alias: string;
  kills: number;
  deaths: number;
  primary_class?: string;
  total_hits?: number;
  total_shots?: number;
  accuracy?: number;
  teammates?: string[];
  result: string;
}

async function processGameResult(
  winnerTeam: string,
  loserTeam: string,
  winnerPlayers: Array<string | EnhancedPlayerStats>, 
  loserPlayers: Array<string | EnhancedPlayerStats>, 
  arenaName: string, 
  timestamp: string,
  seriesId?: string,
  gameNumber?: number,
  gameDuration?: number
) {
  console.log(`Processing game result: ${winnerPlayers.length} winners vs ${loserPlayers.length} losers`);
  console.log(`Series: ${seriesId || 'standalone'}, Game: ${gameNumber || 1}, Duration: ${gameDuration || 0}s`);
  
  // Process each winner - insert detailed stats and update aggregates
  for (const winner of winnerPlayers) {
    try {
      // Handle both string (legacy) and object (new) formats
      const winnerAlias = typeof winner === 'string' ? winner : winner.alias;
      const kills = typeof winner === 'object' && winner.kills !== undefined ? winner.kills : 0;
      const deaths = typeof winner === 'object' && winner.deaths !== undefined ? winner.deaths : 0;
      const primaryClass = typeof winner === 'object' && winner.primary_class ? winner.primary_class : null;
      const totalHits = typeof winner === 'object' && winner.total_hits ? winner.total_hits : 0;
      const totalShots = typeof winner === 'object' && winner.total_shots ? winner.total_shots : 0;
      const accuracy = typeof winner === 'object' && winner.accuracy ? winner.accuracy : null;
      const teammates = typeof winner === 'object' && winner.teammates ? winner.teammates : null;
      
      // 1. Insert detailed game stat into tt_player_stats
      const { data: statId, error: insertError } = await supabaseAdmin
        .rpc('insert_tt_game_stat', {
          p_player_alias: winnerAlias,
          p_team_name: winnerTeam,
          p_opponent_team: loserTeam,
          p_kills: kills,
          p_deaths: deaths,
          p_result: 'win',
          p_primary_class: primaryClass,
          p_total_hits: totalHits,
          p_total_shots: totalShots,
          p_accuracy: accuracy,
          p_teammates: teammates,
          p_game_duration: gameDuration || null,
          p_game_number: gameNumber || 1,
          p_series_id: seriesId || null,
          p_match_id: null,
          p_tournament_id: null
        });
      
      if (insertError) {
        console.error(`Error inserting detailed stats for ${winnerAlias}:`, insertError);
      } else {
        console.log(`✓ Detailed stats inserted for: ${winnerAlias} (ID: ${statId})`);
      }
      
      // 2. Ensure aggregate record exists
      const { error: winError } = await supabaseAdmin
        .rpc('get_or_create_tt_player_record', {
          p_player_id: null,
          p_player_alias: winnerAlias
        });

      if (winError) {
        console.error(`Error creating/getting record for winner ${winnerAlias}:`, winError);
        continue;
      }

      // 3. Update aggregate game wins
      const { error: updateWinError } = await supabaseAdmin
        .rpc('increment_tt_player_game_wins', {
          p_player_alias: winnerAlias
        });

      if (updateWinError) {
        console.error(`Error updating game wins for ${winnerAlias}:`, updateWinError);
      } else {
        console.log(`✓ Game win recorded for: ${winnerAlias}`);
      }
      
      // 4. Update aggregate kills
      if (kills > 0) {
        const { error: killsError } = await supabaseAdmin
          .rpc('increment_tt_player_kills', {
            p_player_alias: winnerAlias,
            p_kills_to_add: kills
          });
        
        if (killsError) {
          console.error(`Error updating kills for ${winnerAlias}:`, killsError);
        }
      }
      
      // 5. Update aggregate deaths
      if (deaths > 0) {
        const { error: deathsError } = await supabaseAdmin
          .rpc('increment_tt_player_deaths', {
            p_player_alias: winnerAlias,
            p_deaths_to_add: deaths
          });
        
        if (deathsError) {
          console.error(`Error updating deaths for ${winnerAlias}:`, deathsError);
        }
      }
    } catch (error) {
      console.error(`Error processing game win for ${typeof winner === 'string' ? winner : winner.alias}:`, error);
    }
  }

  // Process each loser - insert detailed stats and update aggregates
  for (const loser of loserPlayers) {
    try {
      // Handle both string (legacy) and object (new) formats
      const loserAlias = typeof loser === 'string' ? loser : loser.alias;
      const kills = typeof loser === 'object' && loser.kills !== undefined ? loser.kills : 0;
      const deaths = typeof loser === 'object' && loser.deaths !== undefined ? loser.deaths : 0;
      const primaryClass = typeof loser === 'object' && loser.primary_class ? loser.primary_class : null;
      const totalHits = typeof loser === 'object' && loser.total_hits ? loser.total_hits : 0;
      const totalShots = typeof loser === 'object' && loser.total_shots ? loser.total_shots : 0;
      const accuracy = typeof loser === 'object' && loser.accuracy ? loser.accuracy : null;
      const teammates = typeof loser === 'object' && loser.teammates ? loser.teammates : null;
      
      // 1. Insert detailed game stat into tt_player_stats
      const { data: statId, error: insertError } = await supabaseAdmin
        .rpc('insert_tt_game_stat', {
          p_player_alias: loserAlias,
          p_team_name: loserTeam,
          p_opponent_team: winnerTeam,
          p_kills: kills,
          p_deaths: deaths,
          p_result: 'loss',
          p_primary_class: primaryClass,
          p_total_hits: totalHits,
          p_total_shots: totalShots,
          p_accuracy: accuracy,
          p_teammates: teammates,
          p_game_duration: gameDuration || null,
          p_game_number: gameNumber || 1,
          p_series_id: seriesId || null,
          p_match_id: null,
          p_tournament_id: null
        });
      
      if (insertError) {
        console.error(`Error inserting detailed stats for ${loserAlias}:`, insertError);
      } else {
        console.log(`✓ Detailed stats inserted for: ${loserAlias} (ID: ${statId})`);
      }
      
      // 2. Ensure aggregate record exists
      const { error: loseError } = await supabaseAdmin
        .rpc('get_or_create_tt_player_record', {
          p_player_id: null,
          p_player_alias: loserAlias
        });

      if (loseError) {
        console.error(`Error creating/getting record for loser ${loserAlias}:`, loseError);
        continue;
      }

      // 3. Update aggregate game losses
      const { error: updateLossError } = await supabaseAdmin
        .rpc('increment_tt_player_game_losses', {
          p_player_alias: loserAlias
        });

      if (updateLossError) {
        console.error(`Error updating game losses for ${loserAlias}:`, updateLossError);
      } else {
        console.log(`✓ Game loss recorded for: ${loserAlias}`);
      }
      
      // 4. Update aggregate kills
      if (kills > 0) {
        const { error: killsError } = await supabaseAdmin
          .rpc('increment_tt_player_kills', {
            p_player_alias: loserAlias,
            p_kills_to_add: kills
          });
        
        if (killsError) {
          console.error(`Error updating kills for ${loserAlias}:`, killsError);
        }
      }
      
      // 5. Update aggregate deaths
      if (deaths > 0) {
        const { error: deathsError } = await supabaseAdmin
          .rpc('increment_tt_player_deaths', {
            p_player_alias: loserAlias,
            p_deaths_to_add: deaths
          });
        
        if (deathsError) {
          console.error(`Error updating deaths for ${loserAlias}:`, deathsError);
        }
      }
    } catch (error) {
      console.error(`Error processing game loss for ${typeof loser === 'string' ? loser : loser.alias}:`, error);
    }
  }
}

async function processSeriesResult(
  winnerPlayers: Array<string | { alias: string; kills?: number; deaths?: number }>, 
  loserPlayers: Array<string | { alias: string; kills?: number; deaths?: number }>, 
  arenaName: string, 
  timestamp: string, 
  seriesLength: number
) {
  console.log(`Processing series result: ${winnerPlayers.length} winners vs ${loserPlayers.length} losers (best of ${seriesLength})`);
  
  // Process each winner - update their series wins
  for (const winner of winnerPlayers) {
    try {
      // Handle both string (legacy) and object (new) formats
      const winnerAlias = typeof winner === 'string' ? winner : winner.alias;
      
      // Use the get_or_create function to ensure player record exists
      const { error: winError } = await supabaseAdmin
        .rpc('get_or_create_tt_player_record', {
          p_player_id: null, // No player ID needed for alias-only records
          p_player_alias: winnerAlias
        });

      if (winError) {
        console.error(`Error creating/getting record for winner ${winnerAlias}:`, winError);
        continue;
      }

      // Update series wins for this player
      const { error: updateError } = await supabaseAdmin
        .rpc('increment_tt_player_series_wins', {
          p_player_alias: winnerAlias
        });

      if (updateError) {
        console.error(`Error updating series wins for ${winnerAlias}:`, updateError);
      } else {
        console.log(`✓ Series win recorded for: ${winnerAlias}`);
      }
    } catch (error) {
      console.error(`Error processing series win for ${typeof winner === 'string' ? winner : winner.alias}:`, error);
    }
  }

  // Process each loser - update their series losses
  for (const loser of loserPlayers) {
    try {
      // Handle both string (legacy) and object (new) formats
      const loserAlias = typeof loser === 'string' ? loser : loser.alias;
      
      // Use the get_or_create function to ensure player record exists
      const { error: loseError } = await supabaseAdmin
        .rpc('get_or_create_tt_player_record', {
          p_player_id: null, // No player ID needed for alias-only records
          p_player_alias: loserAlias
        });

      if (loseError) {
        console.error(`Error creating/getting record for loser ${loserAlias}:`, loseError);
        continue;
      }

      // Update series losses for this player
      const { error: updateError } = await supabaseAdmin
        .rpc('increment_tt_player_series_losses', {
          p_player_alias: loserAlias
        });

      if (updateError) {
        console.error(`Error updating series losses for ${loserAlias}:`, updateError);
      } else {
        console.log(`✓ Series loss recorded for: ${loserAlias}`);
      }
    } catch (error) {
      console.error(`Error processing series loss for ${typeof loser === 'string' ? loser : loser.alias}:`, error);
    }
  }
}

// Handle GET requests for testing
export async function GET(request: NextRequest) {
  return NextResponse.json({ 
    message: 'Triple Threat Game Stats API',
    endpoints: {
      POST: 'Send game or series results',
      supported_actions: ['game_result', 'series_result', 'test']
    },
    timestamp: new Date().toISOString()
  });
}
