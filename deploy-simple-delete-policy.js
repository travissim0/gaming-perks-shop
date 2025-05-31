const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function deploySimpleDeletePolicy() {
  try {
    console.log('🚀 Deploying simple DELETE policy...');
    
    // Execute the SQL directly
    const { data, error } = await supabase.rpc('sql', {
      query: `
        -- Drop existing DELETE policies
        DROP POLICY IF EXISTS "Authors and moderators can delete posts" ON forum_posts;
        DROP POLICY IF EXISTS "Authors can delete their posts" ON forum_posts;
        DROP POLICY IF EXISTS "Users can delete own posts" ON forum_posts;
        
        -- Create simple DELETE policy
        CREATE POLICY "Authors can delete their own posts" ON forum_posts
          FOR DELETE USING (auth.uid() = author_id);
        
        -- Return verification
        SELECT 
          policyname,
          cmd,
          qual
        FROM pg_policies 
        WHERE schemaname = 'public' 
          AND tablename = 'forum_posts'
          AND cmd = 'DELETE';
      `
    });
    
    if (error) {
      console.error('❌ Error:', error);
      process.exit(1);
    }
    
    console.log('✅ DELETE policy created successfully!');
    
    if (data && data.length > 0) {
      console.log('✅ Policy verified:');
      data.forEach(row => {
        console.log(`  - ${row.policyname}: ${row.qual}`);
      });
    } else {
      console.log('❌ No DELETE policy found after creation!');
    }
    
  } catch (error) {
    console.error('💥 Deployment failed:', error);
    process.exit(1);
  }
}

deploySimpleDeletePolicy(); 