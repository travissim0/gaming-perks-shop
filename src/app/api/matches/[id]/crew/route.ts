import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

/**
 * Staff crew assignment for a match: put a referee, commentator, recorder or
 * player on a match (or take them off) on their behalf. Players still sign
 * themselves up from the match page; this is the staff override.
 *
 * GET  ?q=<alias>&role=<role>   staff — search accounts eligible for the role
 * POST { action: 'add' | 'remove', player_id, role }   staff only
 */

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

type Role = 'player' | 'commentator' | 'recording' | 'referee';
const ROLES: Role[] = ['player', 'commentator', 'recording', 'referee'];

/** Which CTF staff roles may fill each crew slot (players and recorders are open). */
const eligible = (role: Role, ctfRole: string | null | undefined) => {
  const r = (ctfRole || '').toLowerCase();
  if (role === 'referee') return r === 'ctf_admin' || r.includes('referee');
  if (role === 'commentator') return r === 'ctf_admin' || r.includes('commentator');
  return true;
};

async function requireStaff(request: NextRequest) {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) return null;
  const { data: { user }, error } = await supabase.auth.getUser(authHeader.slice(7));
  if (error || !user) return null;
  const { data: p } = await supabaseAdmin.from('profiles').select('is_admin, ctf_role').eq('id', user.id).maybeSingle();
  return p && (p.is_admin === true || p.ctf_role === 'ctf_admin') ? user : null;
}

export async function GET(request: NextRequest) {
  const user = await requireStaff(request);
  if (!user) return NextResponse.json({ error: 'Staff only' }, { status: 403 });
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

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: matchId } = await params;
  const user = await requireStaff(request);
  if (!user) return NextResponse.json({ error: 'Staff only' }, { status: 403 });
  const body = await request.json().catch(() => null);
  const action = body?.action;
  const playerId = body?.player_id;
  const role = body?.role as Role;
  if (!playerId || !ROLES.includes(role)) return NextResponse.json({ error: 'player_id and a valid role are required' }, { status: 400 });

  const { data: match } = await supabaseAdmin.from('matches').select('id, status').eq('id', matchId).maybeSingle();
  if (!match) return NextResponse.json({ error: 'Match not found' }, { status: 404 });

  if (action === 'remove') {
    const { error } = await supabaseAdmin.from('match_participants').delete().eq('match_id', matchId).eq('player_id', playerId).eq('role', role);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  if (action === 'add') {
    const { data: p } = await supabaseAdmin.from('profiles').select('id, in_game_alias, ctf_role').eq('id', playerId).maybeSingle();
    if (!p) return NextResponse.json({ error: 'Unknown player' }, { status: 404 });
    if (!eligible(role, p.ctf_role)) return NextResponse.json({ error: `${p.in_game_alias} doesn't hold the ${role} role` }, { status: 400 });
    const { data: dup } = await supabaseAdmin.from('match_participants').select('id').eq('match_id', matchId).eq('player_id', playerId).eq('role', role).maybeSingle();
    if (dup) return NextResponse.json({ ok: true, already: true });
    const { error } = await supabaseAdmin.from('match_participants').insert({ match_id: matchId, player_id: playerId, role });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, alias: p.in_game_alias });
  }

  return NextResponse.json({ error: 'action must be add or remove' }, { status: 400 });
}
