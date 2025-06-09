const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
require('dotenv').config({ path: './production.env' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function runMigration() {
  console.log('🔧 Running database migration to add expires_at column...\n');
  
  try {
    // Read the SQL migration file
    const migrationSQL = fs.readFileSync('add-expires-at-column.sql', 'utf8');
    
    console.log('📄 SQL Migration:');
    console.log(migrationSQL);
    console.log('\n🚀 Executing migration...\n');
    
    // Execute the migration
    const { data, error } = await supabase.rpc('exec_sql', {
      sql_query: migrationSQL
    });
    
    if (error) {
      console.error('❌ Migration failed:', error);
      
      // Try alternative approach using individual statements
      console.log('🔄 Trying alternative approach...');
      
      const { error: alterError } = await supabase.rpc('exec_sql', {
        sql_query: `ALTER TABLE user_products ADD COLUMN IF NOT EXISTS expires_at TIMESTAMP WITH TIME ZONE;`
      });
      
      if (alterError) {
        console.error('❌ Alternative approach failed:', alterError);
        return;
      }
      
      console.log('✅ Column added successfully using alternative approach');
    } else {
      console.log('✅ Migration completed successfully');
      console.log('📊 Result:', data);
    }
    
    // Verify the column exists
    console.log('\n🔍 Verifying column was added...');
    
    const { data: columnCheck, error: checkError } = await supabase
      .from('information_schema.columns')
      .select('column_name, data_type, is_nullable')
      .eq('table_name', 'user_products')
      .eq('column_name', 'expires_at');
      
    if (checkError) {
      console.error('❌ Verification failed:', checkError);
    } else if (columnCheck && columnCheck.length > 0) {
      console.log('✅ Column verified successfully:');
      console.log(columnCheck[0]);
    } else {
      console.log('⚠️ Column not found - migration may have failed');
    }
    
  } catch (error) {
    console.error('❌ Migration error:', error);
  }
}

runMigration(); 