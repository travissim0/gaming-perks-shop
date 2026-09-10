import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { timingSafeEqual } from 'crypto';
import { supabase } from '@/lib/supabase';
import { getSetting } from '@/lib/site-settings';

export const dynamic = 'force-dynamic';

/**
 * Match setup: the home team's side and both teams' lineups. PRIVATE.
 *
 * Who sees what:
 *   - staff, or the game client (header `X-Client-Key: <MATCH_CLIENT_KEY>`): everything, incl. the `client` block
 *   - home captain/co-captain: the side + the home lineup
 *   - away captain/co-captain: the away lineup only (the side is hidden until the match)
 *   - everyone else: just whether the side and each lineup have been submitted
 *
 * GET  /api/matches/[id]/setup
 * POST /api/matches/[id]/setup  (Bearer)
 *   { action: 'set_side', side: 'titan' | 'collective' | null }   home captain/co-captain or staff
 *   { action: 'set_lineup', squad_id, starting: [player_id], bench: [player_id] }   that squad's captain/co-captain or staff
 *   { action: 'swap_home' }   staff — swaps squad_a/squad_b so the other team is home (clears the side)
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
type Squad = SquadRow & { members: Member[] };
interface Viewer { id: string | null; staff: boolean; client: boolean }

const tagOf = (s: SquadRow) => (s.tag || s.name).slice(0, 8).toUpperCase();
const missingTable = (msg: string | undefined) => /match_setup|match_lineups|does not exist/i.test(String(msg || ''));

async function loadMatch(id: string) {
  const { data, error } = await supabaseAdmin
    .from('matches')
    .select('id, title, scheduled_at, status, match_type, league_slug, season_number, week, stage, playoff_round, squad_a_id, squad_b_id')
    .eq('id', id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data as any | null;
}

async function loadSquads(ids: string[]): Promise<Record<string, Squad>> {
  if (ids.length === 0) return {};
  const [{ data: squads }, { data: members }] = await Promise.all([
    supabaseAdmin.from('squads').select('id, name, tag, captain_id').in('id', ids),
    supabaseAdmin.from('squad_members').select('squad_id, player_id, role, profiles!squad_members_player_id_fkey(in_game_alias)').in('squad_id', ids).eq('status', 'active'),
  ]);
  const out: Record<string, Squad> = {};
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

/** Who is asking: a signed-in user (Bearer), the game client (X-Client-Key), or nobody. */
async function viewerFor(request: NextRequest): Promise<Viewer> {
  const clientKey = request.headers.get('X-Client-Key');
  if (clientKey) {
    const expected = await getSetting('MATCH_CLIENT_KEY');
    const a = Buffer.from(clientKey);
    const b = Buffer.from(expected);
    if (expected && a.length === b.length && timingSafeEqual(a, b)) return { id: null, staff: false, client: true };
  }
  const authHeader = request.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) return { id: null, staff: false, client: false };
  const { data: { user }, error } = await supabase.auth.getUser(authHeader.slice(7));
  if (error || !user) return { id: null, staff: false, client: false };
  const { data: p } = await supabaseAdmin.from('profiles').select('is_admin, ctf_role').eq('id', user.id).maybeSingle();
  return { id: user.id, staff: !!p && (p.is_admin === true || p.ctf_role === 'ctf_admin'), client: false };
}

const leads = (sq: Squad | null | undefined, userId: string | null) =>
  !!sq && !!userId && (sq.captain_id === userId || sq.members.some((m) => m.player_id === userId && m.role !== 'player'));

const isLocked = (match: any) =>
  match.status === 'completed' || match.status === 'cancelled' || match.status === 'expired' || Date.now() >= new Date(match.scheduled_at).getTime();

function buildPayload(match: any, setupRow: any, squads: Record<string, Squad>, lineupRows: any[], viewer: Viewer) {
  const home = match.squad_a_id ? squads[match.squad_a_id] : null;
  const away = match.squad_b_id ? squads[match.squad_b_id] : null;
  const side: Side | null = setupRow?.home_side || null;
  const locked = isLocked(match);

  const teamNames = (sq: SquadRow | null, s: Side | null) => {
    if (!sq || !s) return { starting: null as string | null, bench: null as string | null };
    const tag = tagOf(sq);
    return { starting: `${tag} ${LETTER[s]}`, bench: `${tag} ${LETTER[OTHER[s]]}` };
  };
  const homeNames = teamNames(home, side);
  const awayNames = teamNames(away, side ? OTHER[side] : null);

  type Entry = { player_id: string; alias: string; position: number };
  const bySquad: Record<string, { starting: Entry[]; bench: Entry[] }> = {};
  for (const sq of [home, away]) if (sq) bySquad[sq.id] = { starting: [], bench: [] };
  const aliasOf = new Map<string, string>();
  Object.values(squads).forEach((s) => s.members.forEach((m) => aliasOf.set(m.player_id, m.alias)));
  lineupRows.forEach((l: any) => {
    const b = bySquad[l.squad_id];
    if (!b) return;
    (l.slot === 'starting' ? b.starting : b.bench).push({ player_id: l.player_id, alias: aliasOf.get(l.player_id) || 'Unknown', position: l.position });
  });
  Object.values(bySquad).forEach((b) => { b.starting.sort((x, y) => x.position - y.position); b.bench.sort((x, y) => x.position - y.position); });

  const homeSet = !!home && bySquad[home.id].starting.length > 0;
  const awaySet = !!away && bySquad[away.id].starting.length > 0;
  const ready = !!side && homeSet && awaySet;

  // ---- Visibility ---------------------------------------------------------
  const full = viewer.staff || viewer.client;
  const leadsHome = leads(home, viewer.id);
  const leadsAway = leads(away, viewer.id);
  const seeSide = full || leadsHome;
  const seeHome = full || leadsHome;
  const seeAway = full || leadsAway;

  const teamBlock = (sq: Squad | null, s: Side | null, names: { starting: string | null; bench: string | null }, reveal: boolean) =>
    sq
      ? {
          squad_id: sq.id, name: sq.name, tag: tagOf(sq), roster: sq.members,
          side: seeSide ? s : null,
          team_starting: seeSide ? names.starting : null,
          team_bench: seeSide ? names.bench : null,
          lineup: reveal ? bySquad[sq.id] : null,
        }
      : null;

  const players: { alias: string; player_id: string; squad_tag: string; team: string; spec: boolean; slot: 'starting' | 'bench' }[] = [];
  if (full) {
    const push = (sq: Squad | null, names: { starting: string | null; bench: string | null }) => {
      if (!sq || !names.starting || !names.bench) return;
      bySquad[sq.id].starting.forEach((p) => players.push({ alias: p.alias, player_id: p.player_id, squad_tag: tagOf(sq), team: names.starting!, spec: false, slot: 'starting' }));
      bySquad[sq.id].bench.forEach((p) => players.push({ alias: p.alias, player_id: p.player_id, squad_tag: tagOf(sq), team: names.bench!, spec: true, slot: 'bench' }));
    };
    push(home, homeNames);
    push(away, awayNames);
  }

  return {
    match: {
      id: match.id, title: match.title, scheduled_at: match.scheduled_at, status: match.status,
      league_slug: match.league_slug, season_number: match.season_number, week: match.week, stage: match.stage, playoff_round: match.playoff_round,
      locked,
    },
    home: teamBlock(home, side, homeNames, seeHome),
    away: teamBlock(away, side ? OTHER[side] : null, awayNames, seeAway),
    /** Public progress flags — no values. */
    progress: { side_picked: !!side, home_lineup_set: homeSet, away_lineup_set: awaySet, ready },
    side_chosen_at: seeSide ? setupRow?.side_chosen_at || null : null,
    client: full
      ? { ready, teams: side && home && away ? [homeNames.starting, homeNames.bench, awayNames.starting, awayNames.bench] : [], players }
      : null,
    viewer: viewer.id || viewer.staff
      ? {
          is_staff: viewer.staff,
          leads_home: leadsHome,
          leads_away: leadsAway,
          can_pick_side: viewer.staff || (!locked && leadsHome),
          can_edit_home: viewer.staff || (!locked && leadsHome),
          can_edit_away: viewer.staff || (!locked && leadsAway),
        }
      : null,
  };
}

async function loadAll(id: string, viewer: Viewer) {
  const match = await loadMatch(id);
  if (!match) return null;
  const ids = [match.squad_a_id, match.squad_b_id].filter(Boolean) as string[];
  const [squads, setupRes, lineupRes] = await Promise.all([
    loadSquads(ids),
    supabaseAdmin.from('match_setup').select('home_side, side_chosen_at, side_chosen_by').eq('match_id', id).maybeSingle(),
    supabaseAdmin.from('match_lineups').select('squad_id, player_id, slot, position').eq('match_id', id),
  ]);
  if ((setupRes.error && missingTable(setupRes.error.message)) || (lineupRes.error && missingTable(lineupRes.error.message))) return { pending_sql: true };
  return buildPayload(match, setupRes.data, squads, lineupRes.data || [], viewer);
}

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
    NextResponse.json({ error: missingTable(error.message) ? 'Run add-match-setup.sql in Supabase first' : error.message }, { status: missingTable(error.message) ? 503 : 500 });

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
      if (locked) return NextResponse.json({ error: 'Lineups are locked now the match has started' }, { status: 409 });
      if (!leads(sq, viewer.id)) return NextResponse.json({ error: `Only ${sq.name}'s captain or co-captain sets its lineup` }, { status: 403 });
    }
    const starting: string[] = Array.isArray(body.starting) ? Array.from(new Set(body.starting.filter(Boolean))) : [];
    const bench: string[] = Array.isArray(body.bench) ? Array.from(new Set(body.bench.filter((p: string) => p && !starting.includes(p)))) : [];
    const roster = new Set(sq.members.map((m) => m.player_id));
    if ([...starting, ...bench].some((p) => !roster.has(p))) return NextResponse.json({ error: 'Everyone in the lineup must be on the squad roster' }, { status: 400 });

    const rows = [
      ...starting.map((player_id, i) => ({ match_id: id, squad_id: sq.id, player_id, slot: 'starting', position: i, set_by: viewer.id, updated_at: now })),
      ...bench.map((player_id, i) => ({ match_id: id, squad_id: sq.id, player_id, slot: 'bench', position: i, set_by: viewer.id, updated_at: now })),
    ];
    const { error: delErr } = await supabaseAdmin.from('match_lineups').delete().eq('match_id', id).eq('squad_id', sq.id);
    if (delErr) return fail(delErr);
    if (rows.length) {
      const { error: insErr } = await supabaseAdmin.from('match_lineups').insert(rows);
      if (insErr) return fail(insErr);
    }
    return NextResponse.json(await loadAll(id, viewer));
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
}
