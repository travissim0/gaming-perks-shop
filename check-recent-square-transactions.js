require('dotenv').config({ path: '.env.local' });

async function checkRecentSquareTransactions() {
  console.log('🔍 Checking Recent Square Transactions...\n');
  
  try {
    // Use Square API directly to check for recent payments
    const baseUrl = process.env.SQUARE_ENVIRONMENT === 'production' 
      ? 'https://connect.squareup.com' 
      : 'https://connect.squareupsandbox.com';
    
    console.log('📊 Checking Square for recent payments...');
    console.log(`Environment: ${process.env.SQUARE_ENVIRONMENT}`);
    console.log(`Location: ${process.env.SQUARE_LOCATION_ID}`);
    
    // Get payments from the last hour
    const startTime = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const endTime = new Date().toISOString();
    
    const response = await fetch(`${baseUrl}/v2/payments?location_id=${process.env.SQUARE_LOCATION_ID}&begin_time=${startTime}&end_time=${endTime}`, {
      headers: {
        'Authorization': `Bearer ${process.env.SQUARE_ACCESS_TOKEN}`,
        'Square-Version': '2025-01-23',
        'Content-Type': 'application/json'
      }
    });
    
    if (response.ok) {
      const data = await response.json();
      const payments = data.payments || [];
      
      console.log(`💳 Found ${payments.length} Square payments in the last hour:`);
      
      if (payments.length === 0) {
        console.log('   No payments found in Square');
        console.log('   This could mean:');
        console.log('   - The donation failed or was cancelled');
        console.log('   - The payment hasn\'t been processed yet');
        console.log('   - You\'re checking the wrong environment');
      } else {
        payments.forEach((payment, index) => {
          console.log(`\n   ${index + 1}. Payment ${payment.id}:`);
          console.log(`      Amount: $${(payment.amount_money.amount / 100).toFixed(2)} ${payment.amount_money.currency}`);
          console.log(`      Status: ${payment.status}`);
          console.log(`      Created: ${new Date(payment.created_at).toLocaleString()}`);
          console.log(`      Updated: ${new Date(payment.updated_at).toLocaleString()}`);
          console.log(`      Source Type: ${payment.source_type}`);
          console.log(`      Location: ${payment.location_id}`);
          
          if (payment.receipt_number) {
            console.log(`      Receipt: ${payment.receipt_number}`);
          }
          
          if (payment.order_id) {
            console.log(`      Order ID: ${payment.order_id}`);
          }
          
          // Check if this looks like our $1 donation
          if (payment.amount_money.amount === 100) {
            console.log(`      🎯 This looks like your $1 donation!`);
          }
        });
        
        // Check if any payments are completed but missing from database
        const completedPayments = payments.filter(p => p.status === 'COMPLETED');
        if (completedPayments.length > 0) {
          console.log(`\n✅ Found ${completedPayments.length} completed payment(s) in Square`);
          console.log('   If these don\'t appear in your admin panel, the webhook might not be working');
        }
      }
    } else {
      const errorData = await response.json();
      console.log('❌ Square API Error:', response.status);
      console.log('Error details:', errorData);
      
      if (response.status === 401) {
        console.log('\n🔐 Authentication failed - check your access token');
      } else if (response.status === 403) {
        console.log('\n🚫 Permission denied - check your location ID and token permissions');
      }
    }
    
    console.log('\n🔗 Troubleshooting Steps:');
    console.log('   1. Check if the payment appears in your Square Dashboard');
    console.log('   2. Verify webhook is configured in Square Developer Dashboard');
    console.log('   3. Check webhook endpoint URL is correct');
    console.log('   4. Look for webhook delivery failures in Square Dashboard');
    console.log('   5. Test webhook endpoint manually');
    
  } catch (error) {
    console.log('❌ Error checking Square transactions:', error.message);
  }
}

checkRecentSquareTransactions().catch(console.error); 