require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

// Use service role key for admin operations
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function cleanupTestUsers() {
  try {
    console.log('🧹 Cleaning up test users...\n');

    // Get all users
    const { data: allUsers, error: listError } = await supabaseAdmin.auth.admin.listUsers();
    
    if (listError) {
      console.error('❌ Error listing users:', listError);
      return;
    }

    console.log(`📊 Found ${allUsers.users.length} total users`);

    // Find test users (emails containing 'test' and numbers)
    const testUsers = allUsers.users.filter(user => 
      user.email && (
        user.email.includes('test') || 
        user.email.includes('TestPlayer') ||
        user.email.includes('@example.com')
      )
    );

    console.log(`🎯 Found ${testUsers.length} test users to clean up:`);

    for (const user of testUsers) {
      console.log(`\n🔍 Processing user: ${user.email} (${user.id})`);

      // Delete from profiles table first
      const { error: profileDeleteError } = await supabaseAdmin
        .from('profiles')
        .delete()
        .eq('id', user.id);

      if (profileDeleteError) {
        console.log(`   ⚠️ Profile deletion error (might not exist): ${profileDeleteError.message}`);
      } else {
        console.log('   ✅ Profile deleted');
      }

      // Delete from auth.users
      const { error: userDeleteError } = await supabaseAdmin.auth.admin.deleteUser(user.id);

      if (userDeleteError) {
        console.error(`   ❌ User deletion error: ${userDeleteError.message}`);
      } else {
        console.log('   ✅ User deleted from auth');
      }
    }

    console.log('\n🎉 Cleanup completed!');
    console.log('You can now test registration with the same emails again.');

  } catch (error) {
    console.error('❌ Cleanup script error:', error);
  }
}

cleanupTestUsers(); 