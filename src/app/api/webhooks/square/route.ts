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
      const signature = request.headers.get('x-square-signature');
      if (!signature) {
        console.error('❌ Missing Square webhook signature');
        return NextResponse.json({ error: 'Missing signature' }, { status: 401 });
      }

      const url = request.url;
      const hash = crypto
        .createHmac('sha256', SQUARE_WEBHOOK_SIGNATURE_KEY)
        .update(url + body)
        .digest('base64');

      if (signature !== hash) {
        console.error('❌ Square webhook signature verification failed');
        return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
      }
    }

    // Handle payment events
    if (event.type === 'payment.created' || event.type === 'payment.updated') {
      const payment = event.data.object.payment;
      
      if (payment && payment.status === 'COMPLETED') {
        console.log('💳 Processing completed Square payment:', payment.id);

        // Extract amount (Square uses base currency units, so divide by 100 for dollars)
        const amountCents = payment.amount_money?.amount || 0;
        const currency = payment.amount_money?.currency || 'USD';

        // Try to extract user email from various sources
        let userEmail = payment.buyer_email_address;
        let userNote = payment.note || '';

        // Try to get additional info from the order if available
        const order = event.data.object.order;
        if (order) {
          // Look for customer info in order
          userNote = userNote || order.line_items?.[0]?.note || '';
        }

        // Try to find user by email (if they have an account)
        let userId = null;
        if (userEmail) {
          // First try direct email match
          const { data: profile } = await supabaseAdmin
            .from('profiles')
            .select('id')
            .eq('email', userEmail)
            .single();
          
          if (profile) {
            userId = profile.id;
            console.log('👤 Found user for Square donation:', userId);
          } else {
            // If not found, try auth.users table as fallback
            console.log('🔍 Email not found in profiles, checking auth.users...');
            const { data: { users }, error: authError } = await supabaseAdmin.auth.admin.listUsers();
            
            if (!authError && users) {
              const authUser = users.find(u => u.email === userEmail);
              if (authUser) {
                userId = authUser.id;
                console.log('👤 Found user in auth.users for Square donation:', userId);
              }
            }
          }
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

        // Insert the Square donation into the database
        const { data: donation, error: insertError } = await supabaseAdmin
          .from('donation_transactions')
          .insert({
            user_id: userId,
            payment_method: 'square',
            amount_cents: amountCents,
            currency: currency.toLowerCase(),
            status: 'completed',
            customer_email: userEmail || null,
            customer_name: userEmail || 'Anonymous Square Donor',
            donation_message: userNote || `Square donation - ${payment.id}`,
            square_payment_id: payment.id,
            square_order_id: order?.id || null,
            created_at: new Date().toISOString(),
            completed_at: new Date().toISOString(),
          })
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

        return NextResponse.json({ 
          message: 'Square payment processed successfully',
          donation_id: donation.id,
          amount_cents: amountCents,
          currency: currency
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