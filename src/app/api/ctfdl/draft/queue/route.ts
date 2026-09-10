import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, userFromRequest, resolveDraft, loadTeams, loadQueue } from '@/lib/ctfdl-draft-server';
import { leadsTeam } from '@/lib/ctfdl-draft';

export const dynamic = 'force-dynamic';

/**
 * A captain's private pre-draft wishlist (drives their auto-pick).
 * GET  /api/ctfdl/draft/queue?draft=<id>            → { team_id, player_ids }
 * PUT  /api/ctfdl/draft/queue { draft_id, player_ids } (ordered)
 * Only the captain of a participating team can read/write their own queue.
 */
async function myTeam(request: NextRequest, draftId: string) {
  const user = await userFromRequest(request);
  if (!user) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  const draft = await resolveDraft(draftId);
  if (!draft) return { error: NextResponse.json({ error: 'Draft not found' }, { status: 404 }) };
  const team = (await loadTeams(draft.id)).find((t) => leadsTeam(t, user.id));
  if (!team) return { error: NextResponse.json({ error: 'You are not a captain or co-captain in this draft' }, { status: 403 }) };
  return { user, draft, team };
}

export async function GET(request: NextRequest) {
  const draftId = request.nextUrl.searchParams.get('draft');
  if (!draftId) return NextResponse.json({ error: 'draft required' }, { status: 400 });
  const r = await myTeam(request, draftId);
  if ('error' in r) return r.error;
  return NextResponse.json({ team_id: r.team.id, player_ids: await loadQueue(r.draft.id, r.team.id) });
}

export async function PUT(request: NextRequest) {
  const body = await request.json().catch(() => null);
  if (!body?.draft_id) return NextResponse.json({ error: 'draft_id required' }, { status: 400 });
  const r = await myTeam(request, body.draft_id);
  if ('error' in r) return r.error;
  if (r.draft.status === 'complete') return NextResponse.json({ error: 'Draft is complete' }, { status: 409 });

  const playerIds: string[] = Array.isArray(body.player_ids) ? Array.from(new Set(body.player_ids.filter(Boolean))) : [];
  const { error: delErr } = await supabaseAdmin.from('ctfdl_draft_queues').delete().eq('draft_id', r.draft.id).eq('team_id', r.team.id);
  if (delErr) return NextResponse.json({ error: delErr.message }, { status: 500 });
  if (playerIds.length > 0) {
    const { error } = await supabaseAdmin
      .from('ctfdl_draft_queues')
      .insert(playerIds.map((player_id, i) => ({ draft_id: r.draft.id, team_id: r.team.id, player_id, rank: i + 1 })));
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true, team_id: r.team.id, player_ids: playerIds });
}
