require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing Supabase environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function checkPendingRequests() {
  console.log('🔍 Checking for existing pending requests...\n');

  try {
    // Find the user who got the duplicate constraint error
    const { data: user } = await supabase
      .from('profiles')
      .select('id, in_game_alias')
      .eq('in_game_alias', 'CT')
      .single();
    
    if (!user) {
      console.log('❌ CT user not found');
      return;
    }
    
    console.log('✅ Found user:', user.in_game_alias, user.id);
    
    // Check for pending requests made by this user
    const { data: requests, error } = await supabase
      .from('squad_invites')
      .select(`
        id,
        squad_id,
        status,
        created_at,
        expires_at,
        squads!inner(
          name,
          tag,
          is_legacy
        )
      `)
      .eq('invited_player_id', user.id)
      .eq('invited_by', user.id)
      .eq('status', 'pending')
      .gt('expires_at', new Date().toISOString());
    
    if (error) {
      console.error('❌ Error:', error);
      return;
    }
    
    console.log('📋 Found', requests?.length || 0, 'pending requests:');
    
    if (requests && requests.length > 0) {
      requests.forEach((req, index) => {
        console.log(`   Request ${index + 1}:`);
        console.log(`   - Squad: [${req.squads.tag}] ${req.squads.name}`);
        console.log(`   - Is Legacy: ${req.squads.is_legacy}`);
        console.log(`   - Created: ${req.created_at}`);
        console.log(`   - Expires: ${req.expires_at}`);
        console.log(`   - ID: ${req.id}`);
        console.log('');
      });
    } else {
      console.log('   No pending requests found');
    }

    // Also check for any legacy squads that might be involved
    console.log('🏴 Checking legacy squads...');
    const { data: legacySquads } = await supabase
      .from('squads')
      .select('id, name, tag, is_legacy')
      .eq('is_legacy', true);
    
    console.log('Found', legacySquads?.length || 0, 'legacy squads:');
    if (legacySquads && legacySquads.length > 0) {
      legacySquads.forEach((squad, index) => {
        console.log(`   ${index + 1}. [${squad.tag}] ${squad.name}`);
      });
    }

  } catch (error) {
    console.error('❌ Error checking requests:', error);
  }
}

checkPendingRequests().then(() => {
  console.log('\n✅ Check completed');
  process.exit(0);
}).catch(error => {
  console.error('❌ Script failed:', error);
  process.exit(1);
}); 