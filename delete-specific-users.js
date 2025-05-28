require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

// Use service role key for admin operations
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function deleteSpecificUsers() {
  try {
    console.log('🗑️ Deleting specific users...\n');

    // Specify the emails you want to delete
    const emailsToDelete = [
      'acrimoneyius@gmail.com',
      // Add more emails here if needed
      // 'qwerty5544@aim.com', // Uncomment if you want to delete this too
    ];

    console.log('🎯 Emails to delete:', emailsToDelete);
    console.log('⚠️  This will permanently delete these users!\n');

    // Get all users
    const { data: allUsers, error: listError } = await supabaseAdmin.auth.admin.listUsers();
    
    if (listError) {
      console.error('❌ Error listing users:', listError);
      return;
    }

    // Find users with specified emails
    const usersToDelete = allUsers.users.filter(user => 
      user.email && emailsToDelete.includes(user.email)
    );

    console.log(`📊 Found ${usersToDelete.length} users to delete:`);

    for (const user of usersToDelete) {
      console.log(`\n🔍 Processing user: ${user.email} (${user.id})`);
      console.log(`   Created: ${user.created_at}`);
      console.log(`   Email Confirmed: ${user.email_confirmed_at ? 'Yes' : 'No'}`);
      console.log(`   Last Sign In: ${user.last_sign_in_at || 'Never'}`);

      // Check if profile exists
      const { data: profile } = await supabaseAdmin
        .from('profiles')
        .select('in_game_alias, registration_status')
        .eq('id', user.id)
        .maybeSingle();

      if (profile) {
        console.log(`   Profile: ${profile.in_game_alias} (${profile.registration_status})`);
        
        // Delete from profiles table first
        const { error: profileDeleteError } = await supabaseAdmin
          .from('profiles')
          .delete()
          .eq('id', user.id);

        if (profileDeleteError) {
          console.log(`   ❌ Profile deletion error: ${profileDeleteError.message}`);
          continue; // Skip user deletion if profile deletion fails
        } else {
          console.log('   ✅ Profile deleted');
        }
      } else {
        console.log('   Profile: None');
      }

      // Delete from auth.users
      const { error: userDeleteError } = await supabaseAdmin.auth.admin.deleteUser(user.id);

      if (userDeleteError) {
        console.error(`   ❌ User deletion error: ${userDeleteError.message}`);
      } else {
        console.log('   ✅ User deleted from auth');
      }
    }

    console.log('\n🎉 Deletion completed!');
    
    if (usersToDelete.length === 0) {
      console.log('No users found with the specified emails.');
    }

  } catch (error) {
    console.error('❌ Deletion script error:', error);
  }
}

// Ask for confirmation before running
console.log('⚠️  WARNING: This will permanently delete users!');
console.log('📧 Emails to be deleted: acrimoneyius@gmail.com');
console.log('');
console.log('If you want to proceed, uncomment the line below and run the script:');
console.log('// deleteSpecificUsers();');
console.log('');
console.log('Or run with: node -e "require(\'./delete-specific-users.js\'); deleteSpecificUsers();"');

// Uncomment the line below to actually run the deletion
// deleteSpecificUsers(); 