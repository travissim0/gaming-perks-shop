const { createClient } = require('@supabase/supabase-js');

// Configuration
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

async function debugPasswordReset() {
    console.log('🔧 Password Reset Debugging Tool');
    console.log('================================');
    
    // Check environment variables
    console.log('\n📋 Environment Check:');
    console.log('- SUPABASE_URL:', !!SUPABASE_URL ? '✅ Set' : '❌ Missing');
    console.log('- SUPABASE_ANON_KEY:', !!SUPABASE_ANON_KEY ? '✅ Set' : '❌ Missing');
    
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
        console.error('\n❌ Missing required environment variables. Check your .env.local file.');
        return;
    }

    // Create Supabase client
    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    console.log('\n🔗 Supabase client created successfully');

    // Test URLs
    const baseUrl = 'http://localhost:3000';
    const resetUrl = `${baseUrl}/auth/reset-password`;
    
    console.log('\n🌐 URL Configuration:');
    console.log('- Base URL:', baseUrl);
    console.log('- Reset URL:', resetUrl);
    console.log('- Forgot Password URL:', `${baseUrl}/auth/forgot-password`);

    // Check if we can access the reset page
    console.log('\n📄 Page Accessibility Test:');
    try {
        const response = await fetch(resetUrl);
        console.log('- Reset page HTTP status:', response.status);
        console.log('- Reset page accessible:', response.status === 200 ? '✅ Yes' : '❌ No');
    } catch (error) {
        console.log('- Reset page access error:', error.message);
    }

    // Test the password reset email function
    console.log('\n📧 Password Reset Email Test:');
    console.log('This will test the resetPasswordForEmail function with a dummy email.');
    console.log('Note: This will NOT send an actual email unless the email exists in your system.');
    
    try {
        const testEmail = 'test@example.com';
        const { data, error } = await supabase.auth.resetPasswordForEmail(testEmail, {
            redirectTo: resetUrl,
        });

        if (error) {
            console.log('- Password reset test result:', error.message);
            if (error.message.includes('User not found')) {
                console.log('- This is expected for test email ✅');
            }
        } else {
            console.log('- Password reset function works ✅');
        }
    } catch (error) {
        console.log('- Password reset test error:', error.message);
    }

    // Check Supabase Auth settings
    console.log('\n⚙️  Supabase Auth Settings to Check:');
    console.log('1. Go to your Supabase Dashboard');
    console.log('2. Navigate to Authentication > Settings');
    console.log('3. Check "Site URL" is set to:', baseUrl);
    console.log('4. Check "Redirect URLs" includes:', resetUrl);
    console.log('5. Verify email templates are configured');

    console.log('\n🔍 Troubleshooting Steps:');
    console.log('1. Check if dev server is running: npm run dev');
    console.log('2. Test direct URL access:', resetUrl);
    console.log('3. Check browser console for errors');
    console.log('4. Verify email link format in received email');
    console.log('5. Check Supabase Auth logs in dashboard');

    console.log('\n💡 Common Issues:');
    console.log('- Email link might be going to wrong URL');
    console.log('- Supabase Site URL not configured correctly');
    console.log('- Reset page not accessible (404 error)');
    console.log('- Browser cache issues');
    console.log('- Email client blocking redirects');

    console.log('\n🎯 Next Actions:');
    console.log('1. Run: npm run dev (if not running)');
    console.log('2. Test: http://localhost:3000/auth/reset-password');
    console.log('3. Check email link destination');
    console.log('4. Copy exact URL from email and test directly');
}

// Run the debug function
debugPasswordReset().catch(console.error); 