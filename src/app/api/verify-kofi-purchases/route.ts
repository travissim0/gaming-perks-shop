import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const email = searchParams.get('email');

    if (!email) {
      return NextResponse.json({ error: 'Email is required' }, { status: 400 });
    }

    // Create Supabase service client
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // Get all active products
    const { data: products, error: productsError } = await supabase
      .from('products')
      .select('id, name, price')
      .eq('active', true);

    if (productsError) {
      throw productsError;
    }

    // Get user's existing purchases
    const { data: userProfile } = await supabase
      .from('profiles')
      .select('id')
      .eq('email', email)
      .single();

    let existingPurchases: any[] = [];
    if (userProfile) {
      const { data: purchases } = await supabase
        .from('user_products')
        .select('product_id')
        .eq('user_id', userProfile.id)
        .eq('status', 'active');
      existingPurchases = purchases || [];
    }

    // Get all Ko-fi donations for this email that haven't been used
    const { data: donations } = await supabase
      .from('donation_transactions')
      .select('id, amount_cents, created_at, kofi_transaction_id, customer_name, kofi_from_name')
      .eq('status', 'completed')
      .or(`customer_name.eq.${email},kofi_from_name.eq.${email}`)
      .is('user_id', null) // Not yet linked to a user purchase
      .order('created_at', { ascending: false });

    // Build status for each product
    const productStatuses: {[key: string]: any} = {};
    const existingProductIds = new Set(existingPurchases.map(p => p.product_id));

    for (const product of products || []) {
      const isOwned = existingProductIds.has(product.id);
      
      if (isOwned) {
        productStatuses[product.id] = {
          owned: true,
          canVerify: false
        };
      } else {
        // Check if there's a donation that can cover this product
        const availableDonation = donations?.find(d => 
          d.amount_cents >= product.price
        );

        productStatuses[product.id] = {
          owned: false,
          canVerify: !!availableDonation,
          availableDonation: availableDonation ? {
            id: availableDonation.id,
            amount: availableDonation.amount_cents / 100,
            created_at: availableDonation.created_at,
            kofi_transaction_id: availableDonation.kofi_transaction_id
          } : undefined,
          requiredAmount: product.price / 100
        };
      }
    }

    return NextResponse.json({
      success: true,
      productStatuses,
      totalDonations: donations?.length || 0,
      email
    });

  } catch (error: any) {
    console.error('Bulk verify API error:', error);
    return NextResponse.json(
      { error: error.message || 'Unknown error' },
      { status: 500 }
    );
  }
} 