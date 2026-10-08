import { NextRequest, NextResponse } from 'next/server';
import { loadMatch, loadSquads, supabaseAdmin, viewerFor } from '@/lib/match-setup-server';

export const dynamic = 'force-dynamic';

/**
 * POST /api/matches/[id]/mvp { player_name: string | null }
 * League staff, a referee, or the game client (X-Client-Key, for an in-arena "*mvp <alias>" command)
 * names the match MVP (or clears it with null). The MVP is stored on the match's recorded result,
 * so the result has to exist first. The name must be someone who played in the recorded game; for a
 * result entered by hand (no game stats) anyone on either roster is accepted.
 * The reply carries `announce`, a ready-made line for the arena: who won, in how long, and the MVP.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const viewer = await viewerFor(request);
  if (!viewer.staff && !viewer.referee && !viewer.client) return NextResponse.json({ error: 'Only league staff and referees can set the MVP' }, { status: 403 });

  const match = await loadMatch(id);
  if (!match) return NextResponse.json({ error: 'Match not found' }, { status: 404 });

  const RESULT_COLS = 'id, game_id, mvp_player_name, team_a_name, team_b_name, team_a_result, team_b_result, game_length_minutes, win_type';
  const { data: results, error: resErr } = await supabaseAdmin.from('league_matches').select(RESULT_COLS).eq('fixture_id', match.id).limit(1);
  if (resErr) return NextResponse.json({ error: resErr.message }, { status: 500 });
  let result = (results as any[])?.[0];
  // A result entered before fixtures were linked is found by its game instead.
  if (!result && match.game_id) {
    const { data: byGame } = await supabaseAdmin.from('league_matches').select(RESULT_COLS).eq('game_id', match.game_id).limit(1);
    result = (byGame as any[])?.[0];
  }
  if (!result) return NextResponse.json({ error: 'This match has no recorded result yet. Record the result first, then pick the MVP.' }, { status: 409 });

  const body = await request.json().catch(() => null);
  const wanted = typeof body?.player_name === 'string' ? body.player_name.trim() : '';

  let mvp: string | null = null;
  if (wanted) {
    const names = new Set<string>();
    const gameId = result.game_id || match.game_id;
    if (gameId) {
      const { data: rows } = await supabaseAdmin.from('player_stats').select('player_name').eq('game_id', gameId).limit(500);
      ((rows || []) as any[]).forEach((r) => { if (r.player_name) names.add(r.player_name); });
    }
    if (names.size === 0 && match.squad_a_id && match.squad_b_id) {
      const squads = await loadSquads([match.squad_a_id, match.squad_b_id]);
      Object.values(squads).forEach((sq) => sq.members.forEach((m) => { if (m.alias) names.add(m.alias); }));
    }
    mvp = [...names].find((n) => n.toLowerCase() === wanted.toLowerCase()) || null;
    if (!mvp) return NextResponse.json({ error: `${wanted} did not play in this match` }, { status: 400 });
  }

  const { error } = await supabaseAdmin.from('league_matches').update({ mvp_player_name: mvp }).eq('id', result.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // The line the arena posts once the MVP is named (%30 is the in-game bong).
  const winner = /win/i.test(result.team_a_result || '') ? result.team_a_name : /win/i.test(result.team_b_result || '') ? result.team_b_name : null;
  const mins = Number(result.game_length_minutes);
  const total = Number.isFinite(mins) && mins > 0 ? Math.round(mins * 60) : 0;
  const length = total ? `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}` : null;
  const how = result.win_type === '2ot' ? 'double-overtime win' : result.win_type === 'ot' ? 'overtime win' : 'win';
  const announce = mvp
    ? `Congrats to ${winner || 'the winners'} on the ${how}${length ? ` in ${length}` : ''}! Match MVP: ${mvp} %30`
    : null;
  return NextResponse.json({ ok: true, mvp, announce });
}
