import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import { getSetting, setSetting, settingSource } from '@/lib/site-settings';

/**
 * Staff-only integration settings (site_settings table).
 * GET  → { settings: { KEY: { set, source, preview } } }   (secrets never returned)
 * PUT  { KEY: value, … } → saves; empty string clears
 */

const ALLOWED: Record<string, { secret: boolean }> = {
  DISCORD_CLIENT_ID: { secret: false },
  DISCORD_CLIENT_SECRET: { secret: true },
  DISCORD_GUILD_ID: { secret: false },
};

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
  const { error } = await supabaseAdmin.from('site_settings').select('key').limit(1);
  if (error && /does not exist/i.test(error.message)) return NextResponse.json({ pending_sql: true });

  const settings: Record<string, { set: boolean; source: string; preview: string | null }> = {};
  for (const [key, meta] of Object.entries(ALLOWED)) {
    const value = await getSetting(key);
    settings[key] = { set: !!value, source: await settingSource(key), preview: value && !meta.secret ? value : value ? `••••${value.slice(-4)}` : null };
  }
  return NextResponse.json({ settings }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function PUT(request: NextRequest) {
  const user = await requireStaff(request);
  if (!user) return NextResponse.json({ error: 'Staff only' }, { status: 403 });
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== 'object') return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  try {
    for (const [key, raw] of Object.entries(body)) {
      const meta = ALLOWED[key];
      if (!meta) return NextResponse.json({ error: `Unknown setting ${key}` }, { status: 400 });
      if (raw !== null && typeof raw !== 'string') return NextResponse.json({ error: `${key} must be text` }, { status: 400 });
      await setSetting(key, (raw as string | null)?.trim() || null, user.id, meta.secret);
    }
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
