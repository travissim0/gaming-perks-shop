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

async function debugSquadMembers() {
  try {
    console.log('🔍 Debugging squad members data...');
    
    // First, check the squad_members table structure
    console.log('\n📋 Checking squad_members table structure...');
    const { data: columns, error: structError } = await supabase
      .rpc('get_table_columns', { table_name: 'squad_members' })
      .limit(10);
    
    if (structError) {
      console.log('Could not get table structure, trying direct query...');
    } else {
      console.log('Table columns:', columns);
    }
    
    // Get sample squad_members data
    console.log('\n📊 Getting sample squad_members data...');
    const { data: members, error: membersError } = await supabase
      .from('squad_members')
      .select('*')
      .limit(10);
    
    if (membersError) {
      console.error('❌ Error getting squad members:', membersError);
    } else {
      console.log('✅ Found', members?.length || 0, 'squad members');
      if (members && members.length > 0) {
        console.log('Sample member data:', members[0]);
        
        // Check what status values exist
        const statuses = [...new Set(members.map(m => m.status))];
        console.log('Status values found:', statuses);
      }
    }
    
    // Check specific squad member counts
    console.log('\n🔢 Checking member counts by squad...');
    const { data: squadIds, error: squadError } = await supabase
      .from('squads')
      .select('id, name, tag')
      .eq('is_active', true)
      .limit(5);
    
    if (squadError) {
      console.error('❌ Error getting squads:', squadError);
      return;
    }
    
    for (const squad of squadIds || []) {
      // Count all members for this squad
      const { data: allMembers, error: allError } = await supabase
        .from('squad_members')
        .select('status')
        .eq('squad_id', squad.id);
      
      // Count active members
      const { data: activeMembers, error: activeError } = await supabase
        .from('squad_members')
        .select('status')
        .eq('squad_id', squad.id)
        .eq('status', 'active');
      
      // Count approved members (alternative status)
      const { data: approvedMembers, error: approvedError } = await supabase
        .from('squad_members')
        .select('status')
        .eq('squad_id', squad.id)
        .eq('status', 'approved');
      
      console.log(`Squad [${squad.tag}] ${squad.name}:`);
      console.log(`  - All members: ${allMembers?.length || 0}`);
      console.log(`  - Active status: ${activeMembers?.length || 0}`);
      console.log(`  - Approved status: ${approvedMembers?.length || 0}`);
      if (allMembers && allMembers.length > 0) {
        const statuses = [...new Set(allMembers.map(m => m.status))];
        console.log(`  - Status values: ${statuses.join(', ')}`);
      }
      console.log('');
    }
    
  } catch (err) {
    console.error('❌ Exception:', err);
  }
}

debugSquadMembers(); 