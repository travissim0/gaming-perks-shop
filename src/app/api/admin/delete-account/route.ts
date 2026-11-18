import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Site-admin account deletion (for "please delete my account" requests).
// GET  ?userId=  -> preview: the profile plus every linked row and what the delete will do to it.
// POST { userId, confirm } -> deletes. `confirm` must match the alias (or email if no alias).
// The work is done by the admin_delete_account() SQL function (add-admin-delete-account.sql),
// which runs as one transaction, so a refused or failed delete changes nothing.

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const MISSING_FN_HINT = 'Database functions missing - run add-admin-delete-account.sql in the SQL editor.';

async function requireSiteAdmin(request: NextRequest) {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) return null;
  const { data: { user }, error } = await supabaseAdmin.auth.getUser(authHeader.slice(7));
  if (error || !user) return null;
  const { data: profile } = await supabaseAdmin
    .from('profiles')
    .select('is_admin, in_game_alias')
    .eq('id', user.id)
    .single();
  return profile?.is_admin === true ? { id: user.id, alias: profile.in_game_alias as string | null } : null;
}

async function loadTarget(userId: string) {
  const { data: profile } = await supabaseAdmin
    .from('profiles')
    .select('id, in_game_alias, email, is_admin, created_at')
    .eq('id', userId)
    .maybeSingle();
  let email = profile?.email ?? null;
  if (!email) {
    const { data } = await supabaseAdmin.auth.admin.getUserById(userId);
    email = data?.user?.email ?? null;
  }
  if (!profile && !email) return null;
  return {
    id: userId,
    alias: (profile?.in_game_alias as string | null) ?? null,
    email,
    is_admin: profile?.is_admin === true,
    created_at: profile?.created_at ?? null,
  };
}

function rpcError(error: { message?: string; code?: string }) {
  const missing = error.code === 'PGRST202' || /could not find the function/i.test(error.message || '');
  return missing ? MISSING_FN_HINT : error.message || 'Database error';
}

export async function GET(request: NextRequest) {
  const admin = await requireSiteAdmin(request);
  if (!admin) return NextResponse.json({ error: 'Site admin required' }, { status: 403 });

  const userId = request.nextUrl.searchParams.get('userId');
  if (!userId) return NextResponse.json({ error: 'userId is required' }, { status: 400 });

  const target = await loadTarget(userId);
  if (!target) return NextResponse.json({ error: 'Account not found' }, { status: 404 });

  const { data: plan, error } = await supabaseAdmin.rpc('admin_account_delete_plan', { p_user_id: userId });
  if (error) return NextResponse.json({ error: rpcError(error) }, { status: 500 });

  return NextResponse.json({ target, plan: plan || [] });
}

export async function POST(request: NextRequest) {
  const admin = await requireSiteAdmin(request);
  if (!admin) return NextResponse.json({ error: 'Site admin required' }, { status: 403 });

  const body = await request.json().catch(() => null);
  const userId = body?.userId;
  const confirm = typeof body?.confirm === 'string' ? body.confirm.trim().toLowerCase() : '';
  if (!userId || typeof userId !== 'string') {
    return NextResponse.json({ error: 'userId is required' }, { status: 400 });
  }
  if (userId === admin.id) {
    return NextResponse.json({ error: 'You cannot delete your own account here.' }, { status: 400 });
  }

  const target = await loadTarget(userId);
  if (!target) return NextResponse.json({ error: 'Account not found' }, { status: 404 });
  if (target.is_admin) {
    return NextResponse.json({ error: 'This account is a site admin. Remove the admin role first.' }, { status: 400 });
  }
  const expected = (target.alias || target.email || '').trim().toLowerCase();
  if (!expected || confirm !== expected) {
    return NextResponse.json({ error: 'Confirmation text does not match.' }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin.rpc('admin_delete_account', { p_user_id: userId });
  if (error) {
    console.error('[delete-account] refused/failed', { by: admin.alias, target: target.alias, error: error.message });
    return NextResponse.json({ error: rpcError(error) }, { status: 400 });
  }

  console.log('[delete-account] deleted', { by: admin.alias, byId: admin.id, target: target.alias, targetId: userId });
  return NextResponse.json({ success: true, result: data });
}
