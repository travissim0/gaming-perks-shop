/**
 * Site messages from the system account (the bell on freeinf.org). Server only (service role).
 */
import { createClient } from '@supabase/supabase-js';
import { SYSTEM_USER_ID } from '@/lib/constants';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

/** One message to each of these people (duplicates and the system account dropped). Never throws. */
export async function messageUsers(userIds: Iterable<string | null | undefined>, subject: string, content: string): Promise<number> {
  const ids = [...new Set([...userIds].filter((id): id is string => !!id && id !== SYSTEM_USER_ID))];
  if (ids.length === 0) return 0;
  try {
    const { error } = await supabaseAdmin.from('private_messages').insert(ids.map((recipient_id) => ({ sender_id: SYSTEM_USER_ID, recipient_id, subject, content })));
    if (error) { console.error('site messages failed:', error.message); return 0; }
    return ids.length;
  } catch (e) {
    console.error('site messages threw', e);
    return 0;
  }
}

/** Every league staff member (site admins and CTF admins). */
export async function staffUserIds(): Promise<string[]> {
  const { data } = await supabaseAdmin.from('profiles').select('id').or('is_admin.eq.true,ctf_role.eq.ctf_admin');
  return ((data || []) as { id: string }[]).map((p) => p.id);
}

/** The captain and co-captains of these squads. */
export async function squadLeaderIds(squadIds: string[]): Promise<string[]> {
  if (squadIds.length === 0) return [];
  const [{ data: squads }, { data: members }] = await Promise.all([
    supabaseAdmin.from('squads').select('captain_id').in('id', squadIds),
    supabaseAdmin.from('squad_members').select('player_id').in('squad_id', squadIds).eq('status', 'active').in('role', ['captain', 'co_captain']),
  ]);
  return [...new Set([...((squads || []) as any[]).map((s) => s.captain_id), ...((members || []) as any[]).map((m) => m.player_id)].filter(Boolean))];
}
