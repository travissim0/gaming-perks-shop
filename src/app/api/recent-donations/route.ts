import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function GET(req: NextRequest) {
  console.log('🔍 Recent donations API called');
  
  try {
    // Create service client - we know this works from debug script
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    console.log('📊 Querying donation_transactions...');
    
    // This exact query worked in the debug script
    const { data: donations, error } = await supabase
      .from('donation_transactions')
      .select(`
        amount_cents,
        currency,
        donation_message,
        customer_name,
        kofi_from_name,
        created_at,
        payment_method,
        status
      `)
      .eq('status', 'completed')
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) {
      console.error('❌ Database query failed:', error);
      return NextResponse.json({
        error: 'Database query failed',
        details: error.message
      }, { status: 500 });
    }

    console.log(`✅ Query successful - found ${donations?.length || 0} donations`);

    // Format the response - protect donor identity by not exposing real names
    const formattedDonations = donations?.map(donation => ({
      amount: Math.round(donation.amount_cents / 100),
      currency: donation.currency || 'usd',
      customerName: 'Supporter', // Privacy: Don't expose real names from Ko-fi
      message: donation.donation_message || '',
      date: donation.created_at,
      paymentMethod: donation.payment_method || 'kofi'
    })) || [];

    console.log(`✅ Returning ${formattedDonations.length} formatted donations`);

    return NextResponse.json({
      donations: formattedDonations,
      count: formattedDonations.length,
      status: 'success'
    });

  } catch (error: any) {
    console.error('❌ API Error:', error);
    return NextResponse.json({
      error: 'Internal server error',
      details: error.message
    }, { status: 500 });
  }
} 