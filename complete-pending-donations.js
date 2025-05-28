// Script to manually complete pending donations for testing
// This simulates what the webhook should do

const completePendingDonations = async () => {
  console.log('🔄 Fetching pending donations...');
  
  try {
    // Get pending donations
    const response = await fetch('http://localhost:3000/api/test-webhook');
    const data = await response.json();
    
    if (!data.pendingDonations || data.pendingDonations.length === 0) {
      console.log('✅ No pending donations found');
      return;
    }
    
    console.log(`📋 Found ${data.pendingDonations.length} pending donations`);
    
    // Complete each pending donation
    for (const donation of data.pendingDonations) {
      console.log(`\n🔄 Completing donation ${donation.id}...`);
      
      const completeResponse = await fetch('http://localhost:3000/api/test-webhook', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          sessionId: donation.stripe_session_id,
          paymentIntentId: `pi_test_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
        })
      });
      
      const result = await completeResponse.json();
      
      if (result.success) {
        console.log(`✅ Completed donation: $${donation.amount_cents / 100}`);
      } else {
        console.log(`❌ Failed to complete donation: ${result.error}`);
      }
    }
    
    console.log('\n🎉 All pending donations processed!');
    
  } catch (error) {
    console.error('❌ Error completing donations:', error.message);
  }
};

// Run the completion
completePendingDonations(); 