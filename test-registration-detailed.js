require('dotenv').config({ path: '.env.local' });

async function testRegistrationDetailed() {
  try {
    console.log('🧪 Testing in-game registration API with detailed error reporting...\n');

    const testData = {
      alias: 'TestPlayer' + Date.now(),
      email: 'test' + Date.now() + '@example.com'
    };

    console.log('📝 Test data:', testData);

    const response = await fetch('http://localhost:3000/api/in-game-register', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(testData)
    });

    console.log('📊 Response status:', response.status);
    console.log('📊 Response headers:', Object.fromEntries(response.headers.entries()));

    const responseText = await response.text();
    console.log('📄 Raw response:', responseText);

    try {
      const data = JSON.parse(responseText);
      console.log('📋 Parsed response:', JSON.stringify(data, null, 2));
    } catch (parseError) {
      console.log('❌ Failed to parse response as JSON');
    }

    if (response.ok) {
      console.log('✅ Registration successful!');
    } else {
      console.log('❌ Registration failed');
    }

  } catch (error) {
    console.error('❌ Test error:', error);
  }
}

testRegistrationDetailed(); 