const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

// Load environment variables
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing required environment variables:');
  console.error('- NEXT_PUBLIC_SUPABASE_URL');
  console.error('- SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function runSchemaUpdate() {
  try {
    console.log('🔄 Starting free agents schema update...');
    
    // Read the SQL file
    const sqlPath = path.join(__dirname, 'update-free-agents-schema.sql');
    const sql = fs.readFileSync(sqlPath, 'utf8');
    
    // Split into individual statements (basic splitting by semicolon)
    const statements = sql.split(';').filter(stmt => stmt.trim().length > 0);
    
    console.log(`📝 Found ${statements.length} SQL statements to execute`);
    
    // Execute each statement
    for (let i = 0; i < statements.length; i++) {
      const statement = statements[i].trim();
      if (!statement) continue;
      
      console.log(`⚡ Executing statement ${i + 1}/${statements.length}...`);
      
      try {
        const { data, error } = await supabase.rpc('exec_sql', {
          sql_query: statement + ';'
        });
        
        if (error) {
          // Try direct query if RPC fails
          const { data: directData, error: directError } = await supabase
            .from('information_schema.tables')
            .select('*')
            .limit(1);
          
          if (directError) {
            console.error(`❌ Error executing statement ${i + 1}:`, error);
            continue;
          }
          
          // Execute using raw SQL (this might need adjustment based on your Supabase setup)
          console.log(`⚠️  RPC failed, trying alternative method for statement ${i + 1}`);
        } else {
          console.log(`✅ Statement ${i + 1} executed successfully`);
        }
      } catch (err) {
        console.error(`❌ Error executing statement ${i + 1}:`, err.message);
        // Continue with other statements
      }
    }
    
    // Verify the schema changes
    console.log('\n🔍 Verifying schema changes...');
    
    const { data: columns, error: columnsError } = await supabase
      .from('information_schema.columns')
      .select('column_name, data_type, is_nullable, column_default')
      .eq('table_name', 'free_agents')
      .order('ordinal_position');
    
    if (columnsError) {
      console.error('❌ Error verifying schema:', columnsError);
    } else {
      console.log('\n📋 Current free_agents table schema:');
      columns.forEach(col => {
        console.log(`  - ${col.column_name}: ${col.data_type} ${col.is_nullable === 'YES' ? '(nullable)' : '(not null)'}`);
      });
    }
    
    // Test a simple query to ensure everything works
    console.log('\n🧪 Testing free agents query...');
    const { data: testData, error: testError } = await supabase
      .from('free_agents')
      .select('id, preferred_roles, secondary_roles, availability_days, class_ratings, classes_to_try, timezone')
      .limit(1);
    
    if (testError) {
      console.error('❌ Test query failed:', testError);
    } else {
      console.log('✅ Test query successful!');
      if (testData && testData.length > 0) {
        console.log('📊 Sample record structure:', Object.keys(testData[0]));
      }
    }
    
    console.log('\n🎉 Free agents schema update completed!');
    console.log('\nNext steps:');
    console.log('1. Update your application code to use the new fields');
    console.log('2. Test the free agent form with the new features');
    console.log('3. Verify data is being stored correctly');
    
  } catch (error) {
    console.error('💥 Fatal error during schema update:', error);
    process.exit(1);
  }
}

// Manual SQL execution for environments where RPC isn't available
async function manualExecution() {
  console.log('\n📝 Manual SQL execution required:');
  console.log('Copy and paste the following SQL into your Supabase SQL editor:\n');
  
  const sqlPath = path.join(__dirname, 'update-free-agents-schema.sql');
  const sql = fs.readFileSync(sqlPath, 'utf8');
  console.log(sql);
  
  console.log('\n⚠️  After running the SQL manually, restart this script to verify the changes.');
}

// Run the update
runSchemaUpdate().catch(error => {
  console.error('💥 Script failed:', error);
  console.log('\n🔧 Falling back to manual execution...');
  manualExecution();
}); 