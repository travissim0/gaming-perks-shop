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
    const category = url.searchParams.get('category');

    // Get expenses with optional filtering
    let query = serviceSupabase
      .from('expenses')
      .select('*')
      .order('expense_date', { ascending: false });

    if (startDate) {
      query = query.gte('expense_date', startDate);
    }
    if (endDate) {
      query = query.lte('expense_date', endDate);
    }
    if (category && category !== 'all') {
      query = query.eq('category', category);
    }

    const { data: expenses, error: expensesError } = await query;

    if (expensesError) {
      console.error('Error fetching expenses:', expensesError);
      return NextResponse.json({ error: expensesError.message }, { status: 500 });
    }

    return NextResponse.json({ expenses });

  } catch (error) {
    console.error('Error in expenses API:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
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

    const body = await request.json();
    const {
      category,
      description,
      amount,
      expense_date,
      provider,
      is_recurring,
      recurring_period,
      notes
    } = body;

    // Validate required fields
    if (!category || !description || !amount || !expense_date) {
      return NextResponse.json(
        { error: 'Missing required fields: category, description, amount, expense_date' },
        { status: 400 }
      );
    }

    // Create authenticated supabase client with user's session
    const authSupabase = createClient(
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

    // Create the expense
    const { data: newExpense, error: insertError } = await authSupabase
      .from('expenses')
      .insert({
        category,
        description,
        amount: parseFloat(amount),
        expense_date,
        provider: provider || null,
        is_recurring: is_recurring || false,
        recurring_period: recurring_period || null,
        notes: notes || null,
        created_by: user.id
      })
      .select()
      .single();

    if (insertError) {
      console.error('Error creating expense:', insertError);
      return NextResponse.json({ error: insertError.message }, { status: 500 });
    }

    return NextResponse.json({ expense: newExpense }, { status: 201 });

  } catch (error) {
    console.error('Error in expenses POST:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
