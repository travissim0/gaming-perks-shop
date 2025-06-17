const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: 'production.env' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function debugSquadMembership() {
  console.log('🔍 Debugging squad membership issues...');
  console.log('Supabase URL:', process.env.NEXT_PUBLIC_SUPABASE_URL ? 'Found' : 'Missing');
  console.log('Service key:', process.env.SUPABASE_SERVICE_ROLE_KEY ? 'Found' : 'Missing');
  
  // Get a sample of squad members to see the data structure
  const { data: members, error } = await supabase
    .from('squad_members')
    .select(`
      id,
      squad_id,
      player_id,
      role,
      profiles!squad_members_player_id_fkey(in_game_alias, email)
    `)
    .limit(10);
    
  if (error) {
    console.error('❌ Error:', error);
    return;
  }
  
  console.log('✅ Sample squad members:');
  members.forEach(member => {
    console.log(`  ${member.profiles?.in_game_alias} (${member.player_id}) - Squad ${member.squad_id} - Role: ${member.role}`);
  });
  
  // Check if any user has multiple squad memberships
  const { data: duplicates, error: dupError } = await supabase
    .from('squad_members')
    .select('player_id, squad_id, profiles!squad_members_player_id_fkey(in_game_alias)')
    .order('player_id');
    
  if (dupError) {
    console.error('❌ Duplicate check error:', dupError);
    return;
  }
  
  const playerCounts = {};
  duplicates.forEach(member => {
    if (!playerCounts[member.player_id]) {
      playerCounts[member.player_id] = [];
    }
    playerCounts[member.player_id].push({
      squad_id: member.squad_id,
      alias: member.profiles?.in_game_alias
    });
  });
  
  // Find players in multiple squads
  const multiSquadPlayers = Object.entries(playerCounts).filter(([playerId, squads]) => squads.length > 1);
  
  if (multiSquadPlayers.length > 0) {
    console.log('⚠️  Players in multiple squads:');
    multiSquadPlayers.forEach(([playerId, squads]) => {
      console.log(`  Player ${playerId} (${squads[0].alias}): ${squads.length} squads`);
      squads.forEach(squad => console.log(`    - Squad ${squad.squad_id}`));
    });
  } else {
    console.log('✅ No players found in multiple squads');
  }

  // Check recent squad events to see leave attempts
  const { data: events, error: eventsError } = await supabase
    .from('player_events')
    .select(`
      event_type,
      description,
      created_at,
      profiles!player_events_player_id_fkey(in_game_alias)
    `)
    .in('event_type', ['squad_left', 'squad_joined'])
    .order('created_at', { ascending: false })
    .limit(20);
    
  if (!eventsError && events) {
    console.log('\n📋 Recent squad join/leave events:');
    events.forEach(event => {
      console.log(`  ${event.created_at} - ${event.profiles?.in_game_alias}: ${event.event_type}`);
    });
  }
}

debugSquadMembership().catch(console.error); 