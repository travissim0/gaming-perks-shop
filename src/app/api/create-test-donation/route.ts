import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function POST(req: NextRequest) {
  try {
    const { amount, donationMessage } = await req.json();

    // Get the Authorization header
    const authHeader = req.headers.get('authorization');
    
    if (!authHeader) {
      return NextResponse.json(
        { error: 'You must be logged in to create a test donation' },
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
        { error: 'You must be logged in to create a test donation' },
        { status: 401 }
      );
    }

    // Create Supabase service client for database operations
    const supabaseService = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // Generate test IDs
    const testSessionId = `cs_test_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const testPaymentIntentId = `pi_test_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // Create a completed test donation transaction
    const { data, error: dbError } = await supabaseService.from('donation_transactions').insert([
      {
        user_id: user.id,
        stripe_payment_intent_id: testPaymentIntentId,
        stripe_session_id: testSessionId,
        amount_cents: (amount || 5) * 100, // Default to $5 if no amount provided
        currency: 'usd',
        status: 'completed',
        customer_email: user.email,
        customer_name: user.user_metadata?.full_name || 'Test User',
        donation_message: donationMessage || 'Test donation for development',
        completed_at: new Date().toISOString(),
      },
    ]).select();

    if (dbError) {
      console.error('Error creating test donation:', dbError);
      return NextResponse.json(
        { error: 'Failed to create test donation' },
        { status: 500 }
      );
    }

    return NextResponse.json({ 
      success: true, 
      donation: data[0],
      message: 'Test donation created successfully'
    });
  } catch (error: any) {
    console.error('Test donation error:', error);
    return NextResponse.json(
      { error: error.message || 'An error occurred creating test donation' },
      { status: 500 }
    );
  }
} 