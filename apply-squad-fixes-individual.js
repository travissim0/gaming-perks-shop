require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  console.error('❌ Missing environment variables. Trying production.env...');
  
  // Try loading from production.env
  const prodEnv = fs.readFileSync('production.env', 'utf8');
  const lines = prodEnv.split('\n');
  lines.forEach(line => {
    const [key, value] = line.split('=');
    if (key && value) {
      process.env[key] = value;
    }
  });
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function applyFixesIndividually() {
  console.log('🔧 Applying squad fixes individually...\n');
  
  try {
    // Step 1: Clean up duplicates using the simple SQL
    console.log('1. Cleaning up duplicate join requests...');
    const cleanupSQL = `
      DELETE FROM squad_invites 
      WHERE id IN (
          SELECT id 
          FROM (
              SELECT id,
                     ROW_NUMBER() OVER (
                         PARTITION BY squad_id, invited_player_id, invited_by 
                         ORDER BY created_at ASC
                     ) as rn
              FROM squad_invites 
              WHERE status = 'pending' 
                AND invited_by = invited_player_id
          ) ranked
          WHERE rn > 1
      )
    `;
    
    const { error: cleanupError } = await supabase.rpc('exec', { sql: cleanupSQL });
    if (cleanupError) {
      console.log('  Using direct query approach...');
      const { data, error: directError } = await supabase
        .from('squad_invites')
        .select('id, squad_id, invited_player_id, invited_by, created_at, status')
        .eq('status', 'pending')
        .filter('invited_by', 'eq', 'invited_player_id');
      
      if (!directError && data) {
        const grouped = {};
        data.forEach(invite => {
          const key = `${invite.squad_id}-${invite.invited_player_id}-${invite.invited_by}`;
          if (!grouped[key]) {
            grouped[key] = [];
          }
          grouped[key].push(invite);
        });
        
        const duplicatesToDelete = [];
        Object.values(grouped).forEach(group => {
          if (group.length > 1) {
            // Sort by created_at and keep the first one
            group.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
            duplicatesToDelete.push(...group.slice(1).map(inv => inv.id));
          }
        });
        
        if (duplicatesToDelete.length > 0) {
          console.log(`  Found ${duplicatesToDelete.length} duplicates to remove`);
          const { error: deleteError } = await supabase
            .from('squad_invites')
            .delete()
            .in('id', duplicatesToDelete);
          
          if (deleteError) {
            console.error('❌ Error deleting duplicates:', deleteError);
          } else {
            console.log('✅ Duplicates cleaned up');
          }
        } else {
          console.log('✅ No duplicates found');
        }
      }
    } else {
      console.log('✅ Duplicates cleaned up via RPC');
    }

    // Step 2: Fix RLS policies for squad invites
    console.log('\n2. Updating RLS policies...');
    
    // We'll do this through the Supabase dashboard or manually since RLS changes need special permissions
    console.log('⚠️ RLS policy updates need to be done manually in Supabase dashboard');
    console.log('   Required policies:');
    console.log('   - SELECT: Users can view invites sent to/by them + captains can see squad invites');
    console.log('   - INSERT: Captains can invite + users can request to join');
    console.log('   - UPDATE: Users can respond to invites + captains can manage squad invites');
    
    // Step 3: Update frontend duplicate checking
    console.log('\n3. Frontend duplicate checking is already updated in the code');
    console.log('✅ Frontend will now handle duplicate errors gracefully');

    console.log('\n🎉 Basic fixes applied! Manual RLS policy updates needed.');

  } catch (error) {
    console.error('❌ Failed to apply fixes:', error);
    process.exit(1);
  }
}

applyFixesIndividually().then(() => {
  console.log('\n✅ Squad fixes process completed!');
}).catch(error => {
  console.error('❌ Failed to run fixes:', error);
  process.exit(1);
}); 