// Debug script for online users issue
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

// Create both anon and service role clients to compare
const anonClient = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

const serviceClient = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function debugOnlineUsers() {
  console.log('🔍 Debug: Online Users Issue');
  console.log('==============================\n');

  // Test 1: Basic connection test
  console.log('1️⃣ Testing basic Supabase connection...');
  try {
    const { data, error } = await anonClient
      .from('profiles')
      .select('count')
      .limit(1);
    
    if (error) {
      console.log('❌ Basic connection failed:', error);
      console.log('Error details:', JSON.stringify(error, null, 2));
    } else {
      console.log('✅ Basic connection works');
    }
  } catch (err) {
    console.log('❌ Basic connection exception:', err);
  }

  // Test 2: Simple profiles query with anon key
  console.log('\n2️⃣ Testing simple profiles query (anon key)...');
  try {
    const { data, error } = await anonClient
      .from('profiles')
      .select('id')
      .limit(1);
    
    if (error) {
      console.log('❌ Simple profiles query failed (anon):', error);
      console.log('Error details:', JSON.stringify(error, null, 2));
    } else {
      console.log('✅ Simple profiles query works (anon):', data?.length || 0, 'records');
    }
  } catch (err) {
    console.log('❌ Simple profiles query exception (anon):', err);
  }

  // Test 3: Same query with service role key
  console.log('\n3️⃣ Testing simple profiles query (service role)...');
  try {
    const { data, error } = await serviceClient
      .from('profiles')
      .select('id, in_game_alias, last_seen')
      .limit(5);
    
    if (error) {
      console.log('❌ Simple profiles query failed (service):', error);
    } else {
      console.log('✅ Simple profiles query works (service):', data?.length || 0, 'records');
      console.log('Sample data:', data);
    }
  } catch (err) {
    console.log('❌ Simple profiles query exception (service):', err);
  }

  // Test 4: Test the exact query from the frontend (SIMPLIFIED VERSION)
  console.log('\n4️⃣ Testing simplified frontend query (anon key)...');
  try {
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    
    const { data, error } = await anonClient
      .from('profiles')
      .select('id, in_game_alias, email, last_seen, avatar_url')
      .gte('last_seen', fiveMinutesAgo)
      .order('last_seen', { ascending: false })
      .limit(20);
    
    if (error) {
      console.log('❌ Simplified frontend query failed (anon):', error);
      console.log('Error details:', JSON.stringify(error, null, 2));
      console.log('Error code:', error.code);
      console.log('Error message:', error.message);
      console.log('Error hint:', error.hint);
    } else {
      console.log('✅ Simplified frontend query works (anon):', data?.length || 0, 'records');
      if (data && data.length > 0) {
        console.log('Sample online user:', data[0]);
      }
    }
  } catch (err) {
    console.log('❌ Simplified frontend query exception (anon):', err);
  }

  // Test 4b: Test the old problematic query with squad relationships
  console.log('\n4️⃣b Testing old problematic query with squads (for comparison)...');
  try {
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    
    const { data, error } = await anonClient
      .from('profiles')
      .select(`
        id,
        in_game_alias,
        email,
        last_seen,
        avatar_url,
        squad_members (
          role,
          squads (
            name,
            tag
          )
        )
      `)
      .gte('last_seen', fiveMinutesAgo)
      .order('last_seen', { ascending: false })
      .limit(20);
    
    if (error) {
      console.log('❌ Old problematic query still fails (expected):', error.code);
    } else {
      console.log('✅ Old query unexpectedly works:', data?.length || 0, 'records');
    }
  } catch (err) {
    console.log('❌ Old query exception (expected):', err.message);
  }

  // Test 5: Test just profiles table with last_seen
  console.log('\n5️⃣ Testing profiles with last_seen only...');
  try {
    const { data, error } = await anonClient
      .from('profiles')
      .select('id, in_game_alias, last_seen')
      .order('last_seen', { ascending: false })
      .limit(5);
    
    if (error) {
      console.log('❌ Profiles with last_seen failed:', error);
      console.log('Error details:', JSON.stringify(error, null, 2));
    } else {
      console.log('✅ Profiles with last_seen works:', data?.length || 0, 'records');
      if (data && data.length > 0) {
        console.log('Sample record:', data[0]);
      }
    }
  } catch (err) {
    console.log('❌ Profiles with last_seen exception:', err);
  }

  // Test 6: Check if squad_members table is accessible
  console.log('\n6️⃣ Testing squad_members table access...');
  try {
    const { data, error } = await anonClient
      .from('squad_members')
      .select('id')
      .limit(1);
    
    if (error) {
      console.log('❌ Squad members access failed:', error);
      console.log('Error details:', JSON.stringify(error, null, 2));
    } else {
      console.log('✅ Squad members accessible:', data?.length || 0, 'records');
    }
  } catch (err) {
    console.log('❌ Squad members exception:', err);
  }

  // Test 7: Check RLS policies
  console.log('\n7️⃣ Testing RLS policies with service key...');
  try {
    const { data, error } = await serviceClient
      .rpc('exec_sql', { 
        query: `
          SELECT tablename, policyname, permissive, roles, cmd 
          FROM pg_policies 
          WHERE schemaname = 'public' 
            AND tablename IN ('profiles', 'squad_members', 'squads')
          ORDER BY tablename, policyname;
        `
      });
    
    if (error) {
      console.log('❌ RLS policy check failed:', error);
    } else {
      console.log('✅ Current RLS policies:');
      console.log(JSON.stringify(data, null, 2));
    }
  } catch (err) {
    console.log('❌ RLS policy check exception:', err);
  }

  console.log('\n🔍 Debug complete! Check the results above to identify the issue.');
}

// Run the debug
debugOnlineUsers().catch(console.error); 