import { NextRequest, NextResponse } from 'next/server';
import { resolveDraft, loadBundle, loadQueue, makePick } from '@/lib/ctfdl-draft-server';
import { autoPickCandidate, secondsLeft, teamOnClock } from '@/lib/ctfdl-draft';

export const dynamic = 'force-dynamic';

/**
 * POST /api/ctfdl/draft/tick { draft_id }
 * Any open lobby calls this when it sees the clock hit zero. The server
 * re-checks the deadline itself, so a client can't force an early pick, and
 * concurrent calls are harmless: the pick function locks the draft row and
 * the second caller finds the turn already advanced.
 */
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  if (!body?.draft_id) return NextResponse.json({ error: 'draft_id required' }, { status: 400 });

  const draft = await resolveDraft(body.draft_id);
  if (!draft) return NextResponse.json({ error: 'Draft not found' }, { status: 404 });
  if (draft.status !== 'live' || draft.pick_seconds == null) return NextResponse.json({ ok: true, acted: false });

  const left = secondsLeft(draft, Date.now());
  if (left == null || left > 0) return NextResponse.json({ ok: true, acted: false, seconds_left: left });
  if (!draft.auto_pick) return NextResponse.json({ ok: true, acted: false, expired: true });

  const bundle = await loadBundle(draft, null);
  const team = teamOnClock(draft, bundle.teams);
  if (!team) return NextResponse.json({ ok: true, acted: false });

  const queue = await loadQueue(draft.id, team.id);
  const candidate = autoPickCandidate(bundle.players, queue);
  if (!candidate) return NextResponse.json({ ok: true, acted: false, reason: 'nobody left' });

  try {
    const result = await makePick(draft.id, candidate.player_id, 'auto', null);
    return NextResponse.json({ ok: true, acted: true, result });
  } catch (e: any) {
    // Most likely another lobby ticked first and the turn already advanced.
    return NextResponse.json({ ok: true, acted: false, reason: e.message });
  }
}
