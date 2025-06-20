require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function debugSquadMembership() {
  try {
    console.log('🔍 Debugging Squad Membership Status...\n');

    // Find Axidus
    const { data: axidusProfile, error: profileError } = await supabase
      .from('profiles')
      .select('id, in_game_alias')
      .eq('in_game_alias', 'Axidus')
      .single();

    if (profileError || !axidusProfile) {
      console.error('❌ Error finding Axidus profile:', profileError);
      return;
    }

    console.log('✅ Found Axidus:', axidusProfile);

    // Find the TEST legacy squad
    const { data: testSquad, error: squadError } = await supabase
      .from('squads')
      .select('id, name, tag, is_legacy')
      .eq('name', '[TEST] Test')
      .single();

    if (squadError || !testSquad) {
      console.error('❌ Error finding TEST squad:', squadError);
      return;
    }

    console.log('✅ Found TEST squad:', testSquad);

    // Check ALL squad memberships for Axidus (any status)
    const { data: allMemberships, error: membershipError } = await supabase
      .from('squad_members')
      .select(`
        id,
        squad_id,
        player_id,
        role,
        status,
        joined_at,
        squads!squad_members_squad_id_fkey(name, tag, is_legacy)
      `)
      .eq('player_id', axidusProfile.id);

    if (membershipError) {
      console.error('❌ Error getting memberships:', membershipError);
      return;
    }

    console.log('🛡️ All Squad Memberships for Axidus:');
    console.log('Total memberships:', allMemberships?.length || 0);
    allMemberships?.forEach((membership, index) => {
      console.log(`\n${index + 1}. Squad: ${membership.squads.name} (${membership.squads.tag})`);
      console.log(`   - ID: ${membership.squad_id}`);
      console.log(`   - Role: ${membership.role}`);
      console.log(`   - Status: ${membership.status}`);
      console.log(`   - Is Legacy: ${membership.squads.is_legacy}`);
      console.log(`   - Joined: ${membership.joined_at}`);
    });

    // Check specifically for the TEST squad membership
    const testMembership = allMemberships?.find(m => m.squad_id === testSquad.id);
    if (testMembership) {
      console.log('\n✅ Found Axidus membership in TEST squad:');
      console.log('   - Role:', testMembership.role);
      console.log('   - Status:', testMembership.status);
      console.log('   - Joined:', testMembership.joined_at);
      
      if (testMembership.status !== 'active') {
        console.log('\n🚨 ISSUE FOUND: Membership status is not "active"!');
        console.log('   This explains why Axidus is not showing as a member on the squad page.');
        console.log('   The getSquadMembers query filters for status = "active" only.');
      }
    } else {
      console.log('\n❌ No membership found for Axidus in TEST squad!');
    }

    // Test the actual getSquadMembers query that the frontend uses
    console.log('\n🔍 Testing frontend getSquadMembers query...');
    const { data: frontendMembers, error: frontendError } = await supabase
      .from('squad_members')
      .select(`
        id,
        player_id,
        role,
        joined_at,
        status,
        profiles!squad_members_player_id_fkey(in_game_alias)
      `)
      .eq('squad_id', testSquad.id)
      .eq('status', 'active')
      .order('joined_at', { ascending: true });

    if (frontendError) {
      console.error('❌ Frontend query error:', frontendError);
    } else {
      console.log('✅ Frontend query results:');
      console.log('Members count:', frontendMembers?.length || 0);
      frontendMembers?.forEach((member, index) => {
        console.log(`${index + 1}. ${member.profiles?.in_game_alias} (${member.role}) - Status: ${member.status}`);
      });
      
      const axidusInFrontend = frontendMembers?.find(m => m.player_id === axidusProfile.id);
      if (axidusInFrontend) {
        console.log('✅ Axidus IS showing in frontend query');
      } else {
        console.log('❌ Axidus is NOT showing in frontend query');
      }
    }

  } catch (error) {
    console.error('❌ Unexpected error:', error);
  }
}

debugSquadMembership(); 