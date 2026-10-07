import { NextRequest, NextResponse } from 'next/server';
import { callerFrom } from '@/lib/leave-requests-server';
import {
  adminDecideTrade, cancelTrade, loadTrades, proposeTrade, respondToTrade, squadLedBy, supabaseAdmin, tradeContext, tradesInstalled, voteOnTrade,
} from '@/lib/trades-server';

export const dynamic = 'force-dynamic';

/**
 * Squad trades (draft leagues: CTFDL).
 * GET                                     anyone → { context, trades, rosters, me }: the season's squads
 *                                          and their rosters, the deadline and blackout, every trade,
 *                                          and (signed in) which squad the caller leads / staff flag
 * POST  { squad_ids, players: [{ player_id, to_squad_id }], note? }   a captain / co-captain proposes
 * PATCH { id, action: 'accept' | 'decline' }          a squad in the trade answers
 * PATCH { id, action: 'cancel' }                      a squad in the trade (or staff) withdraws it
 * PATCH { id, action: 'approve' | 'appeal', note? }   a squad outside the trade votes during the window
 * PATCH { id, action: 'admin_approve' | 'admin_deny', note? }   league staff decide
 */
export async function GET(request: NextRequest) {
  if (!(await tradesInstalled())) return NextResponse.json({ pending_sql: true, context: null, trades: [], me: null });
  const [context, caller] = await Promise.all([tradeContext(), callerFrom(request)]);
  const trades = await loadTrades({ season: context.season_number });
  // Rosters, so a captain can pick who moves. Squad membership is public on the site already.
  const { data: members } = await supabaseAdmin.from('squad_members').select('squad_id, player_id, role, profiles!squad_members_player_id_fkey(in_game_alias)').in('squad_id', context.squads.map((s) => s.id)).eq('status', 'active');
  const rosters: Record<string, { player_id: string; alias: string; role: string }[]> = {};
  for (const m of (members || []) as any[]) (rosters[m.squad_id] ||= []).push({ player_id: m.player_id, alias: m.profiles?.in_game_alias || 'Unknown', role: m.role });
  for (const list of Object.values(rosters)) list.sort((a, b) => (a.role === 'captain' ? -1 : b.role === 'captain' ? 1 : a.alias.localeCompare(b.alias)));
  const mine = caller ? await squadLedBy(caller.id, context.squads) : null;
  const me = caller ? { user_id: caller.id, alias: caller.alias, staff: caller.staff, squad_id: mine?.id || null } : null;
  return NextResponse.json({ context, trades, rosters, me }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(request: NextRequest) {
  const caller = await callerFrom(request);
  if (!caller) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!(await tradesInstalled())) return NextResponse.json({ error: 'Trades are not set up yet' }, { status: 409 });
  const body = await request.json().catch(() => null);
  const out = await proposeTrade(caller, { squad_ids: Array.isArray(body?.squad_ids) ? body.squad_ids : [], players: Array.isArray(body?.players) ? body.players : [], note: typeof body?.note === 'string' ? body.note : '' });
  if (out.error) return NextResponse.json({ error: out.error }, { status: out.status || 500 });
  return NextResponse.json({ ok: true, trade: out.trade });
}

export async function PATCH(request: NextRequest) {
  const caller = await callerFrom(request);
  if (!caller) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const body = await request.json().catch(() => null);
  const id = body?.id as string | undefined;
  const action = body?.action as string | undefined;
  if (!id || !action) return NextResponse.json({ error: 'id and action required' }, { status: 400 });
  const note = typeof body.note === 'string' ? body.note.trim().slice(0, 1000) : '';

  let out;
  if (action === 'accept' || action === 'decline') out = await respondToTrade(caller, id, action === 'accept');
  else if (action === 'cancel') out = await cancelTrade(caller, id);
  else if (action === 'approve' || action === 'appeal') out = await voteOnTrade(caller, id, action, note);
  else if (action === 'admin_approve' || action === 'admin_deny') {
    if (!caller.staff) return NextResponse.json({ error: 'League staff only' }, { status: 403 });
    out = await adminDecideTrade(caller, id, action === 'admin_approve', note);
  } else return NextResponse.json({ error: 'Unknown action' }, { status: 400 });

  if (out.error && out.status !== 202) return NextResponse.json({ error: out.error }, { status: out.status || 500 });
  return NextResponse.json({ ok: true, trade: out.trade, notice: out.status === 202 ? out.error : undefined });
}
