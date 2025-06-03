require('dotenv').config({ path: '.env.local' });

async function debugRecentDonations() {
  console.log('🔍 Debugging Recent Donations...\n');
  
  try {
    // Import Supabase client
    const { createClient } = require('@supabase/supabase-js');
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );
    
    console.log('📊 Checking database for recent donations...');
    
    // Get recent donations from the last hour (simplified query)
    const { data: donations, error } = await supabase
      .from('donation_transactions')
      .select('*')
      .gte('created_at', new Date(Date.now() - 60 * 60 * 1000).toISOString()) // Last hour
      .order('created_at', { ascending: false });
    
    if (error) {
      console.log('❌ Database error:', error.message);
      console.log('Trying to check table structure...');
      
      // Try to get any recent donations without time filter
      const { data: anyDonations, error: anyError } = await supabase
        .from('donation_transactions')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(5);
        
      if (anyError) {
        console.log('❌ Still getting error:', anyError.message);
        return;
      } else {
        console.log(`Found ${anyDonations.length} total recent donations (any time)`);
        donations = anyDonations; // Use this data instead
      }
    }
    
    console.log(`📋 Found ${donations?.length || 0} donations:`);
    
    if (!donations || donations.length === 0) {
      console.log('   No recent donations found in database');
      console.log('   This could mean:');
      console.log('   - The donation failed at Square');
      console.log('   - The webhook is not working');
      console.log('   - The payment processed but wasn\'t saved to database');
      console.log('   - The table name is different');
    } else {
      donations.forEach((donation, index) => {
        console.log(`\n   ${index + 1}. Donation ${donation.id}:`);
        console.log(`      Amount: $${(donation.amount_cents / 100).toFixed(2)} ${donation.currency || 'USD'}`);
        console.log(`      Status: ${donation.status}`);
        console.log(`      Method: ${donation.payment_method || 'unknown'}`);
        console.log(`      Email: ${donation.customer_email || 'N/A'}`);
        console.log(`      Time: ${new Date(donation.created_at).toLocaleString()}`);
        console.log(`      Square ID: ${donation.square_payment_id || 'N/A'}`);
        console.log(`      Message: ${donation.donation_message || 'No message'}`);
      });
      
      // Look specifically for $1 donations
      const oneDollarDonations = donations.filter(d => d.amount_cents === 100);
      if (oneDollarDonations.length > 0) {
        console.log(`\n💰 Found ${oneDollarDonations.length} $1.00 donation(s):`);
        oneDollarDonations.forEach(d => {
          console.log(`   - Status: ${d.status} at ${new Date(d.created_at).toLocaleString()}`);
        });
      }
    }
    
    // Check for other donation-related tables
    console.log('\n🔍 Checking for other possible tables...');
    
    const tables = ['donations', 'transactions', 'payments'];
    for (const table of tables) {
      try {
        const { data, error } = await supabase
          .from(table)
          .select('*')
          .limit(1);
          
        if (!error) {
          console.log(`   ✅ Found table: ${table}`);
        }
      } catch (e) {
        // Table doesn't exist, that's fine
      }
    }
    
    console.log('\n🔗 Next steps to check:');
    console.log('   1. Check your Square Dashboard for the transaction');
    console.log('   2. Check browser network tab for donation form submission');
    console.log('   3. Look at server logs for any errors');
    console.log('   4. Verify the donation form is working');
    
  } catch (error) {
    console.log('❌ Script error:', error.message);
    console.log('\nPossible issues:');
    console.log('   - Environment variables not set correctly');
    console.log('   - Database connection failed');
    console.log('   - Table name mismatch');
  }
}

debugRecentDonations().catch(console.error); 