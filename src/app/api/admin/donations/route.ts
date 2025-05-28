import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(req: NextRequest) {
  try {
    // Fetch all donation transactions
    const { data: donations, error: donationsError } = await supabase
      .from('donation_transactions')
      .select(`
        id,
        user_id,
        amount_cents,
        currency,
        status,
        customer_email,
        customer_name,
        donation_message,
        created_at,
        completed_at
      `)
      .order('created_at', { ascending: false });

    if (donationsError) {
      console.error('Error fetching donations:', donationsError);
      return NextResponse.json(
        { error: 'Failed to fetch donations' },
        { status: 500 }
      );
    }

    // Format donations for admin display
    const formattedDonations = donations?.map(donation => ({
      id: donation.id,
      user_id: donation.user_id,
      amount: donation.amount_cents / 100,
      currency: donation.currency,
      status: donation.status,
      customer_email: donation.customer_email,
      customer_name: donation.customer_name || 'Anonymous',
      donation_message: donation.donation_message,
      created_at: donation.created_at,
      completed_at: donation.completed_at,
    })) || [];

    return NextResponse.json({
      donations: formattedDonations,
      count: formattedDonations.length,
    });

  } catch (error: any) {
    console.error('Admin donations API error:', error);
    return NextResponse.json(
      { error: error.message || 'Unknown error' },
      { status: 500 }
    );
  }
} 