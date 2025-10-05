import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { createClient } from '@supabase/supabase-js';

// Use service role key for server-to-server communication
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(request: NextRequest) {
  try {
    // Verify the request is from the game server using the service role key
    const authHeader = request.headers.get('Authorization');
    const apiKeyHeader = request.headers.get('apikey');
    
    if (!authHeader || !apiKeyHeader) {
      console.log('Missing auth headers:', { authHeader: !!authHeader, apiKeyHeader: !!apiKeyHeader });
      return NextResponse.json({ error: 'Missing authentication headers' }, { status: 401 });
    }

    // Verify the service role key
    const expectedKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!expectedKey) {
      console.error('SUPABASE_SERVICE_ROLE_KEY not configured');
      return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
    }

    const providedKey = authHeader.replace('Bearer ', '');
    if (providedKey !== expectedKey || apiKeyHeader !== expectedKey) {
      console.log('Invalid service key provided');
      return NextResponse.json({ error: 'Invalid authentication' }, { status: 401 });
    }

    const body = await request.json();
    console.log('Received game stats payload:', JSON.stringify(body, null, 2));

    const { action, winner_team, loser_team, winner_players, loser_players, arena_name, timestamp, series_length } = body;

    if (!action || !winner_team || !loser_team || !winner_players || !loser_players) {
      return NextResponse.json({ 
        error: 'Missing required fields', 
        required: ['action', 'winner_team', 'loser_team', 'winner_players', 'loser_players']
      }, { status: 400 });
    }

    if (action === 'game_result') {
      // Process individual game results
      await processGameResult(winner_players, loser_players, arena_name, timestamp);
      
      return NextResponse.json({ 
        success: true, 
        message: `Game stats processed: ${winner_team} defeated ${loser_team}`,
        processed_winners: winner_players.length,
        processed_losers: loser_players.length
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

async function processGameResult(winnerPlayers: string[], loserPlayers: string[], arenaName: string, timestamp: string) {
  console.log(`Processing game result: ${winnerPlayers.length} winners vs ${loserPlayers.length} losers`);
  
  // Process each winner - update their game wins
  for (const winnerAlias of winnerPlayers) {
    try {
      // Use the get_or_create function to ensure player record exists, then update game wins
      const { error: winError } = await supabaseAdmin
        .rpc('get_or_create_tt_player_record', {
          p_player_id: null, // No player ID needed for alias-only records
          p_player_alias: winnerAlias
        });

      if (winError) {
        console.error(`Error creating/getting record for winner ${winnerAlias}:`, winError);
        continue;
      }

      // Update game wins for this player
      const { error: updateError } = await supabaseAdmin
        .rpc('increment_tt_player_game_wins', {
          p_player_alias: winnerAlias
        });

      if (updateError) {
        console.error(`Error updating game wins for ${winnerAlias}:`, updateError);
      } else {
        console.log(`✓ Game win recorded for: ${winnerAlias}`);
      }
    } catch (error) {
      console.error(`Error processing game win for ${winnerAlias}:`, error);
    }
  }

  // Process each loser - update their game losses
  for (const loserAlias of loserPlayers) {
    try {
      // Use the get_or_create function to ensure player record exists, then update game losses
      const { error: loseError } = await supabaseAdmin
        .rpc('get_or_create_tt_player_record', {
          p_player_id: null, // No player ID needed for alias-only records
          p_player_alias: loserAlias
        });

      if (loseError) {
        console.error(`Error creating/getting record for loser ${loserAlias}:`, loseError);
        continue;
      }

      // Update game losses for this player
      const { error: updateError } = await supabaseAdmin
        .rpc('increment_tt_player_game_losses', {
          p_player_alias: loserAlias
        });

      if (updateError) {
        console.error(`Error updating game losses for ${loserAlias}:`, updateError);
      } else {
        console.log(`✓ Game loss recorded for: ${loserAlias}`);
      }
    } catch (error) {
      console.error(`Error processing game loss for ${loserAlias}:`, error);
    }
  }
}

async function processSeriesResult(winnerPlayers: string[], loserPlayers: string[], arenaName: string, timestamp: string, seriesLength: number) {
  console.log(`Processing series result: ${winnerPlayers.length} winners vs ${loserPlayers.length} losers (best of ${seriesLength})`);
  
  // Process each winner - update their series wins
  for (const winnerAlias of winnerPlayers) {
    try {
      // Use the get_or_create function to ensure player record exists, then update series wins
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
      console.error(`Error processing series win for ${winnerAlias}:`, error);
    }
  }

  // Process each loser - update their series losses
  for (const loserAlias of loserPlayers) {
    try {
      // Use the get_or_create function to ensure player record exists, then update series losses
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
      console.error(`Error processing series loss for ${loserAlias}:`, error);
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
