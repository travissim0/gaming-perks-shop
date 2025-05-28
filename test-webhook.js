// Test script to verify webhook functionality
// Run this after setting up the Stripe CLI listener

const testWebhook = async () => {
  console.log('🔧 Testing webhook system...');
  
  try {
    // Test if the webhook endpoint is accessible
    const response = await fetch('http://localhost:3000/api/webhooks/stripe', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ test: 'ping' })
    });
    
    console.log('📡 Webhook endpoint response:', response.status);
    
    if (response.status === 400) {
      console.log('✅ Webhook endpoint is working (400 expected for test data)');
    } else {
      console.log('❌ Unexpected response from webhook endpoint');
    }
    
  } catch (error) {
    console.error('❌ Error testing webhook:', error.message);
  }
};

// Test pending donations
const testPendingDonations = async () => {
  console.log('\n💰 Checking pending donations...');
  
  try {
    const response = await fetch('http://localhost:3000/api/test-webhook');
    const data = await response.json();
    
    console.log('📊 Pending donations:', data.count);
    if (data.pendingDonations && data.pendingDonations.length > 0) {
      console.log('🔍 Sample pending donation:', {
        id: data.pendingDonations[0].id,
        amount: data.pendingDonations[0].amount_cents / 100,
        session_id: data.pendingDonations[0].stripe_session_id
      });
    }
    
  } catch (error) {
    console.error('❌ Error checking pending donations:', error.message);
  }
};

// Run tests
testWebhook();
testPendingDonations();

console.log('\n📋 Next steps:');
console.log('1. Make sure your .env.local file has the STRIPE_WEBHOOK_SECRET');
console.log('2. The Stripe CLI should show the webhook secret when you run the listen command');
console.log('3. Copy that secret to your .env.local file');
console.log('4. Make a test donation to see if the webhook updates the status'); 