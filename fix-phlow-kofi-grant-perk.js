// Fix Phlow's Ko-Fi donation and grant Text Kill Macro perk
// This script links the donation to the correct user and grants the perk

const { createClient } = require('@supabase/supabase-js');

// Initialize Supabase client
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function fixPhlowDonationAndGrantPerk() {
  console.log('🔧 Fixing Phlow\'s Ko-Fi donation and granting Text Kill Macro perk...\n');

  try {
    // Step 1: Find Phlow's user profile
    console.log('👤 1. Finding Phlow\'s user profile...');
    const { data: phlowProfile, error: profileError } = await supabase
      .from('profiles')
      .select('id, email, in_game_alias, created_at')
      .eq('email', 'ryantpoulin@gmail.com')
      .single();

    if (profileError || !phlowProfile) {
      console.error('❌ Could not find Phlow\'s profile:', profileError?.message);
      return;
    }

    console.log('✅ Found Phlow\'s profile:');
    console.log(`   - User ID: ${phlowProfile.id}`);
    console.log(`   - Email: ${phlowProfile.email}`);
    console.log(`   - Alias: ${phlowProfile.in_game_alias}`);

    // Step 2: Find the Ko-Fi donation with wrong email
    console.log('\n☕ 2. Finding Ko-Fi donation with g25gamingtv@gmail.com...');
    const { data: kofiDonations, error: donationError } = await supabase
      .from('donation_transactions')
      .select('*')
      .eq('payment_method', 'kofi')
      .or('kofi_email.eq.g25gamingtv@gmail.com,customer_email.eq.g25gamingtv@gmail.com')
      .order('created_at', { ascending: false });

    if (donationError) {
      console.error('❌ Error finding Ko-Fi donations:', donationError.message);
      return;
    }

    if (!kofiDonations || kofiDonations.length === 0) {
      console.log('❌ No Ko-Fi donations found with g25gamingtv@gmail.com');
      return;
    }

    console.log(`✅ Found ${kofiDonations.length} Ko-Fi donation(s):`);
    kofiDonations.forEach((donation, index) => {
      console.log(`   ${index + 1}. ${donation.id}: $${(donation.amount_cents / 100).toFixed(2)} on ${new Date(donation.created_at).toLocaleDateString()}`);
    });

    // Step 3: Find the Text Kill Macro product
    console.log('\n🎮 3. Finding Text Kill Macro product...');
    const { data: products, error: productError } = await supabase
      .from('products')
      .select('id, name, description, price, active, customizable')
      .or('name.ilike.%text%kill%macro%,name.ilike.%text%visual%macro%,name.ilike.%kill%macro%,description.ilike.%kill%macro%')
      .eq('active', true);

    if (productError) {
      console.error('❌ Error finding products:', productError.message);
      return;
    }

    if (!products || products.length === 0) {
      console.log('❌ No Text Kill Macro product found');
      return;
    }

    const textKillMacroProduct = products[0]; // Take the first match
    console.log('✅ Found Text Kill Macro product:');
    console.log(`   - Product ID: ${textKillMacroProduct.id}`);
    console.log(`   - Name: ${textKillMacroProduct.name}`);
    console.log(`   - Price: $${(textKillMacroProduct.price / 100).toFixed(2)}`);
    console.log(`   - Customizable: ${textKillMacroProduct.customizable ? 'Yes' : 'No'}`);

    // Step 4: Link the Ko-Fi donation to Phlow's account
    console.log('\n🔗 4. Linking Ko-Fi donation to Phlow\'s account...');
    const donationToUpdate = kofiDonations[0]; // Use the most recent one

    const { error: updateError } = await supabase
      .from('donation_transactions')
      .update({
        user_id: phlowProfile.id,
        customer_name: 'Phlow',
        customer_email: 'ryantpoulin@gmail.com'
      })
      .eq('id', donationToUpdate.id);

    if (updateError) {
      console.error('❌ Error updating donation:', updateError.message);
      return;
    }

    console.log('✅ Ko-Fi donation linked to Phlow\'s account');

    // Step 5: Check if Phlow already has this perk
    console.log('\n🔍 5. Checking if Phlow already has this perk...');
    const { data: existingPerk, error: existingError } = await supabase
      .from('user_products')
      .select('id, phrase, status')
      .eq('user_id', phlowProfile.id)
      .eq('product_id', textKillMacroProduct.id);

    if (existingError) {
      console.error('❌ Error checking existing perks:', existingError.message);
      return;
    }

    if (existingPerk && existingPerk.length > 0) {
      console.log('⚠️ Phlow already has this perk:');
      existingPerk.forEach(perk => {
        console.log(`   - Perk ID: ${perk.id}`);
        console.log(`   - Status: ${perk.status}`);
        console.log(`   - Phrase: ${perk.phrase || 'None set'}`);
      });
      console.log('   → Skipping perk grant (already exists)');
    } else {
      // Step 6: Grant the Text Kill Macro perk
      console.log('\n🎁 6. Granting Text Kill Macro perk to Phlow...');
      const { data: newPerk, error: perkError } = await supabase
        .from('user_products')
        .insert({
          user_id: phlowProfile.id,
          product_id: textKillMacroProduct.id,
          status: 'active',
          purchase_method: 'kofi',
          kofi_transaction_id: donationToUpdate.kofi_transaction_id,
          phrase: 'PHLOW', // Default phrase
          created_at: donationToUpdate.created_at
        })
        .select()
        .single();

      if (perkError) {
        console.error('❌ Error granting perk:', perkError.message);
        return;
      }

      console.log('✅ Text Kill Macro perk granted to Phlow:');
      console.log(`   - Perk ID: ${newPerk.id}`);
      console.log(`   - Phrase: ${newPerk.phrase}`);
      console.log(`   - Status: ${newPerk.status}`);
    }

    // Step 7: Mark donation as used for purchase
    console.log('\n📝 7. Marking donation as used for purchase...');
    const { error: markUsedError } = await supabase
      .from('donation_transactions')
      .update({
        used_for_purchase: true,
        purchase_id: existingPerk && existingPerk.length > 0 ? existingPerk[0].id : newPerk?.id
      })
      .eq('id', donationToUpdate.id);

    if (markUsedError) {
      console.error('❌ Error marking donation as used:', markUsedError.message);
    } else {
      console.log('✅ Donation marked as used for purchase');
    }

    // Step 8: Final verification
    console.log('\n✅ 8. Final verification...');
    const { data: finalCheck, error: finalError } = await supabase
      .from('user_products')
      .select(`
        id, status, phrase, created_at,
        products!inner(name, description, price)
      `)
      .eq('user_id', phlowProfile.id)
      .order('created_at', { ascending: false });

    if (finalError) {
      console.error('❌ Error in final check:', finalError.message);
    } else {
      console.log(`📊 Phlow now has ${finalCheck.length} perk(s):`);
      finalCheck.forEach((perk, index) => {
        console.log(`\n   ${index + 1}. ${perk.products.name}:`);
        console.log(`      - Status: ${perk.status}`);
        console.log(`      - Phrase: ${perk.phrase || 'None'}`);
        console.log(`      - Price: $${(perk.products.price / 100).toFixed(2)}`);
        console.log(`      - Granted: ${new Date(perk.created_at).toLocaleDateString()}`);
      });
    }

    console.log('\n🎉 SUCCESS! Phlow\'s Ko-Fi donation has been fixed and perk granted!');
    console.log('\n📋 Summary:');
    console.log(`   ✅ Donation linked from g25gamingtv@gmail.com to ryantpoulin@gmail.com`);
    console.log(`   ✅ Text Kill Macro perk granted with phrase "PHLOW"`);
    console.log(`   ✅ Donation marked as used for purchase`);
    console.log(`   ✅ Phlow can now use the kill macro in-game`);

    console.log('\n💡 Note: Phlow can change his custom phrase anytime from his dashboard!');

  } catch (error) {
    console.error('❌ Script error:', error.message);
  }
}

// Run the fix
fixPhlowDonationAndGrantPerk(); 