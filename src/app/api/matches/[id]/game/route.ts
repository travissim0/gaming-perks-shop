import { NextRequest, NextResponse } from 'next/server';
import { loadMatch, supabaseAdmin, viewerFor } from '@/lib/match-setup-server';
import { autoRecordFromGame } from '@/lib/match-result-server';

export const dynamic = 'force-dynamic';

/**
 * POST /api/matches/[id]/game — the zone reports the game it ran for a match.
 * Header `X-Client-Key` (or staff Bearer).  Body: { game_id, status?: 'in_progress' | 'played' }
 *
 *   in_progress  the arena's game has started: match goes live, game id noted
 *   played       the game ended: game id linked so the match page shows its stats, and the
 *                result is recorded from the game (winner + length → win type under the
 *                season's rules), standings rebuilt. Staff can remove/re-enter it in the
 *                match manager if the game got it wrong. The reply says what happened.
 *                Only report 'played' for a game that has a winner: a no-winner game is an
 *                aborted game that will be replayed.
 *   After a 'played' report, further 'in_progress' reports are ignored (the arena auto-starting
 *   its next game is not part of the match). Re-sending 'played' for the same game is fine.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const viewer = await viewerFor(request);
  if (!viewer.client && !viewer.staff) return NextResponse.json({ error: 'Client key or staff token required' }, { status: 403 });

  const body = await request.json().catch(() => null);
  const gameId = String(body?.game_id || '').trim();
  const status = body?.status === 'played' ? 'played' : 'in_progress';
  if (!gameId) return NextResponse.json({ error: 'game_id is required' }, { status: 400 });

  const match = await loadMatch(id);
  if (!match) return NextResponse.json({ error: 'Match not found' }, { status: 404 });
  if (['completed', 'cancelled'].includes(match.status)) return NextResponse.json({ ok: true, ignored: `match is ${match.status}` });
  // Once a game has been reported over, the arena's next auto-started game must not take over the
  // match: its start report would overwrite game_id and lose the game that decided it (first live
  // test, 2026-09-27). A repeated 'played' call (stat rows landing late) is still accepted, and
  // staff removing the result clears actual_end_time, which reopens the match for a replay.
  if (status === 'in_progress' && match.actual_end_time) {
    return NextResponse.json({ ok: true, ignored: 'match already reported over; later games in the arena are not this match', game_id: match.game_id });
  }

  const patch: Record<string, any> = { game_id: gameId };
  if (status === 'in_progress' && match.status === 'scheduled') { patch.status = 'in_progress'; patch.actual_start_time = new Date().toISOString(); }
  if (status === 'played') patch.actual_end_time = new Date().toISOString();

  const { error } = await supabaseAdmin.from('matches').update(patch).eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  if (status === 'played') {
    // The zone's stat rows may land a moment after the game ends; the zone can call again.
    const result = await autoRecordFromGame({ ...match, game_id: gameId }, gameId);
    return NextResponse.json({ ok: true, match_id: id, game_id: gameId, status: result.recorded ? 'completed' : match.status, result });
  }
  return NextResponse.json({ ok: true, match_id: id, game_id: gameId, status: patch.status || match.status });
}
