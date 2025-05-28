require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function checkProfilesTable() {
  try {
    console.log('🔍 Checking profiles table structure...\n');

    // Check if we can query the profiles table
    const { data: sampleData, error: queryError } = await supabase
      .from('profiles')
      .select('*')
      .limit(1);

    if (queryError) {
      console.error('❌ Error querying profiles table:', queryError);
      return;
    }

    console.log('✅ Profiles table is accessible');

    // Check the table structure by trying to insert a test record
    console.log('🧪 Testing profile creation with required fields...');

    const testUserId = '00000000-0000-0000-0000-000000000000';
    const testData = {
      id: testUserId,
      email: 'test@example.com',
      in_game_alias: 'TestPlayer',
      registration_status: 'pending_verification'
    };

    console.log('Test data:', testData);

    // Try to insert (this will fail but show us the error)
    const { data: insertData, error: insertError } = await supabase
      .from('profiles')
      .insert([testData])
      .select();

    if (insertError) {
      console.error('❌ Profile insertion test failed:', insertError);
      console.error('Error details:', JSON.stringify(insertError, null, 2));
      
      if (insertError.message.includes('registration_status')) {
        console.log('\n💡 The registration_status column is missing!');
        console.log('Please run this SQL in your Supabase dashboard:');
        console.log('');
        console.log('ALTER TABLE profiles ADD COLUMN registration_status TEXT DEFAULT \'completed\';');
        console.log('');
      }
    } else {
      console.log('✅ Profile creation test successful');
      
      // Clean up the test record
      await supabase
        .from('profiles')
        .delete()
        .eq('id', testUserId);
      
      console.log('🧹 Test record cleaned up');
    }

    // Show current table structure
    console.log('\n📋 Current profiles table sample:');
    const { data: currentData } = await supabase
      .from('profiles')
      .select('*')
      .limit(3);

    if (currentData && currentData.length > 0) {
      console.log('Columns found:', Object.keys(currentData[0]));
    } else {
      console.log('No existing profiles found');
    }

  } catch (error) {
    console.error('❌ Script error:', error);
  }
}

checkProfilesTable(); 