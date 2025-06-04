require('dotenv').config({ path: '.env.local' });

async function fixSquareWebhook401Errors() {
  console.log('🔧 FIXING SQUARE WEBHOOK 401 ERRORS');
  console.log('=====================================\n');

  // Step 1: Check environment configuration
  console.log('📋 STEP 1: Checking Environment Configuration');
  console.log('-------------------------------------------');
  
  const requiredVars = [
    'SQUARE_ACCESS_TOKEN',
    'SQUARE_LOCATION_ID', 
    'SQUARE_ENVIRONMENT',
    'NEXT_PUBLIC_SUPABASE_URL',
    'SUPABASE_SERVICE_ROLE_KEY'
  ];
  
  const missingVars = [];
  const presentVars = [];
  
  requiredVars.forEach(varName => {
    if (process.env[varName]) {
      presentVars.push(varName);
      console.log(`✅ ${varName}: Set`);
    } else {
      missingVars.push(varName);
      console.log(`❌ ${varName}: Missing`);
    }
  });
  
  // Check optional webhook signature key
  const hasWebhookKey = !!process.env.SQUARE_WEBHOOK_SIGNATURE_KEY;
  console.log(`${hasWebhookKey ? '✅' : '⚠️'} SQUARE_WEBHOOK_SIGNATURE_KEY: ${hasWebhookKey ? 'Set' : 'Missing (This is likely causing 401 errors)'}`);
  
  // Step 2: Test Square API connection
  console.log('\n📡 STEP 2: Testing Square API Connection');
  console.log('---------------------------------------');
  
  try {
    const { Client, Environment } = require('square');
    
    const client = new Client({
      accessToken: process.env.SQUARE_ACCESS_TOKEN,
      environment: process.env.SQUARE_ENVIRONMENT === 'production' ? Environment.Production : Environment.Sandbox
    });
    
    const locationsResponse = await client.locationsApi.listLocations();
    
    if (locationsResponse.result.locations && locationsResponse.result.locations.length > 0) {
      console.log('✅ Sucessfully connected to Square API');
      console.log(`📍 Found ${locationsResponse.result.locations.length} location(s)`);
      
      const targetLocation = locationsResponse.result.locations.find(
        loc => loc.id === process.env.SQUARE_LOCATION_ID
      );
      
      if (targetLocation) {
        console.log(`✅ Target location found: ${targetLocation.name} (${targetLocation.id})`);
      } else {
        console.log(`❌ Target location ${process.env.SQUARE_LOCATION_ID} not found`);
        console.log('Available locations:');
        locationsResponse.result.locations.forEach(loc => {
          console.log(`   - ${loc.name}: ${loc.id}`);
        });
      }
    }
  } catch (error) {
    console.log('❌ Square API connection failed:', error.message);
  }
  
  // Step 3: Test webhook endpoint
  console.log('\n🔗 STEP 3: Testing Webhook Endpoint');
  console.log('----------------------------------');
  
  const webhookUrl = 'https://freeinf.org/api/webhooks/square';
  
  try {
    console.log(`📡 Testing ${webhookUrl}...`);
    
    // Create a test webhook payload
    const testPayload = {
      merchant_id: 'test-merchant',
      type: 'payment.created',
      event_id: 'test-event-id',
      created_at: new Date().toISOString(),
      data: {
        type: 'payment',
        id: 'test-payment-id',
        object: {
          payment: {
            id: 'test-payment-123',
            status: 'COMPLETED',
            amount_money: {
              amount: 500, // $5.00
              currency: 'USD'
            },
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          }
        }
      }
    };
    
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Square-webhook-test'
      },
      body: JSON.stringify(testPayload)
    });
    
    console.log(`📊 Response Status: ${response.status} ${response.statusText}`);
    
    if (response.status === 401) {
      console.log('🚨 401 UNAUTHORIZED - This confirms the webhook signature issue!');
      console.log('\n🔧 SOLUTION NEEDED:');
      console.log('1. Get your webhook signature key from Square Developer Dashboard');
      console.log('2. Add it to your .env.local file');
      console.log('3. Or temporarily disable signature verification for testing');
    } else {
      const responseText = await response.text();
      console.log('📄 Response:', responseText.substring(0, 200) + (responseText.length > 200 ? '...' : ''));
    }
    
  } catch (error) {
    console.log('❌ Webhook test failed:', error.message);
  }
  
  // Step 4: Check recent Square payments vs database
  console.log('\n💰 STEP 4: Checking Recent Payments vs Database');
  console.log('---------------------------------------------');
  
  try {
    // Check recent Square payments
    const { Client, Environment } = require('square');
    const client = new Client({
      accessToken: process.env.SQUARE_ACCESS_TOKEN,
      environment: process.env.SQUARE_ENVIRONMENT === 'production' ? Environment.Production : Environment.Sandbox
    });
    
    const endTime = new Date().toISOString();
    const startTime = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(); // Last 24 hours
    
    const paymentsResponse = await client.paymentsApi.listPayments(startTime, endTime, 'DESC');
    const recentPayments = paymentsResponse.result.payments || [];
    
    console.log(`📊 Found ${recentPayments.length} Square payments in last 24 hours`);
    
    if (recentPayments.length > 0) {
      // Check database for these payments
      const { createClient } = require('@supabase/supabase-js');
      const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL,
        process.env.SUPABASE_SERVICE_ROLE_KEY
      );
      
      console.log('\n🔍 Checking which payments exist in database:');
      
      for (const payment of recentPayments.slice(0, 5)) { // Check first 5
        const amount = (parseInt(payment.amountMoney?.amount || 0) / 100).toFixed(2);
        const status = payment.status;
        
        console.log(`\n💳 Payment: $${amount} USD - ${status} - ${payment.id}`);
        console.log(`   Created: ${new Date(payment.createdAt).toLocaleString()}`);
        
        // Check if exists in database
        const { data: existingDonation } = await supabase
          .from('donation_transactions')
          .select('id, status, created_at')
          .eq('square_payment_id', payment.id)
          .single();
        
        if (existingDonation) {
          console.log(`   ✅ EXISTS in database (ID: ${existingDonation.id})`);
        } else {
          console.log(`   ❌ MISSING from database - WEBHOOK FAILED`);
        }
      }
    }
    
  } catch (error) {
    console.log('❌ Error checking payments:', error.message);
  }
  
  // Step 5: Provide solutions
  console.log('\n🛠️  STEP 5: Solutions to Fix 401 Errors');
  console.log('======================================');
  
  if (!hasWebhookKey) {
    console.log('\n🔑 SOLUTION 1: Add Webhook Signature Key (RECOMMENDED)');
    console.log('----------------------------------------------------');
    console.log('1. Go to Square Developer Dashboard');
    console.log('2. Navigate to your application > Webhooks');
    console.log('3. Find your webhook endpoint and copy the "Signature Key"');
    console.log('4. Add this line to your .env.local file:');
    console.log('   SQUARE_WEBHOOK_SIGNATURE_KEY=your_actual_signature_key');
    console.log('5. Restart your application');
  }
  
  console.log('\n🔓 SOLUTION 2: Temporary Fix - Disable Signature Verification');
  console.log('-----------------------------------------------------------');
  console.log('For testing purposes, you can temporarily comment out signature verification:');
  console.log('In src/app/api/webhooks/square/route.ts, comment out this block:');
  console.log('```');
  console.log('// if (SQUARE_WEBHOOK_SIGNATURE_KEY) {');
  console.log('//   ... signature verification code ...');
  console.log('// }');
  console.log('```');
  console.log('⚠️  WARNING: Only do this temporarily! Re-enable for production.');
  
  console.log('\n🚀 SOLUTION 3: Test Webhook Configuration');
  console.log('----------------------------------------');
  console.log('1. Check Square Developer Dashboard > Webhooks');
  console.log('2. Verify webhook URL: https://freeinf.org/api/webhooks/square');
  console.log('3. Ensure these events are enabled:');
  console.log('   - payment.created');
  console.log('   - payment.updated');
  console.log('   - order.created');
  console.log('   - order.updated');
  
  console.log('\n📞 Next Steps:');
  console.log('1. Fix the webhook signature key issue first');
  console.log('2. Test with a small donation');
  console.log('3. Check admin panel to see if donation appears');
  console.log('4. Monitor webhook logs in Square Dashboard');
}

// Run the troubleshooting
if (require.main === module) {
  fixSquareWebhook401Errors().catch(console.error);
}

module.exports = { fixSquareWebhook401Errors }; 