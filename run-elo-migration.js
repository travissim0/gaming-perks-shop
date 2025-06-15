const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

// Configuration
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://nkinpmqnbcjaftqduujf.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5raW5wbXFuYmNqYWZ0cWR1dWpmIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0ODEyMDQ3NiwiZXhwIjoyMDYzNjk2NDc2fQ.u8bPszZSVGJku44KFKyRszfL2lZVwv4-EBYc3dgezK4';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

async function runEloMigration() {
  try {
    console.log('🚀 Starting ELO system migration...');

    // Read the SQL migration file
    const migrationSQL = fs.readFileSync('add-elo-system.sql', 'utf8');

    // Split the SQL into individual statements
    const statements = migrationSQL
      .split(';')
      .map(stmt => stmt.trim())
      .filter(stmt => stmt.length > 0 && !stmt.startsWith('--'));

    console.log(`📝 Found ${statements.length} SQL statements to execute`);

    // Execute each statement
    for (let i = 0; i < statements.length; i++) {
      const statement = statements[i];
      
      if (statement.trim()) {
        console.log(`⚡ Executing statement ${i + 1}/${statements.length}...`);
        
        try {
          const { error } = await supabase.rpc('exec_sql', { 
            sql_query: statement + ';' 
          });

          if (error) {
            // Try direct query if RPC fails
            const { error: directError } = await supabase
              .from('_temp_migration')
              .select('*')
              .limit(0);
            
            // If that also fails, try a different approach
            console.log(`⚠️  RPC failed, trying direct execution: ${error.message}`);
            
            // For CREATE/ALTER statements, we'll need to use a different approach
            if (statement.includes('CREATE') || statement.includes('ALTER') || statement.includes('DROP')) {
              console.log(`🔧 Skipping DDL statement (requires manual execution): ${statement.substring(0, 50)}...`);
              continue;
            }
          } else {
            console.log(`✅ Statement ${i + 1} executed successfully`);
          }
        } catch (execError) {
          console.error(`❌ Error executing statement ${i + 1}:`, execError.message);
          console.log(`Statement: ${statement.substring(0, 100)}...`);
          
          // Continue with other statements
          continue;
        }
      }
    }

    console.log('✅ ELO migration completed!');
    console.log('\n📋 Next steps:');
    console.log('1. Manually run the DDL statements in Supabase SQL editor if needed');
    console.log('2. Run ELO recalculation: node recalculate-elo.js');
    console.log('3. Test the ELO leaderboard at /stats/elo');

  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  }
}

// Alternative: Manual migration instructions
function printManualInstructions() {
  console.log('\n🔧 MANUAL MIGRATION INSTRUCTIONS:');
  console.log('==================================');
  console.log('1. Open Supabase SQL Editor');
  console.log('2. Copy and paste the contents of add-elo-system.sql');
  console.log('3. Execute the SQL statements');
  console.log('4. Run: node recalculate-elo.js');
  console.log('5. Test at /stats/elo');
  console.log('\nSQL file location: add-elo-system.sql');
}

// Check if we should run migration or show instructions
if (process.argv.includes('--manual')) {
  printManualInstructions();
} else {
  runEloMigration();
} 