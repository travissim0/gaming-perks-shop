'use client';

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'react-hot-toast';
import { supabase } from '@/lib/supabase';
import { inputCls, labelCls } from '@/components/ctf/FormBits';

type Row = { set: boolean; source: string; preview: string | null };

const FIELDS = [
  { key: 'DISCORD_CLIENT_ID', label: 'Application (Client) ID', hint: 'Discord developer portal → your application → General Information.', secret: false },
  { key: 'DISCORD_CLIENT_SECRET', label: 'Client Secret', hint: 'OAuth2 page → Client Secret → Reset / Copy. Shown masked once saved.', secret: true },
  { key: 'DISCORD_GUILD_ID', label: 'CTFPL server ID', hint: 'Right-click the server icon with Developer Mode on → Copy Server ID.', secret: false },
] as const;

const btnDiscord = 'px-4 py-2 rounded-md text-sm font-medium bg-[#5865F2] text-white hover:bg-[#6B76F5] disabled:opacity-50 transition-colors';

/**
 * Staff panel for the Discord application settings that power the account
 * link. Values live in site_settings; environment variables override them.
 */
export default function DiscordAppPanel() {
  const [rows, setRows] = useState<Record<string, Row>>({});
  const [values, setValues] = useState<Record<string, string>>({});
  const [pendingSql, setPendingSql] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const res = await fetch('/api/admin/settings', { headers: { Authorization: `Bearer ${session.access_token}` }, cache: 'no-store' });
      const json = await res.json();
      if (json.pending_sql) { setPendingSql(true); return; }
      setRows(json.settings || {});
      const v: Record<string, string> = {};
      for (const f of FIELDS) v[f.key] = !f.secret && json.settings?.[f.key]?.preview ? json.settings[f.key].preview : '';
      setValues(v);
    } catch (e) {
      console.error('settings load failed', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const save = async () => {
    setSaving(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const body: Record<string, string> = {};
      for (const f of FIELDS) {
        const v = values[f.key] ?? '';
        // Secrets: only send when the staff member typed something new.
        if (f.secret && !v) continue;
        body[f.key] = v;
      }
      const res = await fetch('/api/admin/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
        body: JSON.stringify(body),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || 'Save failed');
      toast.success('Discord settings saved');
      setValues((v) => ({ ...v, DISCORD_CLIENT_SECRET: '' }));
      load();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  };

  const allSet = FIELDS.every((f) => rows[f.key]?.set);

  return (
    <section className="rounded-xl bg-[#131A2B]">
      <div className="px-5 py-3 flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.06]">
        <div>
          <h2 className="font-display text-lg text-[#E6EDF7] flex items-center gap-2">
            Discord app
            {!loading && !pendingSql && (
              <span className={`font-sans text-[10px] px-1.5 py-0.5 rounded uppercase tracking-wide ${allSet ? 'bg-[#34D399]/15 text-[#34D399]' : 'bg-[#F59E0B]/15 text-[#F59E0B]'}`}>
                {allSet ? 'Ready' : 'Incomplete'}
              </span>
            )}
          </h2>
          <div className="text-xs text-[#8B98B0]">
            {pendingSql
              ? 'Run add-site-settings.sql in Supabase to enable this panel.'
              : 'Powers “Connect Discord” on profiles and the CTFPL nickname lookup. Redirect URLs in the portal must include https://www.freeinf.org/api/discord/callback and https://freeinf.org/api/discord/callback.'}
          </div>
        </div>
        {!pendingSql && (
          <button onClick={save} disabled={saving || loading} className={btnDiscord}>
            {saving ? 'Saving…' : 'Save'}
          </button>
        )}
      </div>

      {!pendingSql && !loading && (
        <div className="p-5 grid grid-cols-1 md:grid-cols-3 gap-3">
          {FIELDS.map((f) => {
            const row = rows[f.key];
            return (
              <label key={f.key} className="block">
                <span className={labelCls}>
                  {f.label}
                  {row?.source === 'env' && <span className="ml-2 text-[10px] text-[#8B98B0]/60">from hosting env</span>}
                </span>
                <input
                  type={f.secret ? 'password' : 'text'}
                  value={values[f.key] ?? ''}
                  onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
                  placeholder={f.secret ? (row?.set ? `saved ${row.preview}` : 'paste the secret') : ''}
                  disabled={row?.source === 'env'}
                  autoComplete="off"
                  className={inputCls}
                />
                <span className="block text-[11px] text-[#8B98B0]/70 mt-1">{f.hint}</span>
              </label>
            );
          })}
        </div>
      )}
    </section>
  );
}
