import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Use service role client to bypass RLS for admin operations
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Fallback admin emails when database is unavailable
const FALLBACK_ADMIN_EMAILS = [
  'qwerty5544@aim.com',  // Add your admin email here
  // Add other admin emails as needed
];

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

    // Check if user is admin - with fallback for database issues
    let isAdmin = false;
    
    try {
      const { data: profile, error: profileError } = await supabaseAdmin
        .from('profiles')
        .select('is_admin')
        .eq('id', user.id)
        .single();

      if (!profileError && profile?.is_admin) {
        isAdmin = true;
        console.log('✅ Admin verified from database:', user.email);
      }
    } catch (dbError) {
      console.warn('⚠️ Database check failed, using fallback admin list');
    }

    // Fallback: Check against hardcoded admin emails if database check failed
    if (!isAdmin && user.email && FALLBACK_ADMIN_EMAILS.includes(user.email.toLowerCase())) {
      isAdmin = true;
      console.log('✅ Admin verified from fallback list:', user.email);
    }

    if (!isAdmin) {
      console.error('❌ Not admin - email not in database or fallback list:', user.email);
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    // Return cached admin data when database is down
    try {
      // First try donation_transactions table
      const result = await supabaseAdmin
        .from('donation_transactions')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50);
      
      if (result.error) {
        console.warn('⚠️ Database unavailable, returning fallback message');
        return NextResponse.json({
          message: 'Database temporarily unavailable. Using cached supporters data on main pages.',
          fallback: true,
          donations: []
        });
      }

      const donations = result.data || [];
      console.log('✅ Donations fetched successfully:', donations.length);

      // Process donations normally...
      const donationsWithProfiles = await Promise.all(
        donations.map(async (donation) => {
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
      
    } catch (error) {
      console.warn('⚠️ Database error, returning fallback response:', error);
      return NextResponse.json({
        message: 'Database temporarily unavailable. Using cached supporters data on main pages.',
        fallback: true,
        donations: []
      });
    }
    
  } catch (error: any) {
    console.error('❌ Error in donations API:', error);
    return NextResponse.json({ 
      error: 'Internal server error', 
      details: error.message 
    }, { status: 500 });
  }
} 