require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing Supabase environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function setupTestLegacySquad() {
  console.log('🏛️ Setting up Test Legacy Squad System...\n');

  try {
    // 1. Check if the Test squad exists
    console.log('1️⃣ Looking for Test squad...');
    const { data: testSquad, error: squadError } = await supabase
      .from('squads')
      .select('*')
      .eq('id', '0f90abc1-d240-431b-b176-69a9dd55fb4b')
      .single();

    if (squadError) {
      console.error('❌ Error finding Test squad:', squadError.message);
      
      // Try to create the squad if it doesn't exist
      console.log('🔧 Creating Test squad...');
      const { data: newSquad, error: createError } = await supabase
        .from('squads')
        .insert({
          id: '0f90abc1-d240-431b-b176-69a9dd55fb4b',
          name: 'Test',
          tag: 'TEST',
          description: 'Test2',
          captain_id: 'bfa9af64-18a6-4eb4-ba6d-988a62cb051d',
          is_active: false,
          max_members: 20,
          website_link: 'https://freeinf.org',
          banner_url: 'https://nkinpmqnbcjaftqduujf.supabase.co/storage/v1/object/public/avatars/squad-banners/squad-0f90abc1-d240-431b-b176-69a9dd55fb4b-1749491867254.png',
          tournament_eligible: false,
          is_legacy: true
        })
        .select()
        .single();

      if (createError) {
        console.error('❌ Error creating Test squad:', createError.message);
        return;
      }
      
      console.log('✅ Created Test squad:', newSquad);
    } else {
      console.log('✅ Found Test squad:', {
        id: testSquad.id,
        name: testSquad.name,
        tag: testSquad.tag,
        captain_id: testSquad.captain_id,
        is_active: testSquad.is_active,
        is_legacy: testSquad.is_legacy
      });
    }

    // 2. Set the squad as legacy if it isn't already
    if (!testSquad?.is_legacy) {
      console.log('\n2️⃣ Making Test squad legacy...');
      const { error: legacyError } = await supabase
        .from('squads')
        .update({ is_legacy: true })
        .eq('id', '0f90abc1-d240-431b-b176-69a9dd55fb4b');

      if (legacyError) {
        console.error('❌ Error making squad legacy:', legacyError.message);
        return;
      }
      console.log('✅ Test squad is now legacy!');
    } else {
      console.log('✅ Test squad is already legacy!');
    }

    // 3. Check captain profile
    console.log('\n3️⃣ Checking captain profile...');
    const { data: captain, error: captainError } = await supabase
      .from('profiles')
      .select('id, in_game_alias, email')
      .eq('id', 'bfa9af64-18a6-4eb4-ba6d-988a62cb051d')
      .single();

    if (captainError) {
      console.error('❌ Captain not found:', captainError.message);
    } else {
      console.log('✅ Captain found:', captain);
    }

    // 4. Check squad membership
    console.log('\n4️⃣ Checking squad membership...');
    const { data: members, error: membersError } = await supabase
      .from('squad_members')
      .select(`
        id,
        role,
        status,
        joined_at,
        profiles!squad_members_player_id_fkey(in_game_alias)
      `)
      .eq('squad_id', '0f90abc1-d240-431b-b176-69a9dd55fb4b');

    if (membersError) {
      console.error('❌ Error fetching members:', membersError.message);
    } else {
      console.log('✅ Squad members:', members.map(m => ({
        alias: m.profiles?.in_game_alias,
        role: m.role,
        status: m.status,
        joined: new Date(m.joined_at).toLocaleDateString()
      })));
    }

    // 5. Test legacy functions
    console.log('\n5️⃣ Testing legacy system functions...');
    
    // Test can_join_squad function
    const { data: canJoinResult, error: canJoinError } = await supabase
      .rpc('can_join_squad', {
        user_id: 'bfa9af64-18a6-4eb4-ba6d-988a62cb051d',
        target_squad_id: '0f90abc1-d240-431b-b176-69a9dd55fb4b'
      });

    if (canJoinError) {
      console.error('❌ Error testing can_join_squad:', canJoinError.message);
    } else {
      console.log('✅ Can captain join their own legacy squad:', canJoinResult);
    }

    // Test get_user_legacy_squads function
    const { data: legacySquads, error: legacyError } = await supabase
      .rpc('get_user_legacy_squads', {
        user_id: 'bfa9af64-18a6-4eb4-ba6d-988a62cb051d'
      });

    if (legacyError) {
      console.error('❌ Error testing get_user_legacy_squads:', legacyError.message);
    } else {
      console.log('✅ Captain\'s legacy squads:', legacySquads);
    }

    // Test get_user_active_squad function
    const { data: activeSquad, error: activeError } = await supabase
      .rpc('get_user_active_squad', {
        user_id: 'bfa9af64-18a6-4eb4-ba6d-988a62cb051d'
      });

    if (activeError) {
      console.error('❌ Error testing get_user_active_squad:', activeError.message);
    } else {
      console.log('✅ Captain\'s active squad:', activeSquad);
    }

    // Test can_be_free_agent function
    const { data: canBeFreeAgent, error: freeAgentError } = await supabase
      .rpc('can_be_free_agent', {
        user_id: 'bfa9af64-18a6-4eb4-ba6d-988a62cb051d'
      });

    if (freeAgentError) {
      console.error('❌ Error testing can_be_free_agent:', freeAgentError.message);
    } else {
      console.log('✅ Can captain be free agent (should be true for legacy-only):', canBeFreeAgent);
    }

    // 6. Display current squad stats
    console.log('\n6️⃣ Current squad statistics...');
    const { data: allSquads, error: statsError } = await supabase
      .from('squads')
      .select('is_active, is_legacy');

    if (statsError) {
      console.error('❌ Error fetching squad stats:', statsError.message);
    } else {
      const stats = {
        total: allSquads.length,
        active: allSquads.filter(s => s.is_active && !s.is_legacy).length,
        inactive: allSquads.filter(s => !s.is_active && !s.is_legacy).length,
        legacy: allSquads.filter(s => s.is_legacy).length
      };
      console.log('✅ Squad Statistics:', stats);
    }

    console.log('\n🎉 Test Legacy Squad setup complete!');
    console.log('\n📋 Next Steps:');
    console.log('1. Visit /admin/squads to see the legacy squad in action');
    console.log('2. Test joining the legacy squad as different users');
    console.log('3. Verify that legacy squad members can still join active squads');
    console.log('4. Check that legacy squad members appear in free agent pool');

  } catch (error) {
    console.error('❌ Unexpected error:', error);
  }
}

// Run the setup
setupTestLegacySquad(); 