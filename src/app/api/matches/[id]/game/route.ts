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
 *                aborted game that will be replayed. The site enforces both halves itself: a
 *                game with no winner, or one that started more than ten minutes before the
 *                scheduled kick-off (a warm-up), is refused and the match is put back to waiting.
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

  if (status === 'played') {
    // The zone's stat rows may land a moment after the game ends; the zone can call again.
    const result = await autoRecordFromGame({ ...match, game_id: gameId }, gameId);
    if (result.warmup || result.aborted) {
      // Not the match: a game that started well before kick-off (the warm-up the arena's timer
      // ends), or one that ended with no winner (restarted or abandoned before a team held the
      // flags). Put the match back to waiting so the real game's reports are accepted and its
      // stats are the ones linked.
      const { error: resetErr } = await supabaseAdmin.from('matches')
        .update({ status: 'scheduled', game_id: null, actual_start_time: null, actual_end_time: null })
        .eq('id', id);
      if (resetErr) return NextResponse.json({ error: resetErr.message }, { status: 500 });
      return NextResponse.json({ ok: true, ignored: result.warmup ? 'warm-up game, not the match' : 'game had no winner, not the match', match_id: id, game_id: gameId, status: 'scheduled', result });
    }
    if (!result.recorded) {
      // Not recorded yet (stat rows still landing, no winner, …): note the game and that it ended.
      const { error } = await supabaseAdmin.from('matches').update({ game_id: gameId, actual_end_time: new Date().toISOString() }).eq('id', id);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ ok: true, match_id: id, game_id: gameId, status: result.recorded ? 'completed' : match.status, result });
  }

  const patch: Record<string, any> = { game_id: gameId };
  if (match.status === 'scheduled') { patch.status = 'in_progress'; patch.actual_start_time = new Date().toISOString(); }
  const { error } = await supabaseAdmin.from('matches').update(patch).eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, match_id: id, game_id: gameId, status: patch.status || match.status });
}
