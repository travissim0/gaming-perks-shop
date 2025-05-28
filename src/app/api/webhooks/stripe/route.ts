import { NextRequest, NextResponse } from 'next/server';
import { stripe } from '@/lib/stripe';
import { supabase } from '@/lib/supabase';

export async function POST(req: NextRequest) {
  console.log('🔔 Webhook received at:', new Date().toISOString());
  
  try {
    const body = await req.text();
    const signature = req.headers.get('stripe-signature') as string;

    console.log('📝 Webhook signature present:', !!signature);

    // Verify the webhook signature
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!webhookSecret) {
      console.error('❌ Webhook secret not configured');
      return NextResponse.json(
        { error: 'Webhook secret not configured' },
        { status: 500 }
      );
    }

    console.log('🔑 Webhook secret configured');

    // Construct and verify the event
    let event;
    try {
      event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
      console.log('✅ Webhook signature verified successfully');
    } catch (err: any) {
      console.error(`❌ Webhook signature verification failed: ${err.message}`);
      return NextResponse.json(
        { error: `Webhook Error: ${err.message}` },
        { status: 400 }
      );
    }

    console.log(`📨 Webhook event type: ${event.type}`);
    console.log(`📊 Event ID: ${event.id}`);

    // Handle the event
    switch (event.type) {
      case 'checkout.session.completed':
        const session = event.data.object;
        console.log('🛒 Processing checkout.session.completed');
        console.log('📋 Session metadata:', JSON.stringify(session.metadata, null, 2));
        await handleCheckoutSessionCompleted(session);
        break;
      case 'payment_intent.succeeded':
        console.log('💳 Payment intent succeeded (not handling)');
        break;
      case 'payment_intent.payment_failed':
        console.log('❌ Payment intent failed (not handling)');
        break;
      default:
        console.log(`⚠️ Unhandled event type: ${event.type}`);
    }

    console.log('✅ Webhook processed successfully');
    return NextResponse.json({ received: true });
  } catch (error: any) {
    console.error('❌ Webhook error:', error);
    return NextResponse.json(
      { error: error.message || 'Unknown error' },
      { status: 500 }
    );
  }
}

async function handleCheckoutSessionCompleted(session: any) {
  const userId = session.metadata?.userId;
  const productId = session.metadata?.productId;
  const phrase = session.metadata?.phrase;
  const donationType = session.metadata?.donationType;

  console.log('🔍 Session analysis:');
  console.log(`   User ID: ${userId}`);
  console.log(`   Product ID: ${productId || 'None'}`);
  console.log(`   Donation Type: ${donationType || 'None'}`);
  console.log(`   Phrase: ${phrase || 'None'}`);

  if (!userId) {
    console.error('❌ Missing user information in session metadata');
    return;
  }

  // Handle donation transactions
  if (donationType === 'general_donation') {
    console.log('💰 Processing as donation transaction');
    await handleDonationTransaction(session);
    return;
  }

  // Handle product purchases
  if (!productId) {
    console.error('❌ Missing product information in session metadata');
    return;
  }

  console.log('🛍️ Processing as product purchase');

  // Check if this purchase has already been processed
  const { data: existingPurchase } = await supabase
    .from('user_products')
    .select('id')
    .eq('user_id', userId)
    .eq('product_id', productId)
    .eq('stripe_session_id', session.id)
    .maybeSingle();

  if (existingPurchase) {
    console.log('⚠️ Purchase already processed');
    return;
  }

  // Record the purchase
  const { error } = await supabase.from('user_products').insert([
    {
      user_id: userId,
      product_id: productId,
      phrase: phrase || null,
      stripe_session_id: session.id,
      stripe_payment_intent_id: session.payment_intent,
    },
  ]);

  if (error) {
    console.error('❌ Error recording purchase:', error);
    throw error;
  }

  console.log(`✅ Successfully processed purchase for user ${userId}, product ${productId}`);
}

async function handleDonationTransaction(session: any) {
  const userId = session.metadata?.userId;
  const donationMessage = session.metadata?.donationMessage || '';
  const amount = parseInt(session.metadata?.amount || '0');

  console.log('💰 Donation transaction details:');
  console.log(`   User ID: ${userId}`);
  console.log(`   Amount: $${amount}`);
  console.log(`   Message: ${donationMessage || 'None'}`);
  console.log(`   Session ID: ${session.id}`);
  console.log(`   Payment Intent: ${session.payment_intent}`);

  if (!userId || !amount) {
    console.error('❌ Missing donation information in session metadata');
    console.error(`   User ID missing: ${!userId}`);
    console.error(`   Amount missing: ${!amount}`);
    return;
  }

  // Check if this donation transaction exists
  console.log('🔍 Checking for existing donation transaction...');
  const { data: existingDonation, error: fetchError } = await supabase
    .from('donation_transactions')
    .select('id, status')
    .eq('stripe_session_id', session.id)
    .maybeSingle();

  if (fetchError) {
    console.error('❌ Error fetching existing donation:', fetchError);
    throw fetchError;
  }

  if (existingDonation) {
    console.log(`📝 Found existing donation: ${existingDonation.id} (status: ${existingDonation.status})`);
    
    // Update existing transaction to completed status
    console.log('🔄 Updating donation to completed status...');
    const { error } = await supabase
      .from('donation_transactions')
      .update({
        stripe_payment_intent_id: session.payment_intent,
        status: 'completed',
        completed_at: new Date().toISOString(),
      })
      .eq('stripe_session_id', session.id);

    if (error) {
      console.error('❌ Error updating donation transaction:', error);
      throw error;
    }
    console.log('✅ Donation transaction updated to completed');
    return;
  }

  console.log('⚠️ No existing donation found, creating new one (fallback)');
  
  // If no existing transaction, create a new one (fallback)
  const { error } = await supabase.from('donation_transactions').insert([
    {
      user_id: userId,
      stripe_payment_intent_id: session.payment_intent,
      stripe_session_id: session.id,
      amount_cents: amount * 100,
      currency: 'usd',
      status: 'completed',
      customer_email: session.customer_details?.email || session.customer_email,
      customer_name: session.customer_details?.name || '',
      donation_message: donationMessage,
      completed_at: new Date().toISOString(),
    },
  ]);

  if (error) {
    console.error('❌ Error recording donation:', error);
    throw error;
  }

  console.log(`✅ Successfully processed donation for user ${userId}, amount $${amount}`);
} 