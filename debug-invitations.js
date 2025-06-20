require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing Supabase environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function debugInvitations() {
  console.log('🔍 Debug Invitations Loading...\n');

  try {
    // Get a user who should have invitations
    console.log('1️⃣ Finding user with invitations...');
    const { data: invites, error: inviteError } = await supabase
      .from('squad_invites')
      .select('invited_player_id, profiles!squad_invites_invited_player_id_fkey(in_game_alias)')
      .eq('status', 'pending')
      .gt('expires_at', new Date().toISOString())
      .limit(1);

    if (inviteError) throw inviteError;

    if (!invites || invites.length === 0) {
      console.log('❌ No pending invitations found');
      return;
    }

    const targetUser = invites[0];
    console.log(`✅ Found user with invitations: ${targetUser.profiles?.in_game_alias} (${targetUser.invited_player_id})`);

    // Test the exact same query the frontend uses
    console.log('\n2️⃣ Testing frontend invitation query...');
    const { data: frontendInvites, error: frontendError } = await supabase
      .from('squad_invites')
      .select(`
        id,
        squad_id,
        message,
        created_at,
        expires_at,
        status,
        squads!inner(
          id,
          name,
          tag,
          is_active,
          is_legacy
        ),
        profiles!squad_invites_invited_by_fkey(
          in_game_alias
        )
      `)
      .eq('invited_player_id', targetUser.invited_player_id)
      .eq('status', 'pending')
      .gt('expires_at', new Date().toISOString())
      .order('created_at', { ascending: false });

    if (frontendError) throw frontendError;

    console.log(`✅ Found ${frontendInvites?.length || 0} invitations using frontend query`);

    if (frontendInvites && frontendInvites.length > 0) {
      frontendInvites.forEach((invite, index) => {
        console.log(`\n   Invitation ${index + 1}:`);
        console.log(`   - Squad: [${invite.squads.tag}] ${invite.squads.name}`);
        console.log(`   - Is Legacy: ${invite.squads.is_legacy}`);
        console.log(`   - Is Active: ${invite.squads.is_active}`);
        console.log(`   - Invited by: ${invite.profiles?.in_game_alias || 'Unknown'}`);
        console.log(`   - Created: ${invite.created_at}`);
        console.log(`   - Expires: ${invite.expires_at}`);
      });
    }

    // Test filtering logic
    console.log('\n3️⃣ Testing frontend filtering logic...');
    const filteredInvites = frontendInvites?.filter((invite) => {
      const isFromLegacySquad = invite.squads?.is_legacy === true;
      const isFromActiveSquad = invite.squads?.is_active !== false;
      
      console.log(`   - Squad ${invite.squads.name}: Legacy=${isFromLegacySquad}, Active=${isFromActiveSquad}, Should show=${isFromLegacySquad || isFromActiveSquad}`);
      
      return isFromLegacySquad || isFromActiveSquad;
    });

    console.log(`✅ After filtering: ${filteredInvites?.length || 0} invitations should be shown`);

    // Check user's current squad
    console.log('\n4️⃣ Checking user\'s current squad...');
    const { data: userSquadData, error: squadError } = await supabase
      .from('squad_members')
      .select(`squads!inner(id, name, tag, is_legacy)`)
      .eq('player_id', targetUser.invited_player_id)
      .eq('status', 'active')
      .limit(1)
      .maybeSingle();

    if (squadError) {
      console.log('⚠️ Error checking user squad:', squadError.message);
    } else if (userSquadData) {
      console.log(`✅ User is in squad: [${userSquadData.squads.tag}] ${userSquadData.squads.name} (Legacy: ${userSquadData.squads.is_legacy})`);
    } else {
      console.log('✅ User is not in any squad');
    }

    console.log('\n🎉 Debug completed successfully!');

  } catch (error) {
    console.error('❌ Debug failed:', error.message);
    console.error('Full error:', error);
  }
}

// Run the debug
debugInvitations().then(() => {
  console.log('\n✅ Debug script finished');
  process.exit(0);
}).catch(error => {
  console.error('❌ Debug script failed:', error);
  process.exit(1);
}); 