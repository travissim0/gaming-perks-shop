require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing Supabase configuration');
  console.error('Required: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

// Get default avatar URL
function getDefaultAvatarUrl() {
  const { data: { publicUrl } } = supabase.storage
    .from('avatars')
    .getPublicUrl('site-avatars/a7inf2.png');
  return publicUrl;
}

async function updateDefaultAvatars() {
  console.log('🔄 Starting default avatar update process...\n');
  
  try {
    // First, find users without avatars
    console.log('🔍 Finding users without avatars...');
    const { data: usersWithoutAvatars, error: fetchError } = await supabase
      .from('profiles')
      .select('id, in_game_alias, email, avatar_url')
      .or('avatar_url.is.null,avatar_url.eq.')
      .not('in_game_alias', 'is', null)
      .neq('in_game_alias', '');
    
    if (fetchError) {
      throw fetchError;
    }
    
    if (!usersWithoutAvatars || usersWithoutAvatars.length === 0) {
      console.log('✅ All users already have avatars assigned!');
      return;
    }
    
    console.log(`📊 Found ${usersWithoutAvatars.length} users without avatars:`);
    usersWithoutAvatars.forEach((user, index) => {
      console.log(`   ${index + 1}. ${user.in_game_alias} (${user.email})`);
    });
    
    // Get the default avatar URL
    const defaultAvatarUrl = getDefaultAvatarUrl();
    console.log(`\n🖼️  Default avatar URL: ${defaultAvatarUrl}`);
    
    // Update all users without avatars
    console.log('\n🔄 Updating users with default avatar...');
    const { data: updatedUsers, error: updateError } = await supabase
      .from('profiles')
      .update({ 
        avatar_url: defaultAvatarUrl,
        updated_at: new Date().toISOString()
      })
      .or('avatar_url.is.null,avatar_url.eq.')
      .not('in_game_alias', 'is', null)
      .neq('in_game_alias', '')
      .select('id, in_game_alias, avatar_url');
    
    if (updateError) {
      throw updateError;
    }
    
    console.log(`✅ Successfully updated ${updatedUsers?.length || 0} users with default avatars`);
    
    if (updatedUsers && updatedUsers.length > 0) {
      console.log('\n📋 Updated users:');
      updatedUsers.forEach((user, index) => {
        console.log(`   ${index + 1}. ${user.in_game_alias} - Avatar set`);
      });
    }
    
    // Verify the update
    console.log('\n🔍 Verifying update...');
    const { data: remainingUsers, error: verifyError } = await supabase
      .from('profiles')
      .select('id, in_game_alias')
      .or('avatar_url.is.null,avatar_url.eq.')
      .not('in_game_alias', 'is', null)
      .neq('in_game_alias', '');
    
    if (verifyError) {
      console.warn('⚠️ Could not verify update:', verifyError.message);
    } else if (remainingUsers && remainingUsers.length > 0) {
      console.log(`⚠️ ${remainingUsers.length} users still without avatars:`);
      remainingUsers.forEach(user => {
        console.log(`   - ${user.in_game_alias}`);
      });
    } else {
      console.log('🎉 All users now have avatars assigned!');
    }
    
  } catch (error) {
    console.error('❌ Error updating default avatars:', error.message);
    process.exit(1);
  }
}

// Run the update
updateDefaultAvatars(); 