'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import { toast } from 'react-hot-toast';
import { useAuth } from '@/lib/AuthContext';
import { supabase } from '@/lib/supabase';
import type { MatchReportWithDetails, MatchPlayerRating, Profile } from '@/types/database';
import { getRatingColor, getStarDisplay } from '@/utils/ratingUtils';
import { CLASS_OPTIONS } from '@/lib/constants';
import { FormPage, FormSection, Denied, inputCls, labelCls, btnPrimary, btnQuiet } from '@/components/ctf/FormBits';

const isAnalyst = (p: any) => !!p && (p.is_admin === true || p.ctf_role === 'ctf_admin' || String(p.ctf_role || '').includes('analyst'));
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
const r1 = (n: number) => Math.round(n * 10) / 10;

/** Add one player's rating to a report. Stays on the page after saving so several players can be added in a row. */
export default function AddPlayerRatingPage() {
  const { user } = useAuth();
  const router = useRouter();
  const params = useParams();
  const id = params.id as string;
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [report, setReport] = useState<MatchReportWithDetails | null>(null);
  const [existing, setExisting] = useState<MatchPlayerRating[]>([]);
  const [players, setPlayers] = useState<Profile[]>([]);
  const [saving, setSaving] = useState(false);
  const [alias, setAlias] = useState('');
  const [playerId, setPlayerId] = useState('');
  const [cls, setCls] = useState('');
  const [desc, setDesc] = useState('');
  const [clip, setClip] = useState('');
  const [kills, setKills] = useState('0');
  const [deaths, setDeaths] = useState('0');
  const [turret, setTurret] = useState('');
  const [before, setBefore] = useState(3.0);
  const [adjust, setAdjust] = useState(0.0);

  const after = useMemo(() => r1(clamp(before + adjust, 0, 6)), [before, adjust]);

  useEffect(() => {
    if (!user) { setAllowed(false); return; }
    supabase.from('profiles').select('is_admin, ctf_role').eq('id', user.id).maybeSingle().then(({ data }) => setAllowed(isAnalyst(data)));
  }, [user]);

  const load = async () => {
    const r = await fetch(`/api/match-reports/${id}`);
    if (!r.ok) { toast.error('Could not load the report'); router.push('/league/match-reports'); return; }
    const j = await r.json();
    setReport(j.report);
    setExisting(j.playerRatings || []);
  };
  useEffect(() => {
    if (!id) return;
    load();
    fetch('/api/profile/all').then((r) => (r.ok ? r.json() : { profiles: [] })).then((j) => setPlayers(j.profiles || [])).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const pickPlayer = (pid: string) => {
    setPlayerId(pid);
    const p = players.find((x) => x.id === pid);
    if (p?.in_game_alias) setAlias(p.in_game_alias);
  };

  const submit = async (e: React.FormEvent, addAnother: boolean) => {
    e.preventDefault();
    if (!alias.trim() || !cls || !desc.trim()) { toast.error('Player, class and notes are required'); return; }
    setSaving(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Sign in again');
      const body = {
        player_alias: alias.trim(),
        player_id: playerId || null,
        class_position: cls,
        performance_description: desc.trim(),
        highlight_clip_url: clip.trim() || null,
        kills: Number(kills) || 0,
        deaths: Number(deaths) || 0,
        turret_damage: turret.trim() ? Number(turret) : null,
        rating_before: before,
        rating_adjustment: adjust,
        rating_after: after,
        display_order: existing.length,
      };
      const res = await fetch(`/api/match-reports/${id}/player-ratings`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` }, body: JSON.stringify(body) });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || 'Could not add the player');
      toast.success(`${alias.trim()} added`);
      if (addAnother) {
        setAlias(''); setPlayerId(''); setCls(''); setDesc(''); setClip(''); setKills('0'); setDeaths('0'); setTurret(''); setBefore(3.0); setAdjust(0);
        await load();
      } else {
        router.push(`/league/match-reports/${id}`);
      }
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  };

  if (allowed === false) return <Denied user={user} back={`/league/match-reports/${id}`} backLabel="Back to the report" what="rate players" />;

  const sorted = [...players].sort((a, b) => (a.in_game_alias || '').localeCompare(b.in_game_alias || ''));

  return (
    <FormPage
      user={user}
      back={`/league/match-reports/${id}`}
      backLabel="Back to the report"
      title="Rate a player"
      subtitle={report ? <>{report.title} · {existing.length} player{existing.length === 1 ? '' : 's'} rated so far{existing.length > 0 && <>: {existing.map((p) => p.player_alias).join(', ')}</>}</> : 'Loading…'}
    >
      <form onSubmit={(e) => submit(e, false)} className="space-y-4">
        <FormSection n="01" title="Who" hint="Pick a site account so the rating links to their profile, or type a name">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label className={labelCls}>Site account</label>
              <select value={playerId} onChange={(e) => pickPlayer(e.target.value)} className={inputCls} style={{ colorScheme: 'dark' }}>
                <option value="">Not on the site / type a name</option>
                {sorted.filter((p) => p.in_game_alias).map((p) => <option key={p.id} value={p.id}>{p.in_game_alias}</option>)}
              </select>
            </div>
            <div>
              <label className={labelCls}>Alias as it should appear</label>
              <input value={alias} onChange={(e) => setAlias(e.target.value)} className={inputCls} required />
            </div>
            <div>
              <label className={labelCls}>Class / position</label>
              <select value={cls} onChange={(e) => setCls(e.target.value)} className={inputCls} style={{ colorScheme: 'dark' }} required>
                <option value="">Pick…</option>
                {CLASS_OPTIONS.map((c) => <option key={c} value={c}>{c}</option>)}
                <option value="Captain">Captain</option>
                <option value="Flex">Flex</option>
              </select>
            </div>
          </div>
        </FormSection>

        <FormSection n="02" title="Rating" hint="Out of 6">
          <div className="grid grid-cols-1 md:grid-cols-[1fr_1fr_auto] gap-4 items-end">
            <div>
              <label className={labelCls}>Rating before · {before.toFixed(1)}</label>
              <input type="range" min={0} max={6} step={0.1} value={before} onChange={(e) => setBefore(Number(e.target.value))} className="w-full accent-[#22D3EE]" />
            </div>
            <div>
              <label className={labelCls}>Adjustment · {adjust >= 0 ? '+' : ''}{adjust.toFixed(1)}</label>
              <input type="range" min={-2} max={2} step={0.1} value={adjust} onChange={(e) => setAdjust(Number(e.target.value))} className="w-full accent-[#F59E0B]" />
            </div>
            <div className="rounded-lg bg-[#1B2438] px-4 py-3 text-center min-w-[9rem]">
              <div className="text-[11px] uppercase tracking-wide text-[#8B98B0]">After</div>
              <div className={`font-display text-4xl leading-none ${getRatingColor(after)}`}>{after.toFixed(1)}</div>
              <div className="flex justify-center mt-1">{getStarDisplay(after)}</div>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3 mt-4">
            <div><label className={labelCls}>Kills</label><input type="number" min={0} value={kills} onChange={(e) => setKills(e.target.value)} className={inputCls} /></div>
            <div><label className={labelCls}>Deaths</label><input type="number" min={0} value={deaths} onChange={(e) => setDeaths(e.target.value)} className={inputCls} /></div>
            <div><label className={labelCls}>Turret damage (optional)</label><input type="number" min={0} value={turret} onChange={(e) => setTurret(e.target.value)} className={inputCls} /></div>
          </div>
        </FormSection>

        <FormSection n="03" title="Notes">
          <div className="space-y-3">
            <div>
              <label className={labelCls}>How they played</label>
              <textarea value={desc} onChange={(e) => setDesc(e.target.value)} rows={5} placeholder="What they did well, what cost the team, what to watch next week…" className={`${inputCls} resize-y`} required />
            </div>
            <div>
              <label className={labelCls}>Highlight clip (optional)</label>
              <input value={clip} onChange={(e) => setClip(e.target.value)} placeholder="YouTube link or embed code" className={inputCls} />
            </div>
          </div>
        </FormSection>

        <div className="flex flex-wrap justify-end gap-2">
          <Link href={`/league/match-reports/${id}`} className={btnQuiet}>Done</Link>
          <button type="button" onClick={(e) => submit(e as any, true)} disabled={saving} className={btnQuiet}>{saving ? 'Saving…' : 'Save and add another'}</button>
          <button type="submit" disabled={saving} className={btnPrimary}>{saving ? 'Saving…' : 'Save and view report'}</button>
        </div>
      </form>
    </FormPage>
  );
}
