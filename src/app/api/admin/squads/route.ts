import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';

/**
 * Staff writes to squads. The admin pages used to update squads from the
 * browser, and RLS silently matched zero rows for ctf_admins — the toast said
 * "updated" while the database never changed. Service role + staff check here.
 *
 * PATCH { ids: string[] | id: string, patch: { is_active?, is_legacy?, tournament_eligible?, league_slug? } }
 */

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const ALLOWED = ['is_active', 'is_legacy', 'tournament_eligible', 'league_slug', 'name', 'tag', 'description'] as const;

async function requireStaff(request: NextRequest) {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) return null;
  const { data: { user }, error } = await supabase.auth.getUser(authHeader.slice(7));
  if (error || !user) return null;
  const { data: p } = await supabaseAdmin.from('profiles').select('is_admin, ctf_role').eq('id', user.id).maybeSingle();
  return p && (p.is_admin === true || p.ctf_role === 'ctf_admin') ? user : null;
}

export async function PATCH(request: NextRequest) {
  const user = await requireStaff(request);
  if (!user) return NextResponse.json({ error: 'Staff only' }, { status: 403 });

  const body = await request.json().catch(() => null);
  const ids: string[] = Array.isArray(body?.ids) ? body.ids : body?.id ? [body.id] : [];
  if (ids.length === 0) return NextResponse.json({ error: 'id or ids required' }, { status: 400 });

  const patch: Record<string, unknown> = {};
  for (const key of ALLOWED) {
    if (body?.patch && key in body.patch) patch[key] = body.patch[key];
  }
  if (Object.keys(patch).length === 0) return NextResponse.json({ error: 'nothing to update' }, { status: 400 });
  for (const key of ['is_active', 'is_legacy', 'tournament_eligible']) {
    if (key in patch && typeof patch[key] !== 'boolean') return NextResponse.json({ error: `${key} must be true/false` }, { status: 400 });
  }
  if ('league_slug' in patch && patch.league_slug !== null && typeof patch.league_slug !== 'string') {
    return NextResponse.json({ error: 'league_slug must be a string or null' }, { status: 400 });
  }
  if ('name' in patch) {
    if (typeof patch.name !== 'string' || !patch.name.trim()) return NextResponse.json({ error: 'name is required' }, { status: 400 });
    patch.name = patch.name.trim();
  }
  if ('tag' in patch) {
    if (typeof patch.tag !== 'string' || !patch.tag.trim()) return NextResponse.json({ error: 'tag is required' }, { status: 400 });
    patch.tag = patch.tag.trim().toUpperCase().slice(0, 10);
  }
  if ('description' in patch) {
    if (patch.description !== null && typeof patch.description !== 'string') return NextResponse.json({ error: 'description must be text or null' }, { status: 400 });
    patch.description = typeof patch.description === 'string' && patch.description.trim() ? patch.description.trim() : null;
  }
  if ('name' in patch || 'tag' in patch || 'description' in patch) patch.updated_at = new Date().toISOString();

  const { data, error } = await supabaseAdmin.from('squads').update(patch).in('id', ids).select('id');
  if (error) {
    if (error.code === '23505') {
      const which = /tag/i.test(error.message) ? 'tag' : /name/i.test(error.message) ? 'name' : 'name or tag';
      return NextResponse.json({ error: `That squad ${which} is already taken` }, { status: 409 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!data || data.length === 0) return NextResponse.json({ error: 'No squad matched' }, { status: 404 });
  return NextResponse.json({ ok: true, updated: data.length });
}

/**
 * DELETE /api/admin/squads?id=… — disband a squad.
 *
 * The squad pages used to delete from the browser, which row security only allows for the squad's
 * own captain, so staff hit "Error disbanding squad". Allowed here for staff and for the captain.
 * Members and pending invites go first; anything that still points at the squad (recorded matches,
 * standings, a draft team) makes the database refuse, and the caller is told to deactivate or mark
 * it legacy instead so its history survives.
 */
export async function DELETE(request: NextRequest) {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) return NextResponse.json({ error: 'Sign in again' }, { status: 401 });
  const { data: { user } } = await supabase.auth.getUser(authHeader.slice(7));
  if (!user) return NextResponse.json({ error: 'Sign in again' }, { status: 401 });

  const id = new URL(request.url).searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

  const { data: squad } = await supabaseAdmin.from('squads').select('id, name, captain_id').eq('id', id).maybeSingle();
  if (!squad) return NextResponse.json({ error: 'Squad not found' }, { status: 404 });

  const { data: p } = await supabaseAdmin.from('profiles').select('is_admin, ctf_role').eq('id', user.id).maybeSingle();
  const isStaff = !!p && (p.is_admin === true || p.ctf_role === 'ctf_admin');
  let isCaptain = squad.captain_id === user.id;
  if (!isCaptain) {
    const { data: m } = await supabaseAdmin.from('squad_members').select('role').eq('squad_id', id).eq('player_id', user.id).eq('status', 'active').maybeSingle();
    isCaptain = m?.role === 'captain';
  }
  if (!isStaff && !isCaptain) return NextResponse.json({ error: 'Only the captain or league staff can disband a squad' }, { status: 403 });

  // No transactions over REST, so keep copies: if the squad itself can't be deleted, put the members
  // and invites back rather than leaving an empty squad behind.
  const { data: memberRows } = await supabaseAdmin.from('squad_members').select('*').eq('squad_id', id);
  const { data: inviteRows } = await supabaseAdmin.from('squad_invites').select('*').eq('squad_id', id);
  const restore = async () => {
    if (memberRows?.length) await supabaseAdmin.from('squad_members').insert(memberRows);
    if (inviteRows?.length) await supabaseAdmin.from('squad_invites').insert(inviteRows);
  };

  const { error: invErr } = await supabaseAdmin.from('squad_invites').delete().eq('squad_id', id);
  if (invErr && invErr.code !== '42P01') return NextResponse.json({ error: invErr.message }, { status: 500 });
  const { error: memErr } = await supabaseAdmin.from('squad_members').delete().eq('squad_id', id);
  if (memErr) { await restore(); return NextResponse.json({ error: memErr.message }, { status: 500 }); }

  const { error } = await supabaseAdmin.from('squads').delete().eq('id', id);
  if (error) {
    await restore();
    if (error.code === '23503') {
      return NextResponse.json({
        error: `${squad.name} has recorded history (matches, standings or a draft team), so it can't be deleted. Deactivate it or mark it legacy instead.`,
      }, { status: 409 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true, deleted: squad.name });
}
