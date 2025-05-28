import { NextRequest, NextResponse } from 'next/server';
import { stripe } from '@/lib/stripe';
import { createClient } from '@supabase/supabase-js';

// Use service role key for admin operations
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: NextRequest) {
  try {
    // Optional: Add authentication check for admin users only
    const authHeader = req.headers.get('authorization');
    if (authHeader) {
      const userSupabase = createClient(
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
      
      const { data: { user }, error: userError } = await userSupabase.auth.getUser();
      
      if (userError || !user) {
        return NextResponse.json(
          { error: 'Authentication required' },
          { status: 401 }
        );
      }

      // Check if user is admin
      const { data: profile } = await supabase
        .from('profiles')
        .select('is_admin')
        .eq('id', user.id)
        .single();

      if (!profile || !profile.is_admin) {
        return NextResponse.json(
          { error: 'Admin access required' },
          { status: 403 }
        );
      }
    }

    console.log('🔄 Starting Stripe product sync...');

    // Fetch all products from Stripe
    const stripeProducts = await stripe.products.list({
      active: true,
      expand: ['data.default_price'],
      limit: 100,
    });

    // Fetch all prices to get pricing information
    const stripePrices = await stripe.prices.list({
      active: true,
      limit: 100,
    });

    const syncResults = {
      created: 0,
      updated: 0,
      errors: 0,
      products: [] as any[],
    };

    for (const stripeProduct of stripeProducts.data) {
      try {
        // Find the default price or first active price for this product
        let productPrice = null;
        
        if (stripeProduct.default_price) {
          // If default_price is expanded, use it directly
          if (typeof stripeProduct.default_price === 'object') {
            productPrice = stripeProduct.default_price;
          } else {
            // If default_price is just an ID, find it in the prices list
            productPrice = stripePrices.data.find(
              price => price.id === stripeProduct.default_price
            );
          }
        }

        // If no default price, find any price for this product
        if (!productPrice) {
          productPrice = stripePrices.data.find(
            price => price.product === stripeProduct.id
          );
        }

        if (!productPrice) {
          console.warn(`⚠️ No price found for product ${stripeProduct.id}, skipping`);
          syncResults.errors++;
          continue;
        }

        // Check if product already exists in database
        const { data: existingProduct } = await supabase
          .from('products')
          .select('*')
          .eq('price_id', productPrice.id)
          .maybeSingle();

        const productData = {
          name: stripeProduct.name,
          description: stripeProduct.description || '',
          price: productPrice.unit_amount || 0,
          price_id: productPrice.id,
          image: stripeProduct.images?.[0] || null,
          active: stripeProduct.active,
          updated_at: new Date().toISOString(),
        };

        if (existingProduct) {
          // Update existing product
          const { error } = await supabase
            .from('products')
            .update(productData)
            .eq('id', existingProduct.id);

          if (error) {
            console.error(`❌ Error updating product ${stripeProduct.id}:`, error);
            syncResults.errors++;
          } else {
            console.log(`✅ Updated product: ${stripeProduct.name}`);
            syncResults.updated++;
            syncResults.products.push({
              action: 'updated',
              name: stripeProduct.name,
              price_id: productPrice.id,
            });
          }
        } else {
          // Create new product
          const { error } = await supabase
            .from('products')
            .insert([{
              ...productData,
              created_at: new Date().toISOString(),
            }]);

          if (error) {
            console.error(`❌ Error creating product ${stripeProduct.id}:`, error);
            syncResults.errors++;
          } else {
            console.log(`✅ Created product: ${stripeProduct.name}`);
            syncResults.created++;
            syncResults.products.push({
              action: 'created',
              name: stripeProduct.name,
              price_id: productPrice.id,
            });
          }
        }
      } catch (error) {
        console.error(`❌ Error processing product ${stripeProduct.id}:`, error);
        syncResults.errors++;
      }
    }

    console.log('🎉 Stripe product sync completed!');
    console.log(`📊 Results: ${syncResults.created} created, ${syncResults.updated} updated, ${syncResults.errors} errors`);

    return NextResponse.json({
      success: true,
      message: 'Stripe products synced successfully',
      results: syncResults,
    });

  } catch (error: any) {
    console.error('❌ Stripe sync error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to sync Stripe products' },
      { status: 500 }
    );
  }
}

// GET endpoint to check sync status or manually trigger sync
export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const action = url.searchParams.get('action');

    if (action === 'sync') {
      // Redirect to POST endpoint
      return await POST(req);
    }

    // Return current product count and last sync info
    const { count: dbProductCount } = await supabase
      .from('products')
      .select('*', { count: 'exact', head: true });

    const stripeProducts = await stripe.products.list({
      active: true,
      limit: 100,
    });

    return NextResponse.json({
      database_products: dbProductCount || 0,
      stripe_products: stripeProducts.data.length,
      sync_needed: stripeProducts.data.length !== (dbProductCount || 0),
    });

  } catch (error: any) {
    console.error('❌ Sync status error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to check sync status' },
      { status: 500 }
    );
  }
} 