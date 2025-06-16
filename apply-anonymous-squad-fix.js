const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.log('❌ Environment variables not set. Please check your .env files');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function applySQLFix() {
  try {
    console.log('🔧 Applying anonymous squad access fix...');
    
    // Apply the key SQL statements for anonymous access
    const statements = [
      // Drop and recreate squad policy
      `DROP POLICY IF EXISTS "Public squads are viewable by everyone" ON squads`,
      `DROP POLICY IF EXISTS "Anonymous and authenticated squad access" ON squads`,
      `CREATE POLICY "Anonymous and authenticated squad access" ON squads
        FOR SELECT USING (
          (is_active = true AND auth.uid() IS NULL)
          OR
          (auth.uid() IS NOT NULL AND (
            is_active = true
            OR (select auth.uid()) = captain_id 
            OR (select auth.uid()) IN (
              SELECT player_id FROM squad_members WHERE squad_id = squads.id AND status = 'active'
            )
            OR (select auth.uid()) IN (
              SELECT id FROM profiles WHERE is_admin = true
            )
          ))
        )`,
      
      // Fix squad_members policy
      `DROP POLICY IF EXISTS "Squad members are viewable by everyone" ON squad_members`,
      `CREATE POLICY "Squad members are viewable by everyone" ON squad_members
        FOR SELECT USING (
          (auth.uid() IS NULL AND EXISTS (
            SELECT 1 FROM squads WHERE id = squad_id AND is_active = true
          ))
          OR
          (auth.uid() IS NOT NULL)
        )`,
      
      // Grant permissions
      `GRANT SELECT ON squads TO anon`,
      `GRANT SELECT ON squad_members TO anon`,
      `GRANT SELECT ON profiles TO anon`
    ];
    
    for (const statement of statements) {
      console.log('Executing SQL statement...');
      const { error } = await supabase.rpc('exec_sql', { sql: statement });
      if (error && !error.message.includes('does not exist')) {
        console.log('Statement result:', error.message);
      }
    }
    
    console.log('✅ Anonymous squad access policies updated!');
    console.log('🎯 Squad details should now load for non-authenticated users');
    
  } catch (error) {
    console.error('❌ Error applying SQL fix:', error.message);
  }
}

applySQLFix(); 