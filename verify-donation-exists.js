require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

async function verifyDonationExists() {
  console.log('🔍 Verifying your $1 donation exists...\n');
  
  try {
    // Create Supabase service client (bypasses RLS)
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );
    
    console.log('📊 Searching for your specific $1 donation...');
    
    // Look for the specific $1 donation by Square Payment ID
    const { data: donation, error } = await supabase
      .from('donation_transactions')
      .select('*')
      .eq('square_payment_id', '3f41BwwODSrn6MMirlorJ5YG1jDZY')
      .single();
    
    if (error) {
      if (error.code === 'PGRST116') {
        console.log('❌ Your $1 donation was NOT found in the database');
        console.log('🔧 This means it was either:');
        console.log('   - Never inserted');
        console.log('   - Deleted somehow');
        console.log('   - In a different table');
      } else {
        console.error('❌ Database error:', error);
      }
      return false;
    }
    
    if (donation) {
      console.log('🎯 FOUND YOUR $1 DONATION!');
      console.log('📋 Details:');
      console.log(`   ID: ${donation.id}`);
      console.log(`   Amount: $${(donation.amount_cents / 100).toFixed(2)} ${donation.currency.toUpperCase()}`);
      console.log(`   Status: ${donation.status}`);
      console.log(`   Payment Method: ${donation.payment_method}`);
      console.log(`   Square Payment ID: ${donation.square_payment_id}`);
      console.log(`   Customer Email: ${donation.customer_email || 'Unknown'}`);
      console.log(`   Created: ${donation.created_at}`);
      console.log(`   User ID: ${donation.user_id || 'No user linked'}`);
      
      console.log('\n✅ Your donation definitely exists in the database!');
      console.log('🔧 If it\'s not showing in the admin panel, the issue is with:');
      console.log('   - Admin panel API authentication');
      console.log('   - Frontend filtering/display');
      console.log('   - Row Level Security policies');
      
      return true;
    } else {
      console.log('❌ No donation found (this shouldn\'t happen)');
      return false;
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    return false;
  }
}

// Also check if there are any donations at all
async function checkAllRecentDonations() {
  console.log('\n📊 Checking all recent donations...');
  
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );
    
    const { data: donations, error } = await supabase
      .from('donation_transactions')
      .select('id, amount_cents, currency, payment_method, square_payment_id, created_at')
      .order('created_at', { ascending: false })
      .limit(10);
    
    if (error) {
      console.error('❌ Error fetching donations:', error);
      return;
    }
    
    console.log(`📈 Found ${donations.length} recent donations:`);
    donations.forEach((donation, i) => {
      const amount = (donation.amount_cents / 100).toFixed(2);
      const date = new Date(donation.created_at).toLocaleDateString();
      const paymentId = donation.square_payment_id || 'N/A';
      console.log(`   ${i + 1}. $${amount} ${donation.currency.toUpperCase()} - ${donation.payment_method} - ${paymentId} (${date})`);
    });
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

async function main() {
  const exists = await verifyDonationExists();
  await checkAllRecentDonations();
  
  if (exists) {
    console.log('\n🎯 NEXT STEPS:');
    console.log('1. Make sure your dev server is running: npm run dev');
    console.log('2. Go to admin/donations page in browser');
    console.log('3. Use the browser debug script to see what the API returns');
    console.log('4. Check for JavaScript errors in browser console');
  }
}

main().catch(console.error); 