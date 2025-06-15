const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

// Configuration
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://nkinpmqnbcjaftqduujf.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5raW5wbXFuYmNqYWZ0cWR1dWpmIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0ODEyMDQ3NiwiZXhwIjoyMDYzNjk2NDc2fQ.u8bPszZSVGJku44KFKyRszfL2lZVwv4-EBYc3dgezK4';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

async function applyEloFixes() {
  try {
    console.log('🔧 Applying ELO system fixes...');

    // Read the fix SQL file
    const fixSQL = fs.readFileSync('fix-elo-recalculation.sql', 'utf8');

    console.log('📝 Loaded ELO fix SQL');
    console.log('\n🚨 MANUAL STEP REQUIRED:');
    console.log('========================================');
    console.log('1. Open Supabase SQL Editor');
    console.log('2. Copy and paste the contents of fix-elo-recalculation.sql');
    console.log('3. Execute the SQL statements');
    console.log('4. Then run: node fix-elo-system.js --recalculate');
    console.log('\nSQL file location: fix-elo-recalculation.sql');
    console.log('========================================\n');

    // Show a preview of the SQL
    const lines = fixSQL.split('\n');
    console.log('📋 SQL Preview (first 10 lines):');
    lines.slice(0, 10).forEach((line, i) => {
      console.log(`${i + 1}: ${line}`);
    });
    console.log('...');

  } catch (error) {
    console.error('❌ Error reading fix file:', error);
  }
}

async function testRecalculation() {
  try {
    console.log('🧪 Testing ELO recalculation...');

    // Call the fixed recalculation function
    const { data, error } = await supabase.rpc('recalculate_all_elo_ratings');

    if (error) {
      console.error('❌ ELO recalculation still failing:', error);
      console.log('\n💡 Troubleshooting steps:');
      console.log('1. Make sure you ran the fix SQL in Supabase SQL Editor');
      console.log('2. Check that the function was created successfully');
      console.log('3. Verify your database permissions');
      return false;
    }

    console.log('✅ ELO recalculation completed successfully!');
    console.log('📊 Result:', data);

    // Get some stats about the recalculated ratings
    const { data: stats, error: statsError } = await supabase
      .from('elo_leaderboard')
      .select('*')
      .order('weighted_elo', { ascending: false })
      .limit(10);

    if (!statsError && stats && stats.length > 0) {
      console.log('\n🏆 Top 10 ELO Rankings:');
      console.log('========================');
      stats.forEach((player, index) => {
        console.log(`${index + 1}. ${player.player_name} - ${player.weighted_elo} ELO (${player.elo_tier?.name || 'Unknown'}) - ${player.total_games} games`);
      });

      // Check for diversity in ELO ratings
      const eloValues = stats.map(p => parseFloat(p.weighted_elo));
      const minElo = Math.min(...eloValues);
      const maxElo = Math.max(...eloValues);
      const avgElo = eloValues.reduce((a, b) => a + b, 0) / eloValues.length;

      console.log('\n📈 ELO Distribution:');
      console.log(`Min ELO: ${minElo.toFixed(0)}`);
      console.log(`Max ELO: ${maxElo.toFixed(0)}`);
      console.log(`Avg ELO: ${avgElo.toFixed(0)}`);
      console.log(`Range: ${(maxElo - minElo).toFixed(0)}`);

      if (maxElo - minElo < 50) {
        console.log('⚠️  Warning: ELO range is very small. This might indicate:');
        console.log('   - Not enough games played');
        console.log('   - All players have similar skill levels');
        console.log('   - ELO calculation needs adjustment');
      }
    } else {
      console.log('⚠️  No ELO leaderboard data found');
    }

    return true;

  } catch (error) {
    console.error('❌ Unexpected error during recalculation:', error);
    return false;
  }
}

async function checkEloStatus() {
  try {
    console.log('🔍 Checking ELO system status...');

    // Check if we have player stats data
    const { data: playerStats, error: playerError } = await supabase
      .from('player_stats')
      .select('id')
      .limit(1);

    if (playerError) {
      console.log('❌ Cannot access player_stats table:', playerError.message);
      return false;
    }

    // Check if we have aggregate stats
    const { data: aggregateStats, error: aggError } = await supabase
      .from('player_aggregate_stats')
      .select('id')
      .limit(1);

    if (aggError) {
      console.log('❌ Cannot access player_aggregate_stats table:', aggError.message);
      return false;
    }

    // Check if ELO columns exist
    const { data: eloCheck, error: eloError } = await supabase
      .from('player_aggregate_stats')
      .select('elo_rating, elo_confidence')
      .limit(1);

    if (eloError) {
      console.log('❌ ELO columns not found. Run the initial migration first:');
      console.log('   1. Copy add-elo-system.sql to Supabase SQL Editor');
      console.log('   2. Execute the SQL statements');
      console.log('   3. Then run this script again');
      return false;
    }

    console.log('✅ ELO system tables and columns are present');

    // Check if recalculation function exists
    const { data: funcCheck, error: funcError } = await supabase.rpc('recalculate_all_elo_ratings');
    
    if (funcError && funcError.code === '42883') {
      console.log('❌ ELO recalculation function not found');
      return false;
    }

    console.log('✅ ELO system is ready for use');
    return true;

  } catch (error) {
    console.error('❌ Error checking ELO status:', error);
    return false;
  }
}

// Main execution
async function main() {
  const args = process.argv.slice(2);
  
  if (args.includes('--recalculate')) {
    const statusOk = await checkEloStatus();
    if (statusOk) {
      await testRecalculation();
    }
  } else if (args.includes('--status')) {
    await checkEloStatus();
  } else {
    await applyEloFixes();
  }
}

main(); 