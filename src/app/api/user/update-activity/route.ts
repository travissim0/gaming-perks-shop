import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import { ensureProfile } from '@/lib/ensure-profile-server';

/*
 * Called by the site on every sign-in and session restore. Besides stamping last_seen, it's the one
 * place every signed-in user passes through, so it also repairs a missing profile row (see
 * ensureProfile). Identity comes from the bearer token, not the body.
 */

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get('Authorization');
    const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : '';
    const { data: { user } } = token ? await supabase.auth.getUser(token) : { data: { user: null } };
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const profile = await ensureProfile(user);
    if (!profile) return NextResponse.json({ error: 'Failed to update activity' }, { status: 500 });

    const { error } = await supabaseAdmin
      .from('profiles')
      .update({ last_seen: new Date().toISOString() })
      .eq('id', user.id);
    if (error) {
      console.warn('Activity update error:', error.message);
      return NextResponse.json({ error: 'Failed to update activity' }, { status: 500 });
    }

    return NextResponse.json({ success: true, profile_created: profile.created });
  } catch (error: any) {
    console.error('Activity update error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
