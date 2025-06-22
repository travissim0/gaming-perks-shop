const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

// Use production Supabase details
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function grantAdminPermissions() {
  try {
    // Replace with your email address
    const EMAIL = 'your-email@domain.com'; // <-- UPDATE THIS
    
    console.log('🔍 Looking up user by email:', EMAIL);
    
    // Find user by email
    const { data: { users }, error: userError } = await supabase.auth.admin.listUsers();
    if (userError) throw userError;
    
    const user = users.find(u => u.email === EMAIL);
    if (!user) {
      console.log('❌ User not found with email:', EMAIL);
      return;
    }
    
    console.log('✅ Found user:', {
      id: user.id,
      email: user.email,
      alias: user.user_metadata?.alias || user.raw_user_meta_data?.alias
    });
    
    // Update profile to grant admin permissions
    console.log('🔧 Granting admin permissions...');
    
    const { data, error } = await supabase
      .from('profiles')
      .update({
        is_admin: true,
        is_zone_admin: true
      })
      .eq('id', user.id)
      .select();
    
    if (error) throw error;
    
    console.log('✅ Admin permissions granted successfully!');
    console.log('📋 Updated profile:', data[0]);
    
    // Verify the update
    const { data: profile } = await supabase
      .from('profiles')
      .select('id, alias, is_admin, is_zone_admin')
      .eq('id', user.id)
      .single();
    
    console.log('🎉 Verification:', profile);
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

// Run the script
grantAdminPermissions(); 