'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { toast } from 'react-hot-toast';
import { useAuth } from '@/lib/AuthContext';
import { supabase } from '@/lib/supabase';
import type { Squad } from '@/types/database';
import { FormPage, FormSection, Denied, inputCls, labelCls, btnPrimary, btnQuiet } from '@/components/ctf/FormBits';

interface League { id: string; slug: string; name: string; is_featured?: boolean }
interface SeasonOption { id: string; season_number: number; season_name: string | null; status: string }

const isAnalyst = (p: any) => !!p && (p.is_admin === true || p.ctf_role === 'ctf_admin' || String(p.ctf_role || '').includes('analyst'));

export default function CreateMatchReportPage() {
  const { user } = useAuth();
  const router = useRouter();
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [saving, setSaving] = useState(false);
  const [squads, setSquads] = useState<Squad[]>([]);
  const [leagues, setLeagues] = useState<League[]>([]);
  const [seasons, setSeasons] = useState<SeasonOption[]>([]);
  const [form, setForm] = useState({
    title: '',
    squad_a_id: '',
    squad_b_id: '',
    squad_a_name: '',
    squad_b_name: '',
    match_summary: '',
    match_highlights_video_url: '',
    match_date: new Date().toISOString().slice(0, 10),
    season_name: '',
    league_slug: '',
  });
  const set = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }));

  useEffect(() => {
    if (!user) { setAllowed(false); return; }
    supabase.from('profiles').select('is_admin, ctf_role').eq('id', user.id).maybeSingle().then(({ data }) => setAllowed(isAnalyst(data)));
  }, [user]);

  useEffect(() => {
    (async () => {
      const [{ data: ls }, sq] = await Promise.all([
        supabase.from('leagues').select('id, slug, name, is_featured').order('display_order').order('slug'),
        fetch('/api/squads').then((r) => (r.ok ? r.json() : { squads: [] })).catch(() => ({ squads: [] })),
      ]);
      const list = (ls || []) as League[];
      setLeagues(list);
      setSquads(sq.squads || []);
      if (!form.league_slug && list.length) set('league_slug', (list.find((l) => l.is_featured) || list[0]).slug);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!form.league_slug) return;
    (async () => {
      let data: SeasonOption[] = [];
      if (form.league_slug === 'ctfpl') {
        data = ((await supabase.from('ctfpl_seasons').select('id, season_number, season_name, status').order('season_number', { ascending: false })).data || []) as SeasonOption[];
      } else {
        const L = leagues.find((l) => l.slug === form.league_slug);
        if (L) data = ((await supabase.from('league_seasons').select('id, season_number, season_name, status').eq('league_id', L.id).order('season_number', { ascending: false })).data || []) as SeasonOption[];
      }
      setSeasons(data);
      const active = data.find((s) => s.status === 'active') || data.find((s) => s.status === 'upcoming');
      set('season_name', active ? active.season_name || `Season ${active.season_number}` : '');
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.league_slug, leagues]);

  const pickSquad = (side: 'a' | 'b', id: string) => {
    const s = squads.find((x) => x.id === id);
    setForm((f) => ({ ...f, [`squad_${side}_id`]: id, [`squad_${side}_name`]: s ? s.name : f[`squad_${side}_name`] }));
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title || !form.squad_a_name || !form.squad_b_name || !form.match_summary || !form.season_name) { toast.error('Title, both squads, season and summary are required'); return; }
    setSaving(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch('/api/match-reports', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` }, body: JSON.stringify(form) });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || 'Could not create the report');
      toast.success('Report created. Now add the players.');
      router.push(`/league/match-reports/${j.report.id}/add-player`);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  };

  if (allowed === false) return <Denied user={user} back="/league/match-reports" backLabel="Match reports" what="write match reports" />;

  return (
    <FormPage user={user} back="/league/match-reports" backLabel="Match reports" title="Write a match report" subtitle="Cover the match first. Player ratings and clips come on the next screen.">
      <form onSubmit={submit} className="space-y-4">
        <FormSection n="01" title="Match" hint="Required">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <div className="md:col-span-2">
              <label className={labelCls}>League</label>
              <div className="flex gap-1 flex-wrap">
                {leagues.map((l) => (
                  <button key={l.slug} type="button" onClick={() => set('league_slug', l.slug)} className={`px-3 py-1.5 rounded-md text-sm transition-colors ${form.league_slug === l.slug ? 'bg-[#22D3EE]/15 text-[#22D3EE]' : 'text-[#8B98B0] hover:text-[#E6EDF7] hover:bg-white/5'}`}>{l.name}</button>
                ))}
              </div>
            </div>
            <div>
              <label className={labelCls}>Season</label>
              <select value={form.season_name} onChange={(e) => set('season_name', e.target.value)} className={inputCls} style={{ colorScheme: 'dark' }} required>
                <option value="">Pick…</option>
                {seasons.map((s) => { const n = s.season_name || `Season ${s.season_number}`; return <option key={s.id} value={n}>{n}{s.status === 'active' ? ' · current' : ''}</option>; })}
              </select>
            </div>
            <div>
              <label className={labelCls}>Match date</label>
              <input type="date" value={form.match_date} onChange={(e) => set('match_date', e.target.value)} className={inputCls} style={{ colorScheme: 'dark' }} required />
            </div>
            <div className="md:col-span-4">
              <label className={labelCls}>Title</label>
              <input value={form.title} onChange={(e) => set('title', e.target.value)} placeholder={`${(form.league_slug || 'ctfdl').toUpperCase()} S5 Week 3 · AE vs PT`} className={inputCls} required />
            </div>
          </div>
        </FormSection>

        <FormSection n="02" title="Squads" hint="Pick from the list, or type a name for a squad that isn't on the site">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {(['a', 'b'] as const).map((side) => (
              <div key={side} className="space-y-2">
                <label className={labelCls}>Squad {side.toUpperCase()}</label>
                <select value={form[`squad_${side}_id`]} onChange={(e) => pickSquad(side, e.target.value)} className={inputCls} style={{ colorScheme: 'dark' }}>
                  <option value="">Pick a squad…</option>
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
              <textarea value={form.match_summary} onChange={(e) => set('match_summary', e.target.value)} rows={8} placeholder="How the match went: key moments, what decided it, who stood out…" className={`${inputCls} resize-y`} required />
            </div>
            <div>
              <label className={labelCls}>Highlights video (optional)</label>
              <input type="url" value={form.match_highlights_video_url} onChange={(e) => set('match_highlights_video_url', e.target.value)} placeholder="https://youtube.com/watch?v=…" className={inputCls} />
            </div>
          </div>
        </FormSection>

        <div className="flex justify-end gap-2">
          <Link href="/league/match-reports" className={btnQuiet}>Cancel</Link>
          <button type="submit" disabled={saving} className={btnPrimary}>{saving ? 'Creating…' : 'Create and add players'}</button>
        </div>
      </form>
    </FormPage>
  );
}
