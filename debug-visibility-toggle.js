const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

console.log('🔍 Debugging visibility toggle issue...\n');

async function debugVisibilityToggle() {
  try {
    // First check if the column exists
    console.log('1. Checking if hide_from_free_agents column exists...');
    const { data: columnInfo, error: columnError } = await supabase
      .from('information_schema.columns')
      .select('column_name, data_type, is_nullable, column_default')
      .eq('table_name', 'profiles')
      .eq('column_name', 'hide_from_free_agents');
    
    if (columnError) {
      console.error('❌ Error checking column:', columnError);
      return;
    }
    
    if (columnInfo && columnInfo.length > 0) {
      console.log('✅ Column exists:', columnInfo[0]);
    } else {
      console.log('❌ Column does not exist!');
      return;
    }
    
    // Check some sample profile data
    console.log('\n2. Checking sample profile data...');
    const { data: profiles, error: profileError } = await supabase
      .from('profiles')
      .select('id, in_game_alias, hide_from_free_agents')
      .limit(10);
      
    if (profileError) {
      console.error('❌ Error fetching profiles:', profileError);
      return;
    }
    
    console.log('Sample profiles:');
    profiles.forEach((profile, index) => {
      console.log(`  ${index + 1}. ${profile.in_game_alias}: hide_from_free_agents = ${profile.hide_from_free_agents}`);
    });
    
    // Check for any profiles with hide_from_free_agents = true
    console.log('\n3. Checking for hidden profiles...');
    const { data: hiddenProfiles, error: hiddenError } = await supabase
      .from('profiles')
      .select('id, in_game_alias, hide_from_free_agents')
      .eq('hide_from_free_agents', true);
      
    if (hiddenError) {
      console.error('❌ Error fetching hidden profiles:', hiddenError);
      return;
    }
    
    console.log(`Found ${hiddenProfiles.length} hidden profiles:`);
    hiddenProfiles.forEach((profile, index) => {
      console.log(`  ${index + 1}. ${profile.in_game_alias}: ${profile.hide_from_free_agents}`);
    });
    
    // Test updating a profile
    if (profiles.length > 0) {
      console.log('\n4. Testing update functionality...');
      const testProfile = profiles[0];
      const currentValue = testProfile.hide_from_free_agents || false;
      const newValue = !currentValue;
      
      console.log(`Testing update for ${testProfile.in_game_alias}: ${currentValue} -> ${newValue}`);
      
      const { data: updateResult, error: updateError } = await supabase
        .from('profiles')
        .update({ hide_from_free_agents: newValue })
        .eq('id', testProfile.id)
        .select();
        
      if (updateError) {
        console.error('❌ Error updating profile:', updateError);
        return;
      }
      
      console.log('✅ Update successful:', updateResult);
      
      // Verify the update
      console.log('\n5. Verifying update...');
      const { data: verifyResult, error: verifyError } = await supabase
        .from('profiles')
        .select('id, in_game_alias, hide_from_free_agents')
        .eq('id', testProfile.id)
        .single();
        
      if (verifyError) {
        console.error('❌ Error verifying update:', verifyError);
        return;
      }
      
      console.log('✅ Verification result:', verifyResult);
      
      // Restore original value
      console.log('\n6. Restoring original value...');
      const { error: restoreError } = await supabase
        .from('profiles')
        .update({ hide_from_free_agents: currentValue })
        .eq('id', testProfile.id);
        
      if (restoreError) {
        console.error('❌ Error restoring original value:', restoreError);
      } else {
        console.log('✅ Original value restored');
      }
    }
    
  } catch (error) {
    console.error('❌ Unexpected error:', error);
  }
}

debugVisibilityToggle(); 