import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';

/**
 * League schedule (fixtures).
 *
 * GET  /api/league/schedule?league=<slug>&season=<n>
 *      → { fixtures: Fixture[] } — scheduled `matches` rows tagged with this
 *        league/season, each joined to its reported result (league_matches or
 *        ctfpl_matches) by game_id, else by the two squads on the same day.
 *
 * Staff only (is_admin or ctf_role = 'ctf_admin'):
 * POST   { league, season, week, squad_a_id, squad_b_id, scheduled_at }
 * PATCH  { id, week?, squad_a_id?, squad_b_id?, scheduled_at? }
 * DELETE ?id=<match id>   (only while still scheduled)
 *
 * Fixtures are ordinary `matches` rows (match_type 'tournament'), so the match
 * detail page, participant sign-ups, game linking and videos keep working.
 */

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

export interface Fixture {
  id: string;
  week: number | null;
  stage: 'regular' | 'playoff';
  playoff_round: number | null;
  scheduled_at: string;
  status: string;
  title: string;
  squad_a_id: string | null;
  squad_b_id: string | null;
  squad_a_name: string | null;
  squad_a_tag: string | null;
  squad_b_name: string | null;
  squad_b_tag: string | null;
  game_id: string | null;
  vod_url: string | null;
  participants: { role: string; alias: string }[];
  result: {
    id: string;
    a_score: number;
    b_score: number;
    a_result: string | null;
    b_result: string | null;
    played_at: string;
    swapped: boolean;
  } | null;
}

async function requireStaff(request: NextRequest) {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) return null;
  const { data: { user }, error } = await supabase.auth.getUser(authHeader.slice(7));
  if (error || !user) return null;
  const { data: profile } = await supabaseAdmin
    .from('profiles')
    .select('is_admin, ctf_role')
    .eq('id', user.id)
    .maybeSingle();
  const ok = !!profile && (profile.is_admin === true || profile.ctf_role === 'ctf_admin');
  return ok ? user : null;
}

const sameDay = (a: string, b: string) => a.slice(0, 10) === b.slice(0, 10);

export async function GET(request: NextRequest) {
  const league = request.nextUrl.searchParams.get('league');
  const season = Number(request.nextUrl.searchParams.get('season'));
  if (!league || Number.isNaN(season)) {
    return NextResponse.json({ error: 'league and season are required' }, { status: 400 });
  }

  const { data: rows, error } = await supabaseAdmin
    .from('matches')
    .select(`
      id, title, week, stage, playoff_round, scheduled_at, status, squad_a_id, squad_b_id, game_id, vod_url,
      squad_a:squads!matches_squad_a_id_fkey(name, tag),
      squad_b:squads!matches_squad_b_id_fkey(name, tag),
      match_participants(role, profiles!match_participants_player_id_fkey(in_game_alias))
    `)
    .eq('league_slug', league)
    .eq('season_number', season)
    .order('scheduled_at', { ascending: true });
  if (error) {
    // Columns missing until add-league-schedule.sql runs → empty schedule, not a crash.
    if (/column .*does not exist/i.test(error.message)) return NextResponse.json({ fixtures: [], pending_sql: true });
    console.error('schedule GET failed', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Reported results for this season.
  let results: any[] = [];
  if (league === 'ctfpl') {
    const { data } = await supabaseAdmin
      .from('ctfpl_matches')
      .select('id, game_id, match_date, team_a_squad_id, team_b_squad_id, team_a_name, team_b_name, team_a_kills, team_b_kills, team_a_result, team_b_result')
      .eq('season_number', season);
    results = data || [];
  } else {
    const { data: lg } = await supabaseAdmin.from('leagues').select('id').eq('slug', league).maybeSingle();
    const { data: ls } = lg
      ? await supabaseAdmin.from('league_seasons').select('id').eq('league_id', lg.id).eq('season_number', season).maybeSingle()
      : { data: null };
    if (ls) {
      const { data } = await supabaseAdmin
        .from('league_matches')
        .select('id, game_id, match_date, team_a_squad_id, team_b_squad_id, team_a_name, team_b_name, team_a_kills, team_b_kills, team_a_result, team_b_result')
        .eq('league_season_id', ls.id);
      results = data || [];
    }
  }

  const used = new Set<string>();
  const findResult = (m: any) => {
    const byGame = m.game_id ? results.find((r) => r.game_id && r.game_id === m.game_id && !used.has(r.id)) : null;
    const hit =
      byGame ||
      results.find((r) => {
        if (used.has(r.id) || !m.squad_a_id || !m.squad_b_id) return false;
        const pair = new Set([r.team_a_squad_id, r.team_b_squad_id]);
        return pair.has(m.squad_a_id) && pair.has(m.squad_b_id) && sameDay(r.match_date, m.scheduled_at);
      });
    if (!hit) return null;
    used.add(hit.id);
    const swapped = hit.team_a_squad_id !== m.squad_a_id;
    return {
      id: hit.id,
      a_score: swapped ? hit.team_b_kills : hit.team_a_kills,
      b_score: swapped ? hit.team_a_kills : hit.team_b_kills,
      a_result: swapped ? hit.team_b_result : hit.team_a_result,
      b_result: swapped ? hit.team_a_result : hit.team_b_result,
      played_at: hit.match_date,
      swapped,
    };
  };

  const fixtures: Fixture[] = (rows || []).map((m: any) => ({
    id: m.id,
    week: m.week ?? null,
    stage: m.stage === 'playoff' ? 'playoff' : 'regular',
    playoff_round: m.playoff_round ?? null,
    scheduled_at: m.scheduled_at,
    status: m.status,
    title: m.title,
    squad_a_id: m.squad_a_id,
    squad_b_id: m.squad_b_id,
    squad_a_name: m.squad_a?.name ?? null,
    squad_a_tag: m.squad_a?.tag ?? null,
    squad_b_name: m.squad_b?.name ?? null,
    squad_b_tag: m.squad_b?.tag ?? null,
    game_id: m.game_id ?? null,
    vod_url: m.vod_url ?? null,
    participants: (m.match_participants || []).map((p: any) => ({ role: p.role, alias: p.profiles?.in_game_alias || 'Unknown' })),
    result: findResult(m),
  }));

  return NextResponse.json({ fixtures }, { headers: { 'Cache-Control': 'no-store' } });
}

async function squadNames(ids: string[]) {
  const { data } = await supabaseAdmin.from('squads').select('id, name, tag').in('id', ids);
  return new Map((data || []).map((s: any) => [s.id, s]));
}

const validIso = (v: unknown) => typeof v === 'string' && !Number.isNaN(new Date(v).getTime());

const stageTitle = (league: string, season: number, f: { week: number; stage: string; playoff_round?: number | null; label?: string }) =>
  f.stage === 'playoff' ? `${league.toUpperCase()} S${season} · ${f.label || `Playoffs R${f.playoff_round}`}` : `${league.toUpperCase()} S${season} · Week ${f.week}`;

/**
 * Create one fixture ({ league, season, week, squad_a_id, squad_b_id, scheduled_at, stage?, playoff_round?, label? })
 * or many ({ league, season, fixtures: [...] }). All-or-nothing for the batch.
 */
export async function POST(request: NextRequest) {
  const user = await requireStaff(request);
  if (!user) return NextResponse.json({ error: 'Staff only' }, { status: 403 });
  const body = await request.json().catch(() => null);
  const league = body?.league;
  const season = body?.season;
  if (!league || !Number.isInteger(season)) return NextResponse.json({ error: 'league and season are required' }, { status: 400 });

  const items: any[] = Array.isArray(body.fixtures) ? body.fixtures : [body];
  if (items.length === 0) return NextResponse.json({ error: 'No fixtures' }, { status: 400 });
  if (items.length > 200) return NextResponse.json({ error: 'Too many fixtures at once' }, { status: 400 });

  for (const f of items) {
    if (!Number.isInteger(f.week) || f.week < 1 || f.week > 52) return NextResponse.json({ error: 'Week must be 1–52' }, { status: 400 });
    if (!f.squad_a_id || !f.squad_b_id) return NextResponse.json({ error: 'Pick both teams' }, { status: 400 });
    if (f.squad_a_id === f.squad_b_id) return NextResponse.json({ error: 'A team can’t play itself' }, { status: 400 });
    if (!validIso(f.scheduled_at)) return NextResponse.json({ error: 'Pick a date and time' }, { status: 400 });
    if (f.stage && f.stage !== 'regular' && f.stage !== 'playoff') return NextResponse.json({ error: 'Bad stage' }, { status: 400 });
  }

  const ids = Array.from(new Set(items.flatMap((f) => [f.squad_a_id, f.squad_b_id])));
  const names = await squadNames(ids);
  if (ids.some((id) => !names.has(id))) return NextResponse.json({ error: 'Unknown squad' }, { status: 400 });

  const rows = items.map((f) => {
    const stage = f.stage === 'playoff' ? 'playoff' : 'regular';
    const a = names.get(f.squad_a_id)!;
    const b = names.get(f.squad_b_id)!;
    return {
      title: `${stageTitle(league, season, { ...f, stage })} · ${a.name} vs ${b.name}`,
      description: stage === 'playoff'
        ? `${league.toUpperCase()} Season ${season} playoffs${f.label ? `, ${f.label.toLowerCase()}` : ''}.`
        : `${league.toUpperCase()} Season ${season}, week ${f.week}.`,
      match_type: 'tournament',
      status: 'scheduled',
      scheduled_at: f.scheduled_at,
      squad_a_id: f.squad_a_id,
      squad_b_id: f.squad_b_id,
      created_by: user.id,
      league_slug: league,
      season_number: season,
      week: f.week,
      stage,
      playoff_round: stage === 'playoff' ? (Number.isInteger(f.playoff_round) ? f.playoff_round : 1) : null,
    };
  });

  const { data, error } = await supabaseAdmin.from('matches').insert(rows).select('id');
  if (error) {
    console.error('schedule POST failed', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true, ids: (data || []).map((r: any) => r.id), count: rows.length });
}

export async function PATCH(request: NextRequest) {
  const user = await requireStaff(request);
  if (!user) return NextResponse.json({ error: 'Staff only' }, { status: 403 });
  const body = await request.json().catch(() => null);
  const id = body?.id;
  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 });

  const { data: current } = await supabaseAdmin
    .from('matches')
    .select('id, league_slug, season_number, week, stage, playoff_round, squad_a_id, squad_b_id, scheduled_at')
    .eq('id', id)
    .maybeSingle();
  if (!current || !current.league_slug) return NextResponse.json({ error: 'Fixture not found' }, { status: 404 });

  const patch: Record<string, unknown> = {};
  if ('week' in body) {
    if (!Number.isInteger(body.week) || body.week < 1 || body.week > 52) return NextResponse.json({ error: 'Week must be 1–52' }, { status: 400 });
    patch.week = body.week;
  }
  if ('scheduled_at' in body) {
    if (!validIso(body.scheduled_at)) return NextResponse.json({ error: 'Invalid date' }, { status: 400 });
    patch.scheduled_at = body.scheduled_at;
  }
  const aId = body.squad_a_id ?? current.squad_a_id;
  const bId = body.squad_b_id ?? current.squad_b_id;
  if ('squad_a_id' in body || 'squad_b_id' in body) {
    if (!aId || !bId || aId === bId) return NextResponse.json({ error: 'Pick two different teams' }, { status: 400 });
    patch.squad_a_id = aId;
    patch.squad_b_id = bId;
  }
  if (Object.keys(patch).length === 0) return NextResponse.json({ error: 'Nothing to update' }, { status: 400 });

  if ('week' in patch || 'squad_a_id' in patch) {
    const names = await squadNames([aId, bId]);
    const week = (patch.week as number) ?? current.week;
    patch.title = `${stageTitle(current.league_slug, current.season_number, { week, stage: current.stage || 'regular', playoff_round: current.playoff_round })} · ${names.get(aId)?.name || '?'} vs ${names.get(bId)?.name || '?'}`;
  }

  const { error } = await supabaseAdmin.from('matches').update(patch).eq('id', id);
  if (error) {
    console.error('schedule PATCH failed', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: NextRequest) {
  const user = await requireStaff(request);
  if (!user) return NextResponse.json({ error: 'Staff only' }, { status: 403 });
  const id = request.nextUrl.searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 });

  const { data: current } = await supabaseAdmin.from('matches').select('id, status, league_slug, game_id').eq('id', id).maybeSingle();
  if (!current || !current.league_slug) return NextResponse.json({ error: 'Fixture not found' }, { status: 404 });
  if (current.game_id || current.status === 'completed') {
    return NextResponse.json({ error: 'This match has a result linked. Unlink the game first.' }, { status: 400 });
  }

  await supabaseAdmin.from('match_participants').delete().eq('match_id', id);
  const { error } = await supabaseAdmin.from('matches').delete().eq('id', id);
  if (error) {
    console.error('schedule DELETE failed', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
