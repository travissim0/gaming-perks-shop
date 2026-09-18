'use client';

import { useEffect, useState } from 'react';
import { toast } from 'react-hot-toast';
import { supabase } from '@/lib/supabase';
import { getLeagues, pickFeatured, getOpenSeason, getLatestSeason, type LeagueInfo, type LeagueSeason } from '@/lib/leagues';
import { CLASSIC_RULES, POINTS_RULES, normalizeRules, describeRules, TIEBREAKER_LABEL, type ScoringRules } from '@/lib/scoring';
import { Chip } from '@/components/ctf/AdminBits';
import { inputCls, labelCls, btnPrimary, btnQuiet } from '@/components/ctf/FormBits';

/**
 * Staff panel: how this season is scored. A preset (classic 3/1/0 or the
 * points system with RS/FS matches) with every number editable. Saving
 * rebuilds the standings under the new rules.
 */
export default function ScoringRulesPanel() {
  const [league, setLeague] = useState<LeagueInfo | null>(null);
  const [season, setSeason] = useState<LeagueSeason | null>(null);
  const [rules, setRules] = useState<ScoringRules>(CLASSIC_RULES);
  const [dirty, setDirty] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const L = pickFeatured(await getLeagues());
        if (!L) return;
        setLeague(L);
        const S = (await getOpenSeason(L)) || (await getLatestSeason(L));
        setSeason(S);
        setRules(normalizeRules(S?.scoring_rules));
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const set = (patch: Partial<ScoringRules>) => { setRules((r) => ({ ...r, ...patch })); setDirty(true); };
  const setPts = (kind: 'rs' | 'fs', key: keyof ScoringRules['points']['rs'], v: string) => {
    const n = Number(v);
    if (Number.isNaN(n)) return;
    setRules((r) => ({ ...r, points: { ...r.points, [kind]: { ...r.points[kind], [key]: n } } }));
    setDirty(true);
  };
  const setFs = (patch: Partial<ScoringRules['fs']>) => { setRules((r) => ({ ...r, fs: { ...r.fs, ...patch } })); setDirty(true); };

  const save = async () => {
    if (!league || !season) return;
    setSaving(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Not signed in');
      const res = await fetch('/api/league/season', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ action: 'scoring_rules', league_slug: league.slug, season_id: season.id, rules }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || `Request failed (${res.status})`);
      setDirty(false);
      toast.success(json.rebuild_error ? `Rules saved; standings rebuild failed: ${json.rebuild_error}` : `Rules saved · standings rebuilt (${json.rebuilt} squads)`);
    } catch (e: any) {
      toast.error(e.message || 'Could not save rules');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="rounded-xl bg-[#131A2B] px-5 py-4 text-sm text-[#8B98B0]">Loading scoring…</div>;
  if (!league) return null;
  if (league.data_source === 'ctfpl') return null;

  const num = (v: number, on: (s: string) => void, w = 'w-16') => (
    <input type="number" value={v} onChange={(e) => on(e.target.value)} className={`${inputCls} ${w} text-center tabular-nums`} />
  );
  const isPoints = rules.preset === 'points';

  return (
    <section className="rounded-xl bg-[#131A2B]">
      <div className="px-5 py-3 flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.06]">
        <div>
          <h2 className="font-display text-lg text-[#E6EDF7]">Scoring · {league.name}{season ? ` Season ${season.season_number}` : ''}</h2>
          <div className="text-xs text-[#8B98B0]">How results turn into standings this season. Saving re-scores every recorded match.</div>
        </div>
        <div className="flex items-center gap-2">
          {dirty && <button type="button" onClick={() => { setRules(normalizeRules(season?.scoring_rules)); setDirty(false); }} className={btnQuiet}>Discard</button>}
          <button type="button" onClick={save} disabled={!dirty || saving || !season} className={btnPrimary}>{saving ? 'Saving…' : 'Save & rebuild standings'}</button>
        </div>
      </div>

      {!season ? (
        <p className="p-5 text-sm text-[#8B98B0]">No season yet. Create one first.</p>
      ) : (
        <div className="p-5 space-y-5">
          <div className="flex flex-wrap items-center gap-2">
            <span className={labelCls}>Preset</span>
            <Chip active={!isPoints} onClick={() => { setRules({ ...CLASSIC_RULES }); setDirty(true); }}>Classic · 3 / 1 / 0</Chip>
            <Chip active={isPoints} onClick={() => { setRules({ ...POINTS_RULES }); setDirty(true); }}>Points · RS + FS</Chip>
          </div>

          <div className="overflow-x-auto">
            <table className="text-sm">
              <thead>
                <tr className="text-[11px] uppercase tracking-wide text-[#8B98B0]">
                  <th className="pr-4 py-1 text-left font-medium">Result</th>
                  <th className="px-2 py-1 font-medium">RS</th>
                  {isPoints && <th className="px-2 py-1 font-medium">FS</th>}
                </tr>
              </thead>
              <tbody className="text-[#E6EDF7]">
                {([
                  ['regulation', isPoints ? `Win under ${rules.ot_minutes} min` : 'Win'],
                  ['ot', `Win in OT (${rules.ot_minutes}–${rules.ot2_minutes})`],
                  ['ot2', `Win in 2OT (${rules.ot2_minutes}+)`],
                  ['loss', 'Played and lost'],
                  ['forfeit', 'Forfeit / no-show'],
                ] as const).filter(([k]) => isPoints || (k !== 'ot' && k !== 'ot2')).map(([k, label]) => (
                  <tr key={k}>
                    <td className="pr-4 py-1">{label}</td>
                    <td className="px-2 py-1">{num(rules.points.rs[k], (v) => setPts('rs', k, v))}</td>
                    {isPoints && <td className="px-2 py-1">{k === 'forfeit' && rules.fs.forfeit_no_contest ? <span className="text-xs text-[#8B98B0]">no contest</span> : num(rules.points.fs[k], (v) => setPts('fs', k, v))}</td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {isPoints && (
            <>
              <div className="flex flex-wrap items-end gap-3">
                <label className="block"><span className={labelCls}>OT from (min)</span>{num(rules.ot_minutes, (v) => set({ ot_minutes: Number(v) || 0 }), 'w-20')}</label>
                <label className="block"><span className={labelCls}>2OT from (min)</span>{num(rules.ot2_minutes, (v) => set({ ot2_minutes: Number(v) || 0 }), 'w-20')}</label>
                <label className="block"><span className={labelCls}>Playoff spots</span>{num(rules.playoff_spots, (v) => set({ playoff_spots: Number(v) || 0 }), 'w-20')}</label>
              </div>
              <div>
                <div className={labelCls}>Free-scheduled limits</div>
                <div className="flex flex-wrap items-end gap-3">
                  <label className="block"><span className="block text-xs text-[#8B98B0] mb-1">Per squad per week</span>{num(rules.fs.per_week, (v) => setFs({ per_week: Number(v) || 0 }))}</label>
                  <label className="block"><span className="block text-xs text-[#8B98B0] mb-1">Vs same squad per week</span>{num(rules.fs.per_opponent_week, (v) => setFs({ per_opponent_week: Number(v) || 0 }))}</label>
                  <label className="block"><span className="block text-xs text-[#8B98B0] mb-1">Vs same squad per season</span>{num(rules.fs.per_opponent_season, (v) => setFs({ per_opponent_season: Number(v) || 0 }))}</label>
                  <Chip active={rules.fs.needs_verification} onClick={() => setFs({ needs_verification: !rules.fs.needs_verification })}>Needs ref or recording</Chip>
                  <Chip active={rules.fs.forfeit_no_contest} onClick={() => setFs({ forfeit_no_contest: !rules.fs.forfeit_no_contest })}>Forfeit = no contest</Chip>
                </div>
                <p className="mt-1 text-[11px] text-[#8B98B0]">Weeks run Monday to Sunday, league time. FS closes when the regular season ends.</p>
              </div>
            </>
          )}

          <div>
            <div className={labelCls}>Tiebreakers, in order</div>
            <div className="text-sm text-[#E6EDF7]">points → {rules.tiebreakers.map((t) => TIEBREAKER_LABEL[t]).join(' → ')}</div>
          </div>

          <div className="rounded-md bg-[#1B2438] px-3 py-2 text-xs text-[#8B98B0]">
            <div className="text-[10px] uppercase tracking-wide mb-1">Shown on the standings page as</div>
            <ul className="space-y-0.5">{describeRules(rules).map((l) => <li key={l}>{l}</li>)}</ul>
          </div>
        </div>
      )}
    </section>
  );
}
