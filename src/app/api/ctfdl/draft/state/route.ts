import { NextRequest, NextResponse } from 'next/server';
import { loadStateShared } from '@/lib/ctfdl-draft-server';
import { stateSince } from '@/lib/ctfdl-draft';

export const dynamic = 'force-dynamic';

/**
 * GET /api/ctfdl/draft/state?draft=<id>[&v=<ms>][&after=<n>&last=<pick id prefix>]
 * What the draft room polls while a draft runs: the draft row (status, pick number, clock), the picks
 * the viewer doesn't have yet, and which captains/staff are checked in. Under a kB instead of the
 * whole board, the same for every viewer on the same pick, and shared for a second, so a full room
 * costs about the same as one viewer.
 *
 * `v` is the newest change the viewer knows about (the draft row's updated_at in ms). Viewers on the
 * same pick send the same `v`, so they share one cached answer; a viewer who has just been told about
 * a newer change sends that, which gets a copy at least that new.
 */
export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams;
  const draftId = q.get('draft');
  if (!draftId) return NextResponse.json({ error: 'draft required' }, { status: 400 });
  const v = Number(q.get('v'));
  const state = await loadStateShared(draftId, Number.isFinite(v) && v > 0 ? v : 0);
  // `after` + `last`: the picks the viewer already holds, so only the new ones are sent.
  const body = stateSince(state, Number(q.get('after')), q.get('last') || '');
  return NextResponse.json(body, { headers: { 'Cache-Control': 'public, max-age=0, s-maxage=1' } });
}
