import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

interface Supporter {
  id: string;
  type: 'donation' | 'purchase';
  amount: number;
  currency: string;
  customer_name: string;
  message?: string;
  created_at: string;
  payment_method: string;
  product_name?: string;
}

export async function GET(req: NextRequest) {
  try {
    // Create Supabase service client for public data access
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const supporters: Supporter[] = [];

    // Fetch donations from donation_transactions table (simplified query)
    const { data: donations, error: donationsError } = await supabase
      .from('donation_transactions')
      .select(`
        id,
        amount_cents,
        currency,
        donation_message,
        customer_name,
        created_at,
        payment_method,
        kofi_from_name,
        user_id
      `)
      .eq('status', 'completed')
      .order('created_at', { ascending: false });

    if (donationsError) {
      console.error('Error fetching donations:', donationsError);
    } else if (donations) {
      for (const donation of donations) {
        // For now, use the available name fields directly
        const customerName = donation.kofi_from_name || 
                           donation.customer_name || 
                           'Anonymous Supporter';
        
        supporters.push({
          id: `donation-${donation.id}`,
          type: 'donation',
          amount: donation.amount_cents / 100,
          currency: donation.currency || 'usd',
          customer_name: customerName,
          message: donation.donation_message,
          created_at: donation.created_at,
          payment_method: donation.payment_method || 'kofi'
        });
      }
    }

    // Fetch perk purchases from user_products (simplified query)
    const { data: purchases, error: purchasesError } = await supabase
      .from('user_products')
      .select(`
        id,
        created_at,
        purchase_method,
        product_id,
        user_id,
        phrase
      `)
      .eq('status', 'active')
      .order('created_at', { ascending: false });

    if (purchasesError) {
      console.error('Error fetching purchases:', purchasesError);
    } else if (purchases) {
      // Get product details separately
      const productIds = [...new Set(purchases.map(p => p.product_id))];
      const { data: products } = await supabase
        .from('products')
        .select('id, name, price')
        .in('id', productIds);

      // Get user profiles separately
      const userIds = [...new Set(purchases.map(p => p.user_id).filter(Boolean))];
      let profiles: any[] = [];
      if (userIds.length > 0) {
        const { data: userProfiles } = await supabase
          .from('profiles')
          .select('id, email, in_game_alias')
          .in('id', userIds);
        profiles = userProfiles || [];
      }

      // Create lookup maps
      const productMap = new Map(products?.map(p => [p.id, p]) || []);
      const profileMap = new Map(profiles.map(p => [p.id, p]));

      for (const purchase of purchases) {
        const product = productMap.get(purchase.product_id);
        const profile = profileMap.get(purchase.user_id);
        
        if (product) {
          // Use in_game_alias as the primary name source
          const customerName = profile?.in_game_alias || 'No Alias';
          
          // Create product name with phrase if available
          let productDisplayName = product.name;
          if (purchase.phrase) {
            productDisplayName = `${product.name} (${purchase.phrase})`;
          }
          
          supporters.push({
            id: `purchase-${purchase.id}`,
            type: 'purchase',
            amount: product.price / 100,
            currency: 'usd',
            customer_name: customerName,
            created_at: purchase.created_at,
            payment_method: purchase.purchase_method || 'stripe',
            product_name: productDisplayName
          });
        }
      }
    }

    // Sort all supporters by date (newest first)
    supporters.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

    // Calculate comprehensive stats
    const totalAmount = supporters.reduce((sum, supporter) => sum + supporter.amount, 0);
    const totalCount = supporters.length;
    
    // This month's supporters
    const now = new Date();
    const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const thisMonthSupporters = supporters.filter(s => 
      new Date(s.created_at) >= thisMonthStart
    );
    const thisMonthAmount = thisMonthSupporters.reduce((sum, s) => sum + s.amount, 0);
    
    // Find largest contribution with name
    const largestSupporter = supporters.length > 0 
      ? supporters.reduce((max, current) => 
          current.amount > max.amount ? current : max
        )
      : null;

    // Top supporters (unique by name, summed amounts)
    const supporterTotals = new Map<string, { amount: number, count: number, latest: Supporter }>();
    supporters.forEach(supporter => {
      const existing = supporterTotals.get(supporter.customer_name);
      if (existing) {
        existing.amount += supporter.amount;
        existing.count += 1;
        if (new Date(supporter.created_at) > new Date(existing.latest.created_at)) {
          existing.latest = supporter;
        }
      } else {
        supporterTotals.set(supporter.customer_name, {
          amount: supporter.amount,
          count: 1,
          latest: supporter
        });
      }
    });

    const topSupporters = Array.from(supporterTotals.entries())
      .map(([name, data]) => ({
        name,
        totalAmount: data.amount,
        contributionCount: data.count,
        latestContribution: data.latest
      }))
      .sort((a, b) => b.totalAmount - a.totalAmount)
      .slice(0, 10);

    return NextResponse.json({
      supporters: supporters.slice(0, 50), // Recent 50 supporters
      stats: {
        totalAmount: Math.round(totalAmount * 100), // Convert to cents
        totalSupporters: totalCount,
        thisMonthAmount: Math.round(thisMonthAmount * 100), // Convert to cents
        largestContribution: largestSupporter ? {
          amount: Math.round(largestSupporter.amount * 100),
          supporterName: largestSupporter.customer_name,
          type: largestSupporter.type,
          productName: largestSupporter.product_name
        } : null
      },
      topSupporters,
      count: supporters.length,
    });

  } catch (error: any) {
    console.error('Supporters API error:', error);
    return NextResponse.json(
      { error: error.message || 'Unknown error' },
      { status: 500 }
    );
  }
} 