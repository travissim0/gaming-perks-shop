require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

// Initialize Supabase client
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function completePendingDonations() {
  try {
    console.log('🔄 Completing pending donations...\n');

    // Get all pending donations
    const { data: pendingDonations, error: fetchError } = await supabase
      .from('donation_transactions')
      .select('*')
      .eq('status', 'pending')
      .order('created_at', { ascending: false });

    if (fetchError) {
      console.error('❌ Error fetching pending donations:', fetchError);
      return;
    }

    if (!pendingDonations || pendingDonations.length === 0) {
      console.log('✅ No pending donations found.');
      return;
    }

    console.log(`📊 Found ${pendingDonations.length} pending donations to complete:`);

    for (const donation of pendingDonations) {
      console.log(`\n🔄 Processing donation ${donation.id}:`);
      console.log(`   Amount: $${donation.amount_cents / 100}`);
      console.log(`   Email: ${donation.customer_email}`);
      console.log(`   Message: ${donation.donation_message || 'None'}`);

      // Update to completed status
      const { error: updateError } = await supabase
        .from('donation_transactions')
        .update({
          status: 'completed',
          completed_at: new Date().toISOString(),
          // Add a fake payment intent ID if missing
          stripe_payment_intent_id: donation.stripe_payment_intent_id || `pi_manual_${Date.now()}`
        })
        .eq('id', donation.id);

      if (updateError) {
        console.error(`   ❌ Error updating donation ${donation.id}:`, updateError);
      } else {
        console.log(`   ✅ Successfully completed donation ${donation.id}`);
      }
    }

    console.log('\n🎉 Finished processing pending donations!');
    console.log('💡 These donations should now appear in your dashboard.');

  } catch (error) {
    console.error('❌ Script error:', error);
  }
}

// Run the completion function
completePendingDonations(); 