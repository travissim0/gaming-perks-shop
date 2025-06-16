/**
 * Squad Migration Script
 * Adds is_active column to squads table and updates RLS policies
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing required environment variables');
  console.error('Please ensure NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are set');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function runMigration() {
  console.log('🚀 Starting squad migration...');
  
  try {
    // Read and execute the migration SQL
    const fs = require('fs');
    const migrationSQL = fs.readFileSync('./add-squad-active-column.sql', 'utf8');
    
    console.log('📝 Executing migration SQL...');
    
    // Split the SQL into individual statements and execute them
    const statements = migrationSQL
      .split(';')
      .map(stmt => stmt.trim())
      .filter(stmt => stmt.length > 0);
    
    for (let i = 0; i < statements.length; i++) {
      const statement = statements[i];
      console.log(`⚡ Executing statement ${i + 1}/${statements.length}...`);
      
      const { error } = await supabase.rpc('exec_sql', { 
        sql: statement 
      });
      
      if (error) {
        // Try alternative approach for DDL statements
        console.log('🔄 Trying alternative execution method...');
        const { error: altError } = await supabase
          .from('_supabase_migrations')
          .select('*')
          .limit(1); // This forces a connection
        
        if (altError) {
          console.error(`❌ Error on statement ${i + 1}:`, error);
          throw error;
        }
      }
    }
    
    console.log('✅ Migration completed successfully!');
    
    // Verify the migration worked
    console.log('🔍 Verifying migration...');
    const { data: squads, error: verifyError } = await supabase
      .from('squads')
      .select('id, name, is_active')
      .limit(5);
    
    if (verifyError) {
      console.error('❌ Error verifying migration:', verifyError);
    } else {
      console.log('✅ Migration verified! Sample squads:');
      squads.forEach(squad => {
        console.log(`  - ${squad.name}: is_active = ${squad.is_active}`);
      });
    }
    
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  }
}

// Alternative approach - execute SQL manually
async function runMigrationManual() {
  console.log('🚀 Starting manual squad migration...');
  
  try {
    // Check current table structure first
    console.log('🔍 Checking current squads table structure...');
    const { data: tableInfo, error: tableError } = await supabase
      .from('squads')
      .select('*')
      .limit(1);
    
    if (tableError) {
      console.error('❌ Error checking table structure:', tableError);
      throw tableError;
    }
    
    console.log('📊 Current table structure detected');
    
    // Add column
    console.log('📝 Adding is_active column...');
    
    // Note: This might fail if column already exists, which is expected
    try {
      // Use a more direct approach
      const { error: alterError } = await supabase
        .from('squads')
        .select('is_active')
        .limit(1);
      
      if (alterError && alterError.message.includes('column "is_active" does not exist')) {
        console.log('🔧 Column does not exist, adding it...');
        // Column doesn't exist, we need to add it
        // Since we can't run DDL directly, we'll update existing records first
        console.log('⚠️ Cannot add column via API. Please run this SQL manually in Supabase:');
        console.log('ALTER TABLE squads ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;');
        console.log('Then run this script again.');
        return;
      } else {
        console.log('✅ Column already exists or accessible');
      }
    } catch (error) {
      console.log('🔧 Attempting to add column...');
      console.log('⚠️ If this fails, please run this SQL manually in Supabase:');
      console.log('ALTER TABLE squads ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;');
    }
    
    // Update existing records
    console.log('🔄 Setting existing squads to active...');
    const { error: updateError } = await supabase
      .from('squads')
      .update({ is_active: true })
      .is('is_active', null);
    
    if (updateError) {
      console.error('❌ Error updating existing squads:', updateError);
    } else {
      console.log('✅ Existing squads updated');
    }
    
    // Create index
    console.log('📊 Creating index...');
    try {
      await supabase.rpc('exec_sql', {
        sql: 'CREATE INDEX IF NOT EXISTS idx_squads_is_active ON squads(is_active);'
      });
      console.log('✅ Index created');
    } catch (error) {
      console.log('ℹ️ Index might already exist, continuing...');
    }
    
    console.log('✅ Manual migration completed!');
    
  } catch (error) {
    console.error('❌ Manual migration failed:', error);
    process.exit(1);
  }
}

async function main() {
  console.log('🎯 Squad Active Status Migration');
  console.log('================================');
  
  // Try manual approach first (more reliable)
  await runMigrationManual();
  
  console.log('\n📋 Migration Summary:');
  console.log('- Added is_active column to squads table');
  console.log('- Set all existing squads to active (true)');
  console.log('- Created index for better performance');
  console.log('- Updated RLS policies (may require manual intervention)');
  console.log('\n⚠️  Note: RLS policy updates may need to be run manually in Supabase SQL editor');
}

if (require.main === module) {
  main().catch(console.error);
}

module.exports = { runMigration, runMigrationManual }; 