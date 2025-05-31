const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function checkPolicies() {
  console.log('🔍 Checking RLS policies for forum_posts table...\n');
  
  const { data, error } = await supabase.rpc('sql', {
    query: `
      SELECT 
        policyname,
        cmd,
        qual
      FROM pg_policies 
      WHERE schemaname = 'public' 
        AND tablename = 'forum_posts'
      ORDER BY cmd, policyname;
    `
  });
  
  if (error) {
    console.error('❌ Error:', error);
    return;
  }
  
  console.log('📋 Current RLS Policies for forum_posts:');
  if (data.length === 0) {
    console.log('❌ No policies found!');
  } else {
    data.forEach(policy => {
      console.log(`\n🔐 Policy: ${policy.policyname}`);
      console.log(`   Command: ${policy.cmd}`);
      console.log(`   Condition: ${policy.qual || 'No condition'}`);
    });
  }

  // Check if there's a DELETE policy
  const deletePolicy = data.find(p => p.cmd === 'DELETE');
  if (!deletePolicy) {
    console.log('\n❌ No DELETE policy found! This is the issue.');
  } else {
    console.log('\n✅ DELETE policy exists.');
  }
}

checkPolicies().catch(console.error); 