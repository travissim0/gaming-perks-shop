import { NextRequest, NextResponse } from 'next/server';
import { viewerFor } from '@/lib/match-setup-server';
import { decideTime, isTimeError, loadTimeState, proposeTime } from '@/lib/match-time-server';

export const dynamic = 'force-dynamic';

/**
 * Captains agree a league match's kick-off time (src/lib/match-time-server.ts).
 *
 * GET  /api/matches/[id]/time                      anyone → the open proposal, history, and what the viewer may do
 * POST /api/matches/[id]/time { action: 'propose', at, note?, squad_id? }
 *        captain/co-captain of either squad; staff pass squad_id for the side they act for
 * POST /api/matches/[id]/time { action: 'accept' | 'decline', note? }   the other squad's leads, or staff
 * POST /api/matches/[id]/time { action: 'withdraw' }                     the proposing squad's leads, or staff
 */

const fail = (e: unknown) => {
  if (isTimeError(e)) return NextResponse.json({ error: e.message }, { status: e.status });
  console.error('match time failed', e);
  return NextResponse.json({ error: 'Something went wrong' }, { status: 500 });
};

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const viewer = await viewerFor(request);
  try {
    return NextResponse.json(await loadTimeState(id, viewer), { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    return fail(e);
  }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const viewer = await viewerFor(request);
  if (!viewer.id) return NextResponse.json({ error: 'Sign in first' }, { status: 401 });
  const body = await request.json().catch(() => ({}));
  const action = String(body?.action || '');
  const note = typeof body?.note === 'string' ? body.note.trim().slice(0, 300) || null : null;
  try {
    if (action === 'propose') return NextResponse.json(await proposeTime(id, viewer, String(body?.at || ''), note, body?.squad_id ? String(body.squad_id) : null));
    if (action === 'accept' || action === 'decline' || action === 'withdraw') return NextResponse.json(await decideTime(id, viewer, action, note));
    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } catch (e) {
    return fail(e);
  }
}
