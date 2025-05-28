import { NextRequest, NextResponse } from 'next/server';
import { stripe } from '@/lib/stripe';
import { supabase } from '@/lib/supabase';

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const sessionId = url.searchParams.get('session_id');

    if (!sessionId) {
      return NextResponse.json(
        { error: 'Session ID is required' },
        { status: 400 }
      );
    }

    // Retrieve the checkout session from Stripe
    const session = await stripe.checkout.sessions.retrieve(sessionId);

    if (!session) {
      return NextResponse.json(
        { error: 'Invalid checkout session' },
        { status: 404 }
      );
    }

    if (session.payment_status !== 'paid') {
      return NextResponse.json(
        { error: 'Payment has not been completed' },
        { status: 400 }
      );
    }

    // Extract the user ID, product ID, and phrase from the metadata
    const userId = session.metadata?.userId;
    const productId = session.metadata?.productId;
    const phrase = session.metadata?.phrase;

    if (!userId || !productId) {
      return NextResponse.json(
        { error: 'Missing user or product information' },
        { status: 400 }
      );
    }

    // Check if this purchase has already been processed
    const { data: existingPurchase } = await supabase
      .from('user_products')
      .select('id')
      .eq('user_id', userId)
      .eq('product_id', productId)
      .eq('stripe_session_id', sessionId)
      .maybeSingle();

    if (existingPurchase) {
      return NextResponse.json({ success: true, alreadyProcessed: true });
    }

    // Record the purchase
    const { error: insertError } = await supabase.from('user_products').insert([
      {
        user_id: userId,
        product_id: productId,
        phrase: phrase || null,
        stripe_session_id: sessionId,
        stripe_payment_intent_id: session.payment_intent as string,
      },
    ]);

    if (insertError) {
      console.error('Error inserting purchase:', insertError);
      return NextResponse.json(
        { error: 'Failed to record purchase' },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Verification error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to verify checkout' },
      { status: 500 }
    );
  }
} 