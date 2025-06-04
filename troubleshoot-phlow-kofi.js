// Troubleshoot Ko-Fi donation for Phlow
// This script searches for missing Ko-Fi donations and suggests fixes

const { createClient } = require('@supabase/supabase-js');

// Initialize Supabase client
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function troubleshootPhlowDonation() {
  console.log('🔍 Troubleshooting Ko-Fi donation for "Phlow"...\n');

  try {
    // 1. Search for Phlow in user profiles
    console.log('👤 1. Searching for Phlow in user profiles...');
    const { data: profiles, error: profileError } = await supabase
      .from('profiles')
      .select('id, email, in_game_alias, created_at')
      .or(`in_game_alias.ilike.%phlow%,email.ilike.%phlow%`);

    if (profileError) {
      console.error('❌ Error searching profiles:', profileError.message);
    } else if (profiles && profiles.length > 0) {
      console.log('✅ Found Phlow user profile(s):');
      profiles.forEach(profile => {
        console.log(`   - ID: ${profile.id}`);
        console.log(`   - Email: ${profile.email}`);
        console.log(`   - Alias: ${profile.in_game_alias}`);
        console.log(`   - Created: ${new Date(profile.created_at).toLocaleString()}\n`);
      });
    } else {
      console.log('❌ No user profile found for "Phlow"');
      console.log('   → This might be why the donation isn\'t linked!\n');
    }

    // 2. Search Ko-Fi donations for Phlow
    console.log('☕ 2. Searching Ko-Fi donations for Phlow...');
    const { data: kofiDonations, error: kofiError } = await supabase
      .from('donation_transactions')
      .select('*')
      .eq('payment_method', 'kofi')
      .or(`customer_name.ilike.%phlow%,kofi_from_name.ilike.%phlow%,donation_message.ilike.%phlow%,kofi_email.ilike.%phlow%,customer_email.ilike.%phlow%`)
      .order('created_at', { ascending: false });

    if (kofiError) {
      console.error('❌ Error searching Ko-Fi donations:', kofiError.message);
    } else if (kofiDonations && kofiDonations.length > 0) {
      console.log('✅ Found Ko-Fi donation(s) for Phlow:');
      kofiDonations.forEach((donation, index) => {
        console.log(`\n   ${index + 1}. Donation ${donation.id}:`);
        console.log(`      Amount: $${(donation.amount_cents / 100).toFixed(2)} ${donation.currency.toUpperCase()}`);
        console.log(`      Status: ${donation.status}`);
        console.log(`      Ko-Fi Name: ${donation.kofi_from_name || 'N/A'}`);
        console.log(`      Ko-Fi Email: ${donation.kofi_email || 'N/A'}`);
        console.log(`      Customer Email: ${donation.customer_email || 'N/A'}`);
        console.log(`      Customer Name: ${donation.customer_name || 'N/A'}`);
        console.log(`      Message: ${donation.donation_message || 'N/A'}`);
        console.log(`      User Linked: ${donation.user_id ? 'Yes' : 'No'}`);
        console.log(`      Created: ${new Date(donation.created_at).toLocaleString()}`);
        console.log(`      Ko-Fi Transaction ID: ${donation.kofi_transaction_id || 'N/A'}`);
      });
    } else {
      console.log('❌ No Ko-Fi donations found for "Phlow"');
    }

    // 3. Check all recent Ko-Fi donations (might be under different name)
    console.log('\n☕ 3. Checking all recent Ko-Fi donations...');
    const { data: recentKofi, error: recentError } = await supabase
      .from('donation_transactions')
      .select('*')
      .eq('payment_method', 'kofi')
      .gte('created_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString())
      .order('created_at', { ascending: false })
      .limit(10);

    if (recentError) {
      console.error('❌ Error fetching recent Ko-Fi donations:', recentError.message);
    } else if (recentKofi && recentKofi.length > 0) {
      console.log(`📊 Found ${recentKofi.length} recent Ko-Fi donations:`);
      recentKofi.forEach((donation, index) => {
        console.log(`\n   ${index + 1}. ${donation.id}:`);
        console.log(`      $${(donation.amount_cents / 100).toFixed(2)} from "${donation.kofi_from_name || 'Unknown'}"`);
        console.log(`      Ko-Fi Email: ${donation.kofi_email || 'N/A'}`);
        console.log(`      Message: ${donation.donation_message || 'No message'}`);
        console.log(`      Linked to user: ${donation.user_id ? 'Yes' : 'No'}`);
        console.log(`      Date: ${new Date(donation.created_at).toLocaleString()}`);
      });
    } else {
      console.log('❌ No recent Ko-Fi donations found');
    }

    // 4. Check for unlinked Ko-Fi donations
    console.log('\n🔗 4. Checking for unlinked Ko-Fi donations...');
    const { data: unlinked, error: unlinkError } = await supabase
      .from('donation_transactions')
      .select('*')
      .eq('payment_method', 'kofi')
      .is('user_id', null)
      .gte('created_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString())
      .order('created_at', { ascending: false });

    if (unlinkError) {
      console.error('❌ Error checking unlinked donations:', unlinkError.message);
    } else if (unlinked && unlinked.length > 0) {
      console.log(`⚠️ Found ${unlinked.length} unlinked Ko-Fi donation(s):`);
      unlinked.forEach((donation, index) => {
        console.log(`\n   ${index + 1}. Unlinked donation ${donation.id}:`);
        console.log(`      Amount: $${(donation.amount_cents / 100).toFixed(2)}`);
        console.log(`      Ko-Fi Name: "${donation.kofi_from_name || 'Unknown'}"`);
        console.log(`      Ko-Fi Email: ${donation.kofi_email || 'N/A'}`);
        console.log(`      Message: ${donation.donation_message || 'No message'}`);
        console.log(`      Date: ${new Date(donation.created_at).toLocaleString()}`);
        
        // Check if this could be Phlow
        const mightBePhlow = (donation.kofi_from_name && donation.kofi_from_name.toLowerCase().includes('phlow')) ||
                            (donation.kofi_email && donation.kofi_email.toLowerCase().includes('phlow')) ||
                            (donation.donation_message && donation.donation_message.toLowerCase().includes('phlow'));
        
        if (mightBePhlow) {
          console.log(`      🎯 THIS MIGHT BE PHLOW'S DONATION!`);
        }
      });
    } else {
      console.log('✅ All recent Ko-Fi donations are properly linked');
    }

    // 5. Generate troubleshooting report
    console.log('\n📋 TROUBLESHOOTING SUMMARY:');
    console.log('=' * 50);

    const phlowProfile = profiles && profiles.length > 0 ? profiles[0] : null;
    const phlowDonations = kofiDonations && kofiDonations.length > 0 ? kofiDonations : [];
    const suspiciousUnlinked = unlinked ? unlinked.filter(d => 
      (d.kofi_from_name && d.kofi_from_name.toLowerCase().includes('phlow')) ||
      (d.kofi_email && d.kofi_email.toLowerCase().includes('phlow')) ||
      (d.donation_message && d.donation_message.toLowerCase().includes('phlow'))
    ) : [];

    if (phlowProfile && phlowDonations.length > 0) {
      console.log('✅ CASE 1: Donation found and user exists');
      console.log('   → Check admin panel filters and authentication');
      console.log('   → Verify Row Level Security policies');
    } else if (!phlowProfile && phlowDonations.length > 0) {
      console.log('⚠️ CASE 2: Donation found but no user profile');
      console.log('   → Phlow may not have an account on your site');
      console.log('   → Consider creating a profile or linking manually');
    } else if (phlowProfile && phlowDonations.length === 0) {
      console.log('⚠️ CASE 3: User exists but no donation found');
      console.log('   → Check if donation was made with different email');
      console.log('   → Look at unlinked donations above');
    } else if (suspiciousUnlinked.length > 0) {
      console.log('🎯 CASE 4: Potential match found in unlinked donations');
      console.log('   → Check the unlinked donations marked above');
      console.log('   → Consider manual linking');
    } else {
      console.log('❌ CASE 5: No trace found');
      console.log('   → Double-check the Ko-Fi donation was actually made');
      console.log('   → Verify webhook is working properly');
      console.log('   → Check Ko-Fi dashboard for transaction');
    }

    // 6. Provide fix suggestions
    console.log('\n🔧 SUGGESTED FIXES:');
    console.log('=' * 50);

    if (phlowProfile) {
      console.log(`📧 Phlow's registered email: ${phlowProfile.email}`);
      console.log(`👤 Phlow's user ID: ${phlowProfile.id}`);
    }

    if (suspiciousUnlinked.length > 0) {
      console.log('\n🔗 To manually link a donation to Phlow:');
      suspiciousUnlinked.forEach((donation, index) => {
        if (phlowProfile) {
          console.log(`\n   ${index + 1}. For donation ${donation.id}:`);
          console.log(`      UPDATE donation_transactions`);
          console.log(`      SET user_id = '${phlowProfile.id}',`);
          console.log(`          customer_name = 'Phlow'`);
          console.log(`      WHERE id = '${donation.id}';`);
        }
      });
    }

    if (!phlowProfile) {
      console.log('\n👤 To create a profile for Phlow (if they don\'t have an account):');
      console.log('   1. Ask Phlow to create an account on your site');
      console.log('   2. Or manually link using their Ko-Fi email');
    }

    console.log('\n✅ Troubleshooting complete!');

  } catch (error) {
    console.error('❌ Script error:', error.message);
  }
}

// Run the troubleshooting
troubleshootPhlowDonation(); 