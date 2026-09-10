import { supabase } from '@/lib/supabase';

export type SquadPatch = Partial<{
  is_active: boolean;
  is_legacy: boolean;
  tournament_eligible: boolean;
  league_slug: string | null;
}>;

/** Staff-only squad update through the service-role API (browser writes are blocked by RLS). */
export async function patchSquads(ids: string | string[], patch: SquadPatch): Promise<number> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Session expired — sign in again');
  const res = await fetch('/api/admin/squads', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
    body: JSON.stringify({ ids: Array.isArray(ids) ? ids : [ids], patch }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || `Update failed (${res.status})`);
  return json.updated as number;
}
