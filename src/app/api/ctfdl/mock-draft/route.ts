import { NextRequest, NextResponse } from 'next/server';
import {
  supabaseAdmin, userFromRequest, isStaff, hasStaffRole, resolveDraft, ctfdlLeague, loadTeams, loadPicks, loadPlayers,
} from '@/lib/ctfdl-draft-server';
import { getOpenSeason, getLatestSeason } from '@/lib/leagues';
import { ensureProfile } from '@/lib/ensure-profile-server';
import {
  MIN_PUBLIC_BOARDS, requiredCount, scoreBoard,
  type MockAdpRow, type MockBoardView, type MockPoolPlayer, type MockResponse, type MockScoreRow,
} from '@/lib/ctfdl-mock';

/*
 * CTFDL mock drafts: everyone predicts the order the Season's players will be drafted.
 *
 * GET    the pool, the viewer's own board, public ADP (once MIN_PUBLIC_BOARDS exist), the public
 *        boards, and — after the draft — a scoreboard of public boards against the real picks.
 * POST   { player_ids, anonymous } save/replace the viewer's board (one per account per season).
 * DELETE remove the viewer's board.
 *
 * Privacy rules, all enforced here (the table has no read policies):
 *   - A board by a current drafting captain or co-captain is PRIVATE: only its author sees it (as
 *     "My board" in the draft room). It is never listed and never counted in the public ADP.
 *   - Anonymous boards show as "Anonymous #n"; staff can see who wrote them.
 *   - The author's own name on their board is ignored for the ADP (no voting yourself up).
 * Boards lock once the draft leaves setup.
 */

const TABLE = 'ctfdl_mock_boards';
const missingTable = (e: any) => e?.code === '42P01' || /ctfdl_mock_boards/.test(e?.message || '');

async function context() {
  const draft = await resolveDraft();
  let season: { id: string; season_number: number; season_name: string | null } | null = null;
  if (draft) {
    const { data } = await supabaseAdmin.from('league_seasons').select('id, season_number, season_name').eq('id', draft.league_season_id).maybeSingle();
    season = data || null;
  } else {
    const league = await ctfdlLeague();
    const s = league ? (await getOpenSeason(league)) || (await getLatestSeason(league)) : null;
    if (s) season = { id: s.id, season_number: s.season_number, season_name: (s as any).season_name ?? null };
  }
  const teams = draft ? await loadTeams(draft.id) : [];
  const picks = draft ? await loadPicks(draft.id) : [];
  const players = season ? await loadPlayers(draft?.id || '00000000-0000-0000-0000-000000000000', season.season_number, teams, picks, season.id) : [];
  const captainIds = new Set<string>([...teams.map((t) => t.captain_id).filter(Boolean), ...teams.flatMap((t) => t.co_captain_ids)] as string[]);
  const pool: MockPoolPlayer[] = players
    .map((p) => ({ player_id: p.player_id, alias: p.alias, preferred_roles: p.preferred_roles, secondary_roles: p.secondary_roles }))
    .sort((a, b) => a.alias.localeCompare(b.alias));
  const actualOverall: Record<string, number> = {};
  picks.forEach((p) => { if (p.player_id) actualOverall[p.player_id] = p.overall; });
  const locked = !!draft && draft.status !== 'setup';
  return { draft, season, pool, captainIds, actualOverall, locked, teamCount: teams.length };
}

export async function GET(request: NextRequest) {
  const user = await userFromRequest(request);
  const ctx = await context();
  const staff = user ? await isStaff(user.id) : false;
  const poolIds = new Set(ctx.pool.map((p) => p.player_id));
  const inPool = !!user && poolIds.has(user.id);
  const required = requiredCount(ctx.pool.length - (inPool ? 1 : 0));
  let feedsStaffAdp = false;
  if (user && !ctx.captainIds.has(user.id)) {
    const { data: me } = await supabaseAdmin.from('profiles').select('is_admin, ctf_role').eq('id', user.id).maybeSingle();
    feedsStaffAdp = !!me && hasStaffRole(me);
  }

  const base: MockResponse = {
    season: ctx.season,
    draft: ctx.draft ? { id: ctx.draft.id, status: ctx.draft.status } : null,
    locked: ctx.locked,
    teams: ctx.teamCount,
    pool: ctx.pool,
    public_board_count: 0,
    adp: null,
    boards: [],
    scoreboard: null,
    viewer: { signed_in: !!user, is_staff: staff, is_captain: !!user && ctx.captainIds.has(user.id), in_pool: inPool, feeds_staff_adp: feedsStaffAdp, required },
    mine: null,
  };
  if (!ctx.season) return NextResponse.json(base);

  const { data: rows, error } = await supabaseAdmin
    .from(TABLE)
    .select('id, user_id, player_ids, anonymous, created_at, updated_at')
    .eq('league_season_id', ctx.season.id)
    .order('created_at', { ascending: true });
  if (error) {
    if (missingTable(error)) return NextResponse.json({ ...base, needs_setup: true });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  const all = (rows || []) as Array<{ id: string; user_id: string; player_ids: string[]; anonymous: boolean; created_at: string; updated_at: string }>;

  const mineRow = user ? all.find((r) => r.user_id === user.id) : undefined;
  if (mineRow) base.mine = { player_ids: mineRow.player_ids, anonymous: mineRow.anonymous, updated_at: mineRow.updated_at, private: ctx.captainIds.has(mineRow.user_id) };

  const publicRows = all.filter((r) => !ctx.captainIds.has(r.user_id));
  base.public_board_count = publicRows.length;

  // Labels: alias, or "Anonymous #n" numbered by submission order.
  const authorIds = [...new Set(publicRows.map((r) => r.user_id))];
  const aliasById: Record<string, string> = {};
  if (authorIds.length) {
    const { data: profs } = await supabaseAdmin.from('profiles').select('id, in_game_alias').in('id', authorIds);
    (profs || []).forEach((p: any) => { aliasById[p.id] = p.in_game_alias || 'Unknown'; });
  }
  let anonN = 0;
  const views: MockBoardView[] = publicRows.map((r) => {
    const label = r.anonymous ? `Anonymous #${++anonN}` : aliasById[r.user_id] || 'Unknown';
    return {
      id: r.id,
      label,
      anonymous: r.anonymous,
      ...(staff && r.anonymous ? { author_alias: aliasById[r.user_id] || null } : {}),
      // Only players still in the pool are shown (withdrawn registrations drop out).
      player_ids: r.player_ids.filter((id) => poolIds.has(id)),
      updated_at: r.updated_at,
    };
  });
  base.boards = [...views].sort((a, b) => b.updated_at.localeCompare(a.updated_at));

  // Public ADP: positions are recounted after dropping withdrawn players and the author themself.
  if (publicRows.length >= MIN_PUBLIC_BOARDS) {
    const acc: Record<string, number[]> = {};
    for (const r of publicRows) {
      const order = r.player_ids.filter((id) => poolIds.has(id) && id !== r.user_id);
      order.forEach((id, i) => { (acc[id] ||= []).push(i + 1); });
    }
    const aliasOf = Object.fromEntries(ctx.pool.map((p) => [p.player_id, p.alias]));
    const adp: MockAdpRow[] = Object.entries(acc).map(([id, pos]) => ({
      player_id: id,
      alias: aliasOf[id] || 'Unknown',
      adp: Math.round((pos.reduce((a, b) => a + b, 0) / pos.length) * 10) / 10,
      best: Math.min(...pos),
      worst: Math.max(...pos),
      boards: pos.length,
    }));
    adp.sort((a, b) => a.adp - b.adp || b.boards - a.boards || a.alias.localeCompare(b.alias));
    base.adp = adp;
  }

  // After the draft: score public boards against where players actually went.
  if (ctx.draft?.status === 'complete' && Object.keys(ctx.actualOverall).length > 0) {
    const labelById = Object.fromEntries(views.map((v) => [v.id, v.label]));
    const score: MockScoreRow[] = publicRows.map((r) => {
      const s = scoreBoard(r.player_ids.filter((id) => id !== r.user_id), ctx.actualOverall);
      return { board_id: r.id, label: labelById[r.id], ...s };
    });
    score.sort((a, b) => b.points - a.points || b.exact - a.exact || a.label.localeCompare(b.label));
    base.scoreboard = score;
  }

  return NextResponse.json(base);
}

export async function POST(request: NextRequest) {
  const user = await userFromRequest(request);
  if (!user) return NextResponse.json({ error: 'Sign in to save a mock draft' }, { status: 401 });
  const profile = await ensureProfile(user);
  if (!profile?.in_game_alias) return NextResponse.json({ error: 'Set your in-game alias on your profile first' }, { status: 400 });

  const body = await request.json().catch(() => null);
  if (!body || !Array.isArray(body.player_ids)) return NextResponse.json({ error: 'player_ids required' }, { status: 400 });

  const ctx = await context();
  if (!ctx.season) return NextResponse.json({ error: 'No CTFDL season is open' }, { status: 409 });
  if (ctx.locked) return NextResponse.json({ error: 'The draft has started, so mock drafts are locked' }, { status: 409 });

  const poolIds = new Set(ctx.pool.map((p) => p.player_id));
  const seen = new Set<string>();
  const order: string[] = [];
  for (const raw of body.player_ids) {
    if (typeof raw !== 'string' || raw === user.id || seen.has(raw)) continue;
    if (!poolIds.has(raw)) return NextResponse.json({ error: 'That board has a player who is not in the pool any more. Reload and try again.' }, { status: 400 });
    seen.add(raw);
    order.push(raw);
  }
  const need = requiredCount(ctx.pool.length - (poolIds.has(user.id) ? 1 : 0));
  if (order.length < need) {
    return NextResponse.json({ error: `Place at least ${need} players (you have ${order.length}).` }, { status: 400 });
  }

  const now = new Date().toISOString();
  const { error } = await supabaseAdmin
    .from(TABLE)
    .upsert(
      { league_season_id: ctx.season.id, user_id: user.id, player_ids: order, anonymous: body.anonymous === true, updated_at: now },
      { onConflict: 'league_season_id,user_id' },
    );
  if (error) {
    if (missingTable(error)) return NextResponse.json({ error: 'Mock drafts are not set up yet (run create-ctfdl-mock-drafts.sql)' }, { status: 503 });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true, placed: order.length, private: ctx.captainIds.has(user.id) });
}

export async function DELETE(request: NextRequest) {
  const user = await userFromRequest(request);
  if (!user) return NextResponse.json({ error: 'Sign in again' }, { status: 401 });
  const ctx = await context();
  if (!ctx.season) return NextResponse.json({ error: 'No CTFDL season is open' }, { status: 409 });
  if (ctx.locked) return NextResponse.json({ error: 'The draft has started, so mock drafts are locked' }, { status: 409 });
  const { error } = await supabaseAdmin.from(TABLE).delete().eq('league_season_id', ctx.season.id).eq('user_id', user.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
