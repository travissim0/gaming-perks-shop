import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';

/**
 * A signed-in player's own alias list.
 *
 * The profile page used to write profile_aliases straight from the browser and ignored the
 * result; the table's row policies let staff write but not ordinary users, so "Profile updated"
 * showed while nothing was saved. This route writes with the service key, only for the caller's
 * own profile, and reconciles instead of wiping: rows that already exist keep their added_at /
 * added_by (staff-added ones included), removed names are deleted, new names are inserted, and the
 * account's display name is always present and primary.
 *
 * POST { mainAlias: string, aliases: string[] } → { aliases: [...names] }
 */

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

async function authedUser(request: NextRequest) {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) return null;
  const { data: { user }, error } = await supabase.auth.getUser(authHeader.slice(7));
  if (error || !user) return null;
  return user;
}

export async function POST(request: NextRequest) {
  const user = await authedUser(request);
  if (!user) return NextResponse.json({ error: 'Sign in to edit your aliases' }, { status: 401 });

  let body: { mainAlias?: unknown; aliases?: unknown };
  try { body = await request.json(); } catch { return NextResponse.json({ error: 'Bad request' }, { status: 400 }); }

  const mainAlias = typeof body.mainAlias === 'string' ? body.mainAlias.trim() : '';
  if (!mainAlias) return NextResponse.json({ error: 'Display name cannot be blank' }, { status: 400 });

  // Wanted list: display name first, then the extras, trimmed, de-duplicated case-insensitively.
  const wanted: string[] = [];
  const seen = new Set<string>();
  for (const raw of [mainAlias, ...(Array.isArray(body.aliases) ? body.aliases : [])]) {
    if (typeof raw !== 'string') continue;
    const a = raw.trim();
    if (!a || a.length > 64) continue;
    const k = a.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    wanted.push(a);
  }

  const { data: existing, error: readErr } = await supabaseAdmin
    .from('profile_aliases')
    .select('id, alias, is_primary')
    .eq('profile_id', user.id);
  if (readErr) return NextResponse.json({ error: readErr.message }, { status: 500 });

  const byKey = new Map((existing || []).map((r) => [r.alias.trim().toLowerCase(), r]));
  const mainKey = mainAlias.toLowerCase();

  const toDelete = (existing || []).filter((r) => !seen.has(r.alias.trim().toLowerCase())).map((r) => r.id);
  const toInsert = wanted
    .filter((a) => !byKey.has(a.toLowerCase()))
    .map((alias) => ({ profile_id: user.id, alias, is_primary: alias.toLowerCase() === mainKey, added_by: 'system' }));
  const primaryFixes = (existing || [])
    .filter((r) => !toDelete.includes(r.id))
    .filter((r) => r.is_primary !== (r.alias.trim().toLowerCase() === mainKey));

  if (toDelete.length) {
    const { error } = await supabaseAdmin.from('profile_aliases').delete().in('id', toDelete);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }
  for (const r of primaryFixes) {
    const { error } = await supabaseAdmin.from('profile_aliases').update({ is_primary: !r.is_primary }).eq('id', r.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (toInsert.length) {
    const { error } = await supabaseAdmin.from('profile_aliases').insert(toInsert);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ aliases: wanted });
}
