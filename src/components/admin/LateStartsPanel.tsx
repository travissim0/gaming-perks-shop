'use client';

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'react-hot-toast';
import { supabase } from '@/lib/supabase';
import { btnPrimary, btnQuiet } from '@/components/ctf/FormBits';

/**
 * Staff panel: the late-starts switch (site_settings LATE_STARTS, default off).
 * On, a league match whose squad or people are still in an earlier match is held: the zone
 * queue carries a `hold` flag and the zone keeps that arena's timer from running out, then runs
 * a fresh 10-minute timer when the earlier match's result lands. Off, nothing is ever held and
 * referees extend timers by hand (*timer). Off since 2026-10-18 until tested with the zone.
 */
export default function LateStartsPanel() {
  const [on, setOn] = useState<boolean | null>(null);
  const [source, setSource] = useState<string>('none');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const res = await fetch('/api/admin/settings', { headers: { Authorization: `Bearer ${session.access_token}` }, cache: 'no-store' });
      const json = await res.json();
      if (json.pending_sql) return;
      const row = json.settings?.LATE_STARTS;
      setOn((row?.preview || '').toLowerCase() === 'on');
      setSource(row?.source || 'none');
    } catch (e) {
      console.error('late starts setting load failed', e);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const set = async (next: boolean) => {
    if (next && !confirm('Turn late starts on? A match whose squad or people are still in an earlier match will be held, and the zone will keep its arena timer from running out. The zone must already handle the queue\'s hold flag. Turn it off again if anyone is dropped.')) return;
    setSaving(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch('/api/admin/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
        body: JSON.stringify({ LATE_STARTS: next ? 'on' : 'off' }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || 'Save failed');
      toast.success(next ? 'Late starts are ON (takes effect within a minute)' : 'Late starts are OFF');
      await load();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className={`rounded-xl bg-[#131A2B] ${on ? 'ring-1 ring-[#F59E0B]/40' : ''}`}>
      <div className="px-5 py-3 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-lg text-[#E6EDF7] flex items-center gap-2">
            Late starts
            {on !== null && (
              <span className={`font-sans text-[10px] px-1.5 py-0.5 rounded uppercase tracking-wide ${on ? 'bg-[#F59E0B]/15 text-[#F59E0B]' : 'bg-white/5 text-[#8B98B0]'}`}>
                {on ? 'On' : 'Off'}
              </span>
            )}
          </h2>
          <div className="text-xs text-[#8B98B0] max-w-2xl">
            {on
              ? 'A match whose squad or people are still in an earlier match is held: the zone keeps its arena timer from running out, then runs a fresh 10-minute timer once that result lands. Start now on the match page lifts a hold; a hold gives up after 90 minutes.'
              : 'Nothing is held. If a match runs into the next one, the referee extends the next arena’s timer by hand (*timer). Turn on only after the zone handles the queue’s hold flag and a throwaway match has been run through it.'}
          </div>
        </div>
        <div className="flex gap-2">
          {on ? (
            <button onClick={() => set(false)} disabled={saving || source === 'env'} className={`${btnQuiet} text-[#F87171]`}>{saving ? 'Saving…' : 'Turn off'}</button>
          ) : (
            <button onClick={() => set(true)} disabled={saving || on === null || source === 'env'} className={btnPrimary}>{saving ? 'Saving…' : 'Turn on'}</button>
          )}
        </div>
      </div>
    </section>
  );
}
