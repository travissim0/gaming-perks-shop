require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

// Initialize Supabase client
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function testDonationFlow() {
  try {
    console.log('🧪 Testing donation flow and webhook connectivity...\n');

    // 1. Test webhook endpoint connectivity
    console.log('1️⃣ Testing webhook endpoint connectivity...');
    try {
      const response = await fetch('http://localhost:3000/api/webhook-test');
      if (response.ok) {
        const data = await response.json();
        console.log('✅ Webhook test endpoint accessible:', data.message);
      } else {
        console.log('❌ Webhook test endpoint not accessible');
      }
    } catch (error) {
      console.log('❌ Cannot reach webhook test endpoint:', error.message);
      console.log('💡 Make sure your dev server is running: npm run dev');
    }

    // 2. Check recent donation transactions
    console.log('\n2️⃣ Checking recent donation transactions...');
    const { data: recentDonations, error: donationError } = await supabase
      .from('donation_transactions')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(5);

    if (donationError) {
      console.error('❌ Error fetching donations:', donationError);
    } else {
      console.log(`📊 Found ${recentDonations?.length || 0} recent donations:`);
      recentDonations?.forEach((donation, index) => {
        console.log(`   ${index + 1}. $${donation.amount_cents / 100} - ${donation.status} - ${donation.created_at}`);
      });
    }

    // 3. Check webhook configuration
    console.log('\n3️⃣ Checking webhook configuration...');
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
    const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
    
    console.log('🔑 Environment variables:');
    console.log(`   STRIPE_WEBHOOK_SECRET: ${webhookSecret ? '✅ Set' : '❌ Missing'}`);
    console.log(`   STRIPE_SECRET_KEY: ${stripeSecretKey ? '✅ Set' : '❌ Missing'}`);
    console.log(`   NEXT_PUBLIC_SUPABASE_URL: ${process.env.NEXT_PUBLIC_SUPABASE_URL ? '✅ Set' : '❌ Missing'}`);
    console.log(`   SUPABASE_SERVICE_ROLE_KEY: ${process.env.SUPABASE_SERVICE_ROLE_KEY ? '✅ Set' : '❌ Missing'}`);

    // 4. Check for pending donations that need completion
    console.log('\n4️⃣ Checking for pending donations...');
    const { data: pendingDonations, error: pendingError } = await supabase
      .from('donation_transactions')
      .select('*')
      .eq('status', 'pending');

    if (pendingError) {
      console.error('❌ Error fetching pending donations:', pendingError);
    } else {
      console.log(`⏳ Found ${pendingDonations?.length || 0} pending donations`);
      if (pendingDonations && pendingDonations.length > 0) {
        console.log('💡 These donations need webhook completion or manual processing');
        pendingDonations.forEach((donation, index) => {
          console.log(`   ${index + 1}. $${donation.amount_cents / 100} - ${donation.customer_email} - ${donation.created_at}`);
        });
      }
    }

    // 5. Webhook troubleshooting tips
    console.log('\n5️⃣ Webhook troubleshooting checklist:');
    console.log('   📋 Common issues and solutions:');
    console.log('   1. Webhook endpoint not configured in Stripe dashboard');
    console.log('   2. Webhook secret mismatch between Stripe and environment');
    console.log('   3. Development server not accessible from internet (use ngrok)');
    console.log('   4. Webhook events not enabled in Stripe dashboard');
    console.log('   5. Firewall blocking incoming webhook requests');
    
    console.log('\n🔧 Next steps to fix webhook issues:');
    console.log('   1. Check Stripe dashboard > Webhooks for delivery status');
    console.log('   2. Verify webhook endpoint URL is correct');
    console.log('   3. Ensure "checkout.session.completed" event is enabled');
    console.log('   4. Use ngrok for local development: ngrok http 3000');
    console.log('   5. Check server logs for webhook errors');

    console.log('\n🎯 For immediate testing:');
    console.log('   • Make a test donation and check server logs');
    console.log('   • Run: node complete-pending-donations-manual.js (temporary fix)');
    console.log('   • Monitor webhook delivery in Stripe dashboard');

  } catch (error) {
    console.error('❌ Test script error:', error);
  }
}

// Run the test
testDonationFlow(); 