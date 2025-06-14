const { createClient } = require('@supabase/supabase-js');

// Supabase configuration
const supabaseUrl = 'https://nkinpmqnbcjaftqduujf.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5raW5wbXFuYmNqYWZ0cWR1dWpmIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0ODEyMDQ3NiwiZXhwIjoyMDYzNjk2NDc2fQ.u8bPszZSVGJku44KFKyRszfL2lZVwv4-EBYc3dgezK4';

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkMatchesWithRounds() {
    console.log('🔍 Checking which matches have rounds...\n');
    
    try {
        // Get all matches
        const { data: allMatches, error: matchesError } = await supabase
            .from('dueling_matches')
            .select('id, player1_name, player2_name, player1_rounds_won, player2_rounds_won, total_rounds, match_status, created_at')
            .order('id', { ascending: true });
        
        if (matchesError) {
            console.error('❌ Error fetching matches:', matchesError);
            return;
        }
        
        console.log(`📊 Found ${allMatches.length} total matches\n`);
        
        // Check each match for rounds
        const matchesWithRounds = [];
        const matchesWithoutRounds = [];
        
        for (const match of allMatches) {
            const { data: rounds, error: roundsError } = await supabase
                .from('dueling_rounds')
                .select('round_number, winner_name, loser_name')
                .eq('match_id', match.id);
            
            if (roundsError) {
                console.error(`❌ Error fetching rounds for match ${match.id}:`, roundsError);
                continue;
            }
            
            if (rounds.length > 0) {
                matchesWithRounds.push({
                    ...match,
                    actualRounds: rounds.length,
                    rounds: rounds
                });
            } else {
                matchesWithoutRounds.push(match);
            }
        }
        
        console.log(`✅ Matches WITH rounds (${matchesWithRounds.length}):`);
        matchesWithRounds.forEach(match => {
            console.log(`  Match ${match.id}: ${match.player1_name} vs ${match.player2_name} - ${match.actualRounds} rounds (DB says: ${match.player1_rounds_won}-${match.player2_rounds_won}, ${match.total_rounds} total)`);
            match.rounds.forEach(round => {
                console.log(`    Round ${round.round_number}: ${round.winner_name} beats ${round.loser_name}`);
            });
        });
        
        console.log(`\n❌ Matches WITHOUT rounds (${matchesWithoutRounds.length}):`);
        matchesWithoutRounds.forEach(match => {
            console.log(`  Match ${match.id}: ${match.player1_name} vs ${match.player2_name} - NO ROUNDS (created: ${match.created_at})`);
        });
        
        // Check if there's a pattern in the dates
        if (matchesWithRounds.length > 0 && matchesWithoutRounds.length > 0) {
            const lastGoodMatch = matchesWithRounds[matchesWithRounds.length - 1];
            const firstBadMatch = matchesWithoutRounds[0];
            
            console.log(`\n📅 Pattern Analysis:`);
            console.log(`  Last match WITH rounds: Match ${lastGoodMatch.id} (${lastGoodMatch.created_at})`);
            console.log(`  First match WITHOUT rounds: Match ${firstBadMatch.id} (${firstBadMatch.created_at})`);
            console.log(`  🔍 Something changed in the C# code between these dates!`);
        }
        
    } catch (error) {
        console.error('❌ Unexpected error:', error);
    }
}

// Run the check
checkMatchesWithRounds(); 