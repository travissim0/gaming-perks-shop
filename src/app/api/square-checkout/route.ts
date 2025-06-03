import { NextRequest, NextResponse } from 'next/server';
import { legacySquareClient } from '@/lib/square';
import { randomUUID } from 'crypto';

export async function POST(request: NextRequest) {
  try {
    const { amount, message, userEmail } = await request.json();

    if (!amount || amount < 1) {
      return NextResponse.json({ error: 'Invalid amount' }, { status: 400 });
    }

    if (!userEmail) {
      return NextResponse.json({ error: 'User email required' }, { status: 400 });
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

    // Create checkout request with optimized settings
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
            note: donationNote
          }
        ]
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

    console.log('🔄 Creating Square payment link...');
    const response = await legacySquareClient.checkoutApi.createPaymentLink(checkoutRequest);

    if (!response.result || !response.result.paymentLink?.url) {
      console.error('❌ Square API error:', response);
      return NextResponse.json({ error: 'Failed to create checkout session' }, { status: 500 });
    }

    console.log('✅ Square payment link created successfully');
    return NextResponse.json({
      checkoutUrl: response.result.paymentLink.url,
      orderId: response.result.paymentLink.orderId
    });

  } catch (error: any) {
    console.error('❌ Square checkout error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
} 