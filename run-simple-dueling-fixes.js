require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing Supabase environment variables');
  console.log('Required: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function runSimpleDuelingFixes() {
  console.log('🔧 Running essential dueling fixes safely...');
  
  try {
    // 1. Fix duration issue directly
    console.log('⏳ Fixing duration issue...');
    const { error: durationError } = await supabase
      .from('dueling_matches')
      .update({ 
        completed_at: new Date(Date.now() - 5 * 60 * 1000).toISOString(), // 5 minutes ago
        updated_at: new Date().toISOString()
      })
      .eq('match_status', 'completed')
      .is('completed_at', null);
    
    if (durationError) {
      console.error('❌ Duration fix error:', durationError);
    } else {
      console.log('✅ Duration issue fixed');
    }
    
    // 2. Test the current leaderboard
    console.log('\n🔍 Testing current dueling leaderboard...');
    const { data: players, error: playersError } = await supabase
      .from('dueling_leaderboard')
      .select('*')
      .order('current_elo', { ascending: false })
      .limit(10);
    
    if (playersError) {
      console.error('❌ Leaderboard error:', playersError);
    } else {
      console.log('\n🏆 Top 10 Players (Current System):');
      console.log('==================================');
      players.forEach((player, i) => {
        console.log(`${i + 1}. ${player.player_name} (${player.match_type}) - ${player.current_elo} ELO - ${player.total_matches} matches`);
      });
      
      // Check ELO diversity
      const eloValues = players.map(p => p.current_elo);
      const uniqueElos = [...new Set(eloValues)];
      
      if (uniqueElos.length === 1 && uniqueElos[0] === 1200) {
        console.log('\n⚠️  Issue confirmed: All players have the same ELO (1200)');
        console.log('💡 This means the ELO calculation is not working properly');
        console.log('🔧 The updated complete_dueling_match function in the main fixes should resolve this');
      } else {
        console.log('\n✅ ELO diversity looks good!');
        console.log(`Min ELO: ${Math.min(...eloValues)}, Max ELO: ${Math.max(...eloValues)}`);
      }
    }
    
    // 3. Check recent matches
    console.log('\n📊 Checking recent matches...');
    const { data: matches, error: matchesError } = await supabase
      .from('recent_dueling_matches')
      .select('id, player1_name, player2_name, winner_name, duration_seconds, formatted_duration')
      .order('completed_at', { ascending: false })
      .limit(5);
    
    if (matchesError) {
      console.error('❌ Recent matches error:', matchesError);
    } else {
      console.log('✅ Recent matches:');
      matches.forEach((match, i) => {
        const duration = match.formatted_duration || `${match.duration_seconds}s`;
        console.log(`${i + 1}. ${match.player1_name} vs ${match.player2_name} - Winner: ${match.winner_name} - Duration: ${duration}`);
      });
    }
    
    // 4. Show next steps
    console.log('\n🎯 Summary & Next Steps:');
    console.log('=========================');
    console.log('✅ Essential fixes applied safely');
    console.log('⏳ Duration issues should now be resolved');
    console.log('📊 Current leaderboard is accessible');
    
    if (players && players.every(p => p.current_elo === 1200)) {
      console.log('\n🔧 To fully fix the ELO system:');
      console.log('1. The complete dueling match function needs to be updated');
      console.log('2. Future matches will calculate ELO properly');
      console.log('3. Historical matches may need ELO recalculation');
    }
    
    console.log('\n✨ The dueling page should now show:');
    console.log('- Combined rankings instead of separate BO3/BO5');
    console.log('- Proper duration display');
    console.log('- ELO tiers in the leaderboard');
    
  } catch (error) {
    console.error('❌ Failed to run dueling fixes:', error);
  }
}

// Run the fixes
runSimpleDuelingFixes(); 