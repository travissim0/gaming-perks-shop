// Script to fix donation user links by matching email addresses
// This will link donations to users based on their email addresses

const fixDonationUserLinks = async () => {
  console.log('🔧 Fixing donation user links...');
  
  try {
    // First, let's see what donations need fixing
    const donationsResponse = await fetch('http://localhost:3000/api/admin/donations');
    const donationsData = await donationsResponse.json();
    
    if (!donationsData.donations) {
      console.log('❌ Could not fetch donations');
      return;
    }
    
    console.log(`📋 Found ${donationsData.donations.length} total donations`);
    
    // Filter donations that need user_id linking (where user_id is null but email exists)
    const donationsNeedingFix = donationsData.donations.filter(d => 
      !d.user_id && d.customer_email
    );
    
    console.log(`🔍 Found ${donationsNeedingFix.length} donations needing user linking`);
    
    if (donationsNeedingFix.length === 0) {
      console.log('✅ All donations are already properly linked!');
      return;
    }
    
    // Show the donations that need fixing
    donationsNeedingFix.forEach(donation => {
      console.log(`📧 Donation ${donation.id}: $${donation.amount_cents/100} from ${donation.customer_email}`);
    });
    
    console.log('\n💡 To fix these donations, you need to:');
    console.log('1. Create an API endpoint that can update donation user_ids');
    console.log('2. Match donations to users by email address');
    console.log('3. Update the donation records with the correct user_id');
    
    // For now, let's just show what the fix would look like
    console.log('\n🔧 Example fix for your donations:');
    console.log('UPDATE donation_transactions SET user_id = (SELECT id FROM auth.users WHERE email = customer_email) WHERE user_id IS NULL AND customer_email IS NOT NULL;');
    
  } catch (error) {
    console.error('❌ Error fixing donation links:', error.message);
  }
};

// Run the fix
fixDonationUserLinks(); 