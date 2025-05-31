import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';

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
  shop_items?: any[];
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
      console.error('❌ Ko-fi webhook verification failed');
      return NextResponse.json({ error: 'Verification failed' }, { status: 401 });
    }

    // Only process donation types
    if (kofiData.type !== 'Donation' && kofiData.type !== 'Subscription') {
      console.log('ℹ️ Ignoring non-donation Ko-fi webhook type:', kofiData.type);
      return NextResponse.json({ message: 'Non-donation type ignored' });
    }

    // Convert amount to cents
    const amountFloat = parseFloat(kofiData.amount);
    const amountCents = Math.round(amountFloat * 100);

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

    // Return success response
    return NextResponse.json({ 
      message: 'Ko-fi donation processed successfully',
      donation_id: donation.id,
      amount: amountFloat,
      currency: kofiData.currency
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