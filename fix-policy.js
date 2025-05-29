const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function fixPolicy() {
  try {
    console.log('Adding delete policy for match participants...');
    
    // First check if policy already exists
    const { data: existingPolicies, error: checkError } = await supabase
      .from('pg_policies')
      .select('policyname')
      .eq('tablename', 'match_participants')
      .eq('policyname', 'Users can delete their own participation');
    
    if (checkError) {
      console.error('Error checking existing policies:', checkError);
    }
    
    if (existingPolicies && existingPolicies.length > 0) {
      console.log('Policy already exists, skipping creation.');
      return;
    }
    
    // Create the policy using a direct SQL query
    const { data, error } = await supabase.rpc('exec_sql', { 
      sql: `CREATE POLICY "Users can delete their own participation" ON match_participants FOR DELETE USING (auth.uid() = player_id);` 
    });
    
    if (error) {
      console.error('Error creating policy:', error);
    } else {
      console.log('✅ Policy created successfully!');
    }
    
  } catch (err) {
    console.error('Error:', err);
  }
}

fixPolicy(); 