require('dotenv').config({ path: '.env.local' });

async function checkAllDonations() {
  console.log('🔍 Checking All Donations in Database...\n');
  
  try {
    // Import Supabase client
    const { createClient } = require('@supabase/supabase-js');
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );
    
    console.log('📊 Fetching all donations...');
    
    // Get all donations
    const { data: donations, error } = await supabase
      .from('donation_transactions')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(20);
    
    if (error) {
      console.log('❌ Database error:', error.message);
      return;
    }
    
    console.log(`📋 Found ${donations.length} total donations:`);
    
    if (donations.length === 0) {
      console.log('   No donations found in database');
    } else {
      donations.forEach((donation, index) => {
        console.log(`\n   ${index + 1}. ${donation.id}:`);
        console.log(`      Amount: $${(donation.amount_cents / 100).toFixed(2)} ${donation.currency || 'USD'}`);
        console.log(`      Status: ${donation.status}`);
        console.log(`      Method: ${donation.payment_method || 'unknown'}`);
        console.log(`      Email: ${donation.customer_email || 'N/A'}`);
        console.log(`      Created: ${new Date(donation.created_at).toLocaleString()}`);
        console.log(`      Square ID: ${donation.square_payment_id || 'N/A'}`);
        
        // Highlight the one we just added
        if (donation.square_payment_id === '3f41BwwODSrn6MMirlorJ5YG1jDZY') {
          console.log(`      🎯 THIS IS YOUR $1 DONATION!`);
        }
      });
      
      // Look for $1 donations specifically
      const oneDollarDonations = donations.filter(d => d.amount_cents === 100);
      console.log(`\n💰 Found ${oneDollarDonations.length} $1.00 donation(s) in total`);
      
      // Look for Square donations
      const squareDonations = donations.filter(d => d.payment_method === 'square');
      console.log(`🟦 Found ${squareDonations.length} Square donation(s) in total`);
      
      // Check the most recent donation
      if (donations.length > 0) {
        const latest = donations[0];
        console.log(`\n📅 Most recent donation:`);
        console.log(`   $${(latest.amount_cents / 100).toFixed(2)} via ${latest.payment_method} at ${new Date(latest.created_at).toLocaleString()}`);
      }
    }
    
  } catch (error) {
    console.log('❌ Script error:', error.message);
  }
}

checkAllDonations().catch(console.error); 