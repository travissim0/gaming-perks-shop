import { NextRequest, NextResponse } from 'next/server';
import { stripe } from '@/lib/stripe';
import { createClient } from '@supabase/supabase-js';

export async function POST(req: NextRequest) {
  try {
    const { amount, donationMessage } = await req.json();

    // Validate the amount
    if (!amount || amount < 1) {
      return NextResponse.json(
        { error: 'Donation amount must be at least $1' },
        { status: 400 }
      );
    }

    // Get the Authorization header
    const authHeader = req.headers.get('authorization');
    
    if (!authHeader) {
      return NextResponse.json(
        { error: 'You must be logged in to make a donation' },
        { status: 401 }
      );
    }

    // Create Supabase client with the user's access token
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        global: {
          headers: {
            Authorization: authHeader,
          },
        },
      }
    );
    
    // Get the authenticated user
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    
    if (userError || !user) {
      return NextResponse.json(
        { error: 'You must be logged in to make a donation' },
        { status: 401 }
      );
    }

    // Create a Stripe checkout session for donation
    const session_stripe = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: 'usd',
            product_data: {
              name: 'Infantry Online Donation',
              description: donationMessage ? `Message: ${donationMessage}` : 'Support Infantry Online development and server costs',
            },
            unit_amount: amount * 100, // Convert to cents
          },
          quantity: 1,
        },
      ],
      mode: 'payment',
      success_url: `${process.env.NEXT_PUBLIC_SITE_URL}/donation-success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.NEXT_PUBLIC_SITE_URL}/donate`,
      customer_email: user.email,
      metadata: {
        userId: user.id,
        donationType: 'general_donation',
        donationMessage: donationMessage || '',
        amount: amount.toString(),
      },
    });

    // Create Supabase service client for database operations
    const supabaseService = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // Save the transaction record immediately (pending status)
    const { error: dbError } = await supabaseService.from('donation_transactions').insert([
      {
        user_id: user.id,
        stripe_payment_intent_id: null, // Will be updated by webhook when payment completes
        stripe_session_id: session_stripe.id,
        amount_cents: amount * 100,
        currency: 'usd',
        status: 'pending',
        customer_email: user.email,
        customer_name: user.user_metadata?.full_name || '',
        donation_message: donationMessage || null,
      },
    ]);

    if (dbError) {
      console.error('Error saving donation transaction:', dbError);
      // Don't fail the checkout, just log the error
    }

    return NextResponse.json({ id: session_stripe.id });
  } catch (error: any) {
    console.error('Donation checkout error:', error);
    return NextResponse.json(
      { error: error.message || 'An error occurred during donation checkout' },
      { status: 500 }
    );
  }
} 