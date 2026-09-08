'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import Navbar from '@/components/Navbar';
import { useAuth } from '@/lib/AuthContext';
import { supabase } from '@/lib/supabase';
import { useDraft } from '@/components/ctfdl/useDraft';
import { teamIndexForPick } from '@/lib/ctfdl-draft';

interface DraftSeasonOption { season_id: string; season_number: number; season_name: string | null; status: string }

/** Draft recap: the full board by round for a CTFDL season. */
export default function CtfdlDraftRecapPage() {
  const { user } = useAuth();
  const [options, setOptions] = useState<DraftSeasonOption[]>([]);
  const [seasonId, setSeasonId] = useState<string | null>(null);
  const { bundle, loading } = useDraft({ seasonId });

  // Seasons that have a draft (public read on ctfdl_drafts).
  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from('ctfdl_drafts')
        .select('league_season_id, status, league_seasons(season_number, season_name)')
        .order('created_at', { ascending: false });
      const opts: DraftSeasonOption[] = ((data || []) as any[]).map((r) => ({
        season_id: r.league_season_id,
        season_number: r.league_seasons?.season_number ?? 0,
        season_name: r.league_seasons?.season_name ?? null,
        status: r.status,
      }));
      setOptions(opts);
      try {
        const q = new URLSearchParams(window.location.search).get('season');
        if (q && opts.some((o) => o.season_id === q)) setSeasonId(q);
      } catch { /* ignore */ }
    })();
  }, []);

  const draft = bundle?.draft;
  const teams = useMemo(() => [...(bundle?.teams || [])].sort((a, b) => a.pick_order - b.pick_order), [bundle]);
  const picks = bundle?.picks || [];
  const players = bundle?.players || [];
  const playerById = useMemo(() => Object.fromEntries(players.map((p) => [p.player_id, p])), [players]);
  const rounds = draft ? draft.roster_size : 0;

  const cell = (round: number, teamIdx: number) => {
    const t = teams[teamIdx];
    const pk = picks.find((p) => p.round === round && p.team_id === t?.id);
    if (!pk) return <span className="text-[#8B98B0]/40">—</span>;
    if (pk.pick_type === 'skip') return <span className="italic text-[#8B98B0]">skipped</span>;
    const pl = pk.player_id ? playerById[pk.player_id] : null;
    return (
      <span>
        <span className="text-[#8B98B0]">{pk.overall}. </span>
        <span className="text-[#E6EDF7]">{pl?.alias || '—'}</span>
        {pk.pick_type === 'auto' && <span className="ml-1 text-[10px] text-[#F59E0B]">auto</span>}
      </span>
    );
  };

  return (
    <div className="ctf-theme min-h-screen">
      <Navbar user={user} />
      <main className="mx-auto max-w-7xl px-4 py-6">
        <div className="mb-5 flex flex-wrap items-end justify-between gap-3 rounded-xl bg-[#131A2B] p-5">
          <div>
            <div className="mb-1 text-[11px] uppercase tracking-[0.2em] text-[#8B98B0]">CTFDL · Draft recap</div>
            <h1 className="font-display text-3xl leading-none text-[#E6EDF7] md:text-4xl">
              {bundle?.season ? `Season ${bundle.season.season_number}` : 'Draft recap'}
            </h1>
            {draft && (
              <div className="mt-1 text-sm text-[#8B98B0]">
                {draft.order_type === 'snake' ? 'Snake' : 'Straight'} order · {teams.length} teams · {rounds} rounds
                {draft.completed_at ? ` · completed ${new Date(draft.completed_at).toLocaleDateString()}` : draft.status !== 'complete' ? ` · ${draft.status}` : ''}
              </div>
            )}
          </div>
          <div className="flex items-center gap-2">
            {options.length > 1 && (
              <select value={seasonId || options[0]?.season_id || ''} onChange={(e) => setSeasonId(e.target.value)} className="rounded-md border border-white/10 bg-[#0B0F1A] px-2 py-1.5 text-sm text-[#E6EDF7]">
                {options.map((o) => <option key={o.season_id} value={o.season_id}>Season {o.season_number}{o.status !== 'complete' ? ` (${o.status})` : ''}</option>)}
              </select>
            )}
            {draft && draft.status !== 'complete' && (
              <Link href="/league/ctfdl/draft" className="rounded-md bg-[#22D3EE] px-3 py-1.5 text-sm font-semibold text-[#0B0F1A] hover:bg-[#67E8F9]">Open lobby</Link>
            )}
            <Link href="/league/standings?league=ctfdl" className="rounded-md bg-white/5 px-3 py-1.5 text-sm text-[#E6EDF7] hover:bg-white/10">Standings</Link>
          </div>
        </div>

        {loading ? (
          <div className="py-16 text-center text-[#8B98B0]">Loading…</div>
        ) : !draft ? (
          <div className="rounded-xl bg-[#131A2B] p-8 text-center text-[#8B98B0]">No draft has been run yet.</div>
        ) : (
          <>
            <div className="overflow-x-auto rounded-xl bg-[#131A2B] p-4">
              <table className="w-full min-w-[640px] text-sm">
                <thead>
                  <tr className="text-left text-[11px] uppercase tracking-wide text-[#8B98B0]">
                    <th className="px-2 py-2">Round</th>
                    {teams.map((t) => (
                      <th key={t.id} className="px-2 py-2">
                        <div className="text-[#E6EDF7] normal-case tracking-normal font-display text-base">{t.squad_tag ? `[${t.squad_tag}] ` : ''}{t.squad_name}</div>
                        <div className="font-normal normal-case tracking-normal">Capt. {t.captain_alias || '—'} · #{t.pick_order}</div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {Array.from({ length: rounds }).map((_, r) => {
                    const round = r + 1;
                    const dir = draft.order_type === 'snake' && round % 2 === 0 ? '←' : '→';
                    return (
                      <tr key={round} className="border-t border-white/[0.06]">
                        <td className="px-2 py-2 text-[#8B98B0]">{round} <span className="text-[10px]">{dir}</span></td>
                        {teams.map((_, i) => <td key={i} className="px-2 py-2">{cell(round, i)}</td>)}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <p className="mt-2 text-[11px] text-[#8B98B0]">
                Pick numbers are overall picks. {draft.order_type === 'snake' ? 'Even rounds run in reverse order.' : ''}
                {(() => { const n = teams.length; const k = draft.current_pick; const idx = teamIndexForPick(k, n, draft.order_type); return draft.status !== 'complete' && idx >= 0 ? ` Next up: ${teams[idx]?.squad_name}.` : ''; })()}
              </p>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
