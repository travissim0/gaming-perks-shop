const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function checkProfilesSchema() {
  console.log('🔍 Checking profiles table schema...\n');
  
  try {
    // Check what columns exist in profiles table
    const { data, error } = await supabase.rpc('sql', {
      query: `
        SELECT 
          column_name,
          data_type,
          is_nullable,
          column_default
        FROM information_schema.columns 
        WHERE table_schema = 'public' 
          AND table_name = 'profiles'
        ORDER BY ordinal_position;
      `
    });
    
    if (error) {
      console.error('❌ Error:', error);
      return;
    }
    
    console.log('📋 Profiles table columns:');
    data.forEach(col => {
      console.log(`  - ${col.column_name} (${col.data_type}) ${col.is_nullable === 'YES' ? 'NULL' : 'NOT NULL'}`);
    });
    
    // Check if there are any admin-related columns
    const adminColumns = data.filter(col => 
      col.column_name.toLowerCase().includes('admin') || 
      col.column_name.toLowerCase().includes('role')
    );
    
    console.log('\n🔑 Admin/Role related columns:');
    if (adminColumns.length === 0) {
      console.log('  ❌ No admin or role columns found!');
    } else {
      adminColumns.forEach(col => {
        console.log(`  ✅ ${col.column_name} (${col.data_type})`);
      });
    }
    
    // Check if CTF roles tables exist
    console.log('\n🔍 Checking for CTF roles tables...');
    const { data: tables, error: tablesError } = await supabase.rpc('sql', {
      query: `
        SELECT table_name
        FROM information_schema.tables 
        WHERE table_schema = 'public' 
          AND table_name LIKE '%ctf%'
        ORDER BY table_name;
      `
    });
    
    if (tablesError) {
      console.error('❌ Error checking tables:', tablesError);
    } else if (tables.length === 0) {
      console.log('  ❌ No CTF-related tables found');
    } else {
      console.log('  ✅ CTF-related tables:');
      tables.forEach(table => {
        console.log(`    - ${table.table_name}`);
      });
    }
    
  } catch (error) {
    console.error('💥 Script failed:', error);
  }
}

checkProfilesSchema(); 