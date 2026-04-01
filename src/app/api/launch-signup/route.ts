import { NextRequest, NextResponse } from 'next/server';
import { getServiceSupabase } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email, in_game_alias, notify_by_email } = body;

    // Validate email
    if (!email || typeof email !== 'string') {
      return NextResponse.json({ error: 'Email is required' }, { status: 400 });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email.trim())) {
      return NextResponse.json({ error: 'Please enter a valid email address' }, { status: 400 });
    }

    // Sanitize inputs
    const cleanEmail = email.trim().toLowerCase();
    const cleanAlias = in_game_alias?.trim()?.slice(0, 50) || null;

    // Basic request info for admin tracking
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
               request.headers.get('x-real-ip') ||
               'unknown';
    const userAgent = request.headers.get('user-agent')?.slice(0, 255) || null;

    const supabase = getServiceSupabase();

    const { data, error } = await supabase
      .from('launch_signups')
      .upsert(
        {
          email: cleanEmail,
          in_game_alias: cleanAlias,
          notify_by_email: notify_by_email !== false,
          ip_address: ip,
          user_agent: userAgent,
        },
        { onConflict: 'email' }
      )
      .select('id')
      .single();

    if (error) {
      console.error('Launch signup error:', error);
      return NextResponse.json({ error: 'Failed to save signup. Please try again.' }, { status: 500 });
    }

    return NextResponse.json({ success: true, message: 'You\'re on the list!' });
  } catch (error) {
    console.error('Launch signup error:', error);
    return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 });
  }
}

// GET: Return total signup count (public, no personal data)
export async function GET() {
  try {
    const supabase = getServiceSupabase();
    const { count, error } = await supabase
      .from('launch_signups')
      .select('*', { count: 'exact', head: true });

    if (error) {
      return NextResponse.json({ count: 0 });
    }

    return NextResponse.json({ count: count || 0 });
  } catch {
    return NextResponse.json({ count: 0 });
  }
}
