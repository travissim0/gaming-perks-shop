const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

// Load environment variables
require('dotenv').config({ path: './production.env' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function updateFunction() {
  try {
    console.log('📡 Updating news function...');
    
    const sql = fs.readFileSync('./update-news-get-function.sql', 'utf8');
    
    // Execute the SQL directly
    const { data, error } = await supabase.rpc('exec_sql', {
      sql_text: sql
    });
    
    if (error) {
      console.error('❌ Error updating function:', error);
      
      // Try alternative approach - execute SQL parts separately
      console.log('🔄 Trying alternative approach...');
      
      const { error: directError } = await supabase.from('_supabase_migrations').select('*').limit(1);
      
      if (directError) {
        console.log('⚠️ Direct SQL execution not available, trying RPC...');
        
        // Try using a simpler approach
        const { data: result, error: rpcError } = await supabase.rpc('get_news_posts_with_read_status', {
          user_uuid: null,
          limit_count: 1
        });
        
        if (rpcError) {
          console.error('❌ Current function test failed:', rpcError);
        } else {
          console.log('✅ Current function works, manual update needed');
          console.log('📝 Please run the SQL in update-news-get-function.sql manually in your database');
        }
      }
      return;
    }
    
    console.log('✅ Function updated successfully!');
    
    // Test the updated function
    console.log('🧪 Testing updated function...');
    const { data: testResult, error: testError } = await supabase.rpc('get_news_posts_with_read_status', {
      user_uuid: null,
      limit_count: 1,
      post_uuid: null
    });
    
    if (testError) {
      console.error('❌ Test failed:', testError);
    } else {
      console.log('✅ Function test passed!');
    }
    
  } catch (error) {
    console.error('❌ Unexpected error:', error);
  }
}

updateFunction(); 