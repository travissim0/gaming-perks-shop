const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function checkSchema() {
  try {
    console.log('=== Checking Database Schema ===');
    
    // Check if posts_count column exists in profiles
    const { data: columns } = await supabase
      .from('information_schema.columns')
      .select('column_name')
      .eq('table_name', 'profiles')
      .like('column_name', '%post%');
      
    console.log('Post-related columns in profiles:', columns);
    
    // Check RLS policies for forum_posts
    const { data: policies } = await supabase
      .from('pg_policies')
      .select('*')
      .eq('tablename', 'forum_posts');
      
    console.log('Forum posts RLS policies:', policies?.map(p => ({
      policyname: p.policyname,
      cmd: p.cmd,
      roles: p.roles,
      qual: p.qual,
      with_check: p.with_check
    })));
    
    // Get a sample user profile to see available fields
    const { data: sampleProfile } = await supabase
      .from('profiles')
      .select('*')
      .limit(1);
      
    console.log('Sample profile structure:', sampleProfile?.[0] ? Object.keys(sampleProfile[0]) : 'No profiles found');
    
    // Check forum_posts table structure
    const { data: postColumns } = await supabase
      .from('information_schema.columns')
      .select('column_name, data_type')
      .eq('table_name', 'forum_posts');
      
    console.log('Forum posts columns:', postColumns);
    
  } catch (error) {
    console.error('Error:', error.message);
  }
}

checkSchema(); 