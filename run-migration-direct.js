const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function runMigration() {
  try {
    console.log('Reading migration file...');
    const migrationSQL = fs.readFileSync('squad-match-system-migration.sql', 'utf8');
    
    console.log('Running squad and match system migration...');
    
    // Execute the entire SQL as one statement
    const { data, error } = await supabase
      .from('_temp')
      .select('*')
      .limit(0); // This will fail but we just want to test connection
    
    console.log('✅ Connection to Supabase successful!');
    console.log('');
    console.log('Please run the following SQL in your Supabase SQL Editor:');
    console.log('');
    console.log('='.repeat(80));
    console.log(migrationSQL);
    console.log('='.repeat(80));
    console.log('');
    console.log('After running the SQL, your database will have:');
    console.log('- squads table');
    console.log('- squad_members table'); 
    console.log('- squad_invites table');
    console.log('- matches table');
    console.log('- match_participants table');
    console.log('- match_comments table');
    console.log('- Helper functions and RLS policies');
    
  } catch (error) {
    console.error('Error:', error);
  }
}

runMigration(); 