import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function GET(request: NextRequest) {
  try {
    console.log('🔍 Starting debug API...');
    
    const results: any = {};

    // Test 1: Check if donation_transactions table exists and its structure
    try {
      const { data: donationTest, error: donationError } = await supabase
        .from('donation_transactions')
        .select('*')
        .limit(1);
      
      results.donation_transactions = {
        success: !donationError,
        error: donationError?.message,
        sample_data: donationTest?.[0] || null,
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
        .select('*')
        .limit(1);
      
      results.user_products = {
        success: !userProductsError,
        error: userProductsError?.message,
        sample_data: userProductsTest?.[0] || null,
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
        .select('*')
        .limit(1);
      
      results.profiles = {
        success: !profilesError,
        error: profilesError?.message,
        sample_data: profilesTest?.[0] || null,
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
        .select('*')
        .limit(1);
      
      results.products = {
        success: !productsError,
        error: productsError?.message,
        sample_data: productsTest?.[0] || null,
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
        data: joinTest
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
          *,
          profiles!user_id (
            email,
            in_game_alias
          )
        `)
        .limit(1);
      
      results.user_products_with_profiles_join = {
        success: !joinError,
        error: joinError?.message,
        data: joinTest
      };
    } catch (err: any) {
      results.user_products_with_profiles_join = {
        success: false,
        error: err.message
      };
    }

    return NextResponse.json({
      timestamp: new Date().toISOString(),
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