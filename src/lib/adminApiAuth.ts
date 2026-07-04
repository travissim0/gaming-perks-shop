import { NextRequest, NextResponse } from 'next/server';
import { getServiceSupabase } from '@/lib/supabase';

export interface AdminAuthResult {
  ok: boolean;
  userId?: string;
  response?: NextResponse;
}

/**
 * Server-side gate for the Infantry DB admin routes: validates the Bearer token
 * and requires a zone admin (profiles.is_zone_admin) or a site admin
 * (profiles.is_admin as a super-admin override). Returns a ready-to-send error
 * response when the caller is not authorized.
 */
export async function requireZoneAdmin(request: NextRequest): Promise<AdminAuthResult> {
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
    .select('is_admin, is_zone_admin')
    .eq('id', user.id)
    .single();
  if (profile?.is_zone_admin !== true && profile?.is_admin !== true) {
    return { ok: false, response: NextResponse.json({ error: 'Zone admin access required' }, { status: 403 }) };
  }

  return { ok: true, userId: user.id };
}

/**
 * Best-effort audit trail for Infantry DB operations. Never throws — a
 * missing infantry_db_audit table must not break the admin tools.
 */
export async function auditInfantryDb(
  adminId: string,
  action: 'lookup' | 'update_email' | 'query' | 'canned' | 'send_reset',
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
