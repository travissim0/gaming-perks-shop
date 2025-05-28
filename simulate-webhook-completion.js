// Script to simulate webhook completion for testing
// This will automatically complete pending donations after a short delay

const simulateWebhookCompletion = async () => {
  console.log('🔄 Starting automatic donation completion simulation...');
  
  const checkAndCompleteDonations = async () => {
    try {
      // Get pending donations
      const response = await fetch('http://localhost:3000/api/test-webhook');
      const data = await response.json();
      
      if (data.pendingDonations && data.pendingDonations.length > 0) {
        console.log(`📋 Found ${data.pendingDonations.length} pending donations`);
        
        // Complete each pending donation
        for (const donation of data.pendingDonations) {
          console.log(`🔄 Auto-completing donation ${donation.id} ($${donation.amount_cents/100})`);
          
          const completeResponse = await fetch('http://localhost:3000/api/test-webhook', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              sessionId: donation.stripe_session_id,
              paymentIntentId: `pi_auto_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
            })
          });
          
          const result = await completeResponse.json();
          
          if (result.success) {
            console.log(`✅ Auto-completed donation: $${donation.amount_cents / 100}`);
          } else {
            console.log(`❌ Failed to auto-complete donation: ${result.error}`);
          }
        }
      }
      
    } catch (error) {
      console.error('❌ Error in auto-completion:', error.message);
    }
  };
  
  // Check for pending donations every 10 seconds
  console.log('🎯 Monitoring for pending donations every 10 seconds...');
  console.log('💡 Make a test donation and it will be automatically completed!');
  console.log('🛑 Press Ctrl+C to stop monitoring');
  
  // Run immediately
  await checkAndCompleteDonations();
  
  // Then run every 10 seconds
  setInterval(checkAndCompleteDonations, 10000);
};

// Start the simulation
simulateWebhookCompletion(); 