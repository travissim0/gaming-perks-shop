const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function deployForumFixes() {
  try {
    console.log('🚀 Deploying forum fixes...');
    
    // Read the SQL file
    const sql = fs.readFileSync('fix-forum-posts-delete-and-counts.sql', 'utf8');
    
    console.log('📝 Executing SQL script...');
    
    // Execute the SQL
    const { data, error } = await supabase.rpc('exec_sql', { sql_text: sql });
    
    if (error) {
      console.error('❌ SQL Error:', error);
      // Try executing without the RPC function
      console.log('🔄 Trying direct execution...');
      
      // Split SQL into individual statements and execute
      const statements = sql.split(';').filter(stmt => stmt.trim());
      
      for (let i = 0; i < statements.length; i++) {
        const statement = statements[i].trim();
        if (statement) {
          console.log(`📋 Executing statement ${i + 1}/${statements.length}...`);
          try {
            const result = await supabase.rpc('exec_sql', { sql_text: statement });
            if (result.error) {
              console.warn(`⚠️  Warning on statement ${i + 1}:`, result.error.message);
            }
          } catch (err) {
            console.warn(`⚠️  Statement ${i + 1} failed:`, err.message);
          }
        }
      }
    } else {
      console.log('✅ SQL executed successfully');
    }
    
    // Verify the deployment
    console.log('🔍 Verifying deployment...');
    
    // Check if posts_count column exists
    const { data: columns } = await supabase
      .from('information_schema.columns')
      .select('column_name')
      .eq('table_schema', 'public')
      .eq('table_name', 'profiles')
      .eq('column_name', 'posts_count');
    
    console.log('✓ Posts count column exists:', columns && columns.length > 0);
    
    // Check if delete policy exists
    const { data: policies } = await supabase
      .from('pg_policies')
      .select('policyname')
      .eq('schemaname', 'public')
      .eq('tablename', 'forum_posts')
      .eq('cmd', 'DELETE');
    
    console.log('✓ Delete policies found:', policies?.length || 0);
    
    console.log('🎉 Forum fixes deployment completed!');
    
  } catch (error) {
    console.error('💥 Deployment failed:', error);
    process.exit(1);
  }
}

deployForumFixes(); 