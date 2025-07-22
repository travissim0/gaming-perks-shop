import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { verifyAdminAccess, logAdminAction } from '@/utils/adminAuth';

// Use service role client to bypass RLS for admin operations
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(request: NextRequest) {
  try {
    console.log('🔍 Donations API starting...');

    // Use centralized admin authorization
    const authResult = await verifyAdminAccess(request);
    if (!authResult.success) {
      return NextResponse.json({ error: authResult.error }, { status: authResult.statusCode });
    }

    const { user } = authResult;

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