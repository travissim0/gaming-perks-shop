// Test script to verify online users functionality works after RLS fix
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function testOnlineUsers() {
  console.log('🧪 Testing online users functionality...');
  
  try {
    // Test 1: Basic profiles query
    console.log('\n1️⃣ Testing basic profiles access...');
    const { data: profiles, error: profilesError } = await supabase
      .from('profiles')
      .select('id, in_game_alias, email, last_seen')
      .limit(5);
    
    if (profilesError) {
      console.log('❌ Profiles query failed:', profilesError);
      return false;
    } else {
      console.log('✅ Profiles query successful:', profiles?.length || 0, 'profiles found');
    }

    // Test 2: Recent activity query (simulating online users)
    console.log('\n2️⃣ Testing recent activity query...');
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    const { data: recentUsers, error: recentError } = await supabase
      .from('profiles')
      .select('id, in_game_alias, last_seen')
      .gte('last_seen', fiveMinutesAgo)
      .order('last_seen', { ascending: false })
      .limit(10);
    
    if (recentError) {
      console.log('❌ Recent users query failed:', recentError);
      return false;
    } else {
      console.log('✅ Recent users query successful:', recentUsers?.length || 0, 'recent users found');
    }

    // Test 3: Squad members query
    console.log('\n3️⃣ Testing squad members access...');
    const { data: squadMembers, error: squadError } = await supabase
      .from('squad_members')
      .select('*')
      .limit(5);
    
    if (squadError) {
      console.log('❌ Squad members query failed:', squadError);
      return false;
    } else {
      console.log('✅ Squad members query successful:', squadMembers?.length || 0, 'squad members found');
    }

    console.log('\n🎉 All tests passed! Online users functionality should be working.');
    return true;
    
  } catch (error) {
    console.log('❌ Test failed with error:', error);
    return false;
  }
}

// Run the test
testOnlineUsers().then(success => {
  if (success) {
    console.log('\n✅ RLS fix was successful! Online users should now display on the homepage.');
  } else {
    console.log('\n❌ RLS fix may not have been fully applied. Check the Supabase dashboard.');
  }
}); 