import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Service client for admin operations
const serviceSupabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Regular client for auth
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export async function GET(request: NextRequest) {
  try {
    // Get the authorization header
    const authHeader = request.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const token = authHeader.split(' ')[1];
    
    // Verify the user with the token
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check if user is admin
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('is_admin')
      .eq('id', user.id)
      .single();

    if (profileError || !profile?.is_admin) {
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 });
    }

    const url = new URL(request.url);
    const startDate = url.searchParams.get('start_date');
    const endDate = url.searchParams.get('end_date');

    // Get financial overview using the database function
    const { data: overview, error: overviewError } = await serviceSupabase.rpc(
      'get_financial_overview',
      {
        start_date: startDate,
        end_date: endDate
      }
    );

    if (overviewError) {
      console.error('Error fetching financial overview:', overviewError);
      return NextResponse.json({ error: overviewError.message }, { status: 500 });
    }

    // Get summary totals
    const totals = overview.reduce((acc, month) => ({
      total_revenue: (acc.total_revenue || 0) + (parseFloat(month.total_revenue) || 0),
      total_donations: (acc.total_donations || 0) + (parseFloat(month.total_donations) || 0),
      total_orders: (acc.total_orders || 0) + (parseFloat(month.total_orders) || 0),
      total_expenses: (acc.total_expenses || 0) + (parseFloat(month.total_expenses) || 0),
      website_costs: (acc.website_costs || 0) + (parseFloat(month.website_costs) || 0),
      server_costs: (acc.server_costs || 0) + (parseFloat(month.server_costs) || 0),
      ai_subscription_costs: (acc.ai_subscription_costs || 0) + (parseFloat(month.ai_subscription_costs) || 0),
      ai_usage_costs: (acc.ai_usage_costs || 0) + (parseFloat(month.ai_usage_costs) || 0),
      other_costs: (acc.other_costs || 0) + (parseFloat(month.other_costs) || 0),
      net_profit: (acc.net_profit || 0) + (parseFloat(month.net_profit) || 0)
    }), {});

    // Calculate overall profit margin
    const overallProfitMargin = totals.total_revenue > 0 
      ? ((totals.net_profit / totals.total_revenue) * 100).toFixed(2)
      : 0;

    return NextResponse.json({ 
      overview,
      totals: {
        ...totals,
        profit_margin: parseFloat(overallProfitMargin)
      }
    });

  } catch (error) {
    console.error('Error in financial overview API:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
