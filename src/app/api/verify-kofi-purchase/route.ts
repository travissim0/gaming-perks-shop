import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { productId, userEmail, transactionId } = body;

    if (!productId || !userEmail) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // Get product details
    const { data: product, error: productError } = await supabase
      .from('products')
      .select('*')
      .eq('id', productId)
      .single();

    if (productError || !product) {
      return NextResponse.json({ error: 'Product not found' }, { status: 404 });
    }

    // Find user by email to get user_id
    const { data: userProfile, error: userError } = await supabase
      .from('profiles')
      .select('id')
      .eq('email', userEmail)
      .single();

    if (userError || !userProfile) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Look for matching Ko-fi donation with the right amount and email
    const { data: donations, error: donationError } = await supabase
      .from('donation_transactions')
      .select('*')
      .eq('payment_method', 'kofi') // Only Ko-fi donations
      .eq('kofi_from_name', userEmail) // Ko-fi might store email in kofi_from_name or kofi_email field
      .gte('amount_cents', product.price) // Amount must be at least the product price
      .eq('used_for_purchase', false) // Not already used for a purchase
      .order('created_at', { ascending: false });

    if (donationError) {
      return NextResponse.json({ error: 'Database error' }, { status: 500 });
    }

    // Also check kofi_email field in case Ko-fi stores email there
    const { data: donationsByEmail, error: emailError } = await supabase
      .from('donation_transactions')
      .select('*')
      .eq('payment_method', 'kofi')
      .eq('kofi_email', userEmail)
      .gte('amount_cents', product.price)
      .eq('used_for_purchase', false)
      .order('created_at', { ascending: false });

    if (emailError) {
      return NextResponse.json({ error: 'Database error' }, { status: 500 });
    }

    // Also check customer_email field
    const { data: donationsByCustomerEmail, error: customerEmailError } = await supabase
      .from('donation_transactions')
      .select('*')
      .eq('payment_method', 'kofi')
      .eq('customer_email', userEmail)
      .gte('amount_cents', product.price)
      .eq('used_for_purchase', false)
      .order('created_at', { ascending: false });

    if (customerEmailError) {
      return NextResponse.json({ error: 'Database error' }, { status: 500 });
    }

    // Combine and deduplicate donations
    const allDonations = [...(donations || []), ...(donationsByEmail || []), ...(donationsByCustomerEmail || [])];
    const uniqueDonations = allDonations.filter((donation, index, self) => 
      index === self.findIndex(d => d.id === donation.id)
    );

    // If specific transaction ID provided, look for exact match
    let matchingDonation = null;
    if (transactionId) {
      matchingDonation = uniqueDonations.find(d => d.kofi_transaction_id === transactionId);
    } else {
      // Find the most recent donation that meets the criteria
      matchingDonation = uniqueDonations[0];
    }

    if (!matchingDonation) {
      return NextResponse.json({ 
        error: 'No matching Ko-fi donation found',
        details: 'Either no donation found for this email, or insufficient amount, or donation already used.'
      }, { status: 404 });
    }

    // Check if user already has this product
    const { data: existingPurchase } = await supabase
      .from('user_products')
      .select('*')
      .eq('user_id', userProfile.id)
      .eq('product_id', productId)
      .single();

    if (existingPurchase) {
      return NextResponse.json({ 
        error: 'User already owns this product',
        purchase: existingPurchase
      }, { status: 400 });
    }

    // Create the purchase record
    const { data: newPurchase, error: purchaseError } = await supabase
      .from('user_products')
      .insert({
        user_id: userProfile.id,
        product_id: productId,
        status: 'active',
        phrase: body.customPhrase || null,
        stripe_payment_intent_id: null, // Not using Stripe
        expires_at: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .select()
      .single();

    if (purchaseError) {
      console.error('Purchase creation error:', purchaseError);
      return NextResponse.json({ error: 'Failed to create purchase record', details: purchaseError.message }, { status: 500 });
    }

    // Mark the Ko-fi donation as used
    await supabase
      .from('donation_transactions')
      .update({ 
        used_for_purchase: true,
        purchase_id: newPurchase.id
      })
      .eq('id', matchingDonation.id);

    return NextResponse.json({
      success: true,
      message: 'Purchase verified and activated!',
      purchase: newPurchase,
      donation: matchingDonation
    });

  } catch (error) {
    console.error('Error verifying Ko-fi purchase:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const userEmail = searchParams.get('email');
  const productId = searchParams.get('productId');

  if (!userEmail || !productId) {
    return NextResponse.json({ error: 'Missing email or productId' }, { status: 400 });
  }

  try {
    // Find user by email to get user_id
    const { data: userProfile, error: userError } = await supabase
      .from('profiles')
      .select('id')
      .eq('email', userEmail)
      .single();

    if (userError || !userProfile) {
      return NextResponse.json({ 
        owned: false,
        canVerify: false,
        availableDonation: null,
        requiredAmount: 0
      });
    }

    // Check if user already has this product
    const { data: existingPurchase } = await supabase
      .from('user_products')
      .select('*')
      .eq('user_id', userProfile.id)
      .eq('product_id', productId)
      .single();

    if (existingPurchase) {
      return NextResponse.json({ 
        owned: true,
        purchase: existingPurchase
      });
    }

    // Get product details
    const { data: product } = await supabase
      .from('products')
      .select('*')
      .eq('id', productId)
      .single();

    if (!product) {
      return NextResponse.json({ error: 'Product not found' }, { status: 404 });
    }

    // Check for available Ko-fi donations
    const { data: donations } = await supabase
      .from('donation_transactions')
      .select('*')
      .eq('payment_method', 'kofi')
      .or(`kofi_from_name.eq.${userEmail},kofi_email.eq.${userEmail},customer_email.eq.${userEmail}`)
      .gte('amount_cents', product.price)
      .eq('used_for_purchase', false)
      .order('created_at', { ascending: false });

    const availableDonation = donations && donations.length > 0 ? donations[0] : null;

    return NextResponse.json({ 
      owned: false,
      canVerify: !!availableDonation,
      availableDonation: availableDonation ? {
        id: availableDonation.id,
        amount: availableDonation.amount_cents / 100, // Convert cents to dollars
        created_at: availableDonation.created_at,
        kofi_transaction_id: availableDonation.kofi_transaction_id
      } : null,
      requiredAmount: product.price / 100 // Convert cents to dollars
    });

  } catch (error) {
    console.error('Error checking purchase status:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
} 