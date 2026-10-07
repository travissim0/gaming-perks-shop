import { NextRequest, NextResponse } from 'next/server';
import { hasClientKey, isPlanClass, loadMatch, loadSquads, missingLineupCol, supabaseAdmin, tagOf, type PlanClass, type PlanSide } from '@/lib/match-setup-server';

export const dynamic = 'force-dynamic';

/**
 * POST /api/matches/[id]/plan-response   (X-Client-Key: the zone)
 *   { alias, answer: 'yes' | 'no', side?: 'O' | 'D', class?: 'INF' | 'HVY' | 'SL' | 'MED' | 'ENG' | 'IFL' | 'JT' }
 *
 * A player's answer, typed in game, to the plan their captain set for them on the match page
 * (?y accepts; ?n declines, optionally suggesting a side and / or class). Stored on their
 * match_lineups row; the captain sees it next to the player. Private like the plan itself.
 * The answer stands until the captain changes what that player is asked to play.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!(await hasClientKey(request))) return NextResponse.json({ error: 'Zone client key required' }, { status: 403 });

  const body = await request.json().catch(() => null);
  const alias = typeof body?.alias === 'string' ? body.alias.trim() : '';
  const answer = body?.answer === 'yes' ? 'yes' : body?.answer === 'no' ? 'no' : null;
  if (!alias || !answer) return NextResponse.json({ error: 'alias and answer (yes / no) required' }, { status: 400 });
  const side: PlanSide | null = answer === 'no' && (body.side === 'O' || body.side === 'D') ? body.side : null;
  const cls: PlanClass | null = answer === 'no' && isPlanClass(body.class) ? body.class : null;

  const match = await loadMatch(id);
  if (!match) return NextResponse.json({ error: 'Match not found' }, { status: 404 });
  const squads = await loadSquads([match.squad_a_id, match.squad_b_id].filter(Boolean));

  // The in-game alias is the roster alias (profiles.in_game_alias); case can differ.
  let squadId: string | null = null;
  let playerId: string | null = null;
  for (const sq of Object.values(squads)) {
    const m = sq.members.find((x) => x.alias.toLowerCase() === alias.toLowerCase());
    if (m) { squadId = sq.id; playerId = m.player_id; break; }
  }
  if (!playerId || !squadId) return NextResponse.json({ error: `${alias} is not on either squad's roster` }, { status: 404 });

  const { data: row, error: readErr } = await supabaseAdmin
    .from('match_lineups')
    .select('*')
    .eq('match_id', id).eq('squad_id', squadId).eq('player_id', playerId)
    .maybeSingle();
  if (readErr) return NextResponse.json({ error: readErr.message }, { status: 500 });
  if (!row || (!row.plan_side && !row.plan_class)) return NextResponse.json({ error: 'No plan to answer for this player' }, { status: 409 });

  const { error } = await supabaseAdmin
    .from('match_lineups')
    .update({ plan_ack: answer, plan_ack_at: new Date().toISOString(), plan_suggest_side: side, plan_suggest_class: cls })
    .eq('match_id', id).eq('squad_id', squadId).eq('player_id', playerId);
  if (error) {
    const col = missingLineupCol(error.message);
    return NextResponse.json({ error: col ? 'Run add-match-plan-ack.sql in Supabase first' : error.message }, { status: col ? 503 : 500 });
  }
  return NextResponse.json({ ok: true, alias, squad_tag: tagOf(squads[squadId]), answer, side, class: cls, plan_side: row.plan_side ?? null, plan_class: row.plan_class ?? null });
}
