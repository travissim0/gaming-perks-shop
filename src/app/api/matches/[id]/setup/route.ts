import { NextRequest, NextResponse } from 'next/server';
import {
  STARTERS, greenBlockedFor, isLocked, isSubWindow, leads, loadAll, loadMatch, loadSquads, missingTable, missingLineupCol, supabaseAdmin, viewerFor,
  PLAN_LABEL, SQL_FOR_COL, isPlanClass, type PlanClass, type PlanSide, type TenMan,
} from '@/lib/match-setup-server';

export const dynamic = 'force-dynamic';

/**
 * Match setup: the home team's side and both teams' lineups. PRIVATE.
 * Visibility and shapes: src/lib/match-setup-server.ts.
 *
 * GET  /api/matches/[id]/setup
 * POST /api/matches/[id]/setup  (Bearer)
 *   { action: 'set_side', side: 'titan' | 'collective' | null }   home captain/co-captain or staff
 *   { action: 'set_lineup', squad_id, starting: [player_id], bench: [player_id], ten_man?: { [player_id]: 'in' | 'out' } }
 *         that squad's captain/co-captain or staff (max 10 starters). ten_man is the 10-man plan:
 *         'out' = steps out when they go 10-man, 'in' = comes in for them (usually the infil).
 *         plan_side?: { [player_id]: 'O' | 'D' } is the captain's offense / defense arrangement:
 *         a planning aid, private like the lineup, never read by the zone.
 *         plan_class?: { [player_id]: 'INF' | 'HVY' | 'SL' | 'MED' | 'ENG' | 'IFL' | 'JT' } is the class the
 *         captain plans each player on. Same rules as plan_side.
 *   { action: 'sub', squad_id, out_player_id, in_player_id }   that squad's captain/co-captain, staff or a referee;
 *         from side release until the result is recorded. Swaps the two slots and logs it.
 *   { action: 'swap_home' }   staff — swaps squad_a/squad_b so the other team is home (clears the side)
 *   { action: 'set_match_chat', chat: string }   staff or a referee — the in-game chat for this match's captains
 *         and referees; readable only by staff, referees and the two squads' captains / co-captains
 *   { action: 'set_manual_zone', manual: boolean }   staff or a referee — take this match out of (or put it back in) the zone queue
 *
 * Home team = squad_a. Captains can edit until the scheduled time; staff always.
 */

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const viewer = await viewerFor(request);
    const payload = await loadAll(id, viewer);
    if (!payload) return NextResponse.json({ error: 'Match not found' }, { status: 404 });
    return NextResponse.json(payload, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e: any) {
    console.error('match setup GET failed', e);
    return NextResponse.json({ error: 'Could not load match setup' }, { status: 500 });
  }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const viewer = await viewerFor(request);
  if (!viewer.id) return NextResponse.json({ error: 'Sign in first' }, { status: 401 });

  const body = await request.json().catch(() => null);
  const action = body?.action;
  if (!action) return NextResponse.json({ error: 'action required' }, { status: 400 });

  const match = await loadMatch(id);
  if (!match) return NextResponse.json({ error: 'Match not found' }, { status: 404 });
  if (!match.squad_a_id || !match.squad_b_id) return NextResponse.json({ error: 'Both teams must be set on the match first' }, { status: 409 });

  const squads = await loadSquads([match.squad_a_id, match.squad_b_id]);
  const home = squads[match.squad_a_id];
  const away = squads[match.squad_b_id];
  const locked = isLocked(match);
  const now = new Date().toISOString();
  const fail = (error: { message: string }) =>
    NextResponse.json({ error: missingTable(error.message) ? 'Run add-match-setup.sql (and add-match-subs.sql) in Supabase first' : error.message }, { status: missingTable(error.message) ? 503 : 500 });

  if (action === 'set_manual_zone') {
    // Per-match zone switch: off = left out of the zone queue, run by hand. Staff and referees
    // (the people in the arena on match night) can flip it either way.
    if (!viewer.staff && !viewer.referee) return NextResponse.json({ error: 'League staff and referees only' }, { status: 403 });
    if (typeof body.manual !== 'boolean') return NextResponse.json({ error: 'manual must be true or false' }, { status: 400 });
    const { error } = await supabaseAdmin.from('matches').update({ manual_zone: body.manual }).eq('id', id);
    if (error) return NextResponse.json({ error: /manual_zone/.test(error.message) ? 'Run add-match-manual-zone.sql in Supabase first' : error.message }, { status: 500 });
    return NextResponse.json(await loadAll(id, viewer));
  }

  if (action === 'set_match_chat') {
    // The in-game chat for this match's captains and referees. Staff or a referee sets it; only
    // staff, referees and the two squads' captains / co-captains can read it back.
    if (!viewer.staff && !viewer.referee) return NextResponse.json({ error: 'League staff and referees only' }, { status: 403 });
    const raw = typeof body.chat === 'string' ? body.chat : '';
    // Chat names are typed into the game client: keep them short and free of separators.
    const chat = raw.replace(/[\u0000-\u001f,;]/g, '').trim().slice(0, 30);
    const { error } = await supabaseAdmin.from('match_setup').upsert({ match_id: id, ref_chat: chat || null });
    if (error) return NextResponse.json({ error: /ref_chat/.test(error.message) ? 'Run add-match-chat.sql in Supabase first' : error.message }, { status: 500 });
    return NextResponse.json(await loadAll(id, viewer));
  }

  if (action === 'swap_home') {
    if (!viewer.staff) return NextResponse.json({ error: 'Staff only' }, { status: 403 });
    const { error } = await supabaseAdmin.from('matches').update({ squad_a_id: match.squad_b_id, squad_b_id: match.squad_a_id }).eq('id', id);
    if (error) return fail(error);
    const { error: e2 } = await supabaseAdmin.from('match_setup').upsert({ match_id: id, home_side: null, side_chosen_at: null, side_chosen_by: null, updated_at: now });
    if (e2) return fail(e2);
    return NextResponse.json(await loadAll(id, viewer));
  }

  if (action === 'set_side') {
    const side = body.side === null ? null : body.side;
    if (side !== null && side !== 'titan' && side !== 'collective') return NextResponse.json({ error: 'side must be titan, collective or null' }, { status: 400 });
    if (!viewer.staff) {
      if (locked) return NextResponse.json({ error: 'The side is locked now the match has started' }, { status: 409 });
      if (!leads(home, viewer.id)) return NextResponse.json({ error: `Only ${home.name}'s captain or co-captain picks the side (home team)` }, { status: 403 });
    }
    const { error } = await supabaseAdmin
      .from('match_setup')
      .upsert({ match_id: id, home_side: side, side_chosen_at: side ? now : null, side_chosen_by: side ? viewer.id : null, updated_at: now });
    if (error) return fail(error);
    return NextResponse.json(await loadAll(id, viewer));
  }

  if (action === 'set_lineup') {
    const squadId = body.squad_id;
    const sq = squadId === home.id ? home : squadId === away.id ? away : null;
    if (!sq) return NextResponse.json({ error: 'squad_id must be one of the two teams' }, { status: 400 });
    if (!viewer.staff) {
      if (locked) return NextResponse.json({ error: 'Lineups are locked now the match has started. Use a sub instead.' }, { status: 409 });
      if (!leads(sq, viewer.id)) return NextResponse.json({ error: `Only ${sq.name}'s captain or co-captain sets its lineup` }, { status: 403 });
    }
    const starting: string[] = Array.isArray(body.starting) ? Array.from(new Set(body.starting.filter(Boolean))) : [];
    const bench: string[] = Array.isArray(body.bench) ? Array.from(new Set(body.bench.filter((p: string) => p && !starting.includes(p)))) : [];
    const roster = new Set(sq.members.map((m) => m.player_id));
    if ([...starting, ...bench].some((p) => !roster.has(p))) return NextResponse.json({ error: 'Everyone in the lineup must be on the squad roster' }, { status: 400 });
    if (starting.length > STARTERS) return NextResponse.json({ error: `Matches are ${STARTERS}v${STARTERS}: pick at most ${STARTERS} starters, the rest go on the bench` }, { status: 400 });
    // FS Green: only the captain and later-round picks may start. Staff are held to it too.
    const green = await greenBlockedFor(match, squads);
    if (green) {
      const bad = starting.filter((p) => green.blocked.has(p)).map((p) => sq.members.find((m) => m.player_id === p)?.alias || 'a player');
      if (bad.length) return NextResponse.json({ error: `This is an FS Green match: only the captain and round ${green.minRound}+ picks can start. ${bad.join(', ')} ${bad.length === 1 ? 'was' : 'were'} drafted in rounds 1–${green.minRound - 1} and stay${bad.length === 1 ? 's' : ''} on the bench.` }, { status: 400 });
    }

    // 10-man plan. Not tied to the slot: once they have gone 10-man the 'in' player is a starter.
    const tenIn = body.ten_man && typeof body.ten_man === 'object' ? body.ten_man as Record<string, unknown> : {};
    const tenMan = (pid: string): TenMan | null => (tenIn[pid] === 'in' || tenIn[pid] === 'out' ? tenIn[pid] as TenMan : null);
    const planIn = body.plan_side && typeof body.plan_side === 'object' ? body.plan_side as Record<string, unknown> : {};
    const planSide = (pid: string): PlanSide | null => (planIn[pid] === 'O' || planIn[pid] === 'D' ? planIn[pid] as PlanSide : null);
    const classIn = body.plan_class && typeof body.plan_class === 'object' ? body.plan_class as Record<string, unknown> : {};
    const planClass = (pid: string): PlanClass | null => (isPlanClass(classIn[pid]) ? classIn[pid] : null);
    const rows: Record<string, unknown>[] = [
      ...starting.map((player_id, i) => ({ match_id: id, squad_id: sq.id, player_id, slot: 'starting', position: i, ten_man: tenMan(player_id), plan_side: planSide(player_id), plan_class: planClass(player_id), set_by: viewer.id, updated_at: now })),
      ...bench.map((player_id, i) => ({ match_id: id, squad_id: sq.id, player_id, slot: 'bench', position: i, ten_man: tenMan(player_id), plan_side: planSide(player_id), plan_class: planClass(player_id), set_by: viewer.id, updated_at: now })),
    ];
    const { error: delErr } = await supabaseAdmin.from('match_lineups').delete().eq('match_id', id).eq('squad_id', sq.id);
    if (delErr) return fail(delErr);
    let warning: string | undefined;
    if (rows.length) {
      // A column not added yet: save the lineup without it and say what was dropped.
      let toInsert = rows;
      let { error: insErr } = await supabaseAdmin.from('match_lineups').insert(toInsert);
      for (let col = insErr ? missingLineupCol(insErr.message) : null; insErr && col && col in toInsert[0]; col = insErr ? missingLineupCol(insErr.message) : null) {
        const dropped = col;
        if (toInsert.some((r) => r[dropped])) warning = `${PLAN_LABEL[dropped]} not saved: run ${SQL_FOR_COL[dropped]} in Supabase`;
        toInsert = toInsert.map((r) => { const n = { ...r }; delete n[dropped]; return n; });
        ({ error: insErr } = await supabaseAdmin.from('match_lineups').insert(toInsert));
      }
      if (insErr) return fail(insErr);
    }
    return NextResponse.json({ ...(await loadAll(id, viewer)), ...(warning ? { warning } : {}) });
  }

  if (action === 'sub') {
    const squadId = body.squad_id;
    const sq = squadId === home.id ? home : squadId === away.id ? away : null;
    if (!sq) return NextResponse.json({ error: 'squad_id must be one of the two teams' }, { status: 400 });
    const outId = String(body.out_player_id || '');
    const inId = String(body.in_player_id || '');
    if (!outId || !inId || outId === inId) return NextResponse.json({ error: 'Pick who comes out and who goes in' }, { status: 400 });
    if (!(viewer.staff || viewer.referee || leads(sq, viewer.id))) {
      return NextResponse.json({ error: `Only ${sq.name}'s captains, league staff or a referee can make a sub` }, { status: 403 });
    }
    if (!viewer.staff && !isSubWindow(match)) {
      return NextResponse.json({ error: 'Subs open when the side is released, five minutes before the match, and close once the result is in. Before then, edit the lineup.' }, { status: 409 });
    }
    const roster = new Set(sq.members.map((m) => m.player_id));
    if (!roster.has(inId)) return NextResponse.json({ error: 'The player coming in must be on the squad roster' }, { status: 400 });
    // FS Green: a round 1-3 pick can't be subbed in either (the match would score as Red).
    const green = await greenBlockedFor(match, squads);
    if (green?.blocked.has(inId)) {
      return NextResponse.json({ error: `This is an FS Green match: ${sq.members.find((m) => m.player_id === inId)?.alias || 'that player'} was drafted in rounds 1–${green.minRound - 1} and can't be subbed in. Only the captain and round ${green.minRound}+ picks play.` }, { status: 400 });
    }

    const { data: rows, error: rowsErr } = await supabaseAdmin.from('match_lineups').select('id, player_id, slot, position').eq('match_id', id).eq('squad_id', sq.id);
    if (rowsErr) return fail(rowsErr);
    const outRow = (rows || []).find((r: any) => r.player_id === outId);
    const inRow = (rows || []).find((r: any) => r.player_id === inId);
    if (!outRow || outRow.slot !== 'starting') return NextResponse.json({ error: 'The player coming out must be in the starting lineup' }, { status: 400 });

    // In: take the outgoing player's starting spot. Out: to the bench (the incoming player's old spot, or the end).
    const benchPos = inRow ? inRow.position : Math.max(-1, ...(rows || []).filter((r: any) => r.slot === 'bench').map((r: any) => r.position)) + 1;
    const alias = (pid: string) => sq.members.find((m) => m.player_id === pid)?.alias || 'Unknown';
    const up1 = inRow
      ? supabaseAdmin.from('match_lineups').update({ slot: 'starting', position: outRow.position, set_by: viewer.id, updated_at: now }).eq('id', inRow.id)
      : supabaseAdmin.from('match_lineups').insert({ match_id: id, squad_id: sq.id, player_id: inId, slot: 'starting', position: outRow.position, set_by: viewer.id, updated_at: now });
    const { error: e1 } = await up1;
    if (e1) return fail(e1);
    const { error: e2 } = await supabaseAdmin.from('match_lineups').update({ slot: 'bench', position: benchPos, set_by: viewer.id, updated_at: now }).eq('id', outRow.id);
    if (e2) return fail(e2);
    const { error: e3 } = await supabaseAdmin.from('match_lineup_subs').insert({ match_id: id, squad_id: sq.id, out_player_id: outId, in_player_id: inId, by_id: viewer.id });
    if (e3 && !missingTable(e3.message)) return fail(e3);
    if (e3) console.warn('match_lineup_subs missing (add-match-subs.sql): sub applied but not logged');
    return NextResponse.json({ ...(await loadAll(id, viewer)), sub: { out: alias(outId), in: alias(inId) } });
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
}
