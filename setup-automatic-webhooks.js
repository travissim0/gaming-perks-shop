// Script to help set up automatic webhooks with ngrok
// This will get your ngrok URL and provide setup instructions

const setupAutomaticWebhooks = async () => {
  console.log('🔧 Setting up automatic webhooks...');
  
  try {
    // Get ngrok tunnel information
    const response = await fetch('http://localhost:4040/api/tunnels');
    const data = await response.json();
    
    if (data.tunnels && data.tunnels.length > 0) {
      const tunnel = data.tunnels.find(t => t.config.addr === 'localhost:3000');
      
      if (tunnel) {
        const publicUrl = tunnel.public_url;
        const webhookUrl = `${publicUrl}/api/webhooks/stripe`;
        
        console.log('✅ Ngrok tunnel found!');
        console.log(`🌐 Public URL: ${publicUrl}`);
        console.log(`🔗 Webhook URL: ${webhookUrl}`);
        
        console.log('\n📋 Next steps to set up automatic webhooks:');
        console.log('1. Go to https://dashboard.stripe.com/test/webhooks');
        console.log('2. Click "Add endpoint"');
        console.log(`3. Enter this URL: ${webhookUrl}`);
        console.log('4. Select these events:');
        console.log('   - checkout.session.completed');
        console.log('   - payment_intent.succeeded');
        console.log('   - payment_intent.payment_failed');
        console.log('5. Click "Add endpoint"');
        console.log('6. Copy the webhook signing secret');
        console.log('7. Update your .env.local file with the new secret');
        
        console.log('\n🎯 After setup, your donations will automatically update!');
        
        // Test if the webhook endpoint is accessible
        const testResponse = await fetch(`${publicUrl}/api/webhooks/stripe`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ test: 'connectivity' })
        });
        
        if (testResponse.status === 400) {
          console.log('✅ Webhook endpoint is accessible from the internet!');
        } else {
          console.log('⚠️ Webhook endpoint might not be accessible');
        }
        
      } else {
        console.log('❌ No tunnel found for localhost:3000');
        console.log('Make sure ngrok is running with: ngrok http 3000');
      }
    } else {
      console.log('❌ No ngrok tunnels found');
      console.log('Make sure ngrok is running with: ngrok http 3000');
    }
    
  } catch (error) {
    console.error('❌ Error setting up webhooks:', error.message);
    console.log('\n💡 Make sure:');
    console.log('1. ngrok is running: ngrok http 3000');
    console.log('2. Your Next.js app is running on port 3000');
    console.log('3. ngrok web interface is accessible at http://localhost:4040');
  }
};

// Run the setup
setupAutomaticWebhooks(); 