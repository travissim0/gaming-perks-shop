require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
    console.error('❌ Missing Supabase configuration');
    console.error('Make sure NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are set in .env.local');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function insertAxidusWorthMatch() {
    try {
        console.log('🎯 Inserting Axidus vs Worth Bo5 match...');
        
        // Match data based on terminal output
        const matchData = {
            match_type: 'ranked_bo5',
            player1_name: 'Axidus',
            player2_name: 'Worth',
            winner_name: 'Axidus',
            player1_rounds_won: 3,  // Axidus won 3 rounds
            player2_rounds_won: 1,  // Worth won 1 round
            total_rounds: 4,
            match_status: 'completed',
            arena_name: 'ovd',
            started_at: new Date(Date.now() - 10 * 60 * 1000).toISOString(), // 10 minutes ago
            completed_at: new Date().toISOString()
        };
        
        console.log('📝 Match data:', matchData);
        
        // Insert the match
        const { data: matchResult, error: matchError } = await supabase
            .from('dueling_matches')
            .insert(matchData)
            .select()
            .single();
        
        if (matchError) {
            console.error('❌ Error inserting match:', matchError);
            return;
        }
        
        console.log('✅ Match inserted successfully:', matchResult);
        const matchId = matchResult.id;
        
        // Round data based on terminal output:
        // Round 1: Axidus beats Worth (42HP vs 0HP)
        // Round 2: Worth beats Axidus (17HP vs 0HP) 
        // Round 3: Axidus beats Worth (22HP vs 0HP)
        // Round 4: Axidus beats Worth (52HP vs 0HP)
        
        const roundsData = [
            {
                match_id: matchId,
                round_number: 1,
                winner_name: 'Axidus',
                loser_name: 'Worth',
                winner_hp_left: 42,
                loser_hp_left: 0,
                round_duration_seconds: 31, // Estimated from terminal
                kills_in_round: 1,
                started_at: new Date(Date.now() - 9 * 60 * 1000).toISOString(),
                completed_at: new Date(Date.now() - 8.5 * 60 * 1000).toISOString()
            },
            {
                match_id: matchId,
                round_number: 2,
                winner_name: 'Worth',
                loser_name: 'Axidus',
                winner_hp_left: 17,
                loser_hp_left: 0,
                round_duration_seconds: 49,
                kills_in_round: 1,
                started_at: new Date(Date.now() - 8 * 60 * 1000).toISOString(),
                completed_at: new Date(Date.now() - 7 * 60 * 1000).toISOString()
            },
            {
                match_id: matchId,
                round_number: 3,
                winner_name: 'Axidus',
                loser_name: 'Worth',
                winner_hp_left: 22,
                loser_hp_left: 0,
                round_duration_seconds: 43,
                kills_in_round: 1,
                started_at: new Date(Date.now() - 6 * 60 * 1000).toISOString(),
                completed_at: new Date(Date.now() - 5 * 60 * 1000).toISOString()
            },
            {
                match_id: matchId,
                round_number: 4,
                winner_name: 'Axidus',
                loser_name: 'Worth',
                winner_hp_left: 52,
                loser_hp_left: 0,
                round_duration_seconds: 20,
                kills_in_round: 1,
                started_at: new Date(Date.now() - 4 * 60 * 1000).toISOString(),
                completed_at: new Date(Date.now() - 3 * 60 * 1000).toISOString()
            }
        ];
        
        console.log('\n🔄 Inserting rounds...');
        
        // Insert rounds
        const { data: roundsResult, error: roundsError } = await supabase
            .from('dueling_rounds')
            .insert(roundsData)
            .select();
        
        if (roundsError) {
            console.error('❌ Error inserting rounds:', roundsError);
            return;
        }
        
        console.log('✅ Rounds inserted successfully:', roundsResult.length, 'rounds');
        
        // Sample kill data for each round (based on terminal output stats)
        const killsData = [];
        
        // Round 1 kills - Axidus wins with 42HP left
        killsData.push({
            match_id: matchId,
            round_id: roundsResult[0].id,
            killer_name: 'Axidus',
            victim_name: 'Worth',
            weapon_used: 'Assault Rifle',
            damage_dealt: 60,
            victim_hp_before: 60,
            victim_hp_after: 0,
            shots_fired: 105,
            shots_hit: 23,
            accuracy: 0.2190,
            is_double_hit: true,
            is_triple_hit: false,
            kill_timestamp: new Date(Date.now() - 8.5 * 60 * 1000).toISOString()
        });
        
        // Round 2 kills - Worth wins with 17HP left
        killsData.push({
            match_id: matchId,
            round_id: roundsResult[1].id,
            killer_name: 'Worth',
            victim_name: 'Axidus',
            weapon_used: 'Assault Rifle',
            damage_dealt: 60,
            victim_hp_before: 60,
            victim_hp_after: 0,
            shots_fired: 87,
            shots_hit: 16,
            accuracy: 0.1839,
            is_double_hit: false,
            is_triple_hit: false,
            kill_timestamp: new Date(Date.now() - 7 * 60 * 1000).toISOString()
        });
        
        // Round 3 kills - Axidus wins with 22HP left
        killsData.push({
            match_id: matchId,
            round_id: roundsResult[2].id,
            killer_name: 'Axidus',
            victim_name: 'Worth',
            weapon_used: 'Assault Rifle',
            damage_dealt: 60,
            victim_hp_before: 60,
            victim_hp_after: 0,
            shots_fired: 42,
            shots_hit: 12,
            accuracy: 0.2857,
            is_double_hit: false,
            is_triple_hit: false,
            kill_timestamp: new Date(Date.now() - 5 * 60 * 1000).toISOString()
        });
        
        // Round 4 kills - Axidus wins with 52HP left
        killsData.push({
            match_id: matchId,
            round_id: roundsResult[3].id,
            killer_name: 'Axidus',
            victim_name: 'Worth',
            weapon_used: 'Assault Rifle',
            damage_dealt: 60,
            victim_hp_before: 60,
            victim_hp_after: 0,
            shots_fired: 87,
            shots_hit: 16,
            accuracy: 0.1839,
            is_double_hit: false,
            is_triple_hit: false,
            kill_timestamp: new Date(Date.now() - 3 * 60 * 1000).toISOString()
        });
        
        console.log('\n🔄 Inserting kill data...');
        
        // Insert kills
        const { data: killsResult, error: killsError } = await supabase
            .from('dueling_kills')
            .insert(killsData)
            .select();
        
        if (killsError) {
            console.error('❌ Error inserting kills:', killsError);
            return;
        }
        
        console.log('✅ Kills inserted successfully:', killsResult.length, 'kills');
        
        // Update player stats
        console.log('\n🔄 Updating player statistics...');
        
        // You can run the update_dueling_player_stats function if it exists
        try {
            await supabase.rpc('update_dueling_player_stats', {
                p_player_name: 'Axidus',
                p_match_type: 'ranked_bo5'
            });
            
            await supabase.rpc('update_dueling_player_stats', {
                p_player_name: 'Worth',
                p_match_type: 'ranked_bo5'
            });
            
            console.log('✅ Player statistics updated');
        } catch (statsError) {
            console.log('⚠️  Could not update player stats automatically (function may not exist)');
        }
        
        console.log('\n🎉 Successfully inserted Axidus vs Worth Bo5 match!');
        console.log('📊 Match Summary:');
        console.log(`• Match ID: ${matchId}`);
        console.log('• Winner: Axidus');
        console.log('• Final Score: 3-1');
        console.log('• Total Rounds: 4');
        console.log('• Arena: ovd');
        console.log('• Match Type: ranked_bo5');
        
        console.log('\n✅ The match should now appear in your dueling history and leaderboards!');
        
    } catch (error) {
        console.error('❌ Error inserting match:', error);
        process.exit(1);
    }
}

insertAxidusWorthMatch(); 