require('dotenv').config({ path: '.env.local' });

async function testRealRegistration() {
  try {
    console.log('🧪 Testing in-game registration with real email...\n');

    // Use a unique alias and email for testing
    const testData = {
      alias: 'TestPlayer' + Date.now(),
      email: 'qwerty5544@aim.com' // Use your real email for testing
    };

    console.log('📝 Test data:', testData);
    console.log('⚠️  Make sure to check your email inbox and spam folder!\n');

    const response = await fetch('http://localhost:3000/api/in-game-register', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(testData)
    });

    console.log('📊 Response status:', response.status);

    const data = await response.json();
    console.log('📋 Response:', JSON.stringify(data, null, 2));

    if (response.ok) {
      console.log('\n✅ Registration successful!');
      console.log('📧 Check your email for the verification link');
      console.log('📱 The email should contain a link to complete registration');
      console.log('🔗 The link will take you to set your password');
    } else {
      console.log('\n❌ Registration failed');
      console.log('Error:', data.error);
    }

    console.log('\n📋 Next steps:');
    console.log('1. Check your email inbox (and spam folder)');
    console.log('2. Click the verification link in the email');
    console.log('3. Set your password on the website');
    console.log('4. Access your dashboard');

  } catch (error) {
    console.error('❌ Test error:', error);
  }
}

testRealRegistration(); 