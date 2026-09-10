'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import { toast } from 'react-hot-toast';
import { useAuth } from '@/lib/AuthContext';
import { supabase } from '@/lib/supabase';
import type { Squad } from '@/types/database';
import { FormPage, FormSection, Denied, inputCls, labelCls, btnPrimary, btnQuiet, btnDanger } from '@/components/ctf/FormBits';

const isAnalyst = (p: any) => !!p && (p.is_admin === true || p.ctf_role === 'ctf_admin' || String(p.ctf_role || '').includes('analyst'));

export default function EditMatchReportPage() {
  const { user } = useAuth();
  const router = useRouter();
  const params = useParams();
  const id = params.id as string;
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [squads, setSquads] = useState<Squad[]>([]);
  const [form, setForm] = useState({
    title: '', squad_a_id: '', squad_b_id: '', squad_a_name: '', squad_b_name: '',
    match_summary: '', match_highlights_video_url: '', match_date: '', season_name: '',
  });
  const set = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }));

  useEffect(() => {
    if (!user) { setAllowed(false); return; }
    supabase.from('profiles').select('is_admin, ctf_role').eq('id', user.id).maybeSingle().then(({ data }) => setAllowed(isAnalyst(data)));
  }, [user]);

  useEffect(() => {
    if (!id) return;
    (async () => {
      try {
        const [r, sq] = await Promise.all([fetch(`/api/match-reports/${id}`), fetch('/api/squads').then((x) => (x.ok ? x.json() : { squads: [] })).catch(() => ({ squads: [] }))]);
        if (!r.ok) throw new Error('Could not load the report');
        const d = (await r.json()).report;
        setForm({
          title: d.title || '', squad_a_id: d.squad_a_id || '', squad_b_id: d.squad_b_id || '', squad_a_name: d.squad_a_name || '', squad_b_name: d.squad_b_name || '',
          match_summary: d.match_summary || '', match_highlights_video_url: d.match_highlights_video_url || '', match_date: (d.match_date || '').slice(0, 10), season_name: d.season_name || '',
        });
        setSquads(sq.squads || []);
      } catch (e: any) {
        toast.error(e.message);
        router.push('/league/match-reports');
      } finally {
        setLoading(false);
      }
    })();
  }, [id, router]);

  const auth = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    return { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` };
  };
  const pickSquad = (side: 'a' | 'b', sid: string) => {
    const s = squads.find((x) => x.id === sid);
    setForm((f) => ({ ...f, [`squad_${side}_id`]: sid, [`squad_${side}_name`]: s ? s.name : f[`squad_${side}_name`] }));
  };
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title || !form.squad_a_name || !form.squad_b_name || !form.match_summary || !form.season_name) { toast.error('Title, both squads, season and summary are required'); return; }
    setSaving(true);
    try {
      const res = await fetch(`/api/match-reports/${id}`, { method: 'PUT', headers: await auth(), body: JSON.stringify(form) });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || 'Could not save');
      toast.success('Report saved');
      router.push(`/league/match-reports/${id}`);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  };
  const remove = async () => {
    if (!confirm('Delete this report and all its player ratings? This cannot be undone.')) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/match-reports/${id}`, { method: 'DELETE', headers: await auth() });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Could not delete');
      toast.success('Report deleted');
      router.push('/league/match-reports');
    } catch (e: any) {
      toast.error(e.message);
      setSaving(false);
    }
  };

  if (allowed === false) return <Denied user={user} back={`/league/match-reports/${id}`} backLabel="Back to the report" what="edit match reports" />;

  return (
    <FormPage user={user} back={`/league/match-reports/${id}`} backLabel="Back to the report" title="Edit match report" subtitle={loading ? 'Loading…' : form.title}>
      {!loading && (
        <form onSubmit={submit} className="space-y-4">
          <FormSection n="01" title="Match">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
              <div className="md:col-span-2">
                <label className={labelCls}>Title</label>
                <input value={form.title} onChange={(e) => set('title', e.target.value)} className={inputCls} required />
              </div>
              <div>
                <label className={labelCls}>Season</label>
                <input value={form.season_name} onChange={(e) => set('season_name', e.target.value)} className={inputCls} required />
              </div>
              <div>
                <label className={labelCls}>Match date</label>
                <input type="date" value={form.match_date} onChange={(e) => set('match_date', e.target.value)} className={inputCls} style={{ colorScheme: 'dark' }} required />
              </div>
            </div>
          </FormSection>
          <FormSection n="02" title="Squads">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {(['a', 'b'] as const).map((side) => (
                <div key={side} className="space-y-2">
                  <label className={labelCls}>Squad {side.toUpperCase()}</label>
                  <select value={form[`squad_${side}_id`]} onChange={(e) => pickSquad(side, e.target.value)} className={inputCls} style={{ colorScheme: 'dark' }}>
                    <option value="">Not linked to a squad on the site</option>
                    {squads.map((s) => <option key={s.id} value={s.id}>{s.tag ? `[${s.tag}] ` : ''}{s.name}</option>)}
                  </select>
                  <input value={form[`squad_${side}_name`]} onChange={(e) => set(`squad_${side}_name`, e.target.value)} placeholder="Squad name" className={inputCls} required />
                </div>
              ))}
            </div>
          </FormSection>
          <FormSection n="03" title="Write-up">
            <div className="space-y-3">
              <div>
                <label className={labelCls}>Match summary</label>
                <textarea value={form.match_summary} onChange={(e) => set('match_summary', e.target.value)} rows={8} className={`${inputCls} resize-y`} required />
              </div>
              <div>
                <label className={labelCls}>Highlights video (optional)</label>
                <input type="url" value={form.match_highlights_video_url} onChange={(e) => set('match_highlights_video_url', e.target.value)} placeholder="https://youtube.com/watch?v=…" className={inputCls} />
              </div>
            </div>
          </FormSection>
          <div className="flex items-center justify-between gap-2">
            <button type="button" onClick={remove} disabled={saving} className={btnDanger}>Delete report</button>
            <div className="flex gap-2">
              <Link href={`/league/match-reports/${id}`} className={btnQuiet}>Cancel</Link>
              <button type="submit" disabled={saving} className={btnPrimary}>{saving ? 'Saving…' : 'Save changes'}</button>
            </div>
          </div>
        </form>
      )}
    </FormPage>
  );
}
