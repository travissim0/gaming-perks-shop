const { createClient } = require('@supabase/supabase-js');

// Supabase configuration
const supabaseUrl = 'https://nkinpmqnbcjaftqduujf.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5raW5wbXFuYmNqYWZ0cWR1dWpmIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0ODEyMDQ3NiwiZXhwIjoyMDYzNjk2NDc2fQ.u8bPszZSVGJku44KFKyRszfL2lZVwv4-EBYc3dgezK4';

const supabase = createClient(supabaseUrl, supabaseKey);

async function investigateDuelingRounds() {
    console.log('🔍 Investigating Dueling Rounds Data...\n');
    
    try {
        // Check total counts in each table
        console.log('📊 Table Counts:');
        
        const { count: matchesCount } = await supabase
            .from('dueling_matches')
            .select('*', { count: 'exact', head: true });
        console.log(`  dueling_matches: ${matchesCount} records`);
        
        const { count: roundsCount } = await supabase
            .from('dueling_rounds')
            .select('*', { count: 'exact', head: true });
        console.log(`  dueling_rounds: ${roundsCount} records`);
        
        const { count: killsCount } = await supabase
            .from('dueling_kills')
            .select('*', { count: 'exact', head: true });
        console.log(`  dueling_kills: ${killsCount} records`);
        
        // Check some sample rounds data
        console.log('\n🎯 Sample Dueling Rounds:');
        const { data: sampleRounds, error: roundsError } = await supabase
            .from('dueling_rounds')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(10);
        
        if (roundsError) {
            console.error('❌ Error fetching rounds:', roundsError);
        } else if (sampleRounds.length === 0) {
            console.log('⚠️  NO ROUNDS FOUND! This explains the 0-0 scores.');
        } else {
            console.log(`Found ${sampleRounds.length} recent rounds:`);
            sampleRounds.forEach(round => {
                console.log(`  Round ${round.round_number} (Match ${round.match_id}): ${round.winner_name} beats ${round.loser_name} (${round.winner_hp_left}HP vs ${round.loser_hp_left}HP)`);
            });
        }
        
        // Check some sample kills data
        console.log('\n⚔️  Sample Dueling Kills:');
        const { data: sampleKills, error: killsError } = await supabase
            .from('dueling_kills')
            .select('*')
            .order('kill_timestamp', { ascending: false })
            .limit(5);
        
        if (killsError) {
            console.error('❌ Error fetching kills:', killsError);
        } else if (sampleKills.length === 0) {
            console.log('⚠️  NO KILLS FOUND!');
        } else {
            console.log(`Found ${sampleKills.length} recent kills:`);
            sampleKills.forEach(kill => {
                console.log(`  ${kill.killer_name} killed ${kill.victim_name} (${kill.shots_fired} shots, ${kill.shots_hit} hits, ${((kill.shots_hit/kill.shots_fired)*100).toFixed(1)}% accuracy)`);
            });
        }
        
        // Check if there are any matches that DO have rounds
        console.log('\n🔍 Checking for matches WITH rounds:');
        const { data: matchesWithRounds, error: matchRoundsError } = await supabase
            .from('dueling_matches')
            .select(`
                id, 
                player1_name, 
                player2_name, 
                player1_rounds_won, 
                player2_rounds_won, 
                total_rounds,
                dueling_rounds(count)
            `)
            .neq('dueling_rounds.count', 0)
            .limit(5);
        
        if (matchRoundsError) {
            console.error('❌ Error fetching matches with rounds:', matchRoundsError);
        } else {
            console.log(`Found ${matchesWithRounds.length} matches with actual rounds data`);
            matchesWithRounds.forEach(match => {
                console.log(`  Match ${match.id}: ${match.player1_name} vs ${match.player2_name} (${match.player1_rounds_won}-${match.player2_rounds_won})`);
            });
        }
        
        // Check the most recent match details
        console.log('\n🔍 Most Recent Match Details:');
        const { data: recentMatch, error: recentError } = await supabase
            .from('dueling_matches')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(1)
            .single();
        
        if (recentError) {
            console.error('❌ Error fetching recent match:', recentError);
        } else {
            console.log(`Most recent match (ID ${recentMatch.id}):`);
            console.log(`  Players: ${recentMatch.player1_name} vs ${recentMatch.player2_name}`);
            console.log(`  Score: ${recentMatch.player1_rounds_won}-${recentMatch.player2_rounds_won} (${recentMatch.total_rounds} rounds)`);
            console.log(`  Status: ${recentMatch.match_status}`);
            console.log(`  Created: ${recentMatch.created_at}`);
            console.log(`  Completed: ${recentMatch.completed_at}`);
            
            // Check if this match has any rounds
            const { data: matchRounds, error: matchRoundsErr } = await supabase
                .from('dueling_rounds')
                .select('*')
                .eq('match_id', recentMatch.id);
            
            if (matchRoundsErr) {
                console.error('❌ Error fetching match rounds:', matchRoundsErr);
            } else {
                console.log(`  Rounds in database: ${matchRounds.length}`);
                if (matchRounds.length > 0) {
                    matchRounds.forEach(round => {
                        console.log(`    Round ${round.round_number}: ${round.winner_name} beats ${round.loser_name}`);
                    });
                } else {
                    console.log('    ⚠️  NO ROUNDS FOUND FOR THIS MATCH!');
                }
            }
        }
        
    } catch (error) {
        console.error('❌ Unexpected error:', error);
    }
}

// Run the investigation
investigateDuelingRounds(); 