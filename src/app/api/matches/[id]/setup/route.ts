import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

/**
 * Match setup: the home team's side and both teams' lineups.
 *
 * GET  /api/matches/[id]/setup
 *   Public. Returns the match, both squads with rosters, the side, the
 *   lineups, and a `client` block the game client can consume directly:
 *   which in-game team each player belongs to and whether they start in spec.
 *   With a Bearer token it also says what the viewer may edit.
 *
 * POST /api/matches/[id]/setup  (Bearer)
 *   { action: 'set_side', side: 'titan' | 'collective' | null }   home captain/co-captain or staff
 *   { action: 'set_lineup', squad_id, starting: [player_id], bench: [player_id] }   that squad's captain/co-captain or staff
 *   { action: 'swap_home' }   staff — swaps squad_a/squad_b so the other team is home
 *
 * Home team = squad_a. Captains can edit until the scheduled time; staff always.
 *
 * Team naming: the home side's starters play on "<TAG> T" or "<TAG> C"
 * (Titan / Collective); their bench sits in spec on the other one. The away
 * team gets the opposite side. So KEVI home picking Titan gives
 * KEVI T (starters) / KEVI C (bench) and NSS C (starters) / NSS T (bench).
 */

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

type Side = 'titan' | 'collective';
const LETTER: Record<Side, 'T' | 'C'> = { titan: 'T', collective: 'C' };
const OTHER: Record<Side, Side> = { titan: 'collective', collective: 'titan' };

interface Member { player_id: string; alias: string; role: 'captain' | 'co_captain' | 'player' }
interface SquadRow { id: string; name: string; tag: string | null; captain_id: string | null }

const tagOf = (s: SquadRow) => (s.tag || s.name).slice(0, 8).toUpperCase();

async function loadMatch(id: string) {
  const { data, error } = await supabaseAdmin
    .from('matches')
    .select('id, title, scheduled_at, status, match_type, league_slug, season_number, week, stage, playoff_round, squad_a_id, squad_b_id, home_side, side_chosen_at, side_chosen_by')
    .eq('id', id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data as any | null;
}

async function loadSquads(ids: string[]): Promise<Record<string, SquadRow & { members: Member[] }>> {
  if (ids.length === 0) return {};
  const [{ data: squads }, { data: members }] = await Promise.all([
    supabaseAdmin.from('squads').select('id, name, tag, captain_id').in('id', ids),
    supabaseAdmin.from('squad_members').select('squad_id, player_id, role, profiles!squad_members_player_id_fkey(in_game_alias)').in('squad_id', ids).eq('status', 'active'),
  ]);
  const out: Record<string, SquadRow & { members: Member[] }> = {};
  (squads || []).forEach((s: any) => { out[s.id] = { id: s.id, name: s.name, tag: s.tag ?? null, captain_id: s.captain_id ?? null, members: [] }; });
  (members || []).forEach((m: any) => {
    const sq = out[m.squad_id];
    if (!sq) return;
    const role = sq.captain_id === m.player_id ? 'captain' : m.role === 'co_captain' ? 'co_captain' : m.role === 'captain' ? 'captain' : 'player';
    sq.members.push({ player_id: m.player_id, alias: m.profiles?.in_game_alias || 'Unknown', role });
  });
  Object.values(out).forEach((s) => s.members.sort((a, b) => (a.role === 'captain' ? -1 : b.role === 'captain' ? 1 : a.alias.localeCompare(b.alias))));
  return out;
}

async function viewerFor(request: NextRequest) {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) return null;
  const { data: { user }, error } = await supabase.auth.getUser(authHeader.slice(7));
  if (error || !user) return null;
  const { data: p } = await supabaseAdmin.from('profiles').select('is_admin, ctf_role').eq('id', user.id).maybeSingle();
  return { id: user.id, staff: !!p && (p.is_admin === true || p.ctf_role === 'ctf_admin') };
}

const leads = (sq: SquadRow & { members: Member[] } | undefined, userId: string) =>
  !!sq && (sq.captain_id === userId || sq.members.some((m) => m.player_id === userId && m.role !== 'player'));

function buildPayload(match: any, squads: Record<string, SquadRow & { members: Member[] }>, lineups: any[], viewer: { id: string; staff: boolean } | null) {
  const home = match.squad_a_id ? squads[match.squad_a_id] : null;
  const away = match.squad_b_id ? squads[match.squad_b_id] : null;
  const side: Side | null = match.home_side || null;

  const teamNames = (sq: SquadRow | null, s: Side | null) => {
    if (!sq || !s) return { starting: null as string | null, bench: null as string | null };
    const tag = tagOf(sq);
    return { starting: `${tag} ${LETTER[s]}`, bench: `${tag} ${LETTER[OTHER[s]]}` };
  };
  const homeNames = teamNames(home, side);
  const awayNames = teamNames(away, side ? OTHER[side] : null);

  const bySquad: Record<string, { starting: { player_id: string; alias: string; position: number }[]; bench: { player_id: string; alias: string; position: number }[] }> = {};
  for (const sq of [home, away]) if (sq) bySquad[sq.id] = { starting: [], bench: [] };
  const aliasOf = new Map<string, string>();
  Object.values(squads).forEach((s) => s.members.forEach((m) => aliasOf.set(m.player_id, m.alias)));
  lineups.forEach((l: any) => {
    const b = bySquad[l.squad_id];
    if (!b) return;
    (l.slot === 'starting' ? b.starting : b.bench).push({ player_id: l.player_id, alias: aliasOf.get(l.player_id) || l.alias || 'Unknown', position: l.position });
  });
  Object.values(bySquad).forEach((b) => { b.starting.sort((x, y) => x.position - y.position); b.bench.sort((x, y) => x.position - y.position); });

  // Game-client view: one row per player with their in-game team and spec state.
  const players: { alias: string; player_id: string; squad_tag: string; team: string; spec: boolean; slot: 'starting' | 'bench' }[] = [];
  const push = (sq: SquadRow | null, names: { starting: string | null; bench: string | null }) => {
    if (!sq || !names.starting || !names.bench) return;
    const b = bySquad[sq.id];
    b.starting.forEach((p) => players.push({ alias: p.alias, player_id: p.player_id, squad_tag: tagOf(sq), team: names.starting!, spec: false, slot: 'starting' }));
    b.bench.forEach((p) => players.push({ alias: p.alias, player_id: p.player_id, squad_tag: tagOf(sq), team: names.bench!, spec: true, slot: 'bench' }));
  };
  push(home, homeNames);
  push(away, awayNames);

  const startsAt = new Date(match.scheduled_at).getTime();
  const locked = match.status === 'completed' || match.status === 'cancelled' || match.status === 'expired' || Date.now() >= startsAt;
  const ready = !!side && !!home && !!away && bySquad[home.id].starting.length > 0 && bySquad[away.id].starting.length > 0;

  return {
    match: {
      id: match.id, title: match.title, scheduled_at: match.scheduled_at, status: match.status,
      league_slug: match.league_slug, season_number: match.season_number, week: match.week, stage: match.stage, playoff_round: match.playoff_round,
      locked,
    },
    home: home ? { squad_id: home.id, name: home.name, tag: tagOf(home), side, team_starting: homeNames.starting, team_bench: homeNames.bench, roster: home.members } : null,
    away: away ? { squad_id: away.id, name: away.name, tag: tagOf(away), side: side ? OTHER[side] : null, team_starting: awayNames.starting, team_bench: awayNames.bench, roster: away.members } : null,
    side_chosen_at: match.side_chosen_at,
    lineups: bySquad,
    client: {
      ready,
      teams: side && home && away ? [homeNames.starting, homeNames.bench, awayNames.starting, awayNames.bench] : [],
      players,
    },
    viewer: viewer
      ? {
          is_staff: viewer.staff,
          leads_home: leads(home || undefined, viewer.id),
          leads_away: leads(away || undefined, viewer.id),
          can_pick_side: viewer.staff || (!locked && leads(home || undefined, viewer.id)),
          can_edit_home: viewer.staff || (!locked && leads(home || undefined, viewer.id)),
          can_edit_away: viewer.staff || (!locked && leads(away || undefined, viewer.id)),
        }
      : null,
  };
}

async function loadAll(id: string, viewer: { id: string; staff: boolean } | null) {
  const match = await loadMatch(id);
  if (!match) return null;
  const ids = [match.squad_a_id, match.squad_b_id].filter(Boolean) as string[];
  const [squads, { data: lineups, error }] = await Promise.all([
    loadSquads(ids),
    supabaseAdmin.from('match_lineups').select('squad_id, player_id, slot, position').eq('match_id', id),
  ]);
  if (error && /does not exist/i.test(error.message)) return { pending_sql: true };
  return buildPayload(match, squads, lineups || [], viewer);
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const viewer = await viewerFor(request);
    const payload = await loadAll(id, viewer);
    if (!payload) return NextResponse.json({ error: 'Match not found' }, { status: 404 });
    return NextResponse.json(payload, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e: any) {
    if (/home_side|does not exist/i.test(String(e?.message))) return NextResponse.json({ pending_sql: true });
    console.error('match setup GET failed', e);
    return NextResponse.json({ error: 'Could not load match setup' }, { status: 500 });
  }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const viewer = await viewerFor(request);
  if (!viewer) return NextResponse.json({ error: 'Sign in first' }, { status: 401 });

  const body = await request.json().catch(() => null);
  const action = body?.action;
  if (!action) return NextResponse.json({ error: 'action required' }, { status: 400 });

  let match: any;
  try { match = await loadMatch(id); } catch (e: any) {
    if (/home_side|does not exist/i.test(String(e?.message))) return NextResponse.json({ error: 'Run add-match-setup.sql in Supabase first' }, { status: 503 });
    throw e;
  }
  if (!match) return NextResponse.json({ error: 'Match not found' }, { status: 404 });
  if (!match.squad_a_id || !match.squad_b_id) return NextResponse.json({ error: 'Both teams must be set on the match first' }, { status: 409 });

  const squads = await loadSquads([match.squad_a_id, match.squad_b_id]);
  const home = squads[match.squad_a_id];
  const away = squads[match.squad_b_id];
  const locked = match.status === 'completed' || match.status === 'cancelled' || match.status === 'expired' || Date.now() >= new Date(match.scheduled_at).getTime();
  const now = new Date().toISOString();

  if (action === 'swap_home') {
    if (!viewer.staff) return NextResponse.json({ error: 'Staff only' }, { status: 403 });
    const { error } = await supabaseAdmin.from('matches').update({ squad_a_id: match.squad_b_id, squad_b_id: match.squad_a_id, home_side: null, side_chosen_at: null, side_chosen_by: null }).eq('id', id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    // Scores follow the teams.
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
      .from('matches')
      .update({ home_side: side, side_chosen_at: side ? now : null, side_chosen_by: side ? viewer.id : null })
      .eq('id', id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(await loadAll(id, viewer));
  }

  if (action === 'set_lineup') {
    const squadId = body.squad_id;
    const sq = squadId === home.id ? home : squadId === away.id ? away : null;
    if (!sq) return NextResponse.json({ error: 'squad_id must be one of the two teams' }, { status: 400 });
    if (!viewer.staff) {
      if (locked) return NextResponse.json({ error: 'Lineups are locked now the match has started' }, { status: 409 });
      if (!leads(sq, viewer.id)) return NextResponse.json({ error: `Only ${sq.name}'s captain or co-captain sets its lineup` }, { status: 403 });
    }
    const starting: string[] = Array.isArray(body.starting) ? Array.from(new Set(body.starting.filter(Boolean))) : [];
    const bench: string[] = Array.isArray(body.bench) ? Array.from(new Set(body.bench.filter((p: string) => p && !starting.includes(p)))) : [];
    const roster = new Set(sq.members.map((m) => m.player_id));
    const bad = [...starting, ...bench].filter((p) => !roster.has(p));
    if (bad.length) return NextResponse.json({ error: 'Everyone in the lineup must be on the squad roster' }, { status: 400 });

    const rows = [
      ...starting.map((player_id, i) => ({ match_id: id, squad_id: sq.id, player_id, slot: 'starting', position: i, set_by: viewer.id, updated_at: now })),
      ...bench.map((player_id, i) => ({ match_id: id, squad_id: sq.id, player_id, slot: 'bench', position: i, set_by: viewer.id, updated_at: now })),
    ];
    const { error: delErr } = await supabaseAdmin.from('match_lineups').delete().eq('match_id', id).eq('squad_id', sq.id);
    if (delErr) return NextResponse.json({ error: delErr.message }, { status: 500 });
    if (rows.length) {
      const { error: insErr } = await supabaseAdmin.from('match_lineups').insert(rows);
      if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 });
    }
    return NextResponse.json(await loadAll(id, viewer));
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
}
