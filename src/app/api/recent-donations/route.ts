import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function GET(req: NextRequest) {
  try {
    // Create Supabase service client for public data access
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // Try both table names for compatibility
    let donations, donationsError;
    
    try {
      // First try donation_transactions table
      const result = await supabase
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
      
      donations = result.data;
      donationsError = result.error;
    } catch (error) {
      console.log('donation_transactions table not found, trying donations table...');
      
      // Fallback to donations table
      const result = await supabase
        .from('donations')
        .select(`
          amount,
          message,
          donor_name,
          created_at
        `)
        .eq('status', 'completed')
        .order('created_at', { ascending: false })
        .limit(10);
      
      donations = result.data;
      donationsError = result.error;
    }

    if (donationsError) {
      console.error('Error fetching donations:', donationsError);
      return NextResponse.json(
        { error: 'Failed to fetch recent donations' },
        { status: 500 }
      );
    }

    // Format the donations for display
    const formattedDonations = donations?.map((donation: any) => ({
      amount: ((donation as any).amount_cents || (donation as any).amount || 0) / 100,
      currency: (donation as any).currency || 'usd',
      message: (donation as any).donation_message || (donation as any).message,
      customerName: (donation as any).customer_name || (donation as any).donor_name || 'Anonymous Supporter',
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