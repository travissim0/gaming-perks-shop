import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function POST(req: NextRequest) {
  try {
    const { sessionId, paymentIntentId } = await req.json();

    if (!sessionId) {
      return NextResponse.json(
        { error: 'Session ID is required' },
        { status: 400 }
      );
    }

    // Create Supabase service client
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // Find the pending donation transaction
    const { data: existingDonation, error: findError } = await supabase
      .from('donation_transactions')
      .select('*')
      .eq('stripe_session_id', sessionId)
      .eq('status', 'pending')
      .maybeSingle();

    if (findError) {
      console.error('Error finding donation:', findError);
      return NextResponse.json(
        { error: 'Error finding donation transaction' },
        { status: 500 }
      );
    }

    if (!existingDonation) {
      return NextResponse.json(
        { error: 'No pending donation found with that session ID' },
        { status: 404 }
      );
    }

    // Update the donation to completed status
    const { data: updatedDonation, error: updateError } = await supabase
      .from('donation_transactions')
      .update({
        stripe_payment_intent_id: paymentIntentId || `pi_test_${Date.now()}`,
        status: 'completed',
        completed_at: new Date().toISOString(),
      })
      .eq('id', existingDonation.id)
      .select()
      .single();

    if (updateError) {
      console.error('Error updating donation:', updateError);
      return NextResponse.json(
        { error: 'Error updating donation transaction' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: 'Donation marked as completed',
      donation: updatedDonation,
    });

  } catch (error: any) {
    console.error('Test webhook error:', error);
    return NextResponse.json(
      { error: error.message || 'Unknown error' },
      { status: 500 }
    );
  }
}

export async function GET(req: NextRequest) {
  try {
    // Create Supabase service client
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // Get all pending donations
    const { data: pendingDonations, error } = await supabase
      .from('donation_transactions')
      .select('*')
      .eq('status', 'pending')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching pending donations:', error);
      return NextResponse.json(
        { error: 'Error fetching pending donations' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      pendingDonations,
      count: pendingDonations?.length || 0,
    });

  } catch (error: any) {
    console.error('Test webhook GET error:', error);
    return NextResponse.json(
      { error: error.message || 'Unknown error' },
      { status: 500 }
    );
  }
} 