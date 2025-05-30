import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function GET(request: NextRequest) {
  try {
    console.log('🔍 Donations API starting...');

    // Skip auth check for now to isolate the database issue
    
    // Simple query without joins first
    const { data: donations, error: donationsError } = await supabase
      .from('donation_transactions')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(50);

    if (donationsError) {
      console.error('❌ Error fetching donations:', donationsError);
      return NextResponse.json({ 
        error: 'Failed to fetch donations', 
        details: donationsError.message 
      }, { status: 500 });
    }

    console.log('✅ Donations fetched successfully:', donations?.length || 0);

    // Transform the data to match the expected format
    const transformedDonations = donations?.map(donation => ({
      id: donation.id,
      amount_cents: donation.amount_cents || donation.amount,
      currency: donation.currency || 'usd',
      status: donation.status || 'completed',
      customer_email: donation.customer_email || donation.donor_email,
      customer_name: donation.customer_name || donation.donor_name,
      donation_message: donation.donation_message || donation.message,
      created_at: donation.created_at,
      completed_at: donation.completed_at || donation.created_at,
      user_profiles: null // Remove relationships for now
    })) || [];

    return NextResponse.json(transformedDonations);
  } catch (error: any) {
    console.error('❌ Error in donations API:', error);
    return NextResponse.json({ 
      error: 'Internal server error', 
      details: error.message 
    }, { status: 500 });
  }
} 