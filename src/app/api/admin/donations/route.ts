import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Use service role client to bypass RLS for admin operations
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(request: NextRequest) {
  try {
    console.log('🔍 Donations API starting...');

    // Check authentication first
    const authHeader = request.headers.get('authorization');
    if (!authHeader) {
      return NextResponse.json({ error: 'No authorization header' }, { status: 401 });
    }

    // Extract token from Bearer header
    const token = authHeader.replace('Bearer ', '');
    
    // Verify the user is admin using the service role client
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
    
    if (authError || !user) {
      console.error('❌ Auth error:', authError);
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
    }

    // Check if user is admin
    const { data: profile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select('is_admin')
      .eq('id', user.id)
      .single();

    if (profileError || !profile?.is_admin) {
      console.error('❌ Not admin:', profileError);
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    console.log('✅ Admin user verified:', user.email);

    // Fetch donations using service role (bypasses RLS) - Try both table names
    let donations, donationsError;
    
    try {
      // First try donation_transactions table
      const result = await supabaseAdmin
        .from('donation_transactions')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50);
      
      donations = result.data;
      donationsError = result.error;
    } catch (error) {
      console.log('donation_transactions table not found, trying donations table...');
      
      // Fallback to donations table
      const result = await supabaseAdmin
        .from('donations')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50);
      
      donations = result.data;
      donationsError = result.error;
    }

    if (donationsError) {
      console.error('❌ Error fetching donations:', donationsError);
      return NextResponse.json({ 
        error: 'Failed to fetch donations', 
        details: donationsError.message 
      }, { status: 500 });
    }

    console.log('✅ Donations fetched successfully:', donations?.length || 0);

    // For each donation with a user_id, fetch the in_game_alias separately
    const donationsWithProfiles = await Promise.all(
      (donations || []).map(async (donation) => {
        let userProfile = null;
        
        if (donation.user_id) {
          try {
            const { data: profile } = await supabaseAdmin
              .from('profiles')
              .select('in_game_alias')
              .eq('id', donation.user_id)
              .single();
            
            userProfile = profile;
          } catch (error) {
            console.log('Could not fetch profile for user:', donation.user_id);
          }
        }
        
        return {
          ...donation,
          user_profiles: userProfile
        };
      })
    );

    // Transform the data to match the expected format
    const transformedDonations = donationsWithProfiles.map(donation => ({
      id: donation.id,
      amount_cents: donation.amount_cents || donation.amount,
      currency: donation.currency || 'usd',
      status: donation.status || 'completed',
      customer_email: donation.customer_email || donation.donor_email,
      customer_name: donation.customer_name || donation.donor_name,
      donation_message: donation.donation_message || donation.message,
      payment_method: donation.payment_method || 'stripe',
      kofi_transaction_id: donation.kofi_transaction_id,
      kofi_message: donation.kofi_message,
      kofi_from_name: donation.kofi_from_name,
      kofi_email: donation.kofi_email,
      kofi_url: donation.kofi_url,
      created_at: donation.created_at,
      completed_at: donation.completed_at || donation.created_at,
      user_profiles: donation.user_profiles
    }));

    console.log('✅ Returning', transformedDonations.length, 'transformed donations');
    return NextResponse.json(transformedDonations);
    
  } catch (error: any) {
    console.error('❌ Error in donations API:', error);
    return NextResponse.json({ 
      error: 'Internal server error', 
      details: error.message 
    }, { status: 500 });
  }
} 