import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';
import { sendDonationSMS } from '../../../utils/sms-notifications';

// Use service role client to bypass RLS for webhook operations
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Ko-fi webhook verification token (set this in your environment variables)
const KOFI_VERIFICATION_TOKEN = process.env.KOFI_VERIFICATION_TOKEN;

interface KofiWebhookData {
  verification_token: string;
  message_id: string;
  timestamp: string;
  type: string;
  is_public: boolean;
  from_name: string;
  message: string;
  amount: string;
  url: string;
  email: string;
  currency: string;
  is_subscription_payment: boolean;
  is_first_subscription_payment: boolean;
  kofi_transaction_id: string;
  shop_items?: {
    direct_link_code: string;
    variation_name?: string;
    quantity: number;
  }[];
  tier_name?: string;
  shipping?: any;
}

export async function POST(request: NextRequest) {
  try {
    console.log('🔔 Ko-fi webhook received');

    // Parse the form data from Ko-fi
    const formData = await request.formData();
    const data = formData.get('data') as string;

    if (!data) {
      console.error('❌ No data in Ko-fi webhook');
      return NextResponse.json({ error: 'No data provided' }, { status: 400 });
    }

    // Parse the JSON data
    let kofiData: KofiWebhookData;
    try {
      kofiData = JSON.parse(data);
    } catch (error) {
      console.error('❌ Invalid JSON in Ko-fi webhook:', error);
      return NextResponse.json({ error: 'Invalid JSON data' }, { status: 400 });
    }

    console.log('📄 Ko-fi webhook data:', {
      message_id: kofiData.message_id,
      from_name: kofiData.from_name,
      amount: kofiData.amount,
      currency: kofiData.currency,
      type: kofiData.type
    });

    // Verify the webhook (if verification token is set)
    if (KOFI_VERIFICATION_TOKEN && kofiData.verification_token !== KOFI_VERIFICATION_TOKEN) {
      console.error('❌ Ko-fi webhook verification failed - Expected:', KOFI_VERIFICATION_TOKEN, 'Got:', kofiData.verification_token);
      return NextResponse.json({ error: 'Verification failed' }, { status: 401 });
    }
    
    console.log('✅ Ko-fi webhook verification passed');

    // Process donations, subscriptions, and shop orders
    if (!['Donation', 'Subscription', 'Shop Order'].includes(kofiData.type)) {
      console.log('ℹ️ Ignoring Ko-fi webhook type:', kofiData.type);
      return NextResponse.json({ message: 'Unsupported type ignored' });
    }

    // Convert amount to cents (remove commas first to handle large amounts like "2,500")
    const cleanAmount = kofiData.amount.replace(/,/g, '');
    const amountFloat = parseFloat(cleanAmount);
    const amountCents = Math.round(amountFloat * 100);

    console.log('💰 Amount processing:', {
      original: kofiData.amount,
      cleaned: cleanAmount,
      float: amountFloat,
      cents: amountCents
    });

    // Try to find user by email (if they have an account) using service role
    let userId = null;
    if (kofiData.email) {
      const { data: profile } = await supabaseAdmin
        .from('profiles')
        .select('id')
        .eq('email', kofiData.email)
        .single();
      
      if (profile) {
        userId = profile.id;
        console.log('👤 Found user for Ko-fi donation:', userId);
      }
    }

    // Check if this Ko-fi transaction already exists using service role
    const { data: existingDonation } = await supabaseAdmin
      .from('donation_transactions')
      .select('id')
      .eq('kofi_transaction_id', kofiData.kofi_transaction_id)
      .single();

    if (existingDonation) {
      console.log('ℹ️ Ko-fi donation already exists:', kofiData.kofi_transaction_id);
      return NextResponse.json({ message: 'Donation already processed' });
    }

    // Insert the Ko-fi donation into the database using service role (bypasses RLS)
    const { data: donation, error: insertError } = await supabaseAdmin
      .from('donation_transactions')
      .insert({
        user_id: userId,
        payment_method: 'kofi',
        amount_cents: amountCents,
        currency: kofiData.currency.toLowerCase(),
        status: 'completed',
        customer_email: kofiData.email || null,
        customer_name: kofiData.from_name,
        donation_message: kofiData.message || null,
        kofi_transaction_id: kofiData.kofi_transaction_id,
        kofi_message: kofiData.message,
        kofi_from_name: kofiData.from_name,
        kofi_email: kofiData.email,
        kofi_url: kofiData.url,
        kofi_shop_items: kofiData.shop_items ? JSON.stringify(kofiData.shop_items) : null,
        created_at: new Date().toISOString(),
        completed_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (insertError) {
      console.error('❌ Error inserting Ko-fi donation:', insertError);
      return NextResponse.json({ 
        error: 'Failed to save donation', 
        details: insertError.message 
      }, { status: 500 });
    }

    console.log('✅ Ko-fi donation saved successfully:', donation.id);

    // Send SMS notification for the donation
    try {
      const smsSuccess = await sendDonationSMS({
        amount: amountFloat,
        currency: kofiData.currency,
        from_name: kofiData.from_name,
        message: kofiData.message,
        type: kofiData.type,
        email: kofiData.email
      });

      if (smsSuccess) {
        console.log('📱 SMS notification sent successfully');
      } else {
        console.warn('⚠️ SMS notification failed to send');
      }
    } catch (smsError) {
      console.error('❌ SMS notification error:', smsError);
      // Don't fail the webhook if SMS fails
    }

    // Process shop items if this is a shop order
    let processedItems = [];
    if (kofiData.type === 'Shop Order' && kofiData.shop_items && kofiData.shop_items.length > 0) {
      console.log('🛒 Processing shop order with items:', kofiData.shop_items);

      for (const item of kofiData.shop_items) {
        try {
          // Find product by direct_link_code (we'll need to add this field to products table)
          const { data: product } = await supabaseAdmin
            .from('products')
            .select('*')
            .eq('kofi_direct_link_code', item.direct_link_code)
            .single();

          if (product && userId) {
            // Create user_product entry automatically
            // Clean and validate phrase
            let cleanPhrase = null;
            if (item.variation_name && item.variation_name.trim()) {
              // Remove any characters not allowed by the constraint
              cleanPhrase = item.variation_name.trim().replace(/[^a-zA-Z0-9 !?._-]/g, '');
              // Limit to 12 characters max
              if (cleanPhrase.length > 12) {
                cleanPhrase = cleanPhrase.substring(0, 12);
              }
              // If it becomes empty after cleaning, set to null
              if (cleanPhrase.length === 0) {
                cleanPhrase = null;
              }
            }

            console.log('🔤 Processing phrase:', item.variation_name, '→', cleanPhrase);

            const { data: userProduct, error: productError } = await supabaseAdmin
              .from('user_products')
              .insert({
                user_id: userId,
                product_id: product.id,
                phrase: cleanPhrase,
                status: 'active',
                purchase_method: 'kofi',
                created_at: new Date().toISOString()
              })
              .select()
              .single();

            if (productError) {
              console.error('❌ Error creating user product:', productError);
              console.error('Purchase creation error:', {
                userId,
                productId: product.id,
                phrase: cleanPhrase,
                variation_name: item.variation_name
              });
            } else {
              console.log('✅ User product created:', userProduct.id);
              processedItems.push({
                product_name: product.name,
                variation: item.variation_name,
                user_product_id: userProduct.id
              });
            }
          } else {
            console.warn('⚠️ Product not found for direct_link_code:', item.direct_link_code);
          }
        } catch (error) {
          console.error('❌ Error processing shop item:', error);
        }
      }
    }

    // Return success response
    return NextResponse.json({ 
      message: kofiData.type === 'Shop Order' ? 'Ko-fi shop order processed successfully' : 'Ko-fi donation processed successfully',
      donation_id: donation.id,
      amount: amountFloat,
      currency: kofiData.currency,
      processed_items: processedItems
    });

  } catch (error: any) {
    console.error('❌ Ko-fi webhook error:', error);
    return NextResponse.json({ 
      error: 'Internal server error', 
      details: error.message 
    }, { status: 500 });
  }
}

// Handle OPTIONS requests for CORS
export async function OPTIONS(request: NextRequest) {
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
} 