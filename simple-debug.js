const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

console.log('Environment check:');
console.log('SUPABASE_URL:', process.env.NEXT_PUBLIC_SUPABASE_URL ? 'Set' : 'Not set');
console.log('SERVICE_ROLE_KEY:', process.env.SUPABASE_SERVICE_ROLE_KEY ? 'Set' : 'Not set');

if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  console.error('❌ Environment variables not set properly');
  process.exit(1);
}

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function simpleTest() {
  try {
    console.log('\n🔍 Testing database connection...');
    
    const { data: profiles, error } = await supabase
      .from('profiles')
      .select('id, in_game_alias, hide_from_free_agents')
      .limit(3);
      
    if (error) {
      console.error('❌ Database error:', error);
      return;
    }
    
    console.log(`✅ Found ${profiles.length} profiles:`);
    profiles.forEach((profile, i) => {
      console.log(`  ${i+1}. ${profile.in_game_alias}: hide_from_free_agents = ${profile.hide_from_free_agents}`);
    });
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

simpleTest(); 