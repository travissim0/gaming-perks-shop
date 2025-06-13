#!/usr/bin/env node

// Check donation data for NULL user_id issues
require('dotenv').config({ path: './.env.local' });

const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function checkDonationData() {
  try {
    console.log('🔍 Checking donation data for issues...\n');

    // Get all donation transactions with user_id info
    const { data: donations, error } = await supabase
      .from('donation_transactions')
      .select(`
        id,
        user_id,
        amount_cents,
        currency,
        customer_email,
        customer_name,
        donation_message,
        payment_method,
        kofi_from_name,
        status,
        created_at
      `)
      .order('created_at', { ascending: false })
      .limit(20);

    if (error) {
      console.error('❌ Error fetching donations:', error);
      return;
    }

    console.log(`📊 Found ${donations?.length || 0} recent donations:`);
    
    let nullUserIds = 0;
    let validUserIds = 0;
    
    donations?.forEach((donation, index) => {
      const hasUserID = donation.user_id !== null;
      if (hasUserID) {
        validUserIds++;
      } else {
        nullUserIds++;
      }
      
      console.log(`\n${index + 1}. ${hasUserID ? '✅' : '❌'} ${donation.customer_name || donation.kofi_from_name || 'Anonymous'}`);
      console.log(`   Amount: $${donation.amount_cents / 100} ${donation.currency}`);
      console.log(`   User ID: ${donation.user_id || 'NULL'}`);
      console.log(`   Email: ${donation.customer_email}`);
      console.log(`   Payment: ${donation.payment_method || 'unknown'}`);
      console.log(`   Status: ${donation.status}`);
    });

    console.log(`\n📈 Summary:`);
    console.log(`   Valid user_id: ${validUserIds}`);
    console.log(`   NULL user_id: ${nullUserIds}`);
    console.log(`   Total: ${donations?.length || 0}`);

    if (nullUserIds > 0) {
      console.log(`\n⚠️  Issue Found: ${nullUserIds} donations have NULL user_id`);
      console.log(`   This is expected for Ko-fi donations from non-registered users`);
      console.log(`   But it breaks user-specific donation queries`);
    }

    // Test the user-donations API endpoint with a real user ID
    if (validUserIds > 0) {
      const validDonation = donations?.find(d => d.user_id !== null);
      if (validDonation) {
        console.log(`\n🧪 Testing user-donations API with real user ID: ${validDonation.user_id}`);
        
        const testUrl = `http://localhost:3000/api/user-donations?userId=${validDonation.user_id}`;
        console.log(`   URL: ${testUrl}`);
        
        try {
          const response = await fetch(testUrl);
          const result = await response.json();
          console.log(`   Status: ${response.status}`);
          console.log(`   Result: ${JSON.stringify(result, null, 2)}`);
        } catch (fetchError) {
          console.log(`   Fetch error: ${fetchError.message}`);
        }
      }
    }

  } catch (error) {
    console.error('❌ Script error:', error);
  }
}

checkDonationData(); 