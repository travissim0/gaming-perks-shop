import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/match-setup-server';
import { callerFrom } from '@/lib/leave-requests-server';

export const dynamic = 'force-dynamic';

/**
 * Crew activity for league staff: who signed up to referee, commentate or record this season,
 * how many of those matches were played with them on crew, VODs delivered by recorders, and
 * no-shows marked by admins by hand. Recognition and coverage, admin-only.
 *
 * GET  /api/admin/crew?league=ctfdl&season=5   staff → { league, seasons, season, people, idle, no_show_installed }
 * POST /api/admin/crew { match_id, player_id, role, no_show, note? }   staff → marks / clears a no-show
 *      (add-crew-no-show.sql; the GET works without it, with no no-show columns)
 */

type Role = 'referee' | 'commentator' | 'recording';
const ROLES: Role[] = ['referee', 'commentator', 'recording'];

export interface CrewMatch {
  match_id: string; title: string; scheduled_at: string; status: string; stage: string | null; fs_color: string | null; week: number | null;
  role: Role; played: boolean; vod: boolean;
  no_show: boolean; no_show_by_alias: string | null; no_show_at: string | null; no_show_note: string | null;
}
export interface CrewPerson {
  player_id: string; alias: string; ctf_role: string | null;
  by_role: Record<Role, { signed: number; played: number; no_shows: number }>;
  vods: number; last_at: string | null; matches: CrewMatch[];
}

const roleOf = (r: string): Role | null => (r === 'referee' ? 'referee' : r === 'commentator' ? 'commentator' : r === 'recording' || r === 'recorder' ? 'recording' : null);
const eligible = (ctfRole: string | null) => { const r = (ctfRole || '').toLowerCase(); return r.includes('referee') || r.includes('commentator') || r.includes('recorder') || r === 'ctf_admin'; };

export async function GET(request: NextRequest) {
  const caller = await callerFrom(request);
  if (!caller?.staff) return NextResponse.json({ error: 'League staff only' }, { status: 403 });
  const slug = (request.nextUrl.searchParams.get('league') || 'ctfdl').toLowerCase();
  const wantSeason = Number(request.nextUrl.searchParams.get('season'));

  const { data: league } = await supabaseAdmin.from('leagues').select('id, slug, name').eq('slug', slug).maybeSingle();
  if (!league) return NextResponse.json({ error: 'League not found' }, { status: 404 });
  const { data: seasons } = await supabaseAdmin.from('league_seasons').select('id, season_number, status').eq('league_id', (league as any).id).order('season_number', { ascending: false });
  const seasonList = ((seasons || []) as any[]).map((s) => ({ season_number: s.season_number, status: s.status }));
  const season = seasonList.find((s) => s.season_number === wantSeason) || seasonList.find((s) => s.status === 'active') || seasonList[0] || null;
  if (!season) return NextResponse.json({ league, seasons: [], season: null, people: [], idle: [], no_show_installed: false });

  // Fixtures that were real matches: no declined / cancelled FS proposals.
  const { data: matches } = await supabaseAdmin
    .from('matches')
    .select('id, title, scheduled_at, status, stage, fs_color, fs_status, week, vod_url')
    .eq('league_slug', slug)
    .eq('season_number', season.season_number)
    .not('squad_a_id', 'is', null)
    .not('squad_b_id', 'is', null)
    .neq('status', 'cancelled')
    .order('scheduled_at', { ascending: true });
  const fixtures = ((matches || []) as any[]).filter((m) => !(m.stage === 'fs' && m.fs_status && m.fs_status !== 'accepted'));
  const byId = new Map(fixtures.map((m) => [m.id, m]));
  const ids = fixtures.map((m) => m.id);

  // Crew rows, with the no-show columns when add-crew-no-show.sql has run.
  let installed = true;
  let rows: any[] = [];
  if (ids.length) {
    let res = await supabaseAdmin.from('match_participants').select('id, match_id, player_id, role, no_show, no_show_by, no_show_at, no_show_note').in('match_id', ids);
    if (res.error && /no_show/.test(res.error.message)) { installed = false; res = await supabaseAdmin.from('match_participants').select('id, match_id, player_id, role').in('match_id', ids) as any; }
    if (res.error) return NextResponse.json({ error: res.error.message }, { status: 500 });
    rows = (res.data || []) as any[];
  }

  const personIds = [...new Set([...rows.map((r) => r.player_id), ...rows.map((r) => r.no_show_by)].filter(Boolean))] as string[];
  const [{ data: profiles }, { data: crewPool }] = await Promise.all([
    personIds.length ? supabaseAdmin.from('profiles').select('id, in_game_alias, ctf_role').in('id', personIds) : Promise.resolve({ data: [] as any[] }),
    supabaseAdmin.from('profiles').select('id, in_game_alias, ctf_role').or('ctf_role.ilike.*referee*,ctf_role.ilike.*commentator*,ctf_role.ilike.*recorder*'),
  ]);
  const prof = new Map(((profiles || []) as any[]).map((p) => [p.id, p]));

  const people = new Map<string, CrewPerson>();
  for (const r of rows) {
    const role = roleOf(r.role);
    const m = byId.get(r.match_id);
    if (!role || !m) continue;
    const p = prof.get(r.player_id);
    let person = people.get(r.player_id);
    if (!person) {
      person = { player_id: r.player_id, alias: p?.in_game_alias || 'Unknown', ctf_role: p?.ctf_role || null, by_role: { referee: { signed: 0, played: 0, no_shows: 0 }, commentator: { signed: 0, played: 0, no_shows: 0 }, recording: { signed: 0, played: 0, no_shows: 0 } }, vods: 0, last_at: null, matches: [] };
      people.set(r.player_id, person);
    }
    const played = m.status === 'completed';
    const vod = played && !!m.vod_url;
    const noShow = r.no_show === true;
    person.by_role[role].signed++;
    if (played && !noShow) person.by_role[role].played++;
    if (noShow) person.by_role[role].no_shows++;
    if (role === 'recording' && vod && !noShow) person.vods++;
    if (played && (!person.last_at || m.scheduled_at > person.last_at)) person.last_at = m.scheduled_at;
    person.matches.push({
      match_id: m.id, title: m.title, scheduled_at: m.scheduled_at, status: m.status, stage: m.stage, fs_color: m.fs_color, week: m.week,
      role, played, vod, no_show: noShow, no_show_by_alias: r.no_show_by ? prof.get(r.no_show_by)?.in_game_alias || 'staff' : null, no_show_at: r.no_show_at || null, no_show_note: r.no_show_note || null,
    });
  }
  const list = [...people.values()].map((p) => ({ ...p, matches: p.matches.sort((x, y) => y.scheduled_at.localeCompare(x.scheduled_at)) }))
    .sort((x, y) => (ROLES.reduce((n, r) => n + y.by_role[r].played, 0) - ROLES.reduce((n, r) => n + x.by_role[r].played, 0)) || x.alias.localeCompare(y.alias));

  // Eligible by role but signed up for nothing this season: who to nudge.
  const idle = ((crewPool || []) as any[])
    .filter((p) => eligible(p.ctf_role) && !people.has(p.id))
    .map((p) => ({ player_id: p.id, alias: p.in_game_alias || 'Unknown', ctf_role: p.ctf_role }))
    .sort((x, y) => x.alias.localeCompare(y.alias));

  return NextResponse.json({ league, seasons: seasonList, season, people: list, idle, no_show_installed: installed, matches_played: fixtures.filter((m) => m.status === 'completed').length }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(request: NextRequest) {
  const caller = await callerFrom(request);
  if (!caller?.staff) return NextResponse.json({ error: 'League staff only' }, { status: 403 });
  const body = await request.json().catch(() => ({}));
  const matchId = String(body?.match_id || ''), playerId = String(body?.player_id || ''), role = String(body?.role || '');
  if (!matchId || !playerId || !role) return NextResponse.json({ error: 'match_id, player_id and role are required' }, { status: 400 });
  const noShow = body?.no_show === true;
  const note = typeof body?.note === 'string' ? body.note.trim().slice(0, 300) || null : null;
  const roles = role === 'recording' ? ['recording', 'recorder'] : [role];
  const { data, error } = await supabaseAdmin
    .from('match_participants')
    .update(noShow ? { no_show: true, no_show_by: caller.id, no_show_at: new Date().toISOString(), no_show_note: note } : { no_show: false, no_show_by: null, no_show_at: null, no_show_note: null })
    .eq('match_id', matchId).eq('player_id', playerId).in('role', roles).select('id');
  if (error) return NextResponse.json({ error: /no_show/.test(error.message) ? 'Run add-crew-no-show.sql in Supabase first' : error.message }, { status: 500 });
  if (!data?.length) return NextResponse.json({ error: 'That crew sign-up no longer exists' }, { status: 404 });
  return NextResponse.json({ ok: true, no_show: noShow });
}
