import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';

/**
 * Staff ↔ bot bridge.
 * GET  → { state, pending, channels } for the admin panel
 * POST { action: 'sync' | 'teardown', season_id? } → queues a command the bot picks up
 */

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

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
  const [{ data: state, error }, { data: pending }, { data: channels }] = await Promise.all([
    supabaseAdmin.from('discord_bot_state').select('*').eq('id', 1).maybeSingle(),
    supabaseAdmin.from('discord_bot_commands').select('id, action, created_at').is('done_at', null),
    supabaseAdmin.from('discord_squad_channels').select('squad_id, squad_name, season_id, updated_at'),
  ]);
  if (error && /does not exist/i.test(error.message)) return NextResponse.json({ pending_sql: true });
  return NextResponse.json({ state: state || null, pending: pending || [], channels: channels || [] }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(request: NextRequest) {
  const user = await requireStaff(request);
  if (!user) return NextResponse.json({ error: 'Staff only' }, { status: 403 });
  const body = await request.json().catch(() => null);
  const action = body?.action;
  if (action !== 'sync' && action !== 'teardown') return NextResponse.json({ error: 'action must be sync or teardown' }, { status: 400 });
  if (action === 'teardown' && !body.season_id) return NextResponse.json({ error: 'season_id required for teardown' }, { status: 400 });
  const { data, error } = await supabaseAdmin
    .from('discord_bot_commands')
    .insert({ action, season_id: body.season_id || null, requested_by: user.id })
    .select('id')
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, id: data.id });
}
