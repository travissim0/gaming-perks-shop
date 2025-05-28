import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function GET(req: NextRequest) {
  try {
    // Create Supabase service client for public data access
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // Fetch recent completed donations
    const { data: donations, error: donationsError } = await supabase
      .from('donation_transactions')
      .select(`
        amount_cents,
        currency,
        donation_message,
        customer_name,
        created_at
      `)
      .eq('status', 'completed')
      .order('created_at', { ascending: false })
      .limit(10);

    if (donationsError) {
      console.error('Error fetching donations:', donationsError);
      return NextResponse.json(
        { error: 'Failed to fetch recent donations' },
        { status: 500 }
      );
    }

    // Format the donations for display
    const formattedDonations = donations?.map(donation => ({
      amount: donation.amount_cents / 100,
      currency: donation.currency,
      message: donation.donation_message,
      customerName: donation.customer_name || 'Anonymous Supporter',
      date: donation.created_at,
    })) || [];

    return NextResponse.json({
      donations: formattedDonations,
      count: formattedDonations.length,
    });

  } catch (error: any) {
    console.error('Recent donations API error:', error);
    return NextResponse.json(
      { error: error.message || 'Unknown error' },
      { status: 500 }
    );
  }
} 