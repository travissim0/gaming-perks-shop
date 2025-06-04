import { NextRequest, NextResponse } from 'next/server';
import { legacySquareClient } from '@/lib/square';
import { supabase } from '@/lib/supabase';
import { randomUUID } from 'crypto';

export async function POST(request: NextRequest) {
  try {
    const { productId, userEmail, customPhrase } = await request.json();

    if (!productId || !userEmail) {
      return NextResponse.json({ error: 'Product ID and user email required' }, { status: 400 });
    }

    // Get product details from database
    const { data: product, error: productError } = await supabase
      .from('products')
      .select('*')
      .eq('id', productId)
      .eq('active', true)
      .single();

    if (productError || !product) {
      return NextResponse.json({ error: 'Product not found' }, { status: 404 });
    }

    // Generate unique idempotency key
    const idempotencyKey = randomUUID();

    // Get location ID from environment variables
    const locationId = process.env.SQUARE_LOCATION_ID!;

    // Create line item description
    let itemDescription = product.description;
    if (customPhrase && product.customizable) {
      itemDescription += ` | Custom Phrase: "${customPhrase}"`;
    }

    // Create checkout request
    const checkoutRequest = {
      idempotencyKey,
      order: {
        locationId,
        lineItems: [
          {
            name: product.name,
            quantity: '1',
            basePriceMoney: {
              amount: BigInt(product.price), // product.price is already in cents
              currency: 'USD'
            },
            note: itemDescription
          }
        ]
      },
      checkoutOptions: {
        redirectUrl: `https://freeinf.org/perks?purchase_success=true&product_id=${productId}`,
        merchantSupportEmail: process.env.MERCHANT_SUPPORT_EMAIL || userEmail
      },
      prePopulatedData: {
        buyerEmail: userEmail
      },
      // Store metadata for webhook processing
      orderSource: {
        name: 'Gaming Perks Shop'
      }
    };

    const response = await legacySquareClient.checkoutApi.createPaymentLink(checkoutRequest);

    if (!response.result) {
      console.error('Square API error:', response);
      return NextResponse.json({ error: 'Failed to create checkout session' }, { status: 500 });
    }

    // Store pending purchase in database for webhook processing
    const { error: dbError } = await supabase
      .from('user_products')
      .insert({
        user_id: (await supabase.auth.getUser()).data.user?.id,
        user_email: userEmail,
        product_id: productId,
        phrase: customPhrase || null,
        status: 'pending',
        purchase_method: 'square',
        square_checkout_session_id: response.result.paymentLink?.id,
        created_at: new Date().toISOString(),
      });

    if (dbError) {
      console.error('Database error:', dbError);
      // Continue anyway, webhook can handle this
    }

    return NextResponse.json({
      checkoutUrl: response.result.paymentLink?.url,
      checkoutSessionId: response.result.paymentLink?.id
    });

  } catch (error: any) {
    console.error('Square product checkout error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
} 