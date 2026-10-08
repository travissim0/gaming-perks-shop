import { greenBlockedFor, missingTable, supabaseAdmin, type Squad } from '@/lib/match-setup-server';

/**
 * Subs during a match, shared by the match page (/api/matches/[id]/setup, action 'sub') and the zone
 * (/api/matches/[id]/sub: a captain's ?sub in game, and undoing a sub the arena could not make).
 * Who may make the sub is checked by the caller; these check the players and do the swap.
 */

type Fail = { error: string; status: number };
export type SubDone = { out: string; in: string };

const aliasIn = (sq: Squad, pid: string) => sq.members.find((m) => m.player_id === pid)?.alias || 'Unknown';

/** In takes the outgoing player's starting spot; out goes to the bench (in's old spot, or the end). Logged. */
export async function makeSub(
  match: any, squads: Record<string, Squad>, sq: Squad, outId: string, inId: string, byId: string | null,
): Promise<SubDone | Fail> {
  if (!outId || !inId || outId === inId) return { error: 'Pick who comes out and who goes in', status: 400 };
  const roster = new Set(sq.members.map((m) => m.player_id));
  if (!roster.has(inId)) return { error: 'The player coming in must be on the squad roster', status: 400 };
  // FS Green: a round 1-3 pick can't be subbed in either (the match would score as Red).
  const green = await greenBlockedFor(match, squads);
  if (green?.blocked.has(inId)) {
    return { error: `This is an FS Green match: ${aliasIn(sq, inId)} was drafted in rounds 1–${green.minRound - 1} and can't be subbed in. Only the captain and round ${green.minRound}+ picks play.`, status: 400 };
  }

  const now = new Date().toISOString();
  const { data: rows, error: rowsErr } = await supabaseAdmin.from('match_lineups').select('id, player_id, slot, position').eq('match_id', match.id).eq('squad_id', sq.id);
  if (rowsErr) return { error: rowsErr.message, status: 500 };
  const outRow = (rows || []).find((r: any) => r.player_id === outId);
  const inRow = (rows || []).find((r: any) => r.player_id === inId);
  if (!outRow || outRow.slot !== 'starting') return { error: 'The player coming out must be in the starting lineup', status: 400 };
  if (inRow?.slot === 'starting') return { error: `${aliasIn(sq, inId)} is already starting`, status: 400 };

  const benchPos = inRow ? inRow.position : Math.max(-1, ...(rows || []).filter((r: any) => r.slot === 'bench').map((r: any) => r.position)) + 1;
  const up1 = inRow
    ? supabaseAdmin.from('match_lineups').update({ slot: 'starting', position: outRow.position, set_by: byId, updated_at: now }).eq('id', inRow.id)
    : supabaseAdmin.from('match_lineups').insert({ match_id: match.id, squad_id: sq.id, player_id: inId, slot: 'starting', position: outRow.position, set_by: byId, updated_at: now });
  const { error: e1 } = await up1;
  if (e1) return { error: e1.message, status: 500 };
  const { error: e2 } = await supabaseAdmin.from('match_lineups').update({ slot: 'bench', position: benchPos, set_by: byId, updated_at: now }).eq('id', outRow.id);
  if (e2) return { error: e2.message, status: 500 };
  const { error: e3 } = await supabaseAdmin.from('match_lineup_subs').insert({ match_id: match.id, squad_id: sq.id, out_player_id: outId, in_player_id: inId, by_id: byId });
  if (e3 && !missingTable(e3.message)) return { error: e3.message, status: 500 };
  if (e3) console.warn('match_lineup_subs missing (add-match-subs.sql): sub applied but not logged');
  return { out: aliasIn(sq, outId), in: aliasIn(sq, inId) };
}

/**
 * Undoes a logged sub the arena could not make (the player going out had a flag): the two players swap
 * back and the log row is removed, so the match page shows the lineup the arena actually has. Refused
 * when the lineup has moved on since (either player has been subbed again).
 */
export async function revertSub(matchId: string, squads: Record<string, Squad>, subId: string): Promise<SubDone | Fail> {
  const { data: sub, error } = await supabaseAdmin.from('match_lineup_subs').select('id, squad_id, out_player_id, in_player_id').eq('match_id', matchId).eq('id', subId).maybeSingle();
  if (error) return { error: error.message, status: 500 };
  if (!sub) return { error: 'Sub not found (already undone?)', status: 404 };
  const sq = squads[sub.squad_id];
  if (!sq) return { error: 'Sub is for a squad not in this match', status: 409 };

  const { data: rows, error: rowsErr } = await supabaseAdmin.from('match_lineups').select('id, player_id, slot, position').eq('match_id', matchId).eq('squad_id', sq.id).in('player_id', [sub.out_player_id, sub.in_player_id]);
  if (rowsErr) return { error: rowsErr.message, status: 500 };
  const outRow = (rows || []).find((r: any) => r.player_id === sub.out_player_id);
  const inRow = (rows || []).find((r: any) => r.player_id === sub.in_player_id);
  if (!outRow || !inRow || outRow.slot !== 'bench' || inRow.slot !== 'starting') {
    return { error: 'The lineup has changed since that sub; leaving it as it is', status: 409 };
  }

  const now = new Date().toISOString();
  const { error: e1 } = await supabaseAdmin.from('match_lineups').update({ slot: 'starting', position: inRow.position, updated_at: now }).eq('id', outRow.id);
  if (e1) return { error: e1.message, status: 500 };
  const { error: e2 } = await supabaseAdmin.from('match_lineups').update({ slot: 'bench', position: outRow.position, updated_at: now }).eq('id', inRow.id);
  if (e2) return { error: e2.message, status: 500 };
  const { error: e3 } = await supabaseAdmin.from('match_lineup_subs').delete().eq('id', sub.id);
  if (e3) return { error: e3.message, status: 500 };
  return { out: aliasIn(sq, sub.out_player_id), in: aliasIn(sq, sub.in_player_id) };
}
