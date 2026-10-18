import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

/**
 * CTF staff roles (profiles.ctf_role), set from the Staff roles panel.
 *
 * POST { userId, role }   role = one of CTF_ROLES, or null for no role
 *
 * Site admins and CTF admins only. CTF admins can't change a site admin's role.
 * The write goes through the service role: RLS on profiles doesn't let CTF admins
 * update other people's rows, so their update from the browser matched no rows and saved nothing.
 */

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const CTF_ROLES = [
  'ctf_admin',
  'ctf_head_referee',
  'ctf_referee',
  'ctf_commentator',
  'ctf_recorder',
  'ctf_analyst',
  'ctf_analyst_commentator',
  'ctf_analyst_referee',
  'ctf_analyst_commentator_referee',
];

async function verifyStaff(request: NextRequest) {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) return null;
  const { data: { user }, error } = await supabase.auth.getUser(authHeader.slice(7));
  if (error || !user) return null;
  const { data: p } = await supabaseAdmin.from('profiles').select('is_admin, ctf_role').eq('id', user.id).maybeSingle();
  if (!p || (p.is_admin !== true && p.ctf_role !== 'ctf_admin')) return null;
  return { id: user.id, isAdmin: p.is_admin === true };
}

export async function POST(request: NextRequest) {
  const v = await verifyStaff(request);
  if (!v) return NextResponse.json({ error: 'Only CTF admins can change roles' }, { status: 403 });

  const body = await request.json().catch(() => null);
  const userId = body?.userId as string | undefined;
  const role = (body?.role ?? null) as string | null;
  if (!userId) return NextResponse.json({ error: 'userId is required' }, { status: 400 });
  if (role !== null && !CTF_ROLES.includes(role)) return NextResponse.json({ error: 'Unknown role' }, { status: 400 });

  const { data: target } = await supabaseAdmin.from('profiles').select('id, in_game_alias, is_admin').eq('id', userId).maybeSingle();
  if (!target) return NextResponse.json({ error: 'Unknown player' }, { status: 404 });
  if (target.is_admin === true && !v.isAdmin) return NextResponse.json({ error: "Only site admins can change a site admin's role" }, { status: 403 });

  const { error } = await supabaseAdmin.from('profiles').update({ ctf_role: role }).eq('id', userId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, alias: target.in_game_alias, role });
}
