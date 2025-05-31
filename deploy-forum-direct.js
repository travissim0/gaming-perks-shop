const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function deployForum() {
  try {
    console.log('🚀 Deploying Forum System...');
    console.log('📋 Using environment from .env.local');
    
    // Check if we have the required environment variables
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
      console.error('❌ Missing required environment variables:');
      console.error('   NEXT_PUBLIC_SUPABASE_URL:', process.env.NEXT_PUBLIC_SUPABASE_URL ? 'SET' : 'NOT SET');
      console.error('   SUPABASE_SERVICE_ROLE_KEY:', process.env.SUPABASE_SERVICE_ROLE_KEY ? 'SET' : 'NOT SET');
      return;
    }
    
    // Read the SQL file
    const sqlContent = fs.readFileSync('add-forum-system-fixed.sql', 'utf8');
    
    console.log('📝 Executing forum schema...');
    
    // Execute the SQL
    const { data, error } = await supabase.rpc('exec_sql', {
      sql: sqlContent
    });
    
    if (error) {
      console.error('❌ Error executing SQL:', error.message);
      return;
    }
    
    console.log('✅ Forum system deployed successfully!');
    
    // Verify deployment
    console.log('🔍 Verifying deployment...');
    
    const { data: categories, error: catError } = await supabase
      .from('forum_categories')
      .select('*');
    
    if (catError) {
      console.error('❌ Error checking categories:', catError.message);
    } else {
      console.log(`✅ Found ${categories.length} forum categories`);
      categories.forEach(cat => {
        console.log(`   - ${cat.name} (${cat.slug})`);
      });
    }
    
  } catch (err) {
    console.error('❌ Deployment failed:', err.message);
  }
}

deployForum(); 