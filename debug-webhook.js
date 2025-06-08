#!/usr/bin/env node

// Debug Ko-fi webhook issues
require('dotenv').config({ path: './production.env' });

console.log('🔍 Ko-fi Webhook Diagnostic Tool\n');

// Check environment variables
console.log('📋 Environment Variables:');
console.log('NEXT_PUBLIC_SUPABASE_URL:', process.env.NEXT_PUBLIC_SUPABASE_URL ? '✅ Set' : '❌ Missing');
console.log('SUPABASE_SERVICE_ROLE_KEY:', process.env.SUPABASE_SERVICE_ROLE_KEY ? '✅ Set' : '❌ Missing');
console.log('KOFI_VERIFICATION_TOKEN:', process.env.KOFI_VERIFICATION_TOKEN ? '✅ Set' : '❌ Missing');
console.log('NEXT_PUBLIC_SITE_URL:', process.env.NEXT_PUBLIC_SITE_URL ? '✅ Set' : '❌ Missing');

if (process.env.KOFI_VERIFICATION_TOKEN) {
  console.log('Ko-fi Token Value:', process.env.KOFI_VERIFICATION_TOKEN);
}

console.log('\n🔗 Testing webhook URL accessibility...');

// Try to test webhook endpoint locally if possible
const https = require('https');

const testUrl = 'https://freeinf.org/';
console.log(`Trying to reach: ${testUrl}`);

const req = https.get(testUrl, (res) => {
  console.log(`✅ Site accessible - Status: ${res.statusCode}`);
  console.log(`Headers: ${JSON.stringify(res.headers, null, 2)}`);
  
  let data = '';
  res.on('data', (chunk) => data += chunk);
  res.on('end', () => {
    console.log(`Response length: ${data.length} characters`);
    if (data.includes('gaming') || data.includes('perks') || data.includes('Next.js')) {
      console.log('✅ Looks like your Next.js app is running!');
    } else {
      console.log('⚠️ Site is up but might not be your Next.js app');
    }
  });
}).on('error', (err) => {
  console.error(`❌ Cannot reach site: ${err.message}`);
  
  if (err.code === 'ENOTFOUND') {
    console.error('🌐 DNS issue - freeinf.org cannot be resolved');
  } else if (err.code === 'ECONNREFUSED') {
    console.error('🚫 Connection refused - server not accepting connections');
  }
});

// Test Ko-fi shop order processing logic locally
console.log('\n🧪 Testing Ko-fi shop order logic...');

const testShopOrder = {
  verification_token: "8abbf9a7-19fe-43f3-ba4e-36acaaedb2b3",
  message_id: "local-test-" + Date.now(),
  timestamp: new Date().toISOString(),
  type: "Shop Order",
  is_public: true,
  from_name: "Local Test",
  message: null,
  amount: "5.00",
  url: "https://ko-fi.com/test",
  email: "qwerty5544@aim.com",
  currency: "USD",
  is_subscription_payment: false,
  is_first_subscription_payment: false,
  kofi_transaction_id: "local-test-" + Date.now(),
  shop_items: [
    {
      direct_link_code: "40a4b65a29",
      variation_name: "floating",
      quantity: 1
    }
  ]
};

console.log('Shop order data structure:');
console.log(JSON.stringify(testShopOrder, null, 2));

// Verify token matching
if (process.env.KOFI_VERIFICATION_TOKEN === testShopOrder.verification_token) {
  console.log('✅ Verification token matches environment variable');
} else {
  console.log('❌ Verification token MISMATCH!');
  console.log(`Environment: ${process.env.KOFI_VERIFICATION_TOKEN}`);
  console.log(`Test data: ${testShopOrder.verification_token}`);
}

console.log('\n📝 Next steps to fix webhook:');
console.log('1. Ensure your Next.js app is running on freeinf.org');
console.log('2. Check PM2 status: pm2 status');
console.log('3. Check app logs: pm2 logs gaming-perks-shop');
console.log('4. Restart if needed: pm2 restart gaming-perks-shop');
console.log('5. Check Ko-fi webhook settings in your Ko-fi dashboard'); 