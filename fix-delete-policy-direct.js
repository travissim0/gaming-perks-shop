const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function fixDeletePolicy() {
  console.log('🔧 Fixing DELETE policy for forum_posts...\n');
  
  try {
    // First, check current policies
    console.log('1. Checking current policies...');
    const { data: currentPolicies, error: checkError } = await supabase
      .rpc('sql', {
        query: `
          SELECT policyname, cmd, qual
          FROM pg_policies 
          WHERE schemaname = 'public' 
            AND tablename = 'forum_posts'
          ORDER BY cmd, policyname;
        `
      });
    
    if (checkError) {
      console.error('❌ Error checking policies:', checkError);
      return;
    }
    
    console.log('Current policies:');
    currentPolicies.forEach(policy => {
      console.log(`  - ${policy.policyname} (${policy.cmd})`);
    });
    
    const deletePolicy = currentPolicies.find(p => p.cmd === 'DELETE');
    
    if (deletePolicy) {
      console.log('\n✅ DELETE policy already exists:', deletePolicy.policyname);
      return;
    }
    
    console.log('\n❌ No DELETE policy found. Creating one...');
    
    // Create the DELETE policy
    console.log('2. Creating DELETE policy...');
    const { data: createResult, error: createError } = await supabase
      .rpc('sql', {
        query: `
          -- Drop any existing DELETE policies
          DROP POLICY IF EXISTS "Authors and moderators can delete posts" ON forum_posts;
          DROP POLICY IF EXISTS "Authors can delete their posts" ON forum_posts;
          DROP POLICY IF EXISTS "Users can delete own posts" ON forum_posts;
          
          -- Create new DELETE policy
          CREATE POLICY "Users can delete own posts" ON forum_posts
            FOR DELETE USING (
              auth.uid() = author_id OR 
              EXISTS (
                SELECT 1 FROM profiles 
                WHERE profiles.id = auth.uid() 
                AND (profiles.is_admin = true OR profiles.ctf_admin = true)
              )
            );
        `
      });
    
    if (createError) {
      console.error('❌ Error creating DELETE policy:', createError);
      return;
    }
    
    console.log('✅ DELETE policy created successfully!');
    
    // Verify the policy was created
    console.log('\n3. Verifying new policy...');
    const { data: verifyPolicies, error: verifyError } = await supabase
      .rpc('sql', {
        query: `
          SELECT policyname, cmd, qual
          FROM pg_policies 
          WHERE schemaname = 'public' 
            AND tablename = 'forum_posts'
            AND cmd = 'DELETE';
        `
      });
    
    if (verifyError) {
      console.error('❌ Error verifying policy:', verifyError);
      return;
    }
    
    if (verifyPolicies.length > 0) {
      console.log('✅ DELETE policy verified:');
      verifyPolicies.forEach(policy => {
        console.log(`  - ${policy.policyname}`);
        console.log(`    Condition: ${policy.qual}`);
      });
    } else {
      console.log('❌ No DELETE policy found after creation!');
    }
    
    console.log('\n🎉 Delete policy fix completed!');
    
  } catch (error) {
    console.error('💥 Script failed:', error);
  }
}

fixDeletePolicy(); 