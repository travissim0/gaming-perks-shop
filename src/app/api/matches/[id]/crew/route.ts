import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import { matchSummary, queueNotice } from '@/lib/notices-server';

export const dynamic = 'force-dynamic';

/**
 * Match crew: referees, commentators, recorders and players on a match.
 *
 * GET  ?q=<alias>&role=<role>                 staff — search accounts eligible for the role
 * POST { action: 'join' | 'leave', role }     the signed-in user, for themselves (role-gated)
 * POST { action: 'add' | 'remove', player_id, role }   staff, on someone's behalf
 *
 * Crew changes (referee, commentator, recorder) post one line in #ctf-referee
 * so the crew can see what's filled. No DMs — John found them too much.
 */

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

type Role = 'player' | 'commentator' | 'recording' | 'referee';
const ROLES: Role[] = ['player', 'commentator', 'recording', 'referee'];
const ROLE_LABEL: Record<Role, string> = { player: 'player', commentator: 'commentator', recording: 'recorder', referee: 'referee' };

/** Which CTF staff roles may fill each crew slot (players and recorders are open). */
const eligible = (role: Role, ctfRole: string | null | undefined) => {
  const r = (ctfRole || '').toLowerCase();
  if (role === 'referee') return r === 'ctf_admin' || r.includes('referee');
  if (role === 'commentator') return r === 'ctf_admin' || r.includes('commentator');
  return true;
};

async function viewer(request: NextRequest) {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) return null;
  const { data: { user }, error } = await supabase.auth.getUser(authHeader.slice(7));
  if (error || !user) return null;
  const { data: p } = await supabaseAdmin.from('profiles').select('in_game_alias, is_admin, ctf_role').eq('id', user.id).maybeSingle();
  return { id: user.id, alias: (p as any)?.in_game_alias || 'Staff', ctfRole: (p as any)?.ctf_role as string | null, staff: !!p && (p.is_admin === true || p.ctf_role === 'ctf_admin') };
}

export async function GET(request: NextRequest) {
  const v = await viewer(request);
  if (!v?.staff) return NextResponse.json({ error: 'Staff only' }, { status: 403 });
  const q = (request.nextUrl.searchParams.get('q') || '').trim();
  const role = request.nextUrl.searchParams.get('role') as Role;
  if (!ROLES.includes(role)) return NextResponse.json({ error: 'Bad role' }, { status: 400 });
  if (q.length < 2) return NextResponse.json({ players: [] });
  const { data } = await supabaseAdmin
    .from('profiles')
    .select('id, in_game_alias, ctf_role')
    .ilike('in_game_alias', `%${q}%`)
    .not('in_game_alias', 'is', null)
    .order('in_game_alias')
    .limit(20);
  const players = (data || [])
    .filter((p: any) => eligible(role, p.ctf_role))
    .slice(0, 8)
    .map((p: any) => ({ id: p.id, in_game_alias: p.in_game_alias, ctf_role: p.ctf_role }));
  return NextResponse.json({ players });
}

async function notify(kind: 'crew_added' | 'crew_removed', matchId: string, target: { id: string; alias: string }, role: Role, by: { id: string; alias: string }) {
  // Only referee changes are announced (#ctf-referee). Commentator/recorder posts are
  // off until they have a channel of their own; player sign-ups are never announced.
  if (role !== 'referee') return;
  const m = await matchSummary(matchId);
  if (!m) return;
  const self = by.id === target.id;
  const label = ROLE_LABEL[role];
  await queueNotice({
    user_id: null,        // channel post only, no DM
    channel: 'referee',
    kind,
    payload: { ...m, role, role_label: label, target_id: target.id, target_alias: target.alias, by_alias: by.alias, self },
    text: '',
  });
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: matchId } = await params;
  const v = await viewer(request);
  if (!v) return NextResponse.json({ error: 'Sign in first' }, { status: 401 });
  const body = await request.json().catch(() => null);
  const action = body?.action as 'join' | 'leave' | 'add' | 'remove';
  const role = body?.role as Role;
  if (!ROLES.includes(role)) return NextResponse.json({ error: 'A valid role is required' }, { status: 400 });

  const { data: match } = await supabaseAdmin.from('matches').select('id, status').eq('id', matchId).maybeSingle();
  if (!match) return NextResponse.json({ error: 'Match not found' }, { status: 404 });

  // Who is being changed, and by whom.
  let target: { id: string; alias: string; ctfRole: string | null };
  if (action === 'join' || action === 'leave') {
    target = { id: v.id, alias: v.alias, ctfRole: v.ctfRole };
    if (action === 'join' && !['scheduled', 'in_progress'].includes(match.status)) return NextResponse.json({ error: 'Sign-ups are closed for this match' }, { status: 409 });
  } else if (action === 'add' || action === 'remove') {
    if (!v.staff) return NextResponse.json({ error: 'Staff only' }, { status: 403 });
    const playerId = body?.player_id;
    if (!playerId) return NextResponse.json({ error: 'player_id is required' }, { status: 400 });
    const { data: p } = await supabaseAdmin.from('profiles').select('id, in_game_alias, ctf_role').eq('id', playerId).maybeSingle();
    if (!p) return NextResponse.json({ error: 'Unknown player' }, { status: 404 });
    target = { id: p.id, alias: p.in_game_alias || 'Player', ctfRole: p.ctf_role };
  } else {
    return NextResponse.json({ error: 'action must be join, leave, add or remove' }, { status: 400 });
  }

  if (action === 'join' || action === 'add') {
    if (!eligible(role, target.ctfRole)) {
      return NextResponse.json({ error: action === 'join' ? `${ROLE_LABEL[role]} role required` : `${target.alias} doesn't hold the ${ROLE_LABEL[role]} role` }, { status: 403 });
    }
    const { data: dup } = await supabaseAdmin.from('match_participants').select('id').eq('match_id', matchId).eq('player_id', target.id).eq('role', role).maybeSingle();
    if (dup) return NextResponse.json({ ok: true, already: true });
    const { error } = await supabaseAdmin.from('match_participants').insert({ match_id: matchId, player_id: target.id, role });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    await notify('crew_added', matchId, target, role, { id: v.id, alias: v.alias });
    return NextResponse.json({ ok: true, alias: target.alias });
  }

  const { data: gone, error } = await supabaseAdmin.from('match_participants').delete().eq('match_id', matchId).eq('player_id', target.id).eq('role', role).select('id');
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (gone && gone.length > 0) await notify('crew_removed', matchId, target, role, { id: v.id, alias: v.alias });
  return NextResponse.json({ ok: true });
}
