const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function fixDeletePolicyDirect() {
  console.log('🔧 Adding DELETE policy directly...\n');
  
  try {
    // Step 1: Check current policies
    console.log('1. Checking current policies...');
    const { data: currentPolicies, error: checkError } = await supabase
      .rpc('sql', {
        query: `
          SELECT policyname, cmd
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
    
    console.log('Current policies:', currentPolicies?.length || 0);
    currentPolicies?.forEach(p => console.log(`  - ${p.policyname} (${p.cmd})`));
    
    // Step 2: Drop existing DELETE policies
    console.log('\n2. Dropping existing DELETE policies...');
    const { error: dropError } = await supabase.rpc('sql', {
      query: `
        DROP POLICY IF EXISTS "Authors and moderators can delete posts" ON forum_posts;
        DROP POLICY IF EXISTS "Authors can delete their posts" ON forum_posts;
        DROP POLICY IF EXISTS "Users can delete own posts" ON forum_posts;
      `
    });
    
    if (dropError) {
      console.error('❌ Error dropping policies:', dropError);
      return;
    }
    console.log('✅ Existing DELETE policies dropped');
    
    // Step 3: Create new DELETE policy
    console.log('\n3. Creating new DELETE policy...');
    const { error: createError } = await supabase.rpc('sql', {
      query: `
        CREATE POLICY "Authors can delete their own posts" ON forum_posts
          FOR DELETE USING (auth.uid() = author_id);
      `
    });
    
    if (createError) {
      console.error('❌ Error creating DELETE policy:', createError);
      return;
    }
    console.log('✅ DELETE policy created successfully!');
    
    // Step 4: Verify the policy
    console.log('\n4. Verifying new policy...');
    const { data: newPolicies, error: verifyError } = await supabase.rpc('sql', {
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
    
    if (newPolicies && newPolicies.length > 0) {
      console.log('✅ DELETE policy verified:');
      newPolicies.forEach(p => {
        console.log(`  - ${p.policyname}: ${p.qual}`);
      });
    } else {
      console.log('❌ No DELETE policy found after creation!');
    }
    
    console.log('\n🎉 DELETE policy fix completed!');
    
  } catch (error) {
    console.error('💥 Script failed:', error);
  }
}

fixDeletePolicyDirect(); 