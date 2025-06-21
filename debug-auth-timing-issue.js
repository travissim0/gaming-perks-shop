require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function debugAuthTimingIssues() {
  console.log('🔍 DEBUGGING AUTH TIMING ISSUES ON FREE AGENTS PAGE\n');
  
  try {
    // 1. Test basic Supabase connection
    console.log('1️⃣ Testing Supabase connection...');
    const { data: connectionTest, error: connectionError } = await supabase
      .from('profiles')
      .select('count')
      .limit(1);
    
    if (connectionError) {
      console.error('❌ Connection error:', connectionError.message);
      return;
    }
    console.log('✅ Supabase connection working\n');
    
    // 2. Check profiles table structure
    console.log('2️⃣ Checking profiles table structure...');
    let tableInfo, tableError;
    try {
      const result = await supabase.rpc('get_table_columns', { table_name: 'profiles' });
      tableInfo = result.data;
      tableError = result.error;
    } catch (rpcError) {
      // Fallback: try to get sample profile
      const result = await supabase
        .from('profiles')
        .select('*')
        .limit(1)
        .single();
      tableInfo = result.data;
      tableError = result.error;
    }
    
    if (tableError) {
      console.warn('⚠️ Could not get table structure:', tableError.message);
    } else {
      console.log('✅ Profiles table accessible');
      if (tableInfo && typeof tableInfo === 'object') {
        console.log('📋 Sample profile fields:', Object.keys(tableInfo));
      }
    }
    console.log('');
    
    // 3. Test auth session retrieval (simulating client-side auth check)
    console.log('3️⃣ Testing auth session simulation...');
    
    // This simulates what happens in the AuthContext
    const sessionStart = Date.now();
    try {
      // Simulate the session check that happens in AuthContext
      const mockSessionCheck = async () => {
        // This would normally be supabase.auth.getSession() on client
        // But we can't test that server-side, so we'll test basic auth operations
        const { data: users, error: usersError } = await supabase.auth.admin.listUsers();
        if (usersError) throw usersError;
        return users.users.length > 0;
      };
      
      const hasUsers = await mockSessionCheck();
      const sessionTime = Date.now() - sessionStart;
      
      console.log(`✅ Auth system responsive: ${sessionTime}ms`);
      console.log(`📊 Total users in system: ${hasUsers ? 'Available' : 'None'}\n`);
      
    } catch (authError) {
      const sessionTime = Date.now() - sessionStart;
      console.error(`❌ Auth system error (${sessionTime}ms):`, authError.message, '\n');
    }
    
    // 4. Test profile loading speed (simulating loadUserProfile)
    console.log('4️⃣ Testing profile loading speed...');
    
    // Get a sample user to test with
    const { data: sampleUsers, error: sampleError } = await supabase.auth.admin.listUsers();
    if (sampleError || !sampleUsers.users.length) {
      console.warn('⚠️ No users found to test profile loading\n');
    } else {
      const testUserId = sampleUsers.users[0].id;
      const profileStart = Date.now();
      
      try {
        const { data: profile, error: profileError } = await supabase
          .from('profiles')
          .select('id, in_game_alias, is_league_banned, hide_from_free_agents')
          .eq('id', testUserId)
          .single();
        
        const profileTime = Date.now() - profileStart;
        
        if (profileError) {
          console.error(`❌ Profile loading error (${profileTime}ms):`, profileError.message);
        } else {
          console.log(`✅ Profile loaded successfully (${profileTime}ms)`);
          console.log('📋 Profile data:', {
            id: profile.id,
            alias: profile.in_game_alias,
            banned: profile.is_league_banned,
            hidden: profile.hide_from_free_agents
          });
        }
      } catch (error) {
        console.error('❌ Profile loading exception:', error.message);
      }
    }
    console.log('');
    
    // 5. Test visibility toggle operation speed
    console.log('5️⃣ Testing visibility toggle operation...');
    if (sampleUsers && sampleUsers.users.length > 0) {
      const testUserId = sampleUsers.users[0].id;
      const toggleStart = Date.now();
      
      try {
        // Read current value
        const { data: currentProfile, error: readError } = await supabase
          .from('profiles')
          .select('hide_from_free_agents')
          .eq('id', testUserId)
          .single();
        
        if (readError) {
          console.error('❌ Read error:', readError.message);
        } else {
          const currentValue = currentProfile.hide_from_free_agents || false;
          console.log('📖 Current visibility value:', currentValue);
          
          // Perform toggle (then toggle back)
          const newValue = !currentValue;
          const { error: updateError } = await supabase
            .from('profiles')
            .update({ hide_from_free_agents: newValue })
            .eq('id', testUserId);
          
          if (updateError) {
            console.error('❌ Update error:', updateError.message);
          } else {
            // Verify update
            const { data: verifyProfile, error: verifyError } = await supabase
              .from('profiles')
              .select('hide_from_free_agents')
              .eq('id', testUserId)
              .single();
            
            if (verifyError) {
              console.error('❌ Verify error:', verifyError.message);
            } else {
              const toggleTime = Date.now() - toggleStart;
              console.log(`✅ Toggle operation completed (${toggleTime}ms)`);
              console.log('🔄 Value changed:', currentValue, '→', verifyProfile.hide_from_free_agents);
              
              // Toggle back to original
              await supabase
                .from('profiles')
                .update({ hide_from_free_agents: currentValue })
                .eq('id', testUserId);
              console.log('🔄 Restored original value');
            }
          }
        }
      } catch (error) {
        console.error('❌ Toggle test exception:', error.message);
      }
    }
    console.log('');
    
    // 6. Test data loading functions (simulating getFreeAgents and getAllPlayers)
    console.log('6️⃣ Testing data loading functions...');
    
    const dataStart = Date.now();
    try {
      const [freeAgentsResult, allPlayersResult] = await Promise.all([
        supabase
          .from('free_agents')
          .select(`
            *,
            profiles!free_agents_player_id_fkey (
              id,
              in_game_alias,
              hide_from_free_agents
            )
          `),
        supabase
          .from('profiles')
          .select('id, in_game_alias, email, created_at, hide_from_free_agents')
          .eq('hide_from_free_agents', false) // This should work if column exists
      ]);
      
      const dataTime = Date.now() - dataStart;
      
      console.log(`✅ Data loading completed (${dataTime}ms)`);
      console.log('📊 Free agents count:', freeAgentsResult.data?.length || 0);
      console.log('📊 Visible players count:', allPlayersResult.data?.length || 0);
      
      if (freeAgentsResult.error) {
        console.error('❌ Free agents error:', freeAgentsResult.error.message);
      }
      if (allPlayersResult.error) {
        console.error('❌ All players error:', allPlayersResult.error.message);
      }
    } catch (error) {
      console.error('❌ Data loading exception:', error.message);
    }
    console.log('');
    
    // 7. Performance summary and recommendations
    console.log('7️⃣ PERFORMANCE ANALYSIS & RECOMMENDATIONS\n');
    
    console.log('🔍 POTENTIAL AUTH TIMING ISSUES:');
    console.log('- AuthContext may be stuck in loading state due to slow session checks');
    console.log('- Multiple re-renders causing performance issues');
    console.log('- Profile loading happening before auth is fully resolved\n');
    
    console.log('💡 RECOMMENDED FIXES:');
    console.log('1. Add timeout handling to AuthContext session checks');
    console.log('2. Implement proper loading states to prevent premature renders');
    console.log('3. Add auth state debugging to identify where loading gets stuck');
    console.log('4. Consider using a more robust auth state management approach');
    console.log('5. Add retry logic for failed auth operations\n');
    
    console.log('🚀 NEXT STEPS:');
    console.log('1. Check browser console for auth-related errors');
    console.log('2. Verify JWT token validity and expiration');
    console.log('3. Test with different browsers/devices');
    console.log('4. Monitor network requests for failed auth calls');
    console.log('5. Consider implementing auth state persistence');
    
  } catch (error) {
    console.error('❌ DEBUG SCRIPT ERROR:', error.message);
  }
}

debugAuthTimingIssues().catch(console.error); 