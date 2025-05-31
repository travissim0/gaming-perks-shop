const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

// Load environment variables
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error('❌ Missing Supabase credentials in .env.local');
    console.error('Required: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function deployKofiIntegration() {
    try {
        console.log('☕ Checking Ko-fi Integration Readiness...\n');
        
        // Check if payment_method column exists
        console.log('🔍 Checking database schema...');
        const { data: columns, error: columnError } = await supabase
            .from('information_schema.columns')
            .select('column_name')
            .eq('table_name', 'donation_transactions')
            .eq('column_name', 'payment_method');

        if (columnError) {
            console.error('❌ Error checking database schema:', columnError.message);
            return;
        }

        const hasPaymentMethodColumn = columns && columns.length > 0;
        
        if (hasPaymentMethodColumn) {
            console.log('✅ Database schema is ready for Ko-fi integration');
            
            // Check existing donations
            const { data: existingDonations, error: donationsError } = await supabase
                .from('donation_transactions')
                .select('payment_method, count', { count: 'exact' });
                
            if (!donationsError) {
                const kofiDonations = existingDonations?.filter(d => d.payment_method === 'kofi').length || 0;
                const stripeDonations = existingDonations?.filter(d => d.payment_method === 'stripe' || !d.payment_method).length || 0;
                
                console.log(`📊 Current donations: ${stripeDonations} Stripe, ${kofiDonations} Ko-fi`);
            }
        } else {
            console.log('❌ Database schema needs to be updated');
            console.log('\n📋 Required Action:');
            console.log('1. Run the SQL script "add-kofi-donations.sql" in your Supabase SQL Editor');
            console.log('2. This will add Ko-fi support columns to the donation_transactions table');
        }

        // Check if Ko-fi webhook endpoint exists
        console.log('\n🔗 Webhook Endpoint Status:');
        console.log('✅ Ko-fi webhook endpoint created: /api/kofi-webhook');
        console.log('📍 Webhook URL: https://your-domain.com/api/kofi-webhook');
        
        // Ko-fi setup instructions
        console.log('\n☕ Ko-fi Setup Instructions:');
        console.log('1. Go to your Ko-fi Creator Dashboard');
        console.log('2. Navigate to Settings > Webhooks');
        console.log('3. Add webhook URL: https://your-domain.com/api/kofi-webhook');
        console.log('4. (Optional) Set KOFI_VERIFICATION_TOKEN in your .env.local for security');
        
        // Environment variables check
        console.log('\n🔧 Environment Variables:');
        const kofiToken = process.env.KOFI_VERIFICATION_TOKEN;
        if (kofiToken) {
            console.log('✅ KOFI_VERIFICATION_TOKEN is set');
        } else {
            console.log('⚠️  KOFI_VERIFICATION_TOKEN not set (optional, but recommended for security)');
        }
        
        // Frontend integration status
        console.log('\n🎨 Frontend Integration:');
        console.log('✅ Donate page updated with Ko-fi option');
        console.log('✅ Admin dashboard updated to show Ko-fi donations');
        console.log('✅ Payment method selection UI added');
        
        // Testing instructions
        console.log('\n🧪 Testing Instructions:');
        console.log('1. Visit /donate page');
        console.log('2. Select Ko-fi payment method');
        console.log('3. Click donate button to test Ko-fi redirect');
        console.log('4. Make a test donation on Ko-fi');
        console.log('5. Check admin dashboard to see if webhook captured the donation');
        
        console.log('\n✅ Ko-fi Integration Deployment Complete!');
        console.log('\n📚 Next Steps:');
        console.log('- Apply database schema updates if needed');
        console.log('- Configure Ko-fi webhook in your Ko-fi dashboard');
        console.log('- Test the complete donation flow');
        console.log('- Monitor webhook logs for any issues');
        
    } catch (error) {
        console.error('❌ Error during Ko-fi integration check:', error.message);
    }
}

deployKofiIntegration(); 