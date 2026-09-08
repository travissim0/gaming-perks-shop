import { NextRequest, NextResponse } from 'next/server';
import { userFromRequest, isStaff, resolveDraft, loadTeams, loadBundle, makePick, postSystemMessage } from '@/lib/ctfdl-draft-server';
import { teamOnClock } from '@/lib/ctfdl-draft';

export const dynamic = 'force-dynamic';

/**
 * POST /api/ctfdl/draft/pick { draft_id, player_id }
 * The captain on the clock picks for their own team; staff can pick for
 * whichever team is on the clock. Turn order and eligibility are enforced
 * again inside the ctfdl_draft_make_pick function.
 */
export async function POST(request: NextRequest) {
  const user = await userFromRequest(request);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json().catch(() => null);
  if (!body?.draft_id || !body?.player_id) return NextResponse.json({ error: 'draft_id and player_id required' }, { status: 400 });

  const draft = await resolveDraft(body.draft_id);
  if (!draft) return NextResponse.json({ error: 'Draft not found' }, { status: 404 });
  if (draft.status !== 'live') return NextResponse.json({ error: 'Draft is not live' }, { status: 409 });

  const teams = await loadTeams(draft.id);
  const onClock = teamOnClock(draft, teams);
  if (!onClock) return NextResponse.json({ error: 'No team is on the clock' }, { status: 409 });

  const staff = await isStaff(user.id);
  const isCaptain = onClock.captain_id === user.id;
  if (!staff && !isCaptain) {
    return NextResponse.json({ error: `It's ${onClock.squad_name}'s pick` }, { status: 403 });
  }

  try {
    const result = await makePick(draft.id, body.player_id, isCaptain ? 'captain' : 'staff', user.id);
    const bundle = await loadBundle(await resolveDraft(draft.id), user.id);
    const who = bundle.players.find((p) => p.player_id === body.player_id)?.alias || 'a player';
    const next = teamOnClock(bundle.draft, bundle.teams);
    await postSystemMessage(
      draft.id,
      `#${result?.overall ?? '?'} ${onClock.squad_name} picked ${who}${isCaptain ? '' : ' (staff)'}.${result?.complete ? ' Draft complete.' : next ? ` ${next.squad_name} is on the clock.` : ''}`,
    );
    return NextResponse.json({ ok: true, result, bundle });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Pick failed' }, { status: 409 });
  }
}
