// Debug script to check user authentication context
// Run this in the browser console while logged in

console.log('🔍 Debugging User Context');

// Check if user is logged in and get user ID
if (typeof window !== 'undefined') {
  // Try to get user from any auth context
  console.log('Current URL:', window.location.href);
  
  // Check localStorage for any auth data
  const authData = localStorage.getItem('sb-kyprscekpxkltadcjbtv-auth-token');
  if (authData) {
    try {
      const parsed = JSON.parse(authData);
      console.log('Auth data found:', {
        user_id: parsed?.user?.id,
        email: parsed?.user?.email,
        role: parsed?.user?.role,
        created_at: parsed?.user?.created_at
      });
    } catch (e) {
      console.log('Auth data exists but couldn\'t parse:', authData);
    }
  } else {
    console.log('No auth data found in localStorage');
  }
} else {
  console.log('Not in browser environment');
}

// For Node.js testing (using service role to check specific user)
if (typeof require !== 'undefined') {
  const { createClient } = require('@supabase/supabase-js');
  require('dotenv').config({ path: '.env.local' });

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  async function checkSpecificUser() {
    const targetUserId = '65adf6db-cc7b-4176-b68c-12f7d3b6291f'; // The user who sent requests
    
    console.log('\n🔍 Checking user profile...');
    const { data: profile, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', targetUserId)
      .single();
      
    if (error) {
      console.error('❌ Error fetching profile:', error);
    } else {
      console.log('✅ User profile:', profile);
    }
    
    console.log('\n🔍 Checking user squad membership...');
    const { data: membership, error: memberError } = await supabase
      .from('squad_members')
      .select('squad_id, role, status')
      .eq('player_id', targetUserId);
      
    if (memberError) {
      console.error('❌ Error fetching membership:', memberError);
    } else {
      console.log('✅ User squad memberships:', membership);
    }
  }
  
  checkSpecificUser().catch(console.error);
} 