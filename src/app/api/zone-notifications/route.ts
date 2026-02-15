import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getServiceSupabase } from '@/lib/supabase';

function getAuthClient(request: NextRequest) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  const authHeader = request.headers.get('authorization');

  return createClient(supabaseUrl, supabaseAnonKey, {
    global: {
      headers: authHeader ? { Authorization: authHeader } : {},
    },
    auth: { persistSession: false },
  });
}

async function getUser(request: NextRequest) {
  const supabase = getAuthClient(request);
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user) return null;
  return user;
}

// GET: Fetch user's notification subscriptions
export async function GET(request: NextRequest) {
  const user = await getUser(request);
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = getServiceSupabase();
  const { data, error } = await supabase
    .from('zone_notification_subscriptions')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}

// POST: Create or update a notification subscription
export async function POST(request: NextRequest) {
  const user = await getUser(request);
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json();
  const { zone_title, threshold } = body;

  if (!zone_title || typeof threshold !== 'number' || threshold < 1) {
    return NextResponse.json(
      { error: 'zone_title and threshold (>= 1) are required' },
      { status: 400 }
    );
  }

  const supabase = getServiceSupabase();

  // Upsert: update threshold if exists, insert if not
  const { data, error } = await supabase
    .from('zone_notification_subscriptions')
    .upsert(
      {
        user_id: user.id,
        zone_title,
        threshold,
        is_active: true,
      },
      { onConflict: 'user_id,zone_title' }
    )
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}

// DELETE: Remove a notification subscription
export async function DELETE(request: NextRequest) {
  const user = await getUser(request);
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const zone_title = searchParams.get('zone_title');

  if (!zone_title) {
    return NextResponse.json(
      { error: 'zone_title is required' },
      { status: 400 }
    );
  }

  const supabase = getServiceSupabase();
  const { error } = await supabase
    .from('zone_notification_subscriptions')
    .delete()
    .eq('user_id', user.id)
    .eq('zone_title', zone_title);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
