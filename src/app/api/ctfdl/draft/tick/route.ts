import { NextRequest, NextResponse } from 'next/server';
import { resolveDraft, loadBoard, loadQueue, loadStateShared, makePick, postSystemMessage } from '@/lib/ctfdl-draft-server';
import { autoPickCandidate, secondsLeft, teamIndexForPick, teamOnClock } from '@/lib/ctfdl-draft';

export const dynamic = 'force-dynamic';

/** Auto-picks being worked out on this server instance right now, by draft + pick number. */
const working = new Set<string>();

/**
 * POST /api/ctfdl/draft/tick { draft_id }
 * Any open lobby calls this when it sees the clock hit zero. The server
 * re-checks the deadline itself, so a client can't force an early pick.
 * Many lobbies call at once: the first one does the work, and the pick is made
 * for the pick number that expired, so a late caller can never land an
 * auto-pick on the next team (the pick function refuses a stale pick number).
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

  const key = `${draft.id}:${draft.current_pick}`;
  if (working.has(key)) return NextResponse.json({ ok: true, acted: false, reason: 'already being picked' });
  working.add(key);
  try {
    const board = await loadBoard(draft);
    const team = teamOnClock(draft, board.teams);
    if (!team) return NextResponse.json({ ok: true, acted: false });

    const queue = await loadQueue(draft.id, team.id);
    const candidate = autoPickCandidate(board.players, queue);
    if (!candidate) return NextResponse.json({ ok: true, acted: false, reason: 'nobody left' });

    try {
      const result = await makePick(draft.id, candidate.player_id, 'auto', null, draft.current_pick);
      const sorted = [...board.teams].sort((a, b) => a.pick_order - b.pick_order);
      const next = result?.complete ? null : sorted[teamIndexForPick(draft.current_pick + 1, sorted.length, draft.order_type)] || null;
      await postSystemMessage(
        draft.id,
        `#${result?.overall ?? '?'} Clock expired — auto-picked ${candidate.alias} for ${team.squad_name}${queue.includes(candidate.player_id) ? ' (from their queue)' : candidate.staff_rank != null ? ' (Staff ADP)' : ' (best self-rating)'}.${result?.complete ? ' Draft complete.' : next ? ` ${next.squad_name} is on the clock.` : ''}`,
      );
      return NextResponse.json({ ok: true, acted: true, result, state: await loadStateShared(draft.id) });
    } catch (e: any) {
      // Most likely another lobby ticked first and the turn already advanced.
      return NextResponse.json({ ok: true, acted: false, reason: e.message });
    }
  } finally {
    working.delete(key);
  }
}
