import { NextRequest, NextResponse } from 'next/server';
import {
  callerFrom, createKickRequest, createLeaveRequest, decideLeaveRequest, kickRequestsInstalled, requestsInstalled, squadLeague, supabaseAdmin, tableMissing,
  type LeaveRequest,
} from '@/lib/leave-requests-server';

export const dynamic = 'force-dynamic';

/**
 * Roster requests on a draft-league squad (CTFDL), where the draft sets the roster: a player asks
 * to leave, or a captain / co-captain asks for a player to be removed. League staff decide.
 *
 * GET  ?squad=<id>   signed in → { needs_request, mine, kick_needs_request, kicks }:
 *                    whether leaving goes through a request and the caller's latest one; whether
 *                    kicking does, and (for the squad's captains and staff) the kick requests waiting
 * GET                staff → { requests }: everything waiting, then the most recent decisions
 * POST  { squad_id, reason? }                           the player asks to leave
 * POST  { squad_id, kind: 'kick', player_id, reason }   a captain / co-captain asks for a removal
 * PATCH { id, action: 'approve' | 'deny', note? }       staff decide; who, when and the reason are saved
 * PATCH { id, action: 'cancel' }                        whoever sent a pending request withdraws it
 */
export async function GET(request: NextRequest) {
  const caller = await callerFrom(request);
  if (!caller) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const squadId = request.nextUrl.searchParams.get('squad');
  if (squadId) {
    const none = { needs_request: false, mine: null, kick_needs_request: false, kicks: [] as LeaveRequest[] };
    const sq = await squadLeague(squadId);
    if (!sq?.draft || !(await requestsInstalled())) return NextResponse.json(none);
    const kickOn = await kickRequestsInstalled();
    const { data } = await supabaseAdmin.from('squad_leave_requests').select('*').eq('squad_id', squadId).order('created_at', { ascending: false }).limit(200);
    const rows = (data || []) as LeaveRequest[];
    // A kick request is about the player, not from them: it never shows up as "your request".
    const mine = rows.find((r) => r.player_id === caller.id && r.kind !== 'kick') || null;
    let kicks: LeaveRequest[] = [];
    if (kickOn) {
      const { data: member } = await supabaseAdmin.from('squad_members').select('role').eq('squad_id', squadId).eq('player_id', caller.id).eq('status', 'active').maybeSingle();
      const leads = sq.captain_id === caller.id || ['captain', 'co_captain'].includes((member as any)?.role);
      // A co-captain never sees a request that is about them.
      if (leads || caller.staff) kicks = rows.filter((r) => r.kind === 'kick' && r.status === 'pending' && (caller.staff || r.player_id !== caller.id));
    }
    return NextResponse.json({ needs_request: true, mine, kick_needs_request: kickOn, kicks }, { headers: { 'Cache-Control': 'no-store' } });
  }

  if (!caller.staff) return NextResponse.json({ error: 'League staff only' }, { status: 403 });
  const [pending, decided] = await Promise.all([
    supabaseAdmin.from('squad_leave_requests').select('*').eq('status', 'pending').order('created_at', { ascending: true }),
    supabaseAdmin.from('squad_leave_requests').select('*').neq('status', 'pending').order('decided_at', { ascending: false, nullsFirst: false }).limit(50),
  ]);
  if (tableMissing(pending.error)) return NextResponse.json({ pending_sql: true, requests: [] });
  if (pending.error) return NextResponse.json({ error: pending.error.message }, { status: 500 });
  return NextResponse.json({ requests: [...((pending.data || []) as LeaveRequest[]), ...((decided.data || []) as LeaveRequest[])] }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(request: NextRequest) {
  const caller = await callerFrom(request);
  if (!caller) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const body = await request.json().catch(() => null);
  if (!body?.squad_id) return NextResponse.json({ error: 'squad_id required' }, { status: 400 });

  const sq = await squadLeague(body.squad_id);
  if (!sq) return NextResponse.json({ error: 'Squad not found' }, { status: 404 });
  if (!sq.draft || !(await requestsInstalled())) return NextResponse.json({ error: 'This squad does not use roster requests' }, { status: 409 });

  const reason = typeof body.reason === 'string' ? body.reason.trim().slice(0, 1000) : '';
  let out;
  if (body.kind === 'kick') {
    if (!body.player_id) return NextResponse.json({ error: 'player_id required' }, { status: 400 });
    if (!(await kickRequestsInstalled())) return NextResponse.json({ error: 'Kick requests are not set up yet' }, { status: 409 });
    out = await createKickRequest(caller, sq, body.player_id, reason);
  } else {
    out = await createLeaveRequest(caller, sq, reason);
  }
  if (out.error) return NextResponse.json({ error: out.error }, { status: out.status || 500 });
  return NextResponse.json({ ok: true, request: out.request });
}

export async function PATCH(request: NextRequest) {
  const caller = await callerFrom(request);
  if (!caller) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const body = await request.json().catch(() => null);
  const action = body?.action as 'approve' | 'deny' | 'cancel' | undefined;
  if (!body?.id || !action) return NextResponse.json({ error: 'id and action required' }, { status: 400 });

  if (action === 'cancel') {
    // The sender withdraws: the player for a leave request, the captain who asked for a kick request.
    const { data: row } = await supabaseAdmin.from('squad_leave_requests').select('*').eq('id', body.id).eq('status', 'pending').maybeSingle();
    const req = row as LeaveRequest | null;
    const sender = req ? (req.kind === 'kick' ? req.requested_by : req.player_id) : null;
    if (!req || sender !== caller.id) return NextResponse.json({ error: 'No pending request of yours to withdraw' }, { status: 404 });
    const { data, error } = await supabaseAdmin
      .from('squad_leave_requests')
      .update({ status: 'cancelled', decided_by: caller.id, decided_by_alias: caller.alias, decided_at: new Date().toISOString() })
      .eq('id', body.id)
      .eq('status', 'pending')
      .select('*')
      .maybeSingle();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!data) return NextResponse.json({ error: 'That request has just been decided' }, { status: 409 });
    return NextResponse.json({ ok: true, request: data });
  }

  if (action !== 'approve' && action !== 'deny') return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  if (!caller.staff) return NextResponse.json({ error: 'Only league staff can approve or deny a request' }, { status: 403 });
  const note = typeof body.note === 'string' ? body.note.trim().slice(0, 1000) : '';
  const out = await decideLeaveRequest(caller, body.id, action === 'approve', note);
  if (out.error) return NextResponse.json({ error: out.error }, { status: out.status || 500 });
  return NextResponse.json({ ok: true, request: out.request });
}
