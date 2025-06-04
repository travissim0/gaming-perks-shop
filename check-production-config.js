#!/usr/bin/env node

/**
 * Check Production Configuration
 * Verifies environment variables and Square setup
 */

console.log('🔍 Checking Production Configuration...');
console.log('=====================================');

// Check Node.js environment
console.log('📦 Node.js version:', process.version);
console.log('🌍 Environment:', process.env.NODE_ENV || 'development');

// Check Square configuration
console.log('\n🟦 Square Configuration:');
console.log('  Application ID:', process.env.SQUARE_APPLICATION_ID ? '✅ Set' : '❌ Missing');
console.log('  Access Token:', process.env.SQUARE_ACCESS_TOKEN ? '✅ Set' : '❌ Missing');
console.log('  Location ID:', process.env.SQUARE_LOCATION_ID ? '✅ Set' : '❌ Missing');
console.log('  Environment:', process.env.SQUARE_ENVIRONMENT || 'Not set');

if (process.env.SQUARE_LOCATION_ID) {
    console.log('  Location ID Value:', process.env.SQUARE_LOCATION_ID);
} else {
    console.log('  ⚠️  SQUARE_LOCATION_ID is missing - this is causing checkout failures!');
}

// Check Supabase configuration
console.log('\n🟢 Supabase Configuration:');
console.log('  URL:', process.env.NEXT_PUBLIC_SUPABASE_URL ? '✅ Set' : '❌ Missing');
console.log('  Anon Key:', process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ? '✅ Set' : '❌ Missing');
console.log('  Service Role Key:', process.env.SUPABASE_SERVICE_ROLE_KEY ? '✅ Set' : '❌ Missing');

// Check other important variables
console.log('\n⚙️  Other Configuration:');
console.log('  PORT:', process.env.PORT || '3000');
console.log('  NODE_OPTIONS:', process.env.NODE_OPTIONS || 'Not set');

// Test Square connection if possible
console.log('\n🧪 Testing Square Connection...');
try {
    if (process.env.SQUARE_APPLICATION_ID && process.env.SQUARE_ACCESS_TOKEN) {
        const { Client, Environment } = require('square');
        
        const client = new Client({
            accessToken: process.env.SQUARE_ACCESS_TOKEN,
            environment: process.env.SQUARE_ENVIRONMENT === 'production' ? Environment.Production : Environment.Sandbox
        });
        
        console.log('  Square client initialized: ✅');
        
        if (process.env.SQUARE_LOCATION_ID) {
            console.log('  Location ID configured: ✅');
        } else {
            console.log('  Location ID missing: ❌');
        }
    } else {
        console.log('  Cannot test - missing credentials: ❌');
    }
} catch (error) {
    console.log('  Square connection test failed:', error.message);
}

console.log('\n=====================================');
console.log('🏁 Configuration check complete!'); 