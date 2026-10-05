import { NextRequest, NextResponse } from 'next/server';
import {
  callerFrom, createLeaveRequest, decideLeaveRequest, requestsInstalled, squadLeague, supabaseAdmin, tableMissing,
  type LeaveRequest,
} from '@/lib/leave-requests-server';

export const dynamic = 'force-dynamic';

/**
 * Requests to leave a draft-league squad (CTFDL). The player asks, league staff decide.
 *
 * GET  ?squad=<id>   signed in → { needs_request, mine }: whether leaving this squad goes through a
 *                    request, and the caller's latest request for it (pending, or the last decision)
 * GET                staff → { requests }: everything waiting, then the most recent decisions
 * POST  { squad_id, reason? }                  the player sends a request (staff are notified)
 * PATCH { id, action: 'approve' | 'deny', note? }   staff decide; who, when and the reason are saved
 * PATCH { id, action: 'cancel' }                    the player withdraws their own pending request
 */
export async function GET(request: NextRequest) {
  const caller = await callerFrom(request);
  if (!caller) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const squadId = request.nextUrl.searchParams.get('squad');
  if (squadId) {
    const sq = await squadLeague(squadId);
    if (!sq?.draft || !(await requestsInstalled())) return NextResponse.json({ needs_request: false, mine: null });
    const { data } = await supabaseAdmin.from('squad_leave_requests').select('*').eq('squad_id', squadId).eq('player_id', caller.id).order('created_at', { ascending: false }).limit(1);
    return NextResponse.json({ needs_request: true, mine: ((data || []) as LeaveRequest[])[0] || null }, { headers: { 'Cache-Control': 'no-store' } });
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
  if (!sq.draft || !(await requestsInstalled())) return NextResponse.json({ error: 'This squad does not use leave requests' }, { status: 409 });

  const reason = typeof body.reason === 'string' ? body.reason.trim().slice(0, 1000) : '';
  const out = await createLeaveRequest(caller, sq, reason);
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
    const { data, error } = await supabaseAdmin
      .from('squad_leave_requests')
      .update({ status: 'cancelled', decided_by: caller.id, decided_by_alias: caller.alias, decided_at: new Date().toISOString() })
      .eq('id', body.id)
      .eq('player_id', caller.id)
      .eq('status', 'pending')
      .select('*')
      .maybeSingle();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!data) return NextResponse.json({ error: 'No pending request of yours to withdraw' }, { status: 404 });
    return NextResponse.json({ ok: true, request: data });
  }

  if (action !== 'approve' && action !== 'deny') return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  if (!caller.staff) return NextResponse.json({ error: 'Only league staff can approve or deny a leave request' }, { status: 403 });
  const note = typeof body.note === 'string' ? body.note.trim().slice(0, 1000) : '';
  const out = await decideLeaveRequest(caller, body.id, action === 'approve', note);
  if (out.error) return NextResponse.json({ error: out.error }, { status: out.status || 500 });
  return NextResponse.json({ ok: true, request: out.request });
}
