const { createClient } = require('@supabase/supabase-js');

// Configuration
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://nkinpmqnbcjaftqduujf.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5raW5wbXFuYmNqYWZ0cWR1dWpmIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0ODEyMDQ3NiwiZXhwIjoyMDYzNjk2NDc2fQ.u8bPszZSVGJku44KFKyRszfL2lZVwv4-EBYc3dgezK4';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

async function recalculateEloRatings() {
  try {
    console.log('🚀 Starting ELO recalculation for all players...');
    console.log('⚠️  This may take several minutes depending on the amount of data');

    // Call the recalculation function
    const { data, error } = await supabase.rpc('recalculate_all_elo_ratings');

    if (error) {
      console.error('❌ ELO recalculation failed:', error);
      process.exit(1);
    }

    console.log('✅ ELO recalculation completed successfully!');
    console.log('📊 Result:', data);

    // Get some stats about the recalculated ratings
    const { data: stats, error: statsError } = await supabase
      .from('elo_leaderboard')
      .select('*')
      .order('weighted_elo', { ascending: false })
      .limit(10);

    if (!statsError && stats) {
      console.log('\n🏆 Top 10 ELO Rankings:');
      console.log('========================');
      stats.forEach((player, index) => {
        console.log(`${index + 1}. ${player.player_name} - ${player.weighted_elo} ELO (${player.elo_tier.name}) - ${player.total_games} games`);
      });
    }

    // Get tier distribution
    const { data: tierStats, error: tierError } = await supabase
      .from('elo_leaderboard')
      .select('elo_tier, count(*)')
      .gte('total_games', 3); // Only players with 3+ games

    if (!tierError && tierStats) {
      console.log('\n📈 Tier Distribution (3+ games):');
      console.log('=================================');
      const tierCounts = {};
      tierStats.forEach(row => {
        const tierName = row.elo_tier?.name || 'Unknown';
        tierCounts[tierName] = (tierCounts[tierName] || 0) + 1;
      });
      
      Object.entries(tierCounts).forEach(([tier, count]) => {
        console.log(`${tier}: ${count} players`);
      });
    }

    console.log('\n🎯 Next steps:');
    console.log('1. Visit /stats/elo to see the ELO leaderboard');
    console.log('2. Import historical data: node import-remote-stats.js');
    console.log('3. ELO will auto-update for new games');

  } catch (error) {
    console.error('❌ Unexpected error:', error);
    process.exit(1);
  }
}

// Test ELO leaderboard API
async function testEloApi() {
  try {
    console.log('🧪 Testing ELO leaderboard API...');
    
    const response = await fetch(`${SUPABASE_URL.replace('https://', 'http://localhost:3000')}/api/player-stats/elo-leaderboard?limit=5`);
    
    if (response.ok) {
      const data = await response.json();
      console.log('✅ API test successful');
      console.log(`📊 Found ${data.pagination.total} players in ELO system`);
    } else {
      console.log('⚠️  API test failed - this is normal if the server is not running');
    }
  } catch (error) {
    console.log('⚠️  API test skipped - server not running');
  }
}

// Check current ELO system status
async function checkEloStatus() {
  try {
    console.log('🔍 Checking ELO system status...');

    // Check if ELO columns exist
    const { data: columns, error: colError } = await supabase
      .from('player_aggregate_stats')
      .select('elo_rating')
      .limit(1);

    if (colError) {
      console.log('❌ ELO columns not found. Run the migration first:');
      console.log('   node run-elo-migration.js --manual');
      return false;
    }

    // Check if we have any ELO data
    const { data: eloData, error: eloError } = await supabase
      .from('player_aggregate_stats')
      .select('elo_rating')
      .not('elo_rating', 'is', null)
      .limit(1);

    if (eloError || !eloData || eloData.length === 0) {
      console.log('⚠️  ELO system is set up but no ratings calculated yet');
      return true;
    }

    console.log('✅ ELO system is active and has data');
    return true;

  } catch (error) {
    console.error('❌ Error checking ELO status:', error);
    return false;
  }
}

// Main execution
async function main() {
  const args = process.argv.slice(2);
  
  if (args.includes('--status')) {
    await checkEloStatus();
  } else if (args.includes('--test')) {
    await testEloApi();
  } else {
    const statusOk = await checkEloStatus();
    if (statusOk) {
      await recalculateEloRatings();
      await testEloApi();
    }
  }
}

main(); 