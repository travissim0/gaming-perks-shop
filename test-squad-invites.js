// Test script to debug squad invites functionality
// Run with: node test-squad-invites.js

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function testSquadInvites() {
  console.log('🔍 Testing Squad Invites Functionality\n');

  // 1. Check squad_invites table structure
  console.log('1. Checking squad_invites table...');
  const { data: invites, error: invitesError } = await supabase
    .from('squad_invites')
    .select('*')
    .limit(5);

  if (invitesError) {
    console.error('❌ Error fetching squad_invites:', invitesError);
  } else {
    console.log('✅ Sample squad_invites data:');
    console.log(invites);
  }

  // 2. Check for join requests (where invited_by = invited_player_id)
  console.log('\n2. Checking for join requests...');
  const { data: joinRequests, error: joinError } = await supabase
    .from('squad_invites')
    .select('*')
    .eq('status', 'pending')
    .limit(10);

  if (joinError) {
    console.error('❌ Error fetching join requests:', joinError);
  } else {
    const selfRequests = joinRequests?.filter(req => req.invited_by === req.invited_player_id);
    console.log('✅ Join requests (self-requests):', selfRequests?.length || 0);
    if (selfRequests?.length > 0) {
      console.log(selfRequests);
    }
  }

  // 3. Check for regular invitations (where invited_by != invited_player_id)
  console.log('\n3. Checking for regular invitations...');
  if (joinRequests) {
    const regularInvites = joinRequests.filter(req => req.invited_by !== req.invited_player_id);
    console.log('✅ Regular invitations:', regularInvites?.length || 0);
    if (regularInvites?.length > 0) {
      console.log(regularInvites.slice(0, 3));
    }
  }

  // 4. Check squads table
  console.log('\n4. Checking squads...');
  const { data: squads, error: squadsError } = await supabase
    .from('squads')
    .select('id, name, tag, captain_id')
    .limit(5);

  if (squadsError) {
    console.error('❌ Error fetching squads:', squadsError);
  } else {
    console.log('✅ Sample squads:');
    console.log(squads);
  }

  // 5. Check squad_members table
  console.log('\n5. Checking squad members...');
  const { data: members, error: membersError } = await supabase
    .from('squad_members')
    .select('squad_id, player_id, role')
    .eq('status', 'active')
    .limit(10);

  if (membersError) {
    console.error('❌ Error fetching squad members:', membersError);
  } else {
    console.log('✅ Sample squad members:');
    console.log(members);
  }

  // 6. Look specifically for "Soup's Disjoint" squad
  console.log('\n6. Looking for Soup\'s Disjoint squad...');
  const { data: soupSquad, error: soupError } = await supabase
    .from('squads')
    .select('*')
    .ilike('name', '%soup%');

  if (soupError) {
    console.error('❌ Error fetching Soup\'s squad:', soupError);
  } else {
    console.log('✅ Soup\'s squad data:');
    console.log(soupSquad);
    
    if (soupSquad && soupSquad.length > 0) {
      // Check for join requests to this squad
      const squadId = soupSquad[0].id;
      const { data: soupRequests, error: soupRequestsError } = await supabase
        .from('squad_invites')
        .select('*')
        .eq('squad_id', squadId)
        .eq('status', 'pending');
        
      if (soupRequestsError) {
        console.error('❌ Error fetching requests to Soup\'s squad:', soupRequestsError);
      } else {
        console.log('✅ Requests to Soup\'s squad:', soupRequests);
      }
    }
  }

  console.log('\n🏁 Test completed!');
}

testSquadInvites().catch(console.error); 