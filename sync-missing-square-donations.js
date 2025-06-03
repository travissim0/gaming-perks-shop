require('dotenv').config({ path: '.env.local' });
const { Client, Environment } = require('square/legacy');
const { createClient } = require('@supabase/supabase-js');

async function syncMissingSquareDonations() {
  console.log('🔄 Syncing missing Square donations...\n');
  
  try {
    // Initialize Square client
    const client = new Client({
      accessToken: process.env.SQUARE_ACCESS_TOKEN,
      environment: Environment.Production,
    });

    const paymentsApi = client.paymentsApi;
    
    // Initialize Supabase client
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    console.log('📡 Fetching Square payments from last 7 days...');
    
    // Get payments from the last 7 days
    const endTime = new Date().toISOString();
    const startTime = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(); // Last 7 days
    
    const response = await paymentsApi.listPayments(
      startTime,
      endTime,
      'DESC'
    );

    const payments = response.result.payments || [];
    console.log(`📊 Found ${payments.length} Square payments in the last 7 days`);
    
    if (payments.length === 0) {
      console.log('❌ No payments found');
      return;
    }
    
    // Filter for completed payments only
    const completedPayments = payments.filter(p => p.status === 'COMPLETED');
    console.log(`✅ ${completedPayments.length} completed payments to check`);
    
    let syncedCount = 0;
    let skippedCount = 0;
    let errorCount = 0;
    
    for (const payment of completedPayments) {
      const amount = (parseInt(payment.amountMoney?.amount || 0) / 100).toFixed(2);
      const paymentId = payment.id;
      
      try {
        // Check if this payment already exists in database
        const { data: existingDonation, error: checkError } = await supabase
          .from('donation_transactions')
          .select('id')
          .eq('square_payment_id', paymentId)
          .single();
        
        if (existingDonation) {
          console.log(`⏭️  Skipping $${amount} - Already in database (${paymentId})`);
          skippedCount++;
          continue;
        }
        
        if (checkError && checkError.code !== 'PGRST116') {
          console.error(`❌ Error checking ${paymentId}:`, checkError);
          errorCount++;
          continue;
        }
        
        // Payment doesn't exist, add it to database
        console.log(`📥 Adding $${amount} to database (${paymentId})...`);
        
        const donationData = {
          payment_method: 'square',
          amount_cents: parseInt(payment.amountMoney.amount),
          currency: payment.amountMoney.currency.toLowerCase(),
          status: 'completed',
          customer_email: null,
          customer_name: 'Square Donor',
          donation_message: `Square donation - ${payment.id}`,
          square_payment_id: payment.id,
          square_order_id: payment.orderId || null,
          created_at: payment.createdAt,
          completed_at: payment.updatedAt,
        };
        
        const { data: newDonation, error: insertError } = await supabase
          .from('donation_transactions')
          .insert(donationData)
          .select()
          .single();
        
        if (insertError) {
          console.error(`❌ Failed to add ${paymentId}:`, insertError);
          errorCount++;
        } else {
          console.log(`✅ Added $${amount} (Database ID: ${newDonation.id})`);
          syncedCount++;
        }
        
      } catch (error) {
        console.error(`❌ Error processing ${paymentId}:`, error.message);
        errorCount++;
      }
    }
    
    console.log('\n📊 SYNC SUMMARY:');
    console.log(`   ✅ Successfully synced: ${syncedCount} donations`);
    console.log(`   ⏭️  Already existed: ${skippedCount} donations`);
    console.log(`   ❌ Errors: ${errorCount} donations`);
    
    if (syncedCount > 0) {
      console.log(`\n🎉 ${syncedCount} missing donations have been added to your database!`);
      console.log('✅ They should now appear in your admin panel');
    } else {
      console.log('\n💡 All Square donations are already in sync');
    }
    
  } catch (error) {
    console.error('❌ Sync error:', error.message);
  }
}

syncMissingSquareDonations().catch(console.error); 