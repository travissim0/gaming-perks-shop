require('dotenv').config({ path: '.env.local' });
const { Client, Environment } = require('square/legacy');
const { createClient } = require('@supabase/supabase-js');

async function checkThreeDollarDonation() {
  console.log('🔍 Checking for your latest $3 Square donation...\n');
  
  try {
    const client = new Client({
      accessToken: process.env.SQUARE_ACCESS_TOKEN,
      environment: Environment.Production,
    });

    const paymentsApi = client.paymentsApi;
    
    const endTime = new Date().toISOString();
    const startTime = new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString(); // Last 1 hour
    
    const response = await paymentsApi.listPayments(startTime, endTime, 'DESC');
    const payments = response.result.payments || [];
    
    console.log(`📊 Found ${payments.length} payments in the last hour`);
    
    // Look for $3 donation (300 cents)
    const threeDollarPayments = payments.filter(p => {
      const amount = parseInt(p.amountMoney?.amount || 0);
      return amount === 300 && p.status === 'COMPLETED';
    });
    
    if (threeDollarPayments.length === 0) {
      console.log('❌ No $3.00 completed payments found');
      console.log('💡 All recent payments:');
      payments.forEach((payment, i) => {
        const amount = (parseInt(payment.amountMoney?.amount || 0) / 100).toFixed(2);
        const status = payment.status;
        const createdAt = new Date(payment.createdAt).toLocaleString();
        console.log(`   ${i + 1}. $${amount} - ${status} - ${payment.id} (${createdAt})`);
      });
      return;
    }
    
    const latestThreeDollar = threeDollarPayments[0];
    console.log('🎯 FOUND YOUR $3 DONATION!');
    console.log(`   Payment ID: ${latestThreeDollar.id}`);
    console.log(`   Amount: $${(parseInt(latestThreeDollar.amountMoney.amount) / 100).toFixed(2)}`);
    console.log(`   Status: ${latestThreeDollar.status}`);
    console.log(`   Created: ${latestThreeDollar.createdAt}`);
    
    // Check if it exists in database
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );
    
    const { data: existingDonation, error } = await supabase
      .from('donation_transactions')
      .select('*')
      .eq('square_payment_id', latestThreeDollar.id)
      .single();
    
    if (existingDonation) {
      console.log('✅ Payment already exists in database');
      return;
    }
    
    // Add to database
    console.log('💾 Adding $3 donation to database...');
    
    const donationData = {
      payment_method: 'square',
      amount_cents: parseInt(latestThreeDollar.amountMoney.amount),
      currency: latestThreeDollar.amountMoney.currency.toLowerCase(),
      status: 'completed',
      customer_email: null,
      customer_name: 'Square Donor',
      donation_message: `Square donation - ${latestThreeDollar.id}`,
      square_payment_id: latestThreeDollar.id,
      square_order_id: latestThreeDollar.orderId || null,
      created_at: latestThreeDollar.createdAt,
      completed_at: latestThreeDollar.updatedAt,
    };
    
    const { data: newDonation, error: insertError } = await supabase
      .from('donation_transactions')
      .insert(donationData)
      .select()
      .single();
    
    if (insertError) {
      console.error('❌ Failed to add donation:', insertError);
    } else {
      console.log('✅ Successfully added $3 donation!');
      console.log(`   Database ID: ${newDonation.id}`);
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

checkThreeDollarDonation().catch(console.error); 