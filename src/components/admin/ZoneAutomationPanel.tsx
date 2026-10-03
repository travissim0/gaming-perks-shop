'use client';

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'react-hot-toast';
import { supabase } from '@/lib/supabase';
import { btnPrimary, btnQuiet } from '@/components/ctf/FormBits';

/**
 * Staff panel: the site-wide zone automation switch (site_settings ZONE_AUTOMATION).
 * Off empties the zone queue, so the zone opens no match arenas, places nobody and applies
 * no subs, with no change needed on the zone side. Individual matches can also be taken
 * out of the queue from their match page ("Run by hand").
 */
export default function ZoneAutomationPanel() {
  const [off, setOff] = useState<boolean | null>(null);
  const [source, setSource] = useState<string>('none');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const res = await fetch('/api/admin/settings', { headers: { Authorization: `Bearer ${session.access_token}` }, cache: 'no-store' });
      const json = await res.json();
      if (json.pending_sql) return;
      const row = json.settings?.ZONE_AUTOMATION;
      setOff((row?.preview || '').toLowerCase() === 'off');
      setSource(row?.source || 'none');
    } catch (e) {
      console.error('zone automation setting load failed', e);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const set = async (nextOff: boolean) => {
    if (nextOff && !confirm('Turn zone automation off for every league match? The zone will open no arenas, place nobody and apply no subs until it is turned back on.')) return;
    setSaving(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch('/api/admin/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
        body: JSON.stringify({ ZONE_AUTOMATION: nextOff ? 'off' : 'on' }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || 'Save failed');
      toast.success(nextOff ? 'Zone automation is OFF: matches run by hand' : 'Zone automation is back on');
      await load();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className={`rounded-xl bg-[#131A2B] ${off ? 'ring-1 ring-[#F87171]/40' : ''}`}>
      <div className="px-5 py-3 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-lg text-[#E6EDF7] flex items-center gap-2">
            Zone automation
            {off !== null && (
              <span className={`font-sans text-[10px] px-1.5 py-0.5 rounded uppercase tracking-wide ${off ? 'bg-[#F87171]/15 text-[#F87171]' : 'bg-[#34D399]/15 text-[#34D399]'}`}>
                {off ? 'Off' : 'On'}
              </span>
            )}
          </h2>
          <div className="text-xs text-[#8B98B0] max-w-2xl">
            {off
              ? 'The zone queue is empty: no match arenas are opened, nobody is placed and subs are not applied. Referees run every match by hand. Lineups and side picks still work on the site.'
              : 'The zone opens each league match’s arena, places the lineups and applies subs. Turn it off if placement misbehaves on match night; one match at a time can be taken out from its match page.'}
          </div>
        </div>
        <div className="flex gap-2">
          {off ? (
            <button onClick={() => set(false)} disabled={saving || source === 'env'} className={btnPrimary}>{saving ? 'Saving…' : 'Turn on'}</button>
          ) : (
            <button onClick={() => set(true)} disabled={saving || off === null || source === 'env'} className={`${btnQuiet} text-[#F87171]`}>{saving ? 'Saving…' : 'Turn off'}</button>
          )}
        </div>
      </div>
    </section>
  );
}
