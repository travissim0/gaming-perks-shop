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

const ALLOWED = ['is_active', 'is_legacy', 'tournament_eligible', 'league_slug'] as const;

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

  const { data, error } = await supabaseAdmin.from('squads').update(patch).in('id', ids).select('id');
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data || data.length === 0) return NextResponse.json({ error: 'No squad matched' }, { status: 404 });
  return NextResponse.json({ ok: true, updated: data.length });
}
