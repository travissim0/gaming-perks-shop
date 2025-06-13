import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const FALLBACK_ADMIN_EMAILS = [
  'travis@freeinf.org',
  'admin@freeinf.org'
];

export async function GET(request: NextRequest) {
  try {
    // Get the authorization header
    const authHeader = request.headers.get('authorization');
    if (!authHeader) {
      return NextResponse.json({ error: 'No authorization header' }, { status: 401 });
    }

    const token = authHeader.replace('Bearer ', '');
    
    // Verify the session and get user
    const { data: { user }, error: userError } = await supabaseAdmin.auth.getUser(token);
    
    if (userError || !user) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
    }

    // Check if user is admin
    let isAdmin = false;
    if (user.email && FALLBACK_ADMIN_EMAILS.includes(user.email.toLowerCase())) {
      isAdmin = true;
    }

    if (!isAdmin) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    // Get current donation mode from environment or default
    const currentMode = process.env.DONATION_DISPLAY_MODE || 'auto';
    
    // Test database connectivity
    let databaseStatus = 'unknown';
    let donationCount = 0;
    let kofiWebhookStatus = 'unknown';
    
    try {
      const { data: donations, error: dbError } = await supabaseAdmin
        .from('donation_transactions')
        .select('id, amount_cents, customer_name, kofi_transaction_id, created_at, status')
        .order('created_at', { ascending: false })
        .limit(10);

      if (dbError) {
        databaseStatus = 'error';
      } else {
        databaseStatus = 'connected';
        donationCount = donations?.length || 0;
        
        // Check for recent Ko-Fi donations (last 7 days)
        const recentKofiDonations = donations?.filter(d => 
          d.kofi_transaction_id && 
          new Date(d.created_at) > new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
        ).length || 0;
        
        kofiWebhookStatus = recentKofiDonations > 0 ? 'working' : 'no_recent_data';
      }
    } catch (error) {
      databaseStatus = 'connection_failed';
    }

    return NextResponse.json({
      currentMode,
      databaseStatus,
      donationCount,
      kofiWebhookStatus,
      modes: {
        auto: 'Auto (Database with cache fallback)',
        database: 'Database only',
        cache: 'Cache only'
      }
    });

  } catch (error: any) {
    console.error('Error in donation-mode API:', error);
    return NextResponse.json({ 
      error: 'Internal server error', 
      details: error.message 
    }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');
    if (!authHeader) {
      return NextResponse.json({ error: 'No authorization header' }, { status: 401 });
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: userError } = await supabaseAdmin.auth.getUser(token);
    
    if (userError || !user) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
    }

    // Check if user is admin
    let isAdmin = false;
    if (user.email && FALLBACK_ADMIN_EMAILS.includes(user.email.toLowerCase())) {
      isAdmin = true;
    }

    if (!isAdmin) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    const body = await request.json();
    const { action, mode } = body;

    if (action === 'set_mode') {
      if (!['auto', 'database', 'cache'].includes(mode)) {
        return NextResponse.json({ error: 'Invalid mode' }, { status: 400 });
      }

      // In a production environment, you would save this to database or environment
      // For now, we'll return success and the frontend will handle mode switching
      return NextResponse.json({ 
        success: true, 
        mode,
        message: `Donation display mode set to: ${mode}` 
      });
    }

    if (action === 'sync_database') {
      try {
        const { data: donations, error } = await supabaseAdmin
          .from('donation_transactions')
          .select('*')
          .eq('status', 'completed')
          .order('created_at', { ascending: false })
          .limit(50);

        if (error) {
          throw error;
        }

        return NextResponse.json({
          success: true,
          message: `Found ${donations?.length || 0} completed donations in database`,
          donations: donations?.slice(0, 5).map(d => ({
            id: d.id,
            amount: d.amount_cents / 100,
            name: d.customer_name || d.kofi_from_name || 'Anonymous',
            date: d.created_at,
            method: d.payment_method || 'unknown'
          }))
        });

      } catch (error: any) {
        return NextResponse.json({ 
          success: false, 
          error: 'Database sync failed',
          details: error.message 
        }, { status: 500 });
      }
    }

    if (action === 'test_kofi_webhook') {
      // Test Ko-Fi webhook by checking recent Ko-Fi donations
      try {
        const { data: kofiDonations, error } = await supabaseAdmin
          .from('donation_transactions')
          .select('*')
          .not('kofi_transaction_id', 'is', null)
          .order('created_at', { ascending: false })
          .limit(10);

        if (error) {
          throw error;
        }

        return NextResponse.json({
          success: true,
          message: `Found ${kofiDonations?.length || 0} Ko-Fi donations`,
          recentKofiDonations: kofiDonations?.map(d => ({
            id: d.kofi_transaction_id,
            amount: d.amount_cents / 100,
            name: d.kofi_from_name || d.customer_name || 'Anonymous',
            date: d.created_at,
            email: d.kofi_email || d.customer_email
          }))
        });

      } catch (error: any) {
        return NextResponse.json({ 
          success: false, 
          error: 'Ko-Fi webhook test failed',
          details: error.message 
        }, { status: 500 });
      }
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });

  } catch (error: any) {
    console.error('Error in donation-mode POST:', error);
    return NextResponse.json({ 
      error: 'Internal server error', 
      details: error.message 
    }, { status: 500 });
  }
} 