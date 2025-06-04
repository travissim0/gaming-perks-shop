import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';

// Use service role client to bypass RLS for webhook operations
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Square webhook signature verification (optional but recommended)
const SQUARE_WEBHOOK_SIGNATURE_KEY = process.env.SQUARE_WEBHOOK_SIGNATURE_KEY;

interface SquareWebhookEvent {
  merchant_id: string;
  type: string;
  event_id: string;
  created_at: string;
  data: {
    type: string;
    id: string;
    object: {
      payment?: any;
      order?: any;
    };
  };
}

// Enhanced user lookup function
async function findUserByEmail(email: string) {
  if (!email) return null;

  console.log('🔍 Looking up user by email:', email);

  // First try profiles table
  const { data: profile, error: profileError } = await supabaseAdmin
    .from('profiles')
    .select('id, in_game_alias, email')
    .eq('email', email)
    .single();

  if (profile) {
    console.log('👤 Found user in profiles:', { id: profile.id, alias: profile.in_game_alias });
    return profile;
  }

  // If not found in profiles, try auth.users table
  console.log('🔍 Not found in profiles, checking auth.users...');
  const { data: { users }, error: authError } = await supabaseAdmin.auth.admin.listUsers();

  if (!authError && users) {
    const authUser = users.find(u => u.email?.toLowerCase() === email.toLowerCase());
    if (authUser) {
      console.log('👤 Found user in auth.users:', authUser.id);
      
      // Check if they have a profile
      const { data: userProfile } = await supabaseAdmin
        .from('profiles')
        .select('id, in_game_alias, email')
        .eq('id', authUser.id)
        .single();

      return {
        id: authUser.id,
        email: authUser.email,
        in_game_alias: userProfile?.in_game_alias || null
      };
    }
  }

  console.log('❌ No user found for email:', email);
  return null;
}

// Enhanced email extraction function
function extractUserEmail(payment: any, order: any): string | null {
  // Try multiple sources for email, prioritizing our enhanced metadata
  const emailSources = [
    // First priority: Our enhanced metadata from checkout
    order?.metadata?.userEmail,
    order?.line_items?.[0]?.metadata?.userEmail,
    
    // Second priority: Standard Square fields
    payment?.buyer_email_address,
    payment?.receipt_email,
    order?.fulfillments?.[0]?.recipient?.email_address,
    order?.tenders?.[0]?.customer_details?.email_address,
    payment?.customer_details?.email_address,
    
    // Third priority: Other possible fields
    payment?.application_details?.square_product,
    order?.metadata?.customer_email,
    order?.metadata?.customerEmail
  ];

  for (const email of emailSources) {
    if (email && typeof email === 'string' && email.includes('@')) {
      console.log('📧 Found email from Square:', email);
      return email.toLowerCase().trim();
    }
  }

  console.log('❌ No email found in Square payment data');
  return null;
}

// Enhanced user info extraction function
function extractUserInfo(payment: any, order: any): { email: string | null, alias: string | null, message: string | null } {
  // Extract email using enhanced function
  const email = extractUserEmail(payment, order);
  
  // Extract in_game_alias from our metadata
  const aliasSources = [
    order?.metadata?.inGameAlias,
    order?.line_items?.[0]?.metadata?.inGameAlias,
    order?.metadata?.userAlias,
    order?.metadata?.alias
  ];
  
  let alias = null;
  for (const aliasValue of aliasSources) {
    if (aliasValue && typeof aliasValue === 'string' && aliasValue.trim() !== '') {
      alias = aliasValue.trim();
      console.log('👤 Found alias from Square metadata:', alias);
      break;
    }
  }
  
  // Extract donation message from various sources
  const messageSources = [
    order?.metadata?.donationMessage,
    order?.line_items?.[0]?.metadata?.donationMessage,
    payment?.note,
    order?.line_items?.[0]?.note,
    order?.metadata?.message
  ];
  
  let message = null;
  for (const messageValue of messageSources) {
    if (messageValue && typeof messageValue === 'string' && messageValue.trim() !== '') {
      message = messageValue.trim();
      break;
    }
  }
  
  return { email, alias, message };
}

export async function POST(request: NextRequest) {
  try {
    console.log('🔔 Square webhook received');

    const body = await request.text();
    const event: SquareWebhookEvent = JSON.parse(body);

    console.log('📄 Square webhook event:', {
      type: event.type,
      event_id: event.event_id,
      merchant_id: event.merchant_id
    });

    // Verify webhook signature if key is available
    if (SQUARE_WEBHOOK_SIGNATURE_KEY) {
      const signature = request.headers.get('x-square-hmacsha256-signature');
      if (!signature) {
        console.error('❌ Missing Square webhook signature');
        return NextResponse.json({ error: 'Missing signature' }, { status: 401 });
      }

      // Square uses HMAC-SHA256 with signature_key + notification_url + body
      // According to Square docs, the signature is calculated as:
      // HMAC-SHA256(signature_key, notification_url + request_body)
      const url = request.url;
      const hash = crypto
        .createHmac('sha256', SQUARE_WEBHOOK_SIGNATURE_KEY)
        .update(url + body)
        .digest('hex');

      if (signature !== hash) {
        console.error('❌ Square webhook signature verification failed');
        console.error('Expected:', hash);
        console.error('Received:', signature);
        return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
      }
    }

    // Handle payment events
    if (event.type === 'payment.created' || event.type === 'payment.updated') {
      const payment = event.data.object.payment;
      
      if (payment && payment.status === 'COMPLETED') {
        console.log('💳 Processing completed Square payment:', payment.id);
        console.log('📊 Payment data available:', Object.keys(payment));

        // Extract amount (Square uses base currency units, so divide by 100 for dollars)
        const amountCents = parseInt(payment.amount_money?.amount || 0);
        const currency = payment.amount_money?.currency || 'USD';

        // Get order info if available
        const order = event.data.object.order;
        console.log('📦 Order data available:', order ? Object.keys(order) : 'None');
        
        // Log metadata for debugging
        if (order?.metadata) {
          console.log('📋 Order metadata:', order.metadata);
        }
        if (order?.line_items?.[0]?.metadata) {
          console.log('📋 Line item metadata:', order.line_items[0].metadata);
        }

        // Enhanced user info extraction
        const { email, alias, message } = extractUserInfo(payment, order);
        
        console.log('📧 Extracted email:', email || 'None');
        console.log('👤 Extracted alias from metadata:', alias || 'None');
        console.log('💬 Extracted message:', message || 'Default');
        
        // Enhanced user lookup
        let userData = null;
        if (email) {
          userData = await findUserByEmail(email);
        }

        // Check if this Square payment already exists
        const { data: existingDonation } = await supabaseAdmin
          .from('donation_transactions')
          .select('id')
          .eq('square_payment_id', payment.id)
          .single();

        if (existingDonation) {
          console.log('ℹ️ Square payment already exists:', payment.id);
          return NextResponse.json({ message: 'Payment already processed' });
        }

        // Prepare donation data with enhanced user information
        const donationData = {
          user_id: userData?.id || null,
          payment_method: 'square',
          amount_cents: amountCents,
          currency: currency.toLowerCase(),
          status: 'completed',
          customer_email: email || null,
          customer_name: userData?.in_game_alias || email || 'Anonymous Square Donor',
          donation_message: message || `Square donation - ${payment.id}`,
          square_payment_id: payment.id,
          square_order_id: order?.id || null,
          created_at: payment.created_at || new Date().toISOString(),
          completed_at: payment.updated_at || new Date().toISOString(),
        };

        console.log('💾 Inserting donation with data:', {
          user_id: donationData.user_id,
          customer_email: donationData.customer_email,
          customer_name: donationData.customer_name,
          in_game_alias: userData?.in_game_alias || 'None found',
          amount: `$${(amountCents / 100).toFixed(2)}`
        });

        // Insert the Square donation into the database
        const { data: donation, error: insertError } = await supabaseAdmin
          .from('donation_transactions')
          .insert(donationData)
          .select()
          .single();

        if (insertError) {
          console.error('❌ Error inserting Square donation:', insertError);
          return NextResponse.json({ 
            error: 'Failed to save donation', 
            details: insertError.message 
          }, { status: 500 });
        }

        console.log('✅ Square donation saved successfully:', donation.id);
        console.log(`💰 Amount: $${(amountCents / 100).toFixed(2)} ${currency}`);
        console.log(`👤 User: ${userData?.in_game_alias || 'Anonymous'} (${email || 'No email'})`);

        return NextResponse.json({ 
          message: 'Square payment processed successfully',
          donation_id: donation.id,
          amount_cents: amountCents,
          currency: currency,
          user_email: email,
          in_game_alias: userData?.in_game_alias || null
        });
      }
    }

    // Handle order events (for additional context)
    if (event.type === 'order.created' || event.type === 'order.updated') {
      const order = event.data.object.order;
      console.log('📦 Square order event:', order?.id, 'state:', order?.state);
      
      // We'll mainly handle this via payment events, but log for debugging
      return NextResponse.json({ message: 'Order event logged' });
    }

    console.log('ℹ️ Ignoring Square webhook event type:', event.type);
    return NextResponse.json({ message: 'Event type ignored' });

  } catch (error: any) {
    console.error('❌ Square webhook error:', error);
    return NextResponse.json({ 
      error: 'Internal server error', 
      details: error.message 
    }, { status: 500 });
  }
} 