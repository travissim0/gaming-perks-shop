// Test Ko-fi Webhook Endpoint
// This simulates a Ko-fi webhook call to test if your endpoint is working

const testWebhook = async () => {
    try {
        console.log('🧪 Testing Ko-fi webhook endpoint...\n');

        // Test data that matches Ko-fi's format
        const testData = {
            verification_token: "test_token",
            message_id: "test_message_" + Date.now(),
            timestamp: new Date().toISOString(),
            type: "Donation",
            is_public: true,
            from_name: "Test Supporter",
            message: "Testing Ko-fi integration!",
            amount: "5.00",
            url: "https://ko-fi.com/ctfpl",
            email: "test@example.com",
            currency: "USD",
            is_subscription_payment: false,
            is_first_subscription_payment: false,
            kofi_transaction_id: "test_" + Date.now() + "_" + Math.random().toString(36).substr(2, 9),
            shop_items: null
        };

        console.log('📄 Test Ko-fi data:', testData);

        // Create FormData like Ko-fi sends
        const formData = new FormData();
        formData.append('data', JSON.stringify(testData));

        // Test the webhook endpoint
        const response = await fetch('http://localhost:3000/api/kofi-webhook', {
            method: 'POST',
            body: formData
        });

        console.log('\n📡 Response status:', response.status);
        
        const responseData = await response.text();
        console.log('📄 Response data:', responseData);

        if (response.ok) {
            console.log('\n✅ Webhook endpoint is working!');
            console.log('💡 If this test succeeds but real Ko-fi donations don\'t appear,');
            console.log('   the issue is likely with Ko-fi webhook configuration.');
        } else {
            console.log('\n❌ Webhook endpoint failed!');
            console.log('🔧 Check your API route and database configuration.');
        }

    } catch (error) {
        console.error('❌ Error testing webhook:', error.message);
        console.log('\n🔧 Make sure your Next.js dev server is running on localhost:3000');
    }
};

// Run the test
testWebhook(); 