// Debug script to run in browser console on admin/donations page
// This will help us see what the admin API is actually returning

console.log('🔍 Starting Admin Frontend Debug...\n');

async function debugAdminDonations() {
  try {
    console.log('📊 Fetching admin donations...');
    
    // Get the current Supabase session (this should work if you're logged in)
    const { createClient } = window.supabase || {};
    
    if (!createClient) {
      console.log('❌ Supabase not available in window. Trying alternative method...');
      
      // Alternative: Try to get session from localStorage
      const session = localStorage.getItem('sb-localhost-auth-token') || 
                      localStorage.getItem('supabase.auth.token');
      
      if (session) {
        try {
          const sessionData = JSON.parse(session);
          const accessToken = sessionData.access_token;
          
          if (accessToken) {
            console.log('✅ Found access token in localStorage');
            return await fetchWithToken(accessToken);
          }
        } catch (e) {
          console.log('❌ Could not parse session from localStorage');
        }
      }
      
      console.log('❌ No authentication method available');
      console.log('🔧 Please make sure you are logged in and try again');
      return;
    }
    
    // Create Supabase client
    const supabase = createClient(
      window.ENV?.NEXT_PUBLIC_SUPABASE_URL || 'YOUR_SUPABASE_URL',
      window.ENV?.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'YOUR_SUPABASE_ANON_KEY'
    );
    
    // Get current session
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();
    
    if (sessionError || !session?.access_token) {
      console.log('❌ No valid session found:', sessionError?.message || 'No session');
      console.log('🔧 Please make sure you are logged in');
      return;
    }
    
    console.log('✅ Session found for user:', session.user.email);
    
    return await fetchWithToken(session.access_token);
    
  } catch (error) {
    console.error('❌ Error in debug script:', error);
  }
}

async function fetchWithToken(accessToken) {
  try {
    console.log('📡 Calling /api/admin/donations with token...');
    
    const response = await fetch('/api/admin/donations', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
    });
    
    console.log(`📡 Response status: ${response.status} ${response.statusText}`);
    
    const data = await response.json();
    
    if (!response.ok) {
      console.log('❌ API Error:', data);
      
      if (response.status === 403) {
        console.log('🚫 Access denied - you might not have admin privileges');
      } else if (response.status === 401) {
        console.log('🔐 Unauthorized - session might be expired');
      }
      
      return;
    }
    
    console.log('✅ API Response received successfully!');
    console.log(`📊 Total donations returned: ${data.length}`);
    
    if (data.length === 0) {
      console.log('⚠️  No donations returned from API');
      console.log('🔧 This might indicate:');
      console.log('   - RLS policies are blocking access');
      console.log('   - The table is actually empty');
      console.log('   - There\'s an issue with the API query');
    } else {
      console.log('💰 Recent donations:');
      data.slice(0, 5).forEach((donation, i) => {
        const amount = (donation.amount_cents / 100).toFixed(2);
        const date = new Date(donation.created_at).toLocaleDateString();
        const paymentId = donation.square_payment_id || donation.stripe_payment_intent_id || 'N/A';
        console.log(`   ${i + 1}. $${amount} ${donation.currency.toUpperCase()} - ${donation.payment_method} - ${paymentId} (${date})`);
      });
      
      // Look specifically for the $1 donation
      const oneDollarDonation = data.find(d => 
        d.amount_cents === 100 && 
        d.square_payment_id === '3f41BwwODSrn6MMirlorJ5YG1jDZY'
      );
      
      if (oneDollarDonation) {
        console.log('🎯 FOUND YOUR $1 DONATION IN API RESPONSE!');
        console.log('   ID:', oneDollarDonation.id);
        console.log('   Amount:', (oneDollarDonation.amount_cents / 100).toFixed(2));
        console.log('   Square Payment ID:', oneDollarDonation.square_payment_id);
        console.log('   Status:', oneDollarDonation.status);
        console.log('   Created:', oneDollarDonation.created_at);
        console.log('✅ The donation IS being returned by the API!');
        console.log('🔧 If you can\'t see it on the page, there might be a frontend filtering or display issue.');
      } else {
        console.log('❌ Your $1 donation NOT found in API response');
        console.log('🔧 This means the API is not returning your donation for some reason');
      }
    }
    
    return data;
    
  } catch (error) {
    console.error('❌ Fetch error:', error);
  }
}

// Instructions for user
console.log('🔧 INSTRUCTIONS:');
console.log('1. Make sure you are on the admin/donations page');
console.log('2. Make sure you are logged in as an admin user');
console.log('3. Run: debugAdminDonations()');
console.log('');

// Auto-run if we're on the right page
if (window.location.pathname === '/admin/donations') {
  console.log('🚀 Auto-running debug on admin donations page...');
  debugAdminDonations();
} else {
  console.log('📍 You are not on the admin/donations page');
  console.log(`📍 Current page: ${window.location.pathname}`);
  console.log('📍 Please navigate to /admin/donations and run: debugAdminDonations()');
} 