require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

console.log('🔧 Environment check:');
console.log('SUPABASE_URL:', process.env.NEXT_PUBLIC_SUPABASE_URL ? 'Set' : 'Not set');
console.log('SERVICE_ROLE_KEY:', process.env.SUPABASE_SERVICE_ROLE_KEY ? 'Set' : 'Not set');

if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  console.error('❌ Missing environment variables');
  process.exit(1);
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function checkSquadIssues() {
  console.log('🔍 Checking squad invitation issues...\n');
  
  try {
    // Simple test to see if connection works
    console.log('1. Testing database connection...');
    const { data: testData, error: testError } = await supabase
      .from('squad_invites')
      .select('id')
      .limit(1);
    
    if (testError) {
      console.error('❌ Database connection failed:', testError);
      return;
    }
    
    console.log('✅ Database connection successful');

    // Check for duplicate pending requests
    console.log('\n2. Checking for duplicate pending join requests...');
    const { data: allRequests, error: reqError } = await supabase
      .from('squad_invites')
      .select('id, squad_id, invited_player_id, invited_by, status')
      .eq('status', 'pending');

    if (reqError) {
      console.error('❌ Error fetching requests:', reqError);
    } else {
      console.log(`Found ${allRequests?.length || 0} total pending requests`);
      
      // Check for self-requests (join requests)
      const selfRequests = allRequests?.filter(req => req.invited_by === req.invited_player_id) || [];
      console.log(`Found ${selfRequests.length} self-requests (join requests)`);
      
      // Group by squad_id and invited_player_id to find duplicates
      const grouped = {};
      selfRequests.forEach(req => {
        const key = `${req.squad_id}-${req.invited_player_id}`;
        if (!grouped[key]) {
          grouped[key] = [];
        }
        grouped[key].push(req);
      });

      const duplicates = Object.values(grouped).filter(group => group.length > 1);
      
      if (duplicates.length > 0) {
        console.log(`❌ Found ${duplicates.length} duplicate join request groups`);
        duplicates.forEach(group => {
          console.log(`  - ${group.length} duplicate requests for squad ${group[0].squad_id} by player ${group[0].invited_player_id}`);
        });
      } else {
        console.log('✅ No duplicate join requests found');
      }
    }

  } catch (error) {
    console.error('❌ Script error:', error);
  }
}

checkSquadIssues().then(() => {
  console.log('\n✅ Check complete');
}).catch(error => {
  console.error('❌ Failed to run check:', error);
}); 