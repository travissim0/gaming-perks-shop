const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

// Load environment variables
require('dotenv').config({ path: './production.env' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function fixFunction() {
  try {
    console.log('🔧 Fixing news function conflict...');
    
    const sql = fs.readFileSync('./fix-news-function-conflict.sql', 'utf8');
    
    // Split SQL into individual statements
    const statements = sql.split(';').filter(stmt => stmt.trim());
    
    for (const statement of statements) {
      if (statement.trim()) {
        console.log(`Executing: ${statement.substring(0, 50)}...`);
        
        try {
          // Try direct query execution
          const { error } = await supabase.rpc('query', { 
            query_text: statement.trim() + ';'
          });
          
          if (error) {
            console.log('RPC query failed, trying alternative...');
            
            // Alternative: Use raw SQL if available
            const { error: rawError } = await supabase
              .from('_supabase_migrations')
              .select('*')
              .limit(1);
            
            if (rawError) {
              console.log('Direct SQL not available, manual execution needed');
            }
          } else {
            console.log('✅ Statement executed successfully');
          }
        } catch (err) {
          console.log(`⚠️ Statement failed: ${err.message}`);
        }
      }
    }
    
    // Test the function
    console.log('\n🧪 Testing fixed function...');
    const { data: testResult, error: testError } = await supabase.rpc('get_news_posts_with_read_status', {
      user_uuid: null,
      limit_count: 1,
      post_uuid: null
    });
    
    if (testError) {
      console.error('❌ Function still has issues:', testError);
      console.log('\n📝 Manual fix needed:');
      console.log('1. Copy the contents of fix-news-function-conflict.sql');
      console.log('2. Run it manually in your Supabase SQL editor');
      console.log('3. This will resolve the function overloading conflict');
    } else {
      console.log('✅ Function working correctly!');
      console.log(`Found ${testResult?.length || 0} posts in test`);
    }
    
  } catch (error) {
    console.error('❌ Unexpected error:', error);
    console.log('\n📝 Please run the SQL manually in Supabase dashboard');
  }
}

fixFunction(); 