require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

// Initialize Supabase client
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function debugDonations() {
  try {
    console.log('🔍 Debugging donation transactions...\n');

    // Get all donation transactions
    const { data: allDonations, error: allError } = await supabase
      .from('donation_transactions')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(10);

    if (allError) {
      console.error('❌ Error fetching donations:', allError);
      return;
    }

    console.log(`📊 Found ${allDonations?.length || 0} recent donation transactions:`);
    
    if (allDonations && allDonations.length > 0) {
      allDonations.forEach((donation, index) => {
        console.log(`\n${index + 1}. Transaction ID: ${donation.id}`);
        console.log(`   User ID: ${donation.user_id}`);
        console.log(`   Amount: $${donation.amount_cents / 100} ${donation.currency.toUpperCase()}`);
        console.log(`   Status: ${donation.status}`);
        console.log(`   Email: ${donation.customer_email}`);
        console.log(`   Message: ${donation.donation_message || 'None'}`);
        console.log(`   Created: ${donation.created_at}`);
        console.log(`   Completed: ${donation.completed_at || 'Not completed'}`);
        console.log(`   Stripe Session: ${donation.stripe_session_id}`);
        console.log(`   Stripe Payment Intent: ${donation.stripe_payment_intent_id || 'None'}`);
      });
    } else {
      console.log('   No donation transactions found.');
    }

    // Get all users to check user IDs
    console.log('\n👥 Recent users:');
    const { data: users, error: usersError } = await supabase
      .from('profiles')
      .select('id, email, created_at')
      .order('created_at', { ascending: false })
      .limit(5);

    if (usersError) {
      console.error('❌ Error fetching users:', usersError);
    } else if (users && users.length > 0) {
      users.forEach((user, index) => {
        console.log(`${index + 1}. User ID: ${user.id}`);
        console.log(`   Email: ${user.email}`);
        console.log(`   Created: ${user.created_at}`);
      });
    }

    // Check for any donations with status 'pending' that might need completion
    const { data: pendingDonations, error: pendingError } = await supabase
      .from('donation_transactions')
      .select('*')
      .eq('status', 'pending');

    if (pendingError) {
      console.error('❌ Error fetching pending donations:', pendingError);
    } else {
      console.log(`\n⏳ Found ${pendingDonations?.length || 0} pending donations:`);
      if (pendingDonations && pendingDonations.length > 0) {
        pendingDonations.forEach((donation, index) => {
          console.log(`${index + 1}. ID: ${donation.id} - $${donation.amount_cents / 100} - ${donation.customer_email}`);
        });
      }
    }

  } catch (error) {
    console.error('❌ Debug script error:', error);
  }
}

// Run the debug function
debugDonations(); 