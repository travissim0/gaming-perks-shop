import { NextRequest, NextResponse } from 'next/server';
import { legacySquareClient } from '@/lib/square';
import { randomUUID } from 'crypto';
import { createClient } from '@supabase/supabase-js';

// Use service role client to get user profile info
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(request: NextRequest) {
  try {
    const { amount, message, userEmail } = await request.json();

    if (!amount || amount < 1) {
      return NextResponse.json({ error: 'Invalid amount' }, { status: 400 });
    }

    if (!userEmail) {
      return NextResponse.json({ error: 'User email required' }, { status: 400 });
    }

    console.log('🔄 Creating Square checkout for:', userEmail);

    // Try to get user's in_game_alias for better tracking
    let userAlias = null;
    try {
      const { data: profile } = await supabaseAdmin
        .from('profiles')
        .select('in_game_alias')
        .eq('email', userEmail)
        .single();
      
      if (profile?.in_game_alias) {
        userAlias = profile.in_game_alias;
        console.log('👤 Found user alias:', userAlias);
      }
    } catch (error) {
      console.log('No profile found for email, will use email only');
    }

    // Convert amount to cents (Square uses base currency units)
    const amountInCents = Math.round(amount * 100);

    // Generate unique idempotency key
    const idempotencyKey = randomUUID();

    // Get location ID
    const locationId = process.env.SQUARE_LOCATION_ID!;

    // Create more descriptive donation text
    const donationTitle = `$${amount} Donation to Infantry Online Community`;
    const donationNote = message ? 
      `Donation: ${message}` : 
      `Thank you for supporting the Infantry Online CTF community!`;

    // Create checkout request with enhanced metadata for webhook
    const checkoutRequest = {
      idempotencyKey,
      order: {
        locationId,
        lineItems: [
          {
            name: donationTitle,
            quantity: '1',
            basePriceMoney: {
              amount: BigInt(amountInCents),
              currency: 'USD'
            },
            note: donationNote,
            // Try to embed user info in metadata that the webhook can access
            metadata: {
              userEmail: userEmail,
              inGameAlias: userAlias || '',
              donationMessage: message || '',
              webhookSource: 'square-checkout'
            }
          }
        ],
        // Also add metadata at order level
        metadata: {
          userEmail: userEmail,
          inGameAlias: userAlias || '',
          donationMessage: message || '',
          webhookSource: 'square-checkout',
          amount: amount.toString(),
          createdByWebsite: 'true'
        }
      },
      checkoutOptions: {
        // Redirect back to our success page immediately after payment
        redirectUrl: `${process.env.NEXT_PUBLIC_SITE_URL}/donate/success?payment_method=square&amount=${amount}`,
        // Auto-accept terms to reduce clicks
        acceptedPaymentMethods: {
          applePay: true,
          googlePay: true,
          card: true,
          cashApp: true
        },
        // Streamline the checkout experience
        allowTipping: false,
        customFields: [],
        // Use merchant support email for faster support
        merchantSupportEmail: 'qwerty5544@aim.com'
      },
      prePopulatedData: {
        buyerEmail: userEmail
      }
    };

    console.log('🔄 Creating Square payment link with enhanced metadata...');
    console.log('📧 User Email:', userEmail);
    console.log('👤 User Alias:', userAlias || 'None found');
    
    const response = await legacySquareClient.checkoutApi.createPaymentLink(checkoutRequest);

    if (!response.result || !response.result.paymentLink?.url) {
      console.error('❌ Square API error:', response);
      return NextResponse.json({ error: 'Failed to create checkout session' }, { status: 500 });
    }

    console.log('✅ Square payment link created successfully');
    console.log('🔗 Order ID:', response.result.paymentLink.orderId);
    
    return NextResponse.json({
      checkoutUrl: response.result.paymentLink.url,
      orderId: response.result.paymentLink.orderId,
      userEmail: userEmail,
      userAlias: userAlias
    });

  } catch (error: any) {
    console.error('❌ Square checkout error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
} 