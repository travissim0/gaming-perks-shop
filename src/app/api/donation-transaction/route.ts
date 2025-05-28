import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const sessionId = searchParams.get('session_id');
    const paymentIntentId = searchParams.get('payment_intent');

    if (!sessionId && !paymentIntentId) {
      return NextResponse.json(
        { error: 'Missing session_id or payment_intent parameter' },
        { status: 400 }
      );
    }

    // Build the query based on available parameters
    let query = supabase
      .from('donation_transactions')
      .select('*');

    if (sessionId) {
      query = query.eq('stripe_session_id', sessionId);
    } else if (paymentIntentId) {
      query = query.eq('stripe_payment_intent_id', paymentIntentId);
    }

    const { data: transaction, error } = await query.single();

    if (error) {
      console.error('Error fetching transaction:', error);
      console.error('Session ID:', sessionId);
      console.error('Payment Intent ID:', paymentIntentId);
      console.error('Full error:', JSON.stringify(error, null, 2));
      return NextResponse.json(
        { error: `Transaction not found: ${error.message}` },
        { status: 404 }
      );
    }

    if (!transaction) {
      return NextResponse.json(
        { error: 'Transaction not found' },
        { status: 404 }
      );
    }

    return NextResponse.json(transaction);

  } catch (error: any) {
    console.error('Error in donation-transaction API:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
} 