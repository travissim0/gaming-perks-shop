const https = require('https');
const querystring = require('querystring');

// Test Ko-fi donation data for production testing
const kofiTestData = {
  "message_id": "prod-test-" + Date.now(),
  "timestamp": new Date().toISOString(),
  "type": "Donation",
  "is_public": true,
  "from_name": "Production Test Donor",
  "message": "Testing Ko-fi integration on production!",
  "amount": "2.00",
  "url": "https://ko-fi.com/Home/CoffeeShop?txid=prod-test-" + Date.now(),
  "email": "prod.test@example.com",
  "currency": "USD",
  "is_subscription_payment": false,
  "is_first_subscription_payment": false,
  "kofi_transaction_id": "prod-test-" + Date.now(),
  "shop_items": null,
  "tier_name": null,
  "shipping": null
  // Note: No verification_token - production might not have one set
};

// Form data as Ko-fi sends it
const formData = querystring.stringify({
  data: JSON.stringify(kofiTestData)
});

// Test against production server
const options = {
  hostname: 'freeinf.org',
  port: 443,
  path: '/api/kofi-webhook',
  method: 'POST',
  headers: {
    'Content-Type': 'application/x-www-form-urlencoded',
    'Content-Length': Buffer.byteLength(formData)
  }
};

console.log('🧪 Testing Ko-fi webhook on PRODUCTION...');
console.log('🌐 Target: https://freeinf.org/api/kofi-webhook');
console.log('📧 Test data:', {
  from_name: kofiTestData.from_name,
  amount: kofiTestData.amount,
  currency: kofiTestData.currency,
  email: kofiTestData.email,
  transaction_id: kofiTestData.kofi_transaction_id
});

const req = https.request(options, (res) => {
  console.log(`\n📊 Status Code: ${res.statusCode}`);
  console.log(`📋 Headers:`, res.headers);

  let responseBody = '';
  res.on('data', (chunk) => {
    responseBody += chunk;
  });

  res.on('end', () => {
    console.log('\n📄 Response Body:', responseBody);
    
    try {
      const response = JSON.parse(responseBody);
      if (res.statusCode === 200) {
        console.log('\n✅ Ko-fi PRODUCTION webhook test SUCCESSFUL!');
        console.log('🎉 Test donation should appear in your admin dashboard');
        console.log('💰 Amount:', kofiTestData.amount, kofiTestData.currency);
        console.log('\n🔍 Check your donations dashboard now!');
      } else {
        console.log('\n❌ Ko-fi webhook test FAILED');
        console.log('🔍 Error:', response.error || 'Unknown error');
      }
    } catch (e) {
      console.log('\n⚠️ Non-JSON response:', responseBody);
    }
  });
});

req.on('error', (error) => {
  console.error('\n❌ Request failed:', error.message);
});

// Send the form data
req.write(formData);
req.end(); 