import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const userId = searchParams.get('userId');

    if (!userId) {
      return NextResponse.json({ error: 'User ID is required' }, { status: 400 });
    }

    // Fetch user's donation transactions
    const { data: donations, error } = await supabase
      .from('donation_transactions')
      .select(`
        id,
        amount_cents,
        currency,
        status,
        customer_email,
        customer_name,
        donation_message,
        created_at,
        completed_at
      `)
      .eq('user_id', userId)
      .eq('status', 'completed')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching donations:', error);
      return NextResponse.json(
        { error: 'Failed to fetch donations' },
        { status: 500 }
      );
    }

    // Calculate totals
    const totalCents = donations?.reduce((sum, donation) => sum + donation.amount_cents, 0) || 0;
    const totalAmount = totalCents / 100;
    const totalCount = donations?.length || 0;
    const currency = donations?.[0]?.currency || 'usd';

    // Get recent donations (last 5)
    const recentDonations = donations?.slice(0, 5).map(donation => ({
      id: donation.id,
      amount: donation.amount_cents / 100,
      currency: donation.currency,
      message: donation.donation_message,
      customerName: donation.customer_name || 'Anonymous',
      date: donation.created_at,
    })) || [];

    return NextResponse.json({
      totalAmount,
      totalCents,
      totalCount,
      currency,
      recentDonations,
    });

  } catch (error: any) {
    console.error('User donations API error:', error);
    return NextResponse.json(
      { error: error.message || 'Unknown error' },
      { status: 500 }
    );
  }
} 