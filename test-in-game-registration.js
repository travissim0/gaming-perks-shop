require('dotenv').config({ path: '.env.local' });

async function testInGameRegistration() {
  try {
    console.log('🧪 Testing in-game registration API...\n');

    const testCases = [
      {
        name: 'Valid Registration',
        alias: 'TestPlayer123',
        email: 'testplayer@example.com',
        expectedStatus: 200
      },
      {
        name: 'Invalid Email Format',
        alias: 'TestPlayer456',
        email: 'invalid-email',
        expectedStatus: 400
      },
      {
        name: 'Missing Alias',
        alias: '',
        email: 'test2@example.com',
        expectedStatus: 400
      },
      {
        name: 'Missing Email',
        alias: 'TestPlayer789',
        email: '',
        expectedStatus: 400
      }
    ];

    for (const testCase of testCases) {
      console.log(`🔍 Testing: ${testCase.name}`);
      console.log(`   Alias: "${testCase.alias}"`);
      console.log(`   Email: "${testCase.email}"`);

      try {
        const response = await fetch('http://localhost:3000/api/in-game-register', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            alias: testCase.alias,
            email: testCase.email
          })
        });

        const data = await response.json();
        
        console.log(`   Status: ${response.status} (expected: ${testCase.expectedStatus})`);
        
        if (response.status === testCase.expectedStatus) {
          console.log('   ✅ Test passed');
        } else {
          console.log('   ❌ Test failed');
        }

        if (response.ok) {
          console.log(`   Response: ${data.message}`);
          if (data.data) {
            console.log(`   Instructions: ${data.data.instructions}`);
          }
        } else {
          console.log(`   Error: ${data.error}`);
        }

      } catch (error) {
        console.log(`   ❌ Request failed: ${error.message}`);
      }

      console.log(''); // Empty line for readability
    }

    // Test server connectivity
    console.log('🌐 Testing server connectivity...');
    try {
      const healthResponse = await fetch('http://localhost:3000/api/webhook-test');
      if (healthResponse.ok) {
        console.log('✅ Server is accessible');
      } else {
        console.log('❌ Server responded with error');
      }
    } catch (error) {
      console.log('❌ Cannot reach server:', error.message);
      console.log('💡 Make sure your dev server is running: npm run dev');
    }

    console.log('\n📋 Test Summary:');
    console.log('• Valid registration should create pending user account');
    console.log('• Invalid inputs should return appropriate error messages');
    console.log('• Check your email for verification links (if using real email)');
    console.log('• Monitor server logs for detailed error information');

  } catch (error) {
    console.error('❌ Test script error:', error);
  }
}

// Run the test
testInGameRegistration(); 