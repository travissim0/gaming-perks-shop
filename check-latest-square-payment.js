require('dotenv').config({ path: '.env.local' });
const { Client, Environment } = require('square/legacy');
const { createClient } = require('@supabase/supabase-js');

async function checkLatestSquarePayment() {
  console.log('🔍 Checking for your latest $2 Square donation...\n');
  
  try {
    // Initialize Square client
    const client = new Client({
      accessToken: process.env.SQUARE_ACCESS_TOKEN,
      environment: Environment.Production,
    });

    const paymentsApi = client.paymentsApi;

    console.log('📡 Fetching recent Square payments...');
    
    // Get payments from the last 3 hours to be safe
    const endTime = new Date().toISOString();
    const startTime = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(); // Last 3 hours
    
    // Simple call with just the basic parameters
    const response = await paymentsApi.listPayments(
      startTime,  // beginTime
      endTime,    // endTime
      'DESC'      // sortOrder
    );

    const payments = response.result.payments || [];
    console.log(`📊 Found ${payments.length} payments in the last 3 hours`);
    
    if (payments.length === 0) {
      console.log('❌ No payments found in the last 3 hours');
      return;
    }
    
    console.log('💡 All recent payments:');
    payments.forEach((payment, i) => {
      const amount = (parseInt(payment.amountMoney?.amount || 0) / 100).toFixed(2);
      const currency = payment.amountMoney?.currency || 'USD';
      const status = payment.status;
      const createdAt = new Date(payment.createdAt).toLocaleString();
      console.log(`   ${i + 1}. $${amount} ${currency} - ${status} - ${payment.id} (${createdAt})`);
    });
    
    // Look for $2 donation (200 cents)
    const twoDollarPayments = payments.filter(p => {
      const amount = parseInt(p.amountMoney?.amount || 0);
      return amount === 200 && p.status === 'COMPLETED';
    });
    
    if (twoDollarPayments.length === 0) {
      console.log('\n❌ No $2.00 completed payments found in Square');
      console.log('🔧 The payment might still be processing or failed');
      
      // Check for any $2 payments regardless of status
      const anyTwoDollar = payments.filter(p => {
        const amount = parseInt(p.amountMoney?.amount || 0);
        return amount === 200;
      });
      
      if (anyTwoDollar.length > 0) {
        console.log('\n💡 Found $2 payments with other statuses:');
        anyTwoDollar.forEach((payment, i) => {
          console.log(`   ${i + 1}. Status: ${payment.status} - ${payment.id}`);
        });
      }
      return;
    }
    
    const latestTwoDollar = twoDollarPayments[0];
    console.log('\n🎯 FOUND YOUR $2 DONATION IN SQUARE!');
    console.log('📋 Square Payment Details:');
    console.log(`   Payment ID: ${latestTwoDollar.id}`);
    console.log(`   Amount: $${(parseInt(latestTwoDollar.amountMoney.amount) / 100).toFixed(2)} ${latestTwoDollar.amountMoney.currency}`);
    console.log(`   Status: ${latestTwoDollar.status}`);
    console.log(`   Created: ${latestTwoDollar.createdAt}`);
    console.log(`   Updated: ${latestTwoDollar.updatedAt}`);
    console.log(`   Order ID: ${latestTwoDollar.orderId || 'None'}`);
    
    // Now check if this payment exists in our database
    console.log('\n🔍 Checking if this payment exists in database...');
    
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );
    
    const { data: existingDonation, error } = await supabase
      .from('donation_transactions')
      .select('*')
      .eq('square_payment_id', latestTwoDollar.id)
      .single();
    
    if (error && error.code !== 'PGRST116') {
      console.error('❌ Database error:', error);
      return;
    }
    
    if (existingDonation) {
      console.log('✅ Payment EXISTS in database');
      console.log(`   Database ID: ${existingDonation.id}`);
      console.log('🔧 If it\'s not showing in admin panel, there might be a frontend issue');
    } else {
      console.log('❌ Payment NOT FOUND in database');
      console.log('🚨 THIS CONFIRMS: Square webhook is not working!');
      console.log('\n🔧 WEBHOOK TROUBLESHOOTING:');
      console.log('   1. Square webhook may not be configured correctly');
      console.log('   2. Webhook endpoint may be failing');
      console.log('   3. Webhook signature verification may be failing');
      console.log('   4. The webhook URL might be incorrect');
      
      // Try to manually add this donation
      console.log('\n💾 Attempting to manually add this donation...');
      
      const donationData = {
        payment_method: 'square',
        amount_cents: parseInt(latestTwoDollar.amountMoney.amount),
        currency: latestTwoDollar.amountMoney.currency.toLowerCase(),
        status: 'completed',
        customer_email: null, // We don't have email from payment alone
        customer_name: 'Square Donor',
        donation_message: `Square donation - ${latestTwoDollar.id}`,
        square_payment_id: latestTwoDollar.id,
        square_order_id: latestTwoDollar.orderId || null,
        created_at: latestTwoDollar.createdAt,
        completed_at: latestTwoDollar.updatedAt,
      };
      
      const { data: newDonation, error: insertError } = await supabase
        .from('donation_transactions')
        .insert(donationData)
        .select()
        .single();
      
      if (insertError) {
        console.error('❌ Failed to manually add donation:', insertError);
      } else {
        console.log('✅ Successfully added donation to database!');
        console.log(`   New Database ID: ${newDonation.id}`);
        console.log('🎉 Your $2 donation should now appear in admin panel');
      }
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    if (error.stack) {
      console.error('Stack trace:', error.stack);
    }
  }
}

checkLatestSquarePayment().catch(console.error); 