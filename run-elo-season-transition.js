require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

// Configuration
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://nkinpmqnbcjaftqduujf.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5raW5wbXFuYmNqYWZ0cWR1dWpmIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0ODEyMDQ3NiwiZXhwIjoyMDYzNjk2NDc2fQ.u8bPszZSVGJku44KFKyRszfL2lZVwv4-EBYc3dgezK4';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

async function runSeasonTransition() {
  try {
    console.log('🏆 Starting ELO Season Transition: Q2-2025 → Q3-2025');
    console.log('=====================================');
    
    // Check current season status
    console.log('\n📊 Checking current season status...');
    const { data: seasons, error: seasonsError } = await supabase
      .from('elo_seasons')
      .select('*')
      .order('created_at', { ascending: false });
    
    if (seasonsError) {
      console.error('❌ Error checking seasons:', seasonsError);
      process.exit(1);
    }
    
    if (seasons) {
      console.log('Current seasons:');
      seasons.forEach(season => {
        const status = season.is_active ? '✅ ACTIVE' : '⏸️  Inactive';
        console.log(`  ${status} ${season.season_name}: ${season.start_date} to ${season.end_date || 'ongoing'}`);
      });
    }
    
    // Check current player stats
    console.log('\n📈 Checking current player statistics...');
    const { data: currentStats, error: statsError } = await supabase
      .from('player_aggregate_stats')
      .select('season, count(*)')
      .not('season', 'is', null);
    
    if (!statsError && currentStats) {
      console.log('Current player records by season:');
      const seasonCounts = currentStats.reduce((acc, stat) => {
        acc[stat.season] = (acc[stat.season] || 0) + 1;
        return acc;
      }, {});
      
      Object.entries(seasonCounts).forEach(([season, count]) => {
        console.log(`  ${season}: ${count} records`);
      });
    }
    
    // Ask for confirmation unless --force flag is provided
    if (!process.argv.includes('--force')) {
      console.log('\n⚠️  WARNING: This will:');
      console.log('   1. Archive all current ELO data as Q2-2025');
      console.log('   2. Reset Q3-2025 season with 15% ELO influence from Q2-2025');
      console.log('   3. Reset all player stats except ELO (with soft reset)');
      console.log('\nTo proceed, add --force flag to the command');
      console.log('Example: node run-elo-season-transition.js --force');
      process.exit(0);
    }
    
    console.log('\n🚀 Executing season transition...');
    
    // Execute the transition
    const { data, error } = await supabase.rpc('transition_to_q3_2025');
    
    if (error) {
      console.error('❌ Season transition failed:', error);
      process.exit(1);
    }
    
    console.log('✅ Season transition completed successfully!');
    console.log('📋 Result:', data);
    
    // Get updated statistics
    console.log('\n📊 Updated season statistics:');
    const { data: newSeasons, error: newSeasonsError } = await supabase
      .from('elo_seasons')
      .select('*')
      .order('created_at', { ascending: false });
    
    if (!newSeasonsError && newSeasons) {
      newSeasons.forEach(season => {
        const status = season.is_active ? '✅ ACTIVE' : '⏸️  Inactive';
        console.log(`  ${status} ${season.season_name}: ${season.start_date} to ${season.end_date || 'ongoing'}`);
      });
    }
    
    // Check Q3-2025 leaderboard
    console.log('\n🏆 Q3-2025 Season Leaderboard (Top 10):');
    const { data: leaderboard, error: leaderboardError } = await supabase
      .from('elo_leaderboard')
      .select('*')
      .eq('season', 'Q3-2025')
      .order('weighted_elo', { ascending: false })
      .limit(10);
    
    if (!leaderboardError && leaderboard && leaderboard.length > 0) {
      leaderboard.forEach((player, index) => {
        const influence = player.season_influence ? ` (${(player.season_influence * 100).toFixed(0)}% from Q2)` : '';
        const archived = player.archived_elo ? ` [was ${Math.round(player.archived_elo)}]` : '';
        console.log(`${index + 1}. ${player.player_name} - ${Math.round(player.weighted_elo)} ELO${archived}${influence}`);
      });
    } else {
      console.log('   No players yet - season is fresh!');
    }
    
    // Show Q2-2025 archive
    console.log('\n🗄️  Q2-2025 Archive (Top 5):');
    const { data: archive, error: archiveError } = await supabase
      .from('player_aggregate_stats')
      .select('player_name, game_mode, elo_rating, total_games')
      .eq('season', 'Q2-2025')
      .order('elo_rating', { ascending: false })
      .limit(5);
    
    if (!archiveError && archive && archive.length > 0) {
      archive.forEach((player, index) => {
        console.log(`${index + 1}. ${player.player_name} - ${Math.round(player.elo_rating)} ELO (${player.total_games} games, ${player.game_mode})`);
      });
    } else {
      console.log('   No archived data found');
    }
    
    console.log('\n✨ Season transition complete!');
    console.log('🎮 Players can now start building their Q3-2025 rankings!');
    console.log('📈 ELO will be influenced by Q2-2025 performance but with fresh competition');
    
  } catch (error) {
    console.error('❌ Unexpected error during season transition:', error);
    process.exit(1);
  }
}

// Handle command line arguments
if (process.argv.includes('--help') || process.argv.includes('-h')) {
  console.log('ELO Season Transition Tool');
  console.log('==========================');
  console.log('');
  console.log('Usage: node run-elo-season-transition.js [options]');
  console.log('');
  console.log('Options:');
  console.log('  --force    Execute the transition without confirmation');
  console.log('  --help     Show this help message');
  console.log('');
  console.log('What this does:');
  console.log('1. Archives all current ELO data as Q2-2025 season');
  console.log('2. Resets Q3-2025 with 15% influence from previous season');
  console.log('3. Resets all player statistics except ELO (soft reset)');
  console.log('4. Marks Q3-2025 as the active season');
  console.log('');
  console.log('Example:');
  console.log('  node run-elo-season-transition.js --force');
  process.exit(0);
}

// Run the transition
runSeasonTransition(); 