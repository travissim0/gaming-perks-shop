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
    const { squadId, newCaptainId } = body;
    if (!squadId || !newCaptainId) {
      return NextResponse.json(
        { error: 'squadId and newCaptainId are required' },
        { status: 400 }
      );
    }

    const { data: squad, error: squadErr } = await supabaseAdmin
      .from('squads')
      .select('id, captain_id')
      .eq('id', squadId)
      .single();
    if (squadErr || !squad) {
      return NextResponse.json({ error: 'Squad not found' }, { status: 404 });
    }

    const { data: newCaptainMember, error: memberErr } = await supabaseAdmin
      .from('squad_members')
      .select('id')
      .eq('squad_id', squadId)
      .eq('player_id', newCaptainId)
      .single();
    if (memberErr || !newCaptainMember) {
      return NextResponse.json({ error: 'New captain must be a current squad member' }, { status: 400 });
    }

    const oldCaptainId = squad.captain_id;
    if (oldCaptainId === newCaptainId) {
      return NextResponse.json({ error: 'New captain is already the captain' }, { status: 400 });
    }

    await supabaseAdmin.from('squad_members').update({ role: 'player' }).eq('squad_id', squadId).eq('role', 'captain');
    await supabaseAdmin.from('squad_members').update({ role: 'captain' }).eq('squad_id', squadId).eq('player_id', newCaptainId);
    const { error: updateSquadErr } = await supabaseAdmin.from('squads').update({ captain_id: newCaptainId }).eq('id', squadId);
    if (updateSquadErr) {
      console.error('transfer-captain: squads update error', updateSquadErr);
      return NextResponse.json({ error: 'Failed to update squad captain' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('transfer-captain error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
