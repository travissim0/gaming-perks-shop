import { NextRequest, NextResponse } from 'next/server';
import { hasClientKey, isSubWindow, leads, loadMatch, loadSquads, subLine, tagOf } from '@/lib/match-setup-server';
import { makeSub, revertSub } from '@/lib/match-subs-server';

export const dynamic = 'force-dynamic';

/**
 * POST /api/matches/[id]/sub   (X-Client-Key: the zone)
 *
 *   { alias, in_alias, out_alias }
 *     A captain's ?sub in:out typed in the match arena. `alias` (the zone vouches for it) must be that
 *     squad's captain or co-captain; both players must be on the same squad's roster; same rules as a
 *     sub on the match page (out is starting, sub window open, FS Green). The zone checks first that
 *     the player going out is dead, on the dropship or not playing.
 *
 *   { revert_sub_id }
 *     Undo a sub the arena could not make (the player going out had a flag). The zone then tells the
 *     captains to redo it with ?sub when that player is dead or on the dropship.
 *
 * Replies { ok, message } — `message` is the arena line ("KEVI (Kev) OUT: anjro --- IN: Soup"),
 * or { error } to show the captain.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!(await hasClientKey(request))) return NextResponse.json({ error: 'Zone client key required' }, { status: 403 });

  const body = await request.json().catch(() => null);
  const match = await loadMatch(id);
  if (!match) return NextResponse.json({ error: 'Match not found' }, { status: 404 });
  if (!match.squad_a_id || !match.squad_b_id) return NextResponse.json({ error: 'Both teams must be set on the match first' }, { status: 409 });
  const squads = await loadSquads([match.squad_a_id, match.squad_b_id]);

  if (typeof body?.revert_sub_id === 'string' && body.revert_sub_id) {
    const undone = await revertSub(id, squads, body.revert_sub_id);
    if ('error' in undone) return NextResponse.json({ error: undone.error }, { status: undone.status });
    return NextResponse.json({ ok: true, reverted: true, out: undone.out, in: undone.in });
  }

  const alias = typeof body?.alias === 'string' ? body.alias.trim().toLowerCase() : '';
  const inAlias = typeof body?.in_alias === 'string' ? body.in_alias.trim().toLowerCase() : '';
  const outAlias = typeof body?.out_alias === 'string' ? body.out_alias.trim().toLowerCase() : '';
  if (!alias || !inAlias || !outAlias) return NextResponse.json({ error: 'Usage: ?sub playerIn:playerOut' }, { status: 400 });
  if (!isSubWindow(match)) return NextResponse.json({ error: 'Subs are not open for this match' }, { status: 409 });

  // The squad this captain leads (in-game alias = roster alias; case can differ).
  const sq = Object.values(squads).find((s) => {
    const me = s.members.find((m) => m.alias.toLowerCase() === alias);
    return !!me && leads(s, me.player_id);
  });
  if (!sq) return NextResponse.json({ error: 'Only a captain or co-captain of a team in this match can sub' }, { status: 403 });
  const find = (a: string) => sq.members.find((m) => m.alias.toLowerCase() === a);
  const me = find(alias)!, inM = find(inAlias), outM = find(outAlias);
  if (!inM) return NextResponse.json({ error: `${body.in_alias} is not on ${tagOf(sq)}'s roster` }, { status: 400 });
  if (!outM) return NextResponse.json({ error: `${body.out_alias} is not on ${tagOf(sq)}'s roster` }, { status: 400 });

  const done = await makeSub(match, squads, sq, outM.player_id, inM.player_id, me.player_id);
  if ('error' in done) return NextResponse.json({ error: done.error }, { status: done.status });
  return NextResponse.json({ ok: true, message: subLine(tagOf(sq), me.alias, done.out, done.in) });
}
