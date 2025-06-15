const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

// Load Supabase config
const config = JSON.parse(fs.readFileSync('supabase-config.json', 'utf8'));
const supabase = createClient(config.supabase.url, config.supabase.service_role_key);

async function fixOvDSideAssignments() {
  console.log('🔧 Fixing OvD side assignment issues...\n');

  try {
    // First, let's see the current problematic OvD games
    console.log('📊 Checking current OvD games with incorrect side assignments...');
    
    const { data: problemGames, error: problemError } = await supabase
      .from('player_stats')
      .select('game_id, team, side, player_name')
      .eq('game_mode', 'OvD');

    if (problemError) {
      throw problemError;
    }

    // Group by game and team to analyze
    const gameAnalysis = {};
    problemGames.forEach(player => {
      if (!gameAnalysis[player.game_id]) {
        gameAnalysis[player.game_id] = {};
      }
      if (!gameAnalysis[player.game_id][player.team]) {
        gameAnalysis[player.game_id][player.team] = { offense: [], defense: [] };
      }
      gameAnalysis[player.game_id][player.team][player.side].push(player);
    });

    // Find games with incorrect assignments
    const corrections = [];
    let problemCount = 0;

    Object.keys(gameAnalysis).forEach(gameId => {
      const teams = gameAnalysis[gameId];
      Object.keys(teams).forEach(teamName => {
        const team = teams[teamName];
        const offenseCount = team.offense.length;
        const defenseCount = team.defense.length;
        const totalPlayers = offenseCount + defenseCount;

        // If team doesn't have exactly 5 players all on the same side, it's a problem
        if (totalPlayers === 5 && (offenseCount !== 5 && defenseCount !== 5)) {
          problemCount++;
          console.log(`❌ Problem found in ${gameId}, team ${teamName}: ${offenseCount} offense, ${defenseCount} defense`);
          
          // Determine what this team should be based on majority
          const shouldBeSide = offenseCount >= defenseCount ? 'offense' : 'defense';
          const playersToFix = shouldBeSide === 'offense' ? team.defense : team.offense;
          
          playersToFix.forEach(player => {
            corrections.push({
              game_id: gameId,
              team: teamName,
              player_name: player.player_name,
              current_side: player.side,
              correct_side: shouldBeSide
            });
          });
        }
      });
    });

    console.log(`\n📈 Found ${problemCount} teams with incorrect side assignments`);
    console.log(`🔧 Need to fix ${corrections.length} individual player records\n`);

    if (corrections.length === 0) {
      console.log('✅ No corrections needed! All OvD games have proper side assignments.');
      return;
    }

    // Show what we're going to fix
    console.log('🔄 Corrections to be made:');
    corrections.forEach(fix => {
      console.log(`  ${fix.game_id} | ${fix.team} | ${fix.player_name}: ${fix.current_side} → ${fix.correct_side}`);
    });

    // Apply the corrections
    console.log('\n🚀 Applying corrections...');
    
    for (const fix of corrections) {
      const { error: updateError } = await supabase
        .from('player_stats')
        .update({ side: fix.correct_side })
        .eq('game_id', fix.game_id)
        .eq('team', fix.team)
        .eq('player_name', fix.player_name)
        .eq('side', fix.current_side);

      if (updateError) {
        console.error(`❌ Error updating ${fix.player_name}:`, updateError);
      } else {
        console.log(`✅ Fixed ${fix.player_name} in ${fix.game_id}`);
      }
    }

    // Verify the fix worked
    console.log('\n🔍 Verifying corrections...');
    
    const { data: verifyData, error: verifyError } = await supabase
      .from('player_stats')
      .select('game_id, team, side, player_name')
      .eq('game_mode', 'OvD');

    if (verifyError) {
      throw verifyError;
    }

    // Re-analyze after fix
    const postFixAnalysis = {};
    verifyData.forEach(player => {
      if (!postFixAnalysis[player.game_id]) {
        postFixAnalysis[player.game_id] = {};
      }
      if (!postFixAnalysis[player.game_id][player.team]) {
        postFixAnalysis[player.game_id][player.team] = { offense: 0, defense: 0 };
      }
      postFixAnalysis[player.game_id][player.team][player.side]++;
    });

    // Check for remaining problems
    let remainingProblems = 0;
    Object.keys(postFixAnalysis).forEach(gameId => {
      const teams = postFixAnalysis[gameId];
      Object.keys(teams).forEach(teamName => {
        const team = teams[teamName];
        if (team.offense !== 5 && team.defense !== 5) {
          remainingProblems++;
          console.log(`⚠️  Still problematic: ${gameId}, team ${teamName}: ${team.offense} offense, ${team.defense} defense`);
        }
      });
    });

    if (remainingProblems === 0) {
      console.log('\n🎉 Success! All OvD games now have proper 5v5 side assignments.');
    } else {
      console.log(`\n⚠️  ${remainingProblems} teams still have issues. Manual review may be needed.`);
    }

    // Show summary statistics
    const gameCount = Object.keys(postFixAnalysis).length;
    console.log(`\n📊 Summary: ${gameCount} OvD games processed`);
    console.log(`✅ ${corrections.length} player records corrected`);

  } catch (error) {
    console.error('❌ Error fixing OvD side assignments:', error);
  }
}

// Run the fix
fixOvDSideAssignments(); 