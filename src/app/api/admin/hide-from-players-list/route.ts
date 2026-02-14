import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const token = authHeader.slice(7);
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('is_admin, ctf_role')
      .eq('id', user.id)
      .single();
    const isAdmin = profile?.is_admin === true || profile?.ctf_role === 'ctf_admin';
    if (!isAdmin) {
      return NextResponse.json({ error: 'Admin or CTF admin required' }, { status: 403 });
    }

    const body = await request.json();
    const profileId = body?.profileId;
    if (!profileId || typeof profileId !== 'string') {
      return NextResponse.json({ error: 'profileId is required' }, { status: 400 });
    }

    const { error: updateError } = await supabaseAdmin
      .from('profiles')
      .update({ hidden_from_players_list: true })
      .eq('id', profileId);

    if (updateError) {
      console.error('hide-from-players-list:', updateError);
      return NextResponse.json({ error: updateError.message || 'Failed to update' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('hide-from-players-list error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
