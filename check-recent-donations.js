require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

// Use service role to bypass RLS
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function checkRecentDonations() {
  try {
    console.log('🔍 Checking recent donations...');
    console.log('🔗 Supabase URL:', process.env.NEXT_PUBLIC_SUPABASE_URL ? 'Set' : 'Missing');
    console.log('🔑 Service Role Key:', process.env.SUPABASE_SERVICE_ROLE_KEY ? 'Set' : 'Missing');
    
    const { data: donations, error } = await supabase
      .from('donation_transactions')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(5);

    if (error) {
      console.error('❌ Error:', error);
      return;
    }

    console.log('\n📊 Recent Donations:');
    donations.forEach((donation, i) => {
      console.log(`\n${i + 1}. ID: ${donation.id}`);
      console.log(`   Payment Method: ${donation.payment_method || 'NULL'}`);
      console.log(`   Amount: $${(donation.amount_cents / 100).toFixed(2)}`);
      console.log(`   Email: ${donation.customer_email}`);
      console.log(`   Ko-fi Transaction ID: ${donation.kofi_transaction_id || 'NULL'}`);
      console.log(`   Ko-fi From Name: ${donation.kofi_from_name || 'NULL'}`);
      console.log(`   Created: ${donation.created_at}`);
    });

    // Check for any Ko-fi specific data
    const kofiDonations = donations.filter(d => 
      d.kofi_transaction_id || d.kofi_from_name || d.payment_method === 'kofi'
    );

    if (kofiDonations.length > 0) {
      console.log('\n☕ Ko-fi Related Donations Found:');
      kofiDonations.forEach(d => {
        console.log(`- ${d.id}: method="${d.payment_method}", kofi_id="${d.kofi_transaction_id}"`);
      });
    } else {
      console.log('\n⚠️ No Ko-fi related donations found');
    }

  } catch (error) {
    console.error('❌ Script error:', error.message);
  }
}

checkRecentDonations(); 