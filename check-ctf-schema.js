const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function checkSchema() {
  try {
    console.log('Checking user_ctf_roles table schema...');
    
    const { data, error } = await supabase.rpc('exec_sql', {
      sql: `
        SELECT column_name, data_type 
        FROM information_schema.columns 
        WHERE table_name = 'user_ctf_roles'
        ORDER BY ordinal_position;
      `
    });
    
    if (error) {
      console.log('Error or table does not exist:', error.message);
    } else {
      console.log('user_ctf_roles columns:', data);
    }
    
    // Check if table exists at all
    const { data: tableExists, error: tableError } = await supabase.rpc('exec_sql', {
      sql: `
        SELECT EXISTS (
          SELECT FROM information_schema.tables 
          WHERE table_name = 'user_ctf_roles'
        ) as exists;
      `
    });
    
    if (tableError) {
      console.log('Error checking table existence:', tableError.message);
    } else {
      console.log('Table exists:', tableExists);
    }
    
  } catch (err) {
    console.error('Error:', err.message);
  }
}

checkSchema(); 