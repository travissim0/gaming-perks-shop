#!/usr/bin/env node

// Troubleshoot Ko-Fi donation issues
require('dotenv').config({ path: './production.env' });

const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function troubleshootKofiDonation() {
  console.log('🔍 Troubleshooting Ko-Fi donation issues...\n');

  try {
    // 1. Check for $121 donation specifically
    console.log('1. Searching for $121 donation...');
    const { data: largeDonations, error: largeError } = await supabase
      .from('donation_transactions')
      .select('*')
      .gte('amount_cents', 12100) // $121 or more
      .order('created_at', { ascending: false });

    if (largeError) {
      console.error('❌ Error querying large donations:', largeError);
    } else {
      console.log(`📊 Found ${largeDonations?.length || 0} donations of $121 or more:`);
      largeDonations?.forEach((donation, index) => {
        console.log(`\n${index + 1}. Amount: $${donation.amount_cents / 100}`);
        console.log(`   Name: ${donation.customer_name || donation.kofi_from_name || 'Unknown'}`);
        console.log(`   Ko-Fi ID: ${donation.kofi_transaction_id || 'None'}`);
        console.log(`   Email: ${donation.customer_email || donation.kofi_email || 'None'}`);
        console.log(`   Date: ${donation.created_at}`);
        console.log(`   Method: ${donation.payment_method || 'Unknown'}`);
        console.log(`   Status: ${donation.status}`);
      });
    }

    // 2. Check recent Ko-Fi donations
    console.log('\n2. Checking recent Ko-Fi donations...');
    const { data: kofiDonations, error: kofiError } = await supabase
      .from('donation_transactions')
      .select('*')
      .eq('payment_method', 'kofi')
      .order('created_at', { ascending: false })
      .limit(10);

    if (kofiError) {
      console.error('❌ Error querying Ko-Fi donations:', kofiError);
    } else {
      console.log(`📊 Found ${kofiDonations?.length || 0} recent Ko-Fi donations:`);
      kofiDonations?.forEach((donation, index) => {
        console.log(`\n${index + 1}. Amount: $${donation.amount_cents / 100}`);
        console.log(`   Name: ${donation.kofi_from_name || donation.customer_name || 'Unknown'}`);
        console.log(`   Ko-Fi ID: ${donation.kofi_transaction_id}`);
        console.log(`   Date: ${donation.created_at}`);
        console.log(`   Status: ${donation.status}`);
      });
    }

    // 3. Check for donations from potential Ko-Fi webhook issues
    console.log('\n3. Checking for potential webhook issues...');
    
    // Check donations without Ko-Fi transaction IDs but with Ko-Fi payment method
    const { data: incompleteKofi, error: incompleteError } = await supabase
      .from('donation_transactions')
      .select('*')
      .eq('payment_method', 'kofi')
      .is('kofi_transaction_id', null)
      .order('created_at', { ascending: false })
      .limit(5);

    if (incompleteError) {
      console.error('❌ Error querying incomplete Ko-Fi donations:', incompleteError);
    } else {
      console.log(`📊 Found ${incompleteKofi?.length || 0} Ko-Fi donations without transaction IDs (potential webhook issues):`);
      incompleteKofi?.forEach((donation, index) => {
        console.log(`\n${index + 1}. Amount: $${donation.amount_cents / 100}`);
        console.log(`   Name: ${donation.customer_name || 'Unknown'}`);
        console.log(`   Date: ${donation.created_at}`);
        console.log(`   Status: ${donation.status}`);
      });
    }

    // 4. Test Ko-Fi webhook endpoint
    console.log('\n4. Ko-Fi webhook configuration check...');
    console.log(`Ko-Fi webhook URL should be: https://freeinf.org/api/kofi-webhook`);
    console.log(`Ko-Fi verification token set: ${process.env.KOFI_VERIFICATION_TOKEN ? 'YES' : 'NO'}`);
    
    if (process.env.KOFI_VERIFICATION_TOKEN) {
      console.log(`Token value: ${process.env.KOFI_VERIFICATION_TOKEN}`);
    } else {
      console.log('⚠️ WARNING: No KOFI_VERIFICATION_TOKEN set in environment');
    }

    // 5. Check for any donations around the time of the missing $121
    console.log('\n5. Recent donations from all sources...');
    const { data: allRecent, error: allError } = await supabase
      .from('donation_transactions')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(20);

    if (allError) {
      console.error('❌ Error querying all recent donations:', allError);
    } else {
      console.log(`📊 Found ${allRecent?.length || 0} recent donations from all sources:`);
      allRecent?.forEach((donation, index) => {
        const amount = donation.amount_cents / 100;
        const isLarge = amount >= 100;
        const prefix = isLarge ? '💰' : '  ';
        console.log(`\n${prefix}${index + 1}. $${amount} - ${donation.customer_name || donation.kofi_from_name || 'Anonymous'}`);
        console.log(`   Method: ${donation.payment_method || 'unknown'} | Status: ${donation.status}`);
        console.log(`   Date: ${donation.created_at}`);
        if (donation.kofi_transaction_id) {
          console.log(`   Ko-Fi ID: ${donation.kofi_transaction_id}`);
        }
      });
    }

    // 6. Recommendations
    console.log('\n6. Troubleshooting recommendations:');
    console.log('   a) Check Ko-Fi dashboard for webhook delivery logs');
    console.log('   b) Verify webhook URL: https://freeinf.org/api/kofi-webhook');
    console.log('   c) Ensure KOFI_VERIFICATION_TOKEN matches Ko-Fi settings');
    console.log('   d) Check server logs for webhook processing errors');
    console.log('   e) Test webhook with Ko-Fi\'s webhook tester tool');
    
    if (largeDonations?.length === 0) {
      console.log('\n⚠️ No $121+ donations found in database - Ko-Fi webhook may not have processed');
      console.log('   - Check if the donation appears in Ko-Fi dashboard');
      console.log('   - Verify webhook is properly configured and firing');
      console.log('   - Check for webhook processing errors in server logs');
    }

  } catch (error) {
    console.error('❌ Troubleshooting script error:', error);
  }
}

// Run the troubleshooting
troubleshootKofiDonation().then(() => {
  console.log('\n✅ Troubleshooting complete!');
  process.exit(0);
}).catch(error => {
  console.error('❌ Fatal error:', error);
  process.exit(1);
}); 