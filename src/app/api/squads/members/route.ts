import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

/**
 * Squad roster management (kick / promote / demote) via service role.
 *
 * Row security on squad_members only lets the captain touch rows directly,
 * and a blocked delete reports "success" with nothing changed — which is how
 * staff kicks looked like they worked but didn't. This route checks the
 * caller's rights itself and then writes with the service role.
 *
 * POST { action: 'kick' | 'promote' | 'demote', squad_id, member_id }
 *   kick    — captain, co-captain (players only), or league staff
 *   promote — captain or staff: player → co_captain
 *   demote  — captain or staff: co_captain → player
 */
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(authHeader.slice(7));
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await request.json().catch(() => null);
    const action = body?.action as 'kick' | 'promote' | 'demote' | undefined;
    const squadId = body?.squad_id as string | undefined;
    const memberId = body?.member_id as string | undefined;
    if (!action || !squadId || !memberId) return NextResponse.json({ error: 'action, squad_id and member_id are required' }, { status: 400 });

    const [{ data: profile }, { data: squad }, { data: target }, { data: callerMember }] = await Promise.all([
      supabaseAdmin.from('profiles').select('is_admin, ctf_role').eq('id', user.id).maybeSingle(),
      supabaseAdmin.from('squads').select('id, captain_id, name').eq('id', squadId).maybeSingle(),
      supabaseAdmin.from('squad_members').select('id, player_id, role, status').eq('id', memberId).eq('squad_id', squadId).maybeSingle(),
      supabaseAdmin.from('squad_members').select('role').eq('squad_id', squadId).eq('player_id', user.id).eq('status', 'active').maybeSingle(),
    ]);
    if (!squad) return NextResponse.json({ error: 'Squad not found' }, { status: 404 });
    if (!target) return NextResponse.json({ error: 'Member not found on this squad' }, { status: 404 });

    const isStaff = !!profile && (profile.is_admin === true || profile.ctf_role === 'ctf_admin');
    const isCaptain = squad.captain_id === user.id || callerMember?.role === 'captain';
    const isCoCaptain = callerMember?.role === 'co_captain';

    if (target.role === 'captain') return NextResponse.json({ error: 'Transfer the captaincy first' }, { status: 409 });
    if (target.player_id === user.id) return NextResponse.json({ error: 'Use Leave squad for yourself' }, { status: 409 });

    if (action === 'kick') {
      const allowed = isStaff || isCaptain || (isCoCaptain && target.role === 'player');
      if (!allowed) return NextResponse.json({ error: 'Only the captain (or staff) can remove this member' }, { status: 403 });
      const { error } = await supabaseAdmin.from('squad_members').delete().eq('id', memberId);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ ok: true });
    }

    if (!(isStaff || isCaptain)) return NextResponse.json({ error: 'Only the captain (or staff) can change roles' }, { status: 403 });
    if (action === 'promote') {
      if (target.role !== 'player') return NextResponse.json({ error: 'Only players can be promoted' }, { status: 409 });
      const { error } = await supabaseAdmin.from('squad_members').update({ role: 'co_captain' }).eq('id', memberId);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ ok: true });
    }
    if (action === 'demote') {
      if (target.role !== 'co_captain') return NextResponse.json({ error: 'Only co-captains can be demoted' }, { status: 409 });
      const { error } = await supabaseAdmin.from('squad_members').update({ role: 'player' }).eq('id', memberId);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ ok: true });
    }
    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } catch (e) {
    console.error('squad members route error:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
