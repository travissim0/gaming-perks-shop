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
    
    console.log('✅ Environment variables found');
    
    // Test connection first
    console.log('🔗 Testing database connection...');
    const { data: connectionTest, error: connectionError } = await supabase
      .from('profiles')
      .select('count', { count: 'exact', head: true });
    
    if (connectionError) {
      console.error('❌ Database connection failed:', connectionError.message);
      return;
    }
    
    console.log('✅ Database connection successful');
    
    // Try to create tables individually
    console.log('📝 Creating forum tables...');
    
    // Check if forum_categories table already exists
    const { data: existingCategories, error: catCheckError } = await supabase
      .from('forum_categories')
      .select('*')
      .limit(1);
    
    if (!catCheckError) {
      console.log('✅ Forum tables already exist!');
      console.log(`   Found ${existingCategories?.length || 0} categories`);
      
      // List existing categories
      const { data: allCategories } = await supabase
        .from('forum_categories')
        .select('*')
        .order('position');
      
      if (allCategories && allCategories.length > 0) {
        console.log('📂 Existing categories:');
        allCategories.forEach(cat => {
          console.log(`   - ${cat.name} (${cat.slug})`);
        });
      }
      
      return;
    }
    
    console.log('⚠️ Forum tables do not exist. Please run the SQL manually:');
    console.log('');
    console.log('1. Go to your Supabase Dashboard');
    console.log('2. Navigate to SQL Editor');
    console.log('3. Copy and paste the contents of add-forum-system-fixed.sql');
    console.log('4. Run the SQL script');
    console.log('');
    console.log('The SQL file is ready and should work without errors.');
    
  } catch (err) {
    console.error('❌ Deployment failed:', err.message);
  }
}

deployForum(); 