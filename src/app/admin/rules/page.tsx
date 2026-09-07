'use client';

import { useState, useEffect, useCallback, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { toast } from 'react-hot-toast';
import { ArrowUp, ArrowDown, Pencil, Trash2, Plus, Eye, EyeOff } from 'lucide-react';
import { useAuth } from '@/lib/AuthContext';
import { supabase } from '@/lib/supabase';
import Navbar from '@/components/Navbar';
import RichTextEditor from '@/components/RichTextEditor';
import { getLeagues, type LeagueInfo } from '@/lib/leagues';
import { getLeagueRulesAdmin, toDoc, EMPTY_DOC, type RuleSection } from '@/lib/rules';

interface FormState {
  id: string | null;
  category: string;
  title: string;
  bodyJson: string;      // TipTap JSON as a string (what RichTextEditor emits)
  is_published: boolean;
}

const emptyForm = (): FormState => ({
  id: null, category: '', title: '', bodyJson: JSON.stringify(EMPTY_DOC), is_published: true,
});

function RulesAdminContent() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [authorized, setAuthorized] = useState(false);

  const [leagues, setLeagues] = useState<LeagueInfo[]>([]);
  const [slug, setSlug] = useState<string>(searchParams.get('league') || '');
  const [sections, setSections] = useState<RuleSection[]>([]);
  const [form, setForm] = useState<FormState | null>(null);
  const [saving, setSaving] = useState(false);

  // ---- auth gate ----
  useEffect(() => {
    if (authLoading) return;
    if (!user) { router.push('/auth/login'); return; }
    (async () => {
      const { data } = await supabase.from('profiles').select('is_admin, ctf_role').eq('id', user.id).single();
      const ok = data && (data.is_admin === true || data.ctf_role === 'ctf_admin');
      if (!ok) { toast.error('Unauthorized: CTF Admin access required'); router.push('/dashboard'); return; }
      setAuthorized(true);
    })();
  }, [user, authLoading, router]);

  useEffect(() => {
    if (!authorized) return;
    (async () => {
      const list = await getLeagues();
      setLeagues(list);
      setSlug((cur) => cur || list[0]?.slug || '');
    })();
  }, [authorized]);

  const load = useCallback(async () => {
    if (!slug) return;
    try {
      setSections(await getLeagueRulesAdmin(slug));
    } catch (err: any) {
      toast.error('Failed to load rules: ' + (err?.message || 'error'));
    }
  }, [slug]);

  useEffect(() => { if (authorized) load(); }, [authorized, load]);

  // ---- actions ----
  const startNew = () => setForm(emptyForm());
  const startEdit = (s: RuleSection) =>
    setForm({ id: s.id, category: s.category, title: s.title, bodyJson: JSON.stringify(toDoc(s.body)), is_published: s.is_published });

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form || !user) return;
    if (!form.title.trim() || !form.category.trim()) { toast.error('Category and title are required'); return; }
    setSaving(true);
    try {
      const body = toDoc(form.bodyJson);
      const payload = {
        league_slug: slug,
        category: form.category.trim(),
        title: form.title.trim(),
        body,
        is_published: form.is_published,
        source: 'admin',
        updated_by: user.id,
        updated_at: new Date().toISOString(),
      };
      if (form.id) {
        const { error } = await supabase.from('league_rules').update(payload).eq('id', form.id);
        if (error) throw error;
        toast.success('Section updated');
      } else {
        const maxOrder = sections.reduce((m, s) => Math.max(m, s.sort_order), 0);
        const { error } = await supabase.from('league_rules').insert({ ...payload, sort_order: maxOrder + 10 });
        if (error) throw error;
        toast.success('Section added');
      }
      setForm(null);
      load();
    } catch (err: any) {
      toast.error('Save failed: ' + (err?.message || 'error'));
    } finally {
      setSaving(false);
    }
  };

  const remove = async (s: RuleSection) => {
    if (!confirm(`Delete "${s.title}"?`)) return;
    const { error } = await supabase.from('league_rules').delete().eq('id', s.id);
    if (error) { toast.error('Delete failed: ' + error.message); return; }
    toast.success('Section deleted');
    load();
  };

  const togglePublished = async (s: RuleSection) => {
    const { error } = await supabase.from('league_rules').update({ is_published: !s.is_published, updated_at: new Date().toISOString() }).eq('id', s.id);
    if (error) { toast.error(error.message); return; }
    load();
  };

  const move = async (index: number, dir: -1 | 1) => {
    const a = sections[index];
    const b = sections[index + dir];
    if (!a || !b) return;
    // Swap sort orders (ensure distinct values even if equal)
    const orderA = b.sort_order === a.sort_order ? a.sort_order + dir : b.sort_order;
    const orderB = a.sort_order;
    const [r1, r2] = await Promise.all([
      supabase.from('league_rules').update({ sort_order: orderA }).eq('id', a.id),
      supabase.from('league_rules').update({ sort_order: orderB }).eq('id', b.id),
    ]);
    if (r1.error || r2.error) { toast.error('Reorder failed'); return; }
    load();
  };

  const categories = Array.from(new Set(sections.map((s) => s.category)));
  const inputCls = 'w-full bg-gray-900 border border-[#22D3EE]/30 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-[#22D3EE]';

  if (!authorized) {
    return (
      <div className="ctf-theme min-h-screen bg-gray-950">
        <Navbar />
        <div className="pt-32 text-center text-white/60">Checking access…</div>
      </div>
    );
  }

  return (
    <div className="ctf-theme min-h-screen bg-gray-950 text-white">
      <Navbar />
      <div className="max-w-5xl mx-auto px-6 pt-28 pb-20">
        <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
          <h1 className="font-display text-3xl text-[#E6EDF7]">Rules editor</h1>
          <div className="flex items-center gap-3">
            <select value={slug} onChange={(e) => { setSlug(e.target.value); setForm(null); }} className="bg-gray-900 border border-[#22D3EE]/30 rounded-lg px-3 py-2 text-sm">
              {leagues.map((l) => <option key={l.slug} value={l.slug}>{l.name}</option>)}
            </select>
            <Link href={`/rules?league=${slug}`} className="text-sm text-[#22D3EE] hover:underline">View page →</Link>
          </div>
        </div>

        {/* Section list */}
        <section className="rounded-2xl bg-[#131A2B] p-5 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-display text-xl text-[#E6EDF7]">Sections</h2>
            <button onClick={startNew} className="inline-flex items-center gap-2 bg-[#22D3EE] text-[#0B0F1A] font-medium px-3 py-1.5 rounded-lg text-sm hover:bg-[#67E8F9]">
              <Plus className="w-4 h-4" aria-hidden="true" /> New section
            </button>
          </div>
          {sections.length === 0 ? (
            <p className="text-[#8B98B0] text-sm">No sections yet for this league.</p>
          ) : (
            <div className="space-y-1.5">
              {sections.map((s, i) => (
                <div key={s.id} className={`flex items-center gap-3 rounded-lg px-3 py-2 ${s.is_published ? 'bg-[#1B2438]' : 'bg-[#1B2438]/50'}`}>
                  <div className="flex flex-col">
                    <button onClick={() => move(i, -1)} disabled={i === 0} className="text-[#8B98B0] hover:text-white disabled:opacity-20" title="Move up"><ArrowUp className="w-4 h-4" /></button>
                    <button onClick={() => move(i, 1)} disabled={i === sections.length - 1} className="text-[#8B98B0] hover:text-white disabled:opacity-20" title="Move down"><ArrowDown className="w-4 h-4" /></button>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm text-[#E6EDF7] truncate">{s.title}</div>
                    <div className="text-[11px] text-[#8B98B0]">
                      {s.category} · {s.source === 'pdf-seed' ? 'from PDF' : 'edited'}{!s.is_published && ' · unpublished'}
                    </div>
                  </div>
                  <button onClick={() => togglePublished(s)} className="text-[#8B98B0] hover:text-white" title={s.is_published ? 'Unpublish' : 'Publish'}>
                    {s.is_published ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                  </button>
                  <button onClick={() => startEdit(s)} className="text-[#22D3EE] hover:text-[#67E8F9]" title="Edit"><Pencil className="w-4 h-4" /></button>
                  <button onClick={() => remove(s)} className="text-[#F87171] hover:text-red-300" title="Delete"><Trash2 className="w-4 h-4" /></button>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Editor */}
        {form && (
          <section className="rounded-2xl bg-[#131A2B] p-5">
            <h2 className="font-display text-xl text-[#E6EDF7] mb-4">{form.id ? 'Edit section' : 'New section'}</h2>
            <form onSubmit={save} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-[#8B98B0] mb-1">Category (nav label)</label>
                  <input list="rule-categories" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} className={inputCls} placeholder="Scheduling" />
                  <datalist id="rule-categories">{categories.map((c) => <option key={c} value={c} />)}</datalist>
                </div>
                <div>
                  <label className="block text-xs text-[#8B98B0] mb-1">Section title</label>
                  <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className={inputCls} placeholder="4.0 Scheduling Rules" />
                </div>
              </div>
              <div>
                <label className="block text-xs text-[#8B98B0] mb-1">Content</label>
                <div className="bg-gray-900 rounded-lg border border-[#22D3EE]/30 p-2">
                  <RichTextEditor content={form.bodyJson} onChange={(json) => setForm((f) => (f ? { ...f, bodyJson: json } : f))} placeholder="Write the rules for this section…" />
                </div>
              </div>
              <div className="flex items-center justify-between flex-wrap gap-3">
                <label className="flex items-center gap-2 text-sm text-[#E6EDF7]">
                  <input type="checkbox" checked={form.is_published} onChange={(e) => setForm({ ...form, is_published: e.target.checked })} /> Published
                </label>
                <div className="flex gap-2">
                  <button type="button" onClick={() => setForm(null)} className="px-4 py-2 rounded-lg border border-white/20 text-white/80 hover:bg-white/5">Cancel</button>
                  <button type="submit" disabled={saving} className="px-4 py-2 rounded-lg bg-[#22D3EE] text-[#0B0F1A] font-medium hover:bg-[#67E8F9] disabled:opacity-50">
                    {saving ? 'Saving…' : 'Save section'}
                  </button>
                </div>
              </div>
            </form>
          </section>
        )}
      </div>
    </div>
  );
}

export default function RulesAdminPage() {
  return (
    <Suspense fallback={<div className="ctf-theme min-h-screen bg-gray-950" />}>
      <RulesAdminContent />
    </Suspense>
  );
}
