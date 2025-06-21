require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function debugTonySquadMemberships() {
  console.log('🔍 Investigating Tony\'s squad memberships...\n');

  try {
    // First, find Tony's profile
    console.log('1. Finding Tony\'s profile...');
    const { data: profiles, error: profileError } = await supabase
      .from('profiles')
      .select('id, in_game_alias, email')
      .ilike('in_game_alias', '%tony%');

    if (profileError) {
      console.error('Error fetching profiles:', profileError);
      return;
    }

    console.log('Found profiles with "tony" in alias:');
    profiles.forEach(profile => {
      console.log(`  - ${profile.in_game_alias} (ID: ${profile.id})`);
    });

    // Check each Tony profile
    for (const profile of profiles) {
      console.log(`\n2. Checking squad memberships for ${profile.in_game_alias}...`);
      
      const { data: memberships, error: membershipError } = await supabase
        .from('squad_members')
        .select(`
          id,
          status,
          role,
          joined_at,
          squads!inner(
            id,
            name,
            tag,
            is_active,
            is_legacy
          )
        `)
        .eq('player_id', profile.id);

      if (membershipError) {
        console.error('Error fetching memberships:', membershipError);
        continue;
      }

      console.log(`Found ${memberships.length} squad memberships:`);
      memberships.forEach(membership => {
        const squad = membership.squads;
        console.log(`  - Squad: ${squad.name} [${squad.tag}]`);
        console.log(`    Status: ${membership.status}`);
        console.log(`    Role: ${membership.role}`);
        console.log(`    Squad Active: ${squad.is_active}`);
        console.log(`    Squad Legacy: ${squad.is_legacy}`);
        console.log(`    Joined: ${new Date(membership.joined_at).toLocaleDateString()}`);
        console.log(`    Membership ID: ${membership.id}`);
        console.log('');
      });

      // Check for active memberships specifically
      const activeMemberships = memberships.filter(m => m.status === 'active');
      console.log(`Active memberships: ${activeMemberships.length}`);
      
      if (activeMemberships.length > 1) {
        console.log('⚠️  ISSUE FOUND: Multiple active squad memberships!');
        activeMemberships.forEach((membership, index) => {
          const squad = membership.squads;
          console.log(`  ${index + 1}. ${squad.name} [${squad.tag}] - Legacy: ${squad.is_legacy}, Active: ${squad.is_active}`);
        });

        // Check if this is allowed (one legacy + one active)
        const legacyCount = activeMemberships.filter(m => m.squads.is_legacy).length;
        const nonLegacyCount = activeMemberships.filter(m => !m.squads.is_legacy).length;
        
        console.log(`Legacy squads: ${legacyCount}, Non-legacy squads: ${nonLegacyCount}`);
        
        if (nonLegacyCount > 1) {
          console.log('❌ VIOLATION: User has multiple active non-legacy squad memberships!');
        } else if (legacyCount <= 1 && nonLegacyCount <= 1) {
          console.log('✅ This is allowed: User can be in one legacy and one active squad');
        }
      } else if (activeMemberships.length === 1) {
        console.log('✅ Normal: User has exactly one active squad membership');
      } else {
        console.log('ℹ️  User has no active squad memberships');
      }
    }

    // 3. Check the specific squads mentioned
    console.log('\n3. Checking Pure Talent and Apex Predators squad details...');
    const { data: squads, error: squadError } = await supabase
      .from('squads')
      .select('id, name, tag, is_active, is_legacy, created_at')
      .in('name', ['Pure Talent', 'Apex Predators']);

    if (squadError) {
      console.error('Error fetching squads:', squadError);
      return;
    }

    squads.forEach(squad => {
      console.log(`Squad: ${squad.name} [${squad.tag}]`);
      console.log(`  Active: ${squad.is_active}`);
      console.log(`  Legacy: ${squad.is_legacy}`);
      console.log(`  Created: ${new Date(squad.created_at).toLocaleDateString()}`);
      console.log('');
    });

    // 4. Check all members of these squads
    console.log('4. Checking all members of Pure Talent and Apex Predators...');
    for (const squad of squads) {
      console.log(`\nMembers of ${squad.name}:`);
      
      const { data: members, error: memberError } = await supabase
        .from('squad_members')
        .select(`
          status,
          role,
          joined_at,
          profiles!inner(
            in_game_alias
          )
        `)
        .eq('squad_id', squad.id);

      if (memberError) {
        console.error('Error fetching members:', memberError);
        continue;
      }

      members.forEach(member => {
        console.log(`  - ${member.profiles.in_game_alias} (${member.status}, ${member.role})`);
      });
    }

    // 5. Look for any users with multiple active memberships
    console.log('\n5. Checking for ALL users with multiple active squad memberships...');
    const { data: allMemberships, error: allError } = await supabase
      .from('squad_members')
      .select(`
        player_id,
        status,
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

    if (allError) {
      console.error('Error fetching all memberships:', allError);
      return;
    }

    // Group by player_id
    const userMemberships = {};
    allMemberships.forEach(membership => {
      const userId = membership.player_id;
      if (!userMemberships[userId]) {
        userMemberships[userId] = {
          alias: membership.profiles.in_game_alias,
          memberships: []
        };
      }
      userMemberships[userId].memberships.push(membership);
    });

    // Find users with multiple active memberships
    const multipleMembers = Object.entries(userMemberships).filter(([userId, data]) => data.memberships.length > 1);
    
    console.log(`Found ${multipleMembers.length} users with multiple active squad memberships:`);
    multipleMembers.forEach(([userId, data]) => {
      console.log(`\n👤 ${data.alias} (ID: ${userId}):`);
      data.memberships.forEach(membership => {
        const squad = membership.squads;
        console.log(`  - ${squad.name} [${squad.tag}] (Legacy: ${squad.is_legacy}, Active: ${squad.is_active})`);
      });
      
      // Check if this is a violation
      const nonLegacyCount = data.memberships.filter(m => !m.squads.is_legacy).length;
      if (nonLegacyCount > 1) {
        console.log(`  ❌ VIOLATION: ${nonLegacyCount} non-legacy squads!`);
      } else {
        console.log(`  ✅ Allowed: Can be in legacy + active squad`);
      }
    });

  } catch (error) {
    console.error('Error during investigation:', error);
  }
}

debugTonySquadMemberships(); 