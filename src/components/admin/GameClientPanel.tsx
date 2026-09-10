'use client';

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'react-hot-toast';
import { supabase } from '@/lib/supabase';
import { inputCls, labelCls, btnPrimary, btnQuiet } from '@/components/ctf/FormBits';

/**
 * Staff panel: the shared key the game client presents to read private
 * match setups (sides + lineups). Stored in site_settings as MATCH_CLIENT_KEY.
 */
export default function GameClientPanel() {
  const [row, setRow] = useState<{ set: boolean; source: string; preview: string | null } | null>(null);
  const [value, setValue] = useState('');
  const [reveal, setReveal] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const res = await fetch('/api/admin/settings', { headers: { Authorization: `Bearer ${session.access_token}` }, cache: 'no-store' });
      const json = await res.json();
      if (json.pending_sql) return;
      setRow(json.settings?.MATCH_CLIENT_KEY || null);
    } catch (e) {
      console.error('game client settings load failed', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const generate = () => {
    const bytes = new Uint8Array(24);
    crypto.getRandomValues(bytes);
    setValue(Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join(''));
    setReveal(true);
  };

  const save = async (clear = false) => {
    setSaving(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch('/api/admin/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
        body: JSON.stringify({ MATCH_CLIENT_KEY: clear ? '' : value }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || 'Save failed');
      toast.success(clear ? 'Game client key cleared' : 'Game client key saved — copy it to the game side now, it is not shown again');
      if (!clear) setReveal(true);
      else { setValue(''); setReveal(false); }
      load();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="rounded-xl bg-[#131A2B]">
      <div className="px-5 py-3 flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.06]">
        <div>
          <h2 className="font-display text-lg text-[#E6EDF7] flex items-center gap-2">
            Game client key
            {!loading && (
              <span className={`font-sans text-[10px] px-1.5 py-0.5 rounded uppercase tracking-wide ${row?.set ? 'bg-[#34D399]/15 text-[#34D399]' : 'bg-[#F59E0B]/15 text-[#F59E0B]'}`}>
                {row?.set ? 'Set' : 'Not set'}
              </span>
            )}
          </h2>
          <div className="text-xs text-[#8B98B0]">
            The zone / game client sends this as an <code className="text-[#E6EDF7]">X-Client-Key</code> header to read match sides and lineups, which are otherwise private. See docs/match-setup-client.md.
          </div>
        </div>
        <div className="flex gap-2">
          {row?.set && <button onClick={() => save(true)} disabled={saving} className={`${btnQuiet} text-[#F87171]`}>Clear</button>}
          <button onClick={() => save(false)} disabled={saving || loading || !value.trim()} className={btnPrimary}>{saving ? 'Saving…' : 'Save key'}</button>
        </div>
      </div>
      <div className="p-5 flex flex-wrap items-end gap-3">
        <label className="block flex-1 min-w-[280px]">
          <span className={labelCls}>Key{row?.set && row.preview ? <span className="ml-2 normal-case tracking-normal text-[#8B98B0]/70">current ends {row.preview}</span> : null}</span>
          <input
            type={reveal ? 'text' : 'password'}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder={row?.set ? 'paste a new key to replace the current one' : 'generate or paste a key'}
            autoComplete="off"
            className={`${inputCls} font-mono`}
            disabled={row?.source === 'env'}
          />
        </label>
        <button onClick={generate} className={btnQuiet} disabled={row?.source === 'env'}>Generate</button>
        {value && <button onClick={() => setReveal((r) => !r)} className={btnQuiet}>{reveal ? 'Hide' : 'Show'}</button>}
      </div>
    </section>
  );
}
