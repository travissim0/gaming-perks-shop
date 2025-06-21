require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function fixTonyAndCheckDuplicates() {
  console.log('🔧 Fixing Tony\'s duplicate squad memberships and checking for others...\n');

  try {
    // 1. First, let's find all users with multiple non-legacy active squad memberships
    console.log('1. Finding all users with duplicate non-legacy squad memberships...');
    
    const { data: duplicateUsers, error: duplicateError } = await supabase.rpc('get_duplicate_squad_members');
    
    if (duplicateError) {
      // If the RPC doesn't exist, use raw query
      console.log('Using direct query...');
      
      const { data: allMemberships, error: membershipError } = await supabase
        .from('squad_members')
        .select(`
          player_id,
          status,
          joined_at,
          id,
          squads!inner(
            name,
            tag,
            is_legacy,
            is_active
          ),
          profiles!inner(
            in_game_alias
          )
        `)
        .eq('status', 'active');

      if (membershipError) {
        console.error('Error fetching memberships:', membershipError);
        return;
      }

      // Group by player_id and find duplicates
      const userMemberships = {};
      allMemberships.forEach(membership => {
        const playerId = membership.player_id;
        if (!userMemberships[playerId]) {
          userMemberships[playerId] = {
            alias: membership.profiles.in_game_alias,
            memberships: []
          };
        }
        userMemberships[playerId].memberships.push(membership);
      });

      // Find users with multiple non-legacy active memberships
      const violations = [];
      Object.entries(userMemberships).forEach(([playerId, data]) => {
        const nonLegacyCount = data.memberships.filter(m => !m.squads.is_legacy && m.squads.is_active).length;
        if (nonLegacyCount > 1) {
          violations.push({
            player_id: playerId,
            alias: data.alias,
            memberships: data.memberships,
            non_legacy_count: nonLegacyCount
          });
        }
      });

      console.log(`Found ${violations.length} users with multiple non-legacy squad memberships:`);
      violations.forEach(violation => {
        console.log(`\n👤 ${violation.alias} (ID: ${violation.player_id}):`);
        console.log(`   Non-legacy squads: ${violation.non_legacy_count}`);
        violation.memberships.forEach(membership => {
          const squad = membership.squads;
          console.log(`   - ${squad.name} [${squad.tag}] (Legacy: ${squad.is_legacy}, Joined: ${new Date(membership.joined_at).toLocaleDateString()})`);
        });
      });

      // 2. Specifically handle Tony
      console.log('\n2. Handling Tony\'s duplicate memberships...');
      const tonyViolation = violations.find(v => v.alias.toLowerCase().includes('tony'));
      
      if (tonyViolation) {
        console.log(`Found Tony: ${tonyViolation.alias}`);
        
        // Find Tony's memberships in Apex Predators and Pure Talent
        const apexMembership = tonyViolation.memberships.find(m => m.squads.name === 'Apex Predators');
        const pureTalentMembership = tonyViolation.memberships.find(m => m.squads.name === 'Pure Talent');
        
        if (apexMembership && pureTalentMembership) {
          console.log('\nTony is in both Apex Predators and Pure Talent. Removing from Apex Predators...');
          
          // Remove Tony from Apex Predators by setting status to 'left'
          const { error: updateError } = await supabase
            .from('squad_members')
            .update({
              status: 'left',
              left_at: new Date().toISOString()
            })
            .eq('id', apexMembership.id);

          if (updateError) {
            console.error('Error removing Tony from Apex Predators:', updateError);
          } else {
            console.log('✅ Successfully removed Tony from Apex Predators');
            
            // Log the change
            console.log(`   Membership ID ${apexMembership.id} status changed to 'left'`);
            console.log(`   Tony remains in Pure Talent (joined: ${new Date(pureTalentMembership.joined_at).toLocaleDateString()})`);
          }
        } else {
          console.log('⚠️  Could not find Tony in both expected squads');
        }
      } else {
        console.log('No Tony found in violations list');
      }

      // 3. Report on other violations
      console.log('\n3. Other users that need attention:');
      const otherViolations = violations.filter(v => !v.alias.toLowerCase().includes('tony'));
      
      if (otherViolations.length === 0) {
        console.log('✅ No other users have duplicate non-legacy squad memberships');
      } else {
        console.log(`⚠️  ${otherViolations.length} other users need manual review:`);
        otherViolations.forEach(violation => {
          console.log(`\n👤 ${violation.alias}:`);
          violation.memberships.forEach(membership => {
            const squad = membership.squads;
            if (!squad.is_legacy) {
              console.log(`   - ${squad.name} [${squad.tag}] (Joined: ${new Date(membership.joined_at).toLocaleDateString()}) - ID: ${membership.id}`);
            }
          });
        });
      }

      // 4. Verify the fix worked
      console.log('\n4. Verifying Tony\'s current squad status...');
      const { data: tonyCheck, error: checkError } = await supabase
        .from('squad_members')
        .select(`
          status,
          squads!inner(
            name,
            tag,
            is_legacy
          )
        `)
        .eq('player_id', tonyViolation?.player_id)
        .eq('status', 'active');

      if (checkError) {
        console.error('Error checking Tony\'s status:', checkError);
      } else {
        console.log('Tony\'s current active squad memberships:');
        tonyCheck.forEach(membership => {
          console.log(`   - ${membership.squads.name} [${membership.squads.tag}] (Legacy: ${membership.squads.is_legacy})`);
        });
      }
    }

  } catch (error) {
    console.error('Unexpected error:', error);
  }
}

// Run the fix
fixTonyAndCheckDuplicates(); 