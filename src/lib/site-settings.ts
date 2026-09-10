import { createClient } from '@supabase/supabase-js';

/**
 * Server-only settings store: environment variable first, then the
 * `site_settings` table (add-site-settings.sql), cached for a minute.
 * Lets staff configure integrations from the admin UI without a redeploy.
 */

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const TTL = 60_000;
let cache: { at: number; values: Map<string, string> } | null = null;

async function loadAll(): Promise<Map<string, string>> {
  if (cache && Date.now() - cache.at < TTL) return cache.values;
  const values = new Map<string, string>();
  const { data, error } = await supabaseAdmin.from('site_settings').select('key, value');
  if (!error) (data || []).forEach((r: any) => { if (r.value) values.set(r.key, r.value); });
  cache = { at: Date.now(), values };
  return values;
}

export function invalidateSettings() { cache = null; }

/** env var (same name) → site_settings row → ''. */
export async function getSetting(key: string): Promise<string> {
  const env = process.env[key];
  if (env) return env;
  return (await loadAll()).get(key) || '';
}

/** Where a value comes from, for the admin panel. */
export async function settingSource(key: string): Promise<'env' | 'db' | 'none'> {
  if (process.env[key]) return 'env';
  return (await loadAll()).has(key) ? 'db' : 'none';
}

export async function setSetting(key: string, value: string | null, userId: string, isSecret = false) {
  const { error } = await supabaseAdmin
    .from('site_settings')
    .upsert({ key, value: value || null, is_secret: isSecret, updated_by: userId, updated_at: new Date().toISOString() });
  invalidateSettings();
  if (error) throw new Error(error.message);
}
