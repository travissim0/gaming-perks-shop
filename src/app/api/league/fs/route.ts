import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import { weekStart, weekEnd } from '@/lib/scoring';
import { loadSeasonRules } from '@/lib/standings-server';
import { fsCapCheck, fsCountsFor } from '@/lib/fs-server';

export const dynamic = 'force-dynamic';

/**
 * Free-scheduled (FS) matches: captain-agreed extra matches that count for
 * fewer points. They live on the schedule (matches, stage 'fs').
 *
 * GET  ?league=&season=&squad=   → this squad's FS usage this week + season, and the caps
 * POST { action: 'propose', league, season, my_squad_id, opponent_squad_id, scheduled_at }
 *        captain/co-captain of my_squad_id (or staff). Proposer is home. Caps checked here.
 * POST { action: 'accept' | 'decline', id }   captain/co-captain of the opponent squad (or staff)
 * POST { action: 'cancel', id }               proposer's squad leads (or staff); pending only
 */

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

async function viewer(request: NextRequest) {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) return null;
  const { data: { user }, error } = await supabase.auth.getUser(authHeader.slice(7));
  if (error || !user) return null;
  const { data: p } = await supabaseAdmin.from('profiles').select('is_admin, ctf_role').eq('id', user.id).maybeSingle();
  return { id: user.id, staff: !!p && (p.is_admin === true || p.ctf_role === 'ctf_admin') };
}

/** Captain or co-captain of the squad? */
async function leads(squadId: string, userId: string) {
  const [{ data: sq }, { data: m }] = await Promise.all([
    supabaseAdmin.from('squads').select('captain_id').eq('id', squadId).maybeSingle(),
    supabaseAdmin.from('squad_members').select('role').eq('squad_id', squadId).eq('player_id', userId).eq('status', 'active').maybeSingle(),
  ]);
  return (sq as any)?.captain_id === userId || (m as any)?.role === 'captain' || (m as any)?.role === 'co_captain';
}

async function seasonFor(slug: string, seasonNumber: number) {
  const { data: lg } = await supabaseAdmin.from('leagues').select('id, name, slug').eq('slug', slug).maybeSingle();
  if (!lg) return null;
  const { data: s } = await supabaseAdmin.from('league_seasons').select('id, season_number, status').eq('league_id', lg.id).eq('season_number', seasonNumber).maybeSingle();
  return s ? { league: lg, season: s } : null;
}

export async function GET(request: NextRequest) {
  const slug = request.nextUrl.searchParams.get('league') || '';
  const seasonNumber = Number(request.nextUrl.searchParams.get('season'));
  const squadId = request.nextUrl.searchParams.get('squad') || '';
  if (!slug || !seasonNumber) return NextResponse.json({ error: 'league and season required' }, { status: 400 });
  const ctx = await seasonFor(slug, seasonNumber);
  if (!ctx) return NextResponse.json({ error: 'Season not found' }, { status: 404 });
  const rules = await loadSeasonRules(ctx.season.id);
  const now = new Date();
  const ws = weekStart(now);
  const usage = squadId ? await fsCountsFor(ctx.season.id, slug, seasonNumber, squadId, '__none__', now.toISOString(), null) : null;
  return NextResponse.json({ enabled: rules.fs.enabled, caps: rules.fs, week: { start: ws, end: weekEnd(ws) }, usage: usage ? { this_week: usage.week } : null }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(request: NextRequest) {
  const v = await viewer(request);
  if (!v) return NextResponse.json({ error: 'Sign in first' }, { status: 401 });
  const body = await request.json().catch(() => null);
  const action = body?.action;

  if (action === 'propose') {
    const { league: slug, season: seasonNumber, my_squad_id: mine, opponent_squad_id: opp, scheduled_at: at } = body;
    if (!slug || !seasonNumber || !mine || !opp || !at) return NextResponse.json({ error: 'league, season, my_squad_id, opponent_squad_id and scheduled_at are required' }, { status: 400 });
    if (mine === opp) return NextResponse.json({ error: 'Pick a different opponent' }, { status: 400 });
    if (Number.isNaN(new Date(at).getTime())) return NextResponse.json({ error: 'Pick a date and time' }, { status: 400 });
    if (new Date(at).getTime() < Date.now() - 60 * 60 * 1000) return NextResponse.json({ error: 'That time is in the past' }, { status: 400 });
    if (!v.staff && !(await leads(mine, v.id))) return NextResponse.json({ error: 'Only your squad’s captain or co-captain can propose an FS match' }, { status: 403 });

    const ctx = await seasonFor(slug, Number(seasonNumber));
    if (!ctx) return NextResponse.json({ error: 'Season not found' }, { status: 404 });
    const rules = await loadSeasonRules(ctx.season.id);
    const { data: squads } = await supabaseAdmin.from('squads').select('id, name, tag').in('id', [mine, opp]);
    const a = (squads || []).find((s: any) => s.id === mine);
    const b = (squads || []).find((s: any) => s.id === opp);
    if (!a || !b) return NextResponse.json({ error: 'Unknown squad' }, { status: 400 });

    const cap = await fsCapCheck(ctx.season.id, slug, Number(seasonNumber), rules, mine, opp, at, null, { a: a.name, b: b.name });
    if (cap) return NextResponse.json({ error: cap }, { status: 409 });

    const ws = weekStart(new Date(at));
    const { data, error } = await supabaseAdmin
      .from('matches')
      .insert({
        title: `${slug.toUpperCase()} S${seasonNumber} · FS · ${b.name} vs ${a.name}`, // away vs home
        description: `${ctx.league.name} Season ${seasonNumber}, free-scheduled match proposed by ${a.name}.`,
        match_type: 'tournament',
        status: 'scheduled',
        scheduled_at: at,
        squad_a_id: mine,
        squad_b_id: opp,
        created_by: v.id,
        league_slug: slug,
        season_number: Number(seasonNumber),
        week: null,
        stage: 'fs',
        fs_status: 'pending',
        proposed_by: v.id,
        fs_week_start: ws,
      })
      .select('id')
      .single();
    if (error) return NextResponse.json({ error: /fs_status|stage/.test(error.message) ? 'Run add-season-scoring.sql in Supabase first' : error.message }, { status: 500 });
    return NextResponse.json({ ok: true, id: data.id });
  }

  if (action === 'accept' || action === 'decline' || action === 'cancel') {
    const id = body?.id;
    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });
    const { data: m } = await supabaseAdmin.from('matches').select('id, stage, fs_status, squad_a_id, squad_b_id, league_slug, season_number, scheduled_at').eq('id', id).maybeSingle();
    if (!m || m.stage !== 'fs') return NextResponse.json({ error: 'Not an FS match' }, { status: 404 });
    if (m.fs_status !== 'pending') return NextResponse.json({ error: `This proposal is already ${m.fs_status}` }, { status: 409 });

    if (action === 'cancel') {
      if (!v.staff && !(await leads(m.squad_a_id, v.id))) return NextResponse.json({ error: 'Only the proposing squad’s captains can cancel' }, { status: 403 });
      const { error } = await supabaseAdmin.from('matches').update({ fs_status: 'cancelled', status: 'cancelled' }).eq('id', id);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ ok: true });
    }

    if (!v.staff && !(await leads(m.squad_b_id, v.id))) return NextResponse.json({ error: 'Only the opponent squad’s captain or co-captain can answer this' }, { status: 403 });
    if (action === 'accept') {
      // Caps can have changed since the proposal (another FS accepted in between).
      const ctx = await seasonFor(m.league_slug, m.season_number);
      if (ctx) {
        const rules = await loadSeasonRules(ctx.season.id);
        const cap = await fsCapCheck(ctx.season.id, m.league_slug, m.season_number, rules, m.squad_a_id, m.squad_b_id, m.scheduled_at, m.id);
        if (cap) return NextResponse.json({ error: cap }, { status: 409 });
      }
      const { error } = await supabaseAdmin.from('matches').update({ fs_status: 'accepted' }).eq('id', id);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ ok: true });
    }
    const { error } = await supabaseAdmin.from('matches').update({ fs_status: 'declined', status: 'cancelled' }).eq('id', id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
}
