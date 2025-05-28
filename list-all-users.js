require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

// Use service role key for admin operations
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function listAllUsers() {
  try {
    console.log('👥 Listing all users...\n');

    // Get all users
    const { data: allUsers, error: listError } = await supabaseAdmin.auth.admin.listUsers();
    
    if (listError) {
      console.error('❌ Error listing users:', listError);
      return;
    }

    console.log(`📊 Found ${allUsers.users.length} total users:\n`);

    for (const user of allUsers.users) {
      console.log(`👤 User: ${user.email}`);
      console.log(`   ID: ${user.id}`);
      console.log(`   Created: ${user.created_at}`);
      console.log(`   Email Confirmed: ${user.email_confirmed_at ? 'Yes' : 'No'}`);
      console.log(`   Last Sign In: ${user.last_sign_in_at || 'Never'}`);
      
      if (user.user_metadata) {
        console.log(`   Metadata:`, user.user_metadata);
      }
      
      // Check if profile exists
      const { data: profile } = await supabaseAdmin
        .from('profiles')
        .select('in_game_alias, registration_status')
        .eq('id', user.id)
        .maybeSingle();
      
      if (profile) {
        console.log(`   Profile: ${profile.in_game_alias} (${profile.registration_status})`);
      } else {
        console.log(`   Profile: None`);
      }
      
      console.log('');
    }

    // Show which emails are test emails
    const testEmails = allUsers.users.filter(user => 
      user.email && (
        user.email.includes('test') || 
        user.email.includes('TestPlayer') ||
        user.email.includes('@example.com')
      )
    );

    if (testEmails.length > 0) {
      console.log(`🧪 Test emails found (${testEmails.length}):`);
      testEmails.forEach(user => console.log(`   - ${user.email}`));
      console.log('\nTo clean these up, run: node cleanup-test-users.js');
    } else {
      console.log('✅ No test emails found');
    }

  } catch (error) {
    console.error('❌ Script error:', error);
  }
}

listAllUsers(); 