require('dotenv').config({ path: '.env.local' });

async function testInvitationRegistration() {
  try {
    console.log('🧪 Testing invitation-based in-game registration...\n');

    // Use a unique alias and test email
    const testData = {
      alias: 'InviteTest' + Date.now(),
      email: 'acrimoneyius@gmail.com' // Use your real email for testing
    };

    console.log('📝 Test data:', testData);
    console.log('📧 This should send an invitation email immediately!\n');

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
      console.log('📧 An invitation email should have been sent immediately');
      console.log('📱 Check your email for the invitation link');
      console.log('🔗 The link will take you directly to set your password');
      console.log('🎯 No password required during registration - email sent first!');
    } else {
      console.log('\n❌ Registration failed');
      console.log('Error:', data.error);
    }

    console.log('\n📋 Expected flow:');
    console.log('1. ✅ API call completes immediately');
    console.log('2. ✅ Invitation email sent to your inbox');
    console.log('3. 📧 Click the invitation link in email');
    console.log('4. 🔑 Set your password on the website');
    console.log('5. 🎮 Access your gaming dashboard');

    console.log('\n🔍 Key difference from before:');
    console.log('- Email is sent IMMEDIATELY when you register in-game');
    console.log('- No password required during registration');
    console.log('- Password is set AFTER clicking the email link');

  } catch (error) {
    console.error('❌ Test error:', error);
  }
}

testInvitationRegistration(); 