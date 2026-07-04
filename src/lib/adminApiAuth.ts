import { NextRequest, NextResponse } from 'next/server';
import { getServiceSupabase } from '@/lib/supabase';

export interface AdminAuthResult {
  ok: boolean;
  userId?: string;
  response?: NextResponse;
}

/**
 * Server-side admin gate for API routes: validates the Bearer token and
 * requires profiles.is_admin. Returns a ready-to-send error response when
 * the caller is not an authenticated site admin.
 */
export async function requireSiteAdmin(request: NextRequest): Promise<AdminAuthResult> {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return { ok: false, response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  }
  const token = authHeader.slice(7);

  const supabaseAdmin = getServiceSupabase();
  const {
    data: { user },
    error: authError,
  } = await supabaseAdmin.auth.getUser(token);
  if (authError || !user) {
    return { ok: false, response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  }

  const { data: profile } = await supabaseAdmin
    .from('profiles')
    .select('is_admin')
    .eq('id', user.id)
    .single();
  if (profile?.is_admin !== true) {
    return { ok: false, response: NextResponse.json({ error: 'Admin access required' }, { status: 403 }) };
  }

  return { ok: true, userId: user.id };
}

/**
 * Best-effort audit trail for Infantry DB operations. Never throws — a
 * missing infantry_db_audit table must not break the admin tools.
 */
export async function auditInfantryDb(
  adminId: string,
  action: 'lookup' | 'update_email' | 'query' | 'canned',
  details: Record<string, unknown>
): Promise<void> {
  try {
    const { error } = await getServiceSupabase()
      .from('infantry_db_audit')
      .insert({ admin_id: adminId, action, details });
    if (error) console.warn('infantry_db_audit insert failed:', error.message);
  } catch (err: unknown) {
    console.warn('infantry_db_audit insert failed:', err);
  }
}
