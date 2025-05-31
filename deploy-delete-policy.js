const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function deployDeletePolicy() {
  console.log('🚀 Deploying DELETE policy for forum_posts...\n');
  
  try {
    // Read the SQL file
    const sqlContent = fs.readFileSync('add-delete-policy.sql', 'utf8');
    console.log('📖 SQL content loaded');
    
    // Execute the SQL
    console.log('⚙️ Executing SQL...');
    const { data, error } = await supabase.rpc('sql', {
      query: sqlContent
    });
    
    if (error) {
      console.error('❌ SQL execution error:', error);
      return;
    }
    
    console.log('✅ SQL executed successfully!');
    
    if (data && data.length > 0) {
      console.log('\n📋 Verification results:');
      data.forEach(row => {
        console.log(`  Policy: ${row.policyname}`);
        console.log(`  Command: ${row.cmd}`);
        console.log(`  Condition: ${row.qual}`);
      });
    }
    
    console.log('\n🎉 DELETE policy deployment completed!');
    
    // Test the policy by checking if it exists
    console.log('\n🔍 Double-checking policy existence...');
    const { data: policies, error: checkError } = await supabase.rpc('sql', {
      query: `
        SELECT count(*) as policy_count
        FROM pg_policies 
        WHERE schemaname = 'public' 
          AND tablename = 'forum_posts'
          AND cmd = 'DELETE';
      `
    });
    
    if (checkError) {
      console.error('❌ Policy check error:', checkError);
    } else {
      const count = policies[0]?.policy_count || 0;
      console.log(`✅ Found ${count} DELETE policy(ies) for forum_posts`);
    }
    
  } catch (error) {
    console.error('💥 Deployment failed:', error);
  }
}

deployDeletePolicy(); 