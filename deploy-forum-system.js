// Forum System Deployment Checker
// This script checks if the forum system is properly deployed and helps with troubleshooting

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: 'production.env' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing Supabase credentials');
  console.error('Required environment variables:');
  console.error('- NEXT_PUBLIC_SUPABASE_URL');
  console.error('- SUPABASE_SERVICE_ROLE_KEY (or NEXT_PUBLIC_SUPABASE_ANON_KEY)');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkTable(tableName, description) {
  try {
    const { data, error } = await supabase
      .from(tableName)
      .select('*')
      .limit(1);
    
    if (error) {
      console.log(`❌ ${description}: ${error.message}`);
      return false;
    } else {
      console.log(`✅ ${description}: Table exists and accessible`);
      return true;
    }
  } catch (error) {
    console.log(`❌ ${description}: ${error.message}`);
    return false;
  }
}

async function checkFunction(functionName, description) {
  try {
    const { data, error } = await supabase
      .rpc(functionName);
    
    if (error && !error.message.includes('null value')) {
      console.log(`❌ ${description}: ${error.message}`);
      return false;
    } else {
      console.log(`✅ ${description}: Function exists and callable`);
      return true;
    }
  } catch (error) {
    console.log(`❌ ${description}: ${error.message}`);
    return false;
  }
}

async function checkForumCategories() {
  try {
    const { data, error } = await supabase
      .from('forum_categories')
      .select('name, slug')
      .order('position');
    
    if (error) {
      console.log(`❌ Forum Categories: ${error.message}`);
      return false;
    }
    
    console.log(`✅ Forum Categories: ${data.length} categories found`);
    if (data.length > 0) {
      console.log('   Available categories:');
      data.forEach(cat => {
        console.log(`   - ${cat.name} (${cat.slug})`);
      });
    }
    return true;
  } catch (error) {
    console.log(`❌ Forum Categories: ${error.message}`);
    return false;
  }
}

async function checkCTFRolePermissions() {
  try {
    const { data, error } = await supabase
      .from('ctf_roles')
      .select('name, permissions')
      .in('name', ['site_admin', 'ctf_admin', 'ctf_head_referee']);
    
    if (error) {
      console.log(`❌ CTF Role Forum Permissions: ${error.message}`);
      return false;
    }
    
    const rolesWithForumPerms = data.filter(role => 
      role.permissions && role.permissions.manage_forum_moderation
    );
    
    console.log(`✅ CTF Role Forum Permissions: ${rolesWithForumPerms.length}/${data.length} roles have forum moderation permissions`);
    return true;
  } catch (error) {
    console.log(`❌ CTF Role Forum Permissions: ${error.message}`);
    return false;
  }
}

async function main() {
  console.log('🔍 Checking Forum System Deployment...\n');
  
  console.log('📋 DATABASE TABLES:');
  const tables = [
    ['forum_categories', 'Forum Categories'],
    ['forum_threads', 'Forum Threads'],
    ['forum_posts', 'Forum Posts'],
    ['forum_thread_views', 'Thread Views Tracking'],
    ['forum_user_preferences', 'User Forum Preferences'],
    ['forum_moderation_log', 'Moderation Log'],
    ['forum_subscriptions', 'Thread Subscriptions']
  ];
  
  let allTablesExist = true;
  for (const [tableName, description] of tables) {
    const exists = await checkTable(tableName, description);
    if (!exists) allTablesExist = false;
  }
  
  console.log('\n🔧 DATABASE FUNCTIONS:');
  const functions = [
    ['increment_thread_views', 'Thread View Counter']
  ];
  
  let allFunctionsExist = true;
  for (const [functionName, description] of functions) {
    const exists = await checkFunction(functionName, description);
    if (!exists) allFunctionsExist = false;
  }
  
  console.log('\n📁 FORUM CONTENT:');
  await checkForumCategories();
  await checkCTFRolePermissions();
  
  console.log('\n📊 DEPLOYMENT STATUS:');
  if (allTablesExist && allFunctionsExist) {
    console.log('✅ Forum system is properly deployed!');
    console.log('\n🚀 NEXT STEPS:');
    console.log('1. Start your development server: npm run dev');
    console.log('2. Visit /forum to see the forum system');
    console.log('3. Create threads and test functionality');
    console.log('4. Check CTF role-based moderation features');
  } else {
    console.log('❌ Forum system deployment incomplete!');
    console.log('\n🔧 TROUBLESHOOTING:');
    console.log('1. Run the SQL script from add-forum-system.sql in your Supabase SQL Editor');
    console.log('2. Verify all tables were created successfully');
    console.log('3. Check that CTF roles system is installed');
    console.log('4. Ensure RLS policies are enabled');
    console.log('5. Re-run this script to verify');
  }
  
  console.log('\n📚 FORUM FEATURES:');
  console.log('- 📝 Thread creation and management');
  console.log('- 💬 Nested post replies');
  console.log('- 📊 View tracking and statistics');
  console.log('- 🔔 Thread subscriptions');
  console.log('- 🛡️ CTF role-based moderation');
  console.log('- 🔍 Search functionality');
  console.log('- ⚙️ User preferences');
  console.log('- 📱 Mobile-responsive design');
}

main().catch(console.error); 