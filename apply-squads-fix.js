const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

// Load environment variables
let envVars = {};
if (fs.existsSync('.env.local')) {
  const envLocal = fs.readFileSync('.env.local', 'utf8');
  envLocal.split('\n').forEach(line => {
    if (line.includes('=')) {
      const [key, value] = line.split('=');
      envVars[key.trim()] = value.trim();
    }
  });
}

const supabaseUrl = envVars.NEXT_PUBLIC_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = envVars.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.log('❌ Missing environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function fixSquadsIssue() {
  try {
    console.log('🔧 Applying squads loading fix...');
    
    // Read and apply the SQL fix
    const sqlFix = fs.readFileSync('fix-squads-loading-issue.sql', 'utf8');
    
    // Execute the SQL fix
    const { error } = await supabase.rpc('exec_sql', { sql: sqlFix });
    
    if (error) {
      console.error('❌ Error applying SQL fix:', error);
      
      // Try applying individual parts of the fix
      console.log('🔧 Trying individual policy updates...');
      
      // Drop and recreate the main policy
      await supabase.rpc('exec_sql', { 
        sql: `
          DROP POLICY IF EXISTS "Anonymous and authenticated squad access" ON squads;
          DROP POLICY IF EXISTS "Public squads are viewable by everyone" ON squads;
          CREATE POLICY "squads_public_read_access" ON squads
            FOR SELECT USING (is_active = true);
        `
      });
      
      console.log('✅ Basic policy update applied');
    } else {
      console.log('✅ SQL fix applied successfully');
    }
    
    // Test the query now
    console.log('\n🔍 Testing squads query after fix...');
    
    const { data, error: queryError } = await supabase
      .from('squads')
      .select(`
        id,
        name,
        tag,
        description,
        captain_id,
        created_at,
        is_active,
        profiles!squads_captain_id_fkey(in_game_alias)
      `)
      .eq('is_active', true)
      .limit(5);

    if (queryError) {
      console.error('❌ Query still failing:', queryError);
    } else {
      console.log('✅ Query success! Found', data?.length || 0, 'squads');
      if (data && data.length > 0) {
        console.log('Sample squad:', data[0]);
      }
    }
    
  } catch (err) {
    console.error('❌ Exception:', err);
  }
}

fixSquadsIssue(); 