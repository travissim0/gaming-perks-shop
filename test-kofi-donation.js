const http = require('http');
const querystring = require('querystring');

// Test Ko-fi donation data based on the example from Ko-fi documentation
const kofiTestData = {
  "verification_token": "test-token-12345", // You'll need to set this in your .env
  "message_id": "186057da-d52a-4a67-9f5b-f3666e9b17a4",
  "timestamp": new Date().toISOString(),
  "type": "Donation",
  "is_public": true,
  "from_name": "Test Donor",
  "message": "Testing Ko-fi integration for gaming-perks-shop!",
  "amount": "5.00",
  "url": "https://ko-fi.com/Home/CoffeeShop?txid=test-00000000-1111-2222-3333-" + Date.now(),
  "email": "test.donor@example.com",
  "currency": "USD",
  "is_subscription_payment": false,
  "is_first_subscription_payment": false,
  "kofi_transaction_id": "test-00000000-1111-2222-3333-" + Date.now(),
  "shop_items": null,
  "tier_name": null,
  "shipping": null
};

// Form data as Ko-fi sends it
const formData = querystring.stringify({
  data: JSON.stringify(kofiTestData)
});

// Test against local development server (HTTP, not HTTPS)
const options = {
  hostname: 'localhost',
  port: 3000,
  path: '/api/kofi-webhook',
  method: 'POST',
  headers: {
    'Content-Type': 'application/x-www-form-urlencoded',
    'Content-Length': Buffer.byteLength(formData)
  }
};

console.log('🧪 Testing Ko-fi webhook integration...');
console.log('📧 Test data:', {
  from_name: kofiTestData.from_name,
  amount: kofiTestData.amount,
  currency: kofiTestData.currency,
  email: kofiTestData.email,
  transaction_id: kofiTestData.kofi_transaction_id
});

const req = http.request(options, (res) => {
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
        console.log('\n✅ Ko-fi webhook test SUCCESSFUL!');
        console.log('🎉 Donation should now appear in your admin dashboard');
        console.log('💰 Amount:', kofiTestData.amount, kofiTestData.currency);
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
  
  if (error.code === 'ECONNREFUSED') {
    console.log('\n💡 Make sure your Next.js dev server is running:');
    console.log('   npm run dev');
    console.log('   Then run this test again.');
  }
});

// Send the form data
req.write(formData);
req.end(); 