require('dotenv').config({ path: '.env.local' });

async function addMissingDonation() {
  console.log('💰 Adding Missing $1 Donation to Database...\n');
  
  try {
    // Import Supabase client
    const { createClient } = require('@supabase/supabase-js');
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );
    
    // The payment details from Square
    const squarePaymentId = '3f41BwwODSrn6MMirlorJ5YG1jDZY';
    const squareOrderId = 'ekv9wd0s727CT7eTjpgI1iSOJB8YY';
    const amount = 100; // $1.00 in cents
    const createdAt = '2025-06-02T23:07:53.000Z'; // From Square
    const completedAt = '2025-06-02T23:07:58.000Z'; // From Square
    
    console.log('🔍 Checking if donation already exists...');
    
    // Check if this donation already exists
    const { data: existing, error: checkError } = await supabase
      .from('donation_transactions')
      .select('id')
      .eq('square_payment_id', squarePaymentId)
      .single();
    
    if (existing) {
      console.log('✅ Donation already exists in database:', existing.id);
      return;
    }
    
    if (checkError && checkError.code !== 'PGRST116') { // PGRST116 = no rows found
      console.log('❌ Error checking existing donation:', checkError.message);
      return;
    }
    
    console.log('💾 Adding donation to database...');
    
    // Insert the missing donation
    const { data: donation, error: insertError } = await supabase
      .from('donation_transactions')
      .insert({
        payment_method: 'square',
        amount_cents: amount,
        currency: 'usd',
        status: 'completed',
        customer_email: 'Unknown', // We don't have this from Square API
        customer_name: 'Square Donor',
        donation_message: `Square donation - ${squarePaymentId}`,
        square_payment_id: squarePaymentId,
        square_order_id: squareOrderId,
        created_at: createdAt,
        completed_at: completedAt,
      })
      .select()
      .single();
    
    if (insertError) {
      console.log('❌ Error inserting donation:', insertError.message);
      console.log('Full error:', insertError);
      return;
    }
    
    console.log('✅ Successfully added missing donation!');
    console.log(`   Donation ID: ${donation.id}`);
    console.log(`   Amount: $${(donation.amount_cents / 100).toFixed(2)}`);
    console.log(`   Payment Method: ${donation.payment_method}`);
    console.log(`   Status: ${donation.status}`);
    console.log(`   Square Payment ID: ${donation.square_payment_id}`);
    console.log(`   Created: ${new Date(donation.created_at).toLocaleString()}`);
    
    console.log('\n🎉 Your $1 donation should now appear in the admin panel!');
    console.log('\n📝 Next Steps:');
    console.log('   1. Check the admin/donations page to confirm it appears');
    console.log('   2. Set up webhooks to prevent this in the future');
    console.log('   3. Test another small donation to verify webhooks work');
    
  } catch (error) {
    console.log('❌ Script error:', error.message);
  }
}

addMissingDonation().catch(console.error); 