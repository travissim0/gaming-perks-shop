import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { createClient } from '@supabase/supabase-js';

// Use service role client for admin operations
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function isUserAdmin(userId: string): Promise<boolean> {
  try {
    const { data, error } = await supabaseAdmin
      .from('profiles')
      .select('is_admin')
      .eq('id', userId)
      .single();

    if (error || !data) return false;
    
    return data.is_admin === true;
  } catch (error) {
    console.error('Error checking admin status:', error);
    return false;
  }
}

export async function GET(request: NextRequest) {
  try {
    console.log('🔍 Debug API called - checking authorization...');
    
    // CRITICAL: Check authentication first
    const authHeader = request.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized - Admin access required' }, { status: 401 });
    }

    const token = authHeader.split(' ')[1];
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
    
    if (authError || !user) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
    }

    // CRITICAL: Verify admin privileges
    if (!(await isUserAdmin(user.id))) {
      console.warn(`⚠️ Unauthorized debug access attempt by user: ${user.email || user.id}`);
      return NextResponse.json({ error: 'Admin privileges required' }, { status: 403 });
    }

    console.log(`✅ Admin debug access granted to: ${user.email}`);
    
    const results: any = {};

    // Test 1: Check if donation_transactions table exists and its structure
    try {
      const { data: donationTest, error: donationError } = await supabase
        .from('donation_transactions')
        .select('id, amount_cents, currency, status, created_at') // LIMITED FIELDS ONLY
        .limit(1);
      
      results.donation_transactions = {
        success: !donationError,
        error: donationError?.message,
        // SECURITY: Don't expose actual sensitive data, just structure info
        has_data: !!donationTest?.[0],
        column_count: donationTest?.[0] ? Object.keys(donationTest[0]).length : 0
      };
    } catch (err: any) {
      results.donation_transactions = {
        success: false,
        error: err.message
      };
    }

    // Test 2: Check user_products table and its structure
    try {
      const { data: userProductsTest, error: userProductsError } = await supabase
        .from('user_products')
        .select('id, user_id, product_id, created_at') // LIMITED FIELDS ONLY
        .limit(1);
      
      results.user_products = {
        success: !userProductsError,
        error: userProductsError?.message,
        has_data: !!userProductsTest?.[0],
        column_count: userProductsTest?.[0] ? Object.keys(userProductsTest[0]).length : 0
      };
    } catch (err: any) {
      results.user_products = {
        success: false,
        error: err.message
      };
    }

    // Test 3: Check profiles table
    try {
      const { data: profilesTest, error: profilesError } = await supabase
        .from('profiles')
        .select('id, created_at, updated_at') // LIMITED FIELDS ONLY - NO EMAILS OR ALIASES
        .limit(1);
      
      results.profiles = {
        success: !profilesError,
        error: profilesError?.message,
        has_data: !!profilesTest?.[0],
        column_count: profilesTest?.[0] ? Object.keys(profilesTest[0]).length : 0
      };
    } catch (err: any) {
      results.profiles = {
        success: false,
        error: err.message
      };
    }

    // Test 4: Check products table
    try {
      const { data: productsTest, error: productsError } = await supabase
        .from('products')
        .select('id, name, price, created_at') // LIMITED FIELDS ONLY
        .limit(1);
      
      results.products = {
        success: !productsError,
        error: productsError?.message,
        has_data: !!productsTest?.[0],
        column_count: productsTest?.[0] ? Object.keys(productsTest[0]).length : 0
      };
    } catch (err: any) {
      results.products = {
        success: false,
        error: err.message
      };
    }

    // Test 5: Try simple join
    try {
      const { data: joinTest, error: joinError } = await supabase
        .from('user_products')
        .select(`
          id,
          user_id,
          product_id,
          created_at
        `)
        .limit(1);
      
      results.simple_user_products_query = {
        success: !joinError,
        error: joinError?.message,
        has_data: !!joinTest?.[0]
      };
    } catch (err: any) {
      results.simple_user_products_query = {
        success: false,
        error: err.message
      };
    }

    // Test 6: Try the problematic join syntax
    try {
      const { data: joinTest, error: joinError } = await supabase
        .from('user_products')
        .select(`
          id,
          user_id,
          product_id,
          created_at,
          profiles!user_id (
            id,
            created_at
          )
        `)
        .limit(1);
      
      results.user_products_with_profiles_join = {
        success: !joinError,
        error: joinError?.message,
        has_data: !!joinTest?.[0]
      };
    } catch (err: any) {
      results.user_products_with_profiles_join = {
        success: false,
        error: err.message
      };
    }

    return NextResponse.json({
      timestamp: new Date().toISOString(),
      admin_user: user.email,
      debug_results: results
    });

  } catch (error: any) {
    console.error('Debug API error:', error);
    return NextResponse.json({ 
      error: 'Debug API failed', 
      details: error.message 
    }, { status: 500 });
  }
} 