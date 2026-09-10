'use client';

import { useState, useEffect, useMemo, Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { ArrowLeftRight, ChevronRight } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/AuthContext';
import Navbar from '@/components/Navbar';
import { displayFont, bodyFont } from '@/lib/fonts';

/*
 * Squad comparison — two rosters side by side with each player's career
 * numbers, aggregate bars, and the match reports between the two squads.
 * Squads from past seasons are included (marked) so old matchups still work.
 * ?a=<squad id>&b=<squad id> preselects.
 */

interface Squad { id: string; name: string; tag: string | null; is_active: boolean; is_legacy?: boolean | null }
interface Member { alias: string; role: string; kills: number; deaths: number; kd: number; captures: number; games: number; elo: number }
interface Report { id: string; title: string; squad_a_name: string; squad_b_name: string; match_date: string; season_name: string }

const A = '#22D3EE';
const B = '#F59E0B';
const fmtDate = (iso: string) => new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });

function Bar({ label, a, b, fmt }: { label: string; a: number; b: number; fmt: (v: number) => string }) {
  const max = Math.max(a, b, 1e-9);
  const aWins = a > b;
  const bWins = b > a;
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wide text-[#8B98B0] text-center mb-1">{label}</div>
      <div className="flex items-center gap-3">
        <span className={`w-16 text-right text-sm tabular-nums ${aWins ? 'text-[#E6EDF7] font-medium' : 'text-[#8B98B0]'}`}>{fmt(a)}</span>
        <div className="flex-1 flex items-center gap-1">
          <div className="flex-1 flex justify-end"><div className="h-2 rounded-l-full" style={{ width: `${(a / max) * 100}%`, background: A, opacity: aWins ? 1 : 0.45 }} /></div>
          <div className="flex-1"><div className="h-2 rounded-r-full" style={{ width: `${(b / max) * 100}%`, background: B, opacity: bWins ? 1 : 0.45 }} /></div>
        </div>
        <span className={`w-16 text-left text-sm tabular-nums ${bWins ? 'text-[#E6EDF7] font-medium' : 'text-[#8B98B0]'}`}>{fmt(b)}</span>
      </div>
    </div>
  );
}

function Roster({ squad, members, color }: { squad: Squad; members: Member[]; color: string }) {
  return (
    <section className="rounded-xl overflow-hidden bg-[#131A2B]">
      <div className="px-4 py-2.5 flex items-center gap-2.5">
        <span className="w-8 h-8 rounded-md text-[11px] font-medium flex items-center justify-center shrink-0" style={{ background: `${color}22`, color }}>{(squad.tag || squad.name).slice(0, 4).toUpperCase()}</span>
        <Link href={`/squads/${squad.id}`} className="font-display text-lg text-[#E6EDF7] hover:text-[#22D3EE] truncate">{squad.name}</Link>
        <span className="ml-auto text-xs text-[#8B98B0] tabular-nums">{members.length} on roster</span>
      </div>
      {members.length === 0 ? (
        <div className="px-4 pb-4 text-sm text-[#8B98B0]">No active members.</div>
      ) : (
        <table className="w-full text-xs">
          <thead>
            <tr className="text-[10px] uppercase tracking-wide text-[#8B98B0]">
              <th className="text-left font-normal px-4 py-1.5">Player</th>
              <th className="text-right font-normal px-2 py-1.5">Games</th>
              <th className="text-right font-normal px-2 py-1.5">Kills</th>
              <th className="text-right font-normal px-2 py-1.5">K/D</th>
              <th className="text-right font-normal px-2 py-1.5">Caps</th>
              <th className="text-right font-normal px-4 py-1.5">ELO</th>
            </tr>
          </thead>
          <tbody>
            {members.map((m) => (
              <tr key={m.alias} className="border-t border-white/[0.06] hover:bg-white/[0.03]">
                <td className="px-4 py-1.5">
                  <Link href={`/stats/player/${encodeURIComponent(m.alias)}`} className="text-[#E6EDF7] hover:text-[#22D3EE]">{m.alias}</Link>
                  {m.role !== 'player' && m.role !== 'member' && <span className="ml-1.5 text-[10px] uppercase tracking-wide text-[#F59E0B]">{m.role.replace('_', ' ')}</span>}
                </td>
                <td className="px-2 py-1.5 text-right tabular-nums text-[#8B98B0]">{m.games || '–'}</td>
                <td className="px-2 py-1.5 text-right tabular-nums text-[#E6EDF7]">{m.games ? m.kills.toLocaleString() : '–'}</td>
                <td className={`px-2 py-1.5 text-right tabular-nums ${m.games ? (m.kd >= 1 ? 'text-[#34D399]' : 'text-[#F87171]') : 'text-[#8B98B0]'}`}>{m.games ? m.kd.toFixed(2) : '–'}</td>
                <td className="px-2 py-1.5 text-right tabular-nums text-[#E6EDF7]">{m.games ? m.captures : '–'}</td>
                <td className="px-4 py-1.5 text-right tabular-nums text-[#E6EDF7]">{m.elo > 0 ? Math.round(m.elo) : '–'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

function ComparePage() {
  const { user } = useAuth();
  const params = useSearchParams();
  const [squads, setSquads] = useState<Squad[]>([]);
  const [aId, setAId] = useState(params.get('a') || '');
  const [bId, setBId] = useState(params.get('b') || '');
  const [membersA, setMembersA] = useState<Member[]>([]);
  const [membersB, setMembersB] = useState<Member[]>([]);
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const full = await supabase.from('squads').select('id, name, tag, is_active, is_legacy').order('is_active', { ascending: false }).order('name');
      const rows = full.error
        ? (await supabase.from('squads').select('id, name, tag, is_active').order('is_active', { ascending: false }).order('name')).data || []
        : full.data || [];
      setSquads(rows as Squad[]);
    })();
  }, []);

  useEffect(() => {
    if (!aId || !bId || aId === bId) { setMembersA([]); setMembersB([]); setReports([]); return; }
    let cancelled = false;
    (async () => {
      setLoading(true); setError(null);
      try {
        const [ra, rb, statsRes, eloRes, { data: reps }] = await Promise.all([
          supabase.from('squad_members').select('player_id, role, status, profiles!squad_members_player_id_fkey(in_game_alias)').eq('squad_id', aId),
          supabase.from('squad_members').select('player_id, role, status, profiles!squad_members_player_id_fkey(in_game_alias)').eq('squad_id', bId),
          fetch('/api/player-stats/leaderboard?limit=1000&sortBy=total_kills&sortOrder=desc').then((r) => r.json()).catch(() => ({})),
          fetch('/api/player-stats/elo-leaderboard?limit=1000&minGames=1').then((r) => r.json()).catch(() => ({})),
          supabase.from('match_reports').select('id, title, squad_a_name, squad_b_name, match_date, season_name')
            .or(`and(squad_a_id.eq.${aId},squad_b_id.eq.${bId}),and(squad_a_id.eq.${bId},squad_b_id.eq.${aId})`)
            .order('match_date', { ascending: false }).limit(20),
        ]);
        if (cancelled) return;
        if (ra.error) throw ra.error;
        if (rb.error) throw rb.error;
        const stats = new Map<string, any>();
        (statsRes.data || []).forEach((s: any) => stats.set(String(s.player_name).toLowerCase(), s));
        const elo = new Map<string, number>();
        (eloRes.data || []).forEach((e: any) => elo.set(String(e.player_name).toLowerCase(), Number(e.weighted_elo) || 0));
        const build = (rows: any[]): Member[] =>
          rows
            .filter((r) => !r.status || r.status === 'active')
            .map((r) => {
              const alias = r.profiles?.in_game_alias || 'Unknown';
              const s = stats.get(alias.toLowerCase());
              return { alias, role: r.role || 'player', kills: s?.total_kills ?? 0, deaths: s?.total_deaths ?? 0, kd: s ? Number(s.kill_death_ratio) : 0, captures: s?.total_captures ?? 0, games: s?.total_games ?? 0, elo: elo.get(alias.toLowerCase()) ?? 0 };
            })
            .sort((x, y) => (x.role === 'captain' ? -1 : y.role === 'captain' ? 1 : y.kills - x.kills));
        setMembersA(build(ra.data || []));
        setMembersB(build(rb.data || []));
        setReports((reps || []) as Report[]);
      } catch (e: any) {
        if (!cancelled) setError(e.message || 'Could not load the comparison');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [aId, bId]);

  const squadA = squads.find((s) => s.id === aId);
  const squadB = squads.find((s) => s.id === bId);
  const ready = !!(squadA && squadB && aId !== bId);
  const agg = (ms: Member[]) => {
    const played = ms.filter((m) => m.games > 0);
    const rated = ms.filter((m) => m.elo > 0);
    return {
      kills: played.reduce((n, m) => n + m.kills, 0),
      kd: played.length ? played.reduce((n, m) => n + m.kd, 0) / played.length : 0,
      caps: played.reduce((n, m) => n + m.captures, 0),
      elo: rated.length ? rated.reduce((n, m) => n + m.elo, 0) / rated.length : 0,
    };
  };
  const aggA = useMemo(() => agg(membersA), [membersA]);
  const aggB = useMemo(() => agg(membersB), [membersB]);
  const label = (s: Squad) => `${s.tag ? `[${s.tag}] ` : ''}${s.name}${!s.is_active || s.is_legacy ? ' · past' : ''}`;
  const selectCls = 'bg-[#0B0F1A] border border-white/10 rounded-md px-3 py-1.5 text-sm text-[#E6EDF7] focus:border-[#22D3EE] focus:outline-none';

  return (
    <div className={`ctf-theme ${displayFont.variable} ${bodyFont.variable} min-h-screen`}>
      <Navbar user={user} />
      <main className="container mx-auto px-4 py-6 max-w-6xl space-y-4">
        <section className="relative overflow-hidden rounded-xl bg-[#131A2B]">
          <div className="absolute inset-0 pointer-events-none" style={{ backgroundImage: 'radial-gradient(circle at 10% 20%, rgba(34,211,238,0.12), transparent 40%)' }} />
          <div className="relative px-5 sm:px-6 py-5 flex flex-col lg:flex-row lg:items-end gap-4">
            <div className="min-w-0 flex-1">
              <div className="text-[11px] uppercase tracking-[0.25em] text-[#22D3EE]/80 mb-1">Free Infantry · CTF leagues</div>
              <h1 className="font-display text-5xl leading-none text-[#E6EDF7]">Compare squads</h1>
              <p className="mt-2 text-sm text-[#8B98B0] max-w-xl">Two rosters side by side: each player’s career numbers, the squad totals, and every match report between them.</p>
            </div>
            <div className="flex flex-wrap items-center gap-2 lg:justify-end">
              <Link href="/league/standings" className="px-3 py-1.5 rounded-md text-sm bg-white/5 text-[#E6EDF7] hover:bg-white/10 transition-colors">Standings</Link>
              <Link href="/squads" className="inline-flex items-center gap-1 px-2 py-1.5 text-sm text-[#8B98B0] hover:text-[#22D3EE] transition-colors">All squads <ChevronRight className="w-3.5 h-3.5" aria-hidden="true" /></Link>
            </div>
          </div>
          <div className="relative border-t border-white/[0.06] px-3 sm:px-4 py-2 flex flex-wrap items-center gap-2">
            <span className="w-2 h-2 rounded-full" style={{ background: A }} />
            <select value={aId} onChange={(e) => setAId(e.target.value)} className={selectCls} style={{ colorScheme: 'dark' }}>
              <option value="">Pick squad A…</option>
              {squads.map((s) => <option key={s.id} value={s.id} disabled={s.id === bId}>{label(s)}</option>)}
            </select>
            <button type="button" onClick={() => { setAId(bId); setBId(aId); }} disabled={!aId && !bId} className="p-1.5 rounded-md text-[#8B98B0] hover:text-[#E6EDF7] hover:bg-white/5 disabled:opacity-30" title="Swap sides"><ArrowLeftRight className="w-4 h-4" /></button>
            <select value={bId} onChange={(e) => setBId(e.target.value)} className={selectCls} style={{ colorScheme: 'dark' }}>
              <option value="">Pick squad B…</option>
              {squads.map((s) => <option key={s.id} value={s.id} disabled={s.id === aId}>{label(s)}</option>)}
            </select>
            <span className="w-2 h-2 rounded-full" style={{ background: B }} />
            {squads.some((s) => !s.is_active || s.is_legacy) && <span className="text-[11px] text-[#8B98B0] ml-2">“past” = a squad from an earlier season</span>}
          </div>
        </section>

        {error ? (
          <section className="rounded-xl bg-[#131A2B] px-5 py-5 text-sm text-[#F87171]">{error}</section>
        ) : !ready ? (
          <section className="rounded-xl bg-[#131A2B] px-6 py-10 text-center">
            <ArrowLeftRight className="w-8 h-8 mx-auto text-white/20" aria-hidden="true" />
            <p className="mt-3 text-sm text-[#8B98B0]">Pick two squads above. You’ll get both rosters with games, kills, K/D, caps and ELO per player, the squad totals compared, and any match reports between them.</p>
          </section>
        ) : loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 animate-pulse">{[0, 1].map((i) => <div key={i} className="h-48 rounded-xl bg-[#131A2B]" />)}</div>
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Roster squad={squadA!} members={membersA} color={A} />
              <Roster squad={squadB!} members={membersB} color={B} />
            </div>

            <section className="rounded-xl bg-[#131A2B] px-5 py-4">
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-display text-lg text-[#E6EDF7]">Squad totals</h2>
                <span className="text-xs text-[#8B98B0]"><span style={{ color: A }}>{squadA!.tag || squadA!.name}</span> vs <span style={{ color: B }}>{squadB!.tag || squadB!.name}</span> · players with recorded games only</span>
              </div>
              <div className="space-y-4">
                <Bar label="Total kills" a={aggA.kills} b={aggB.kills} fmt={(v) => v.toLocaleString()} />
                <Bar label="Average K/D" a={aggA.kd} b={aggB.kd} fmt={(v) => v.toFixed(2)} />
                <Bar label="Total caps" a={aggA.caps} b={aggB.caps} fmt={(v) => v.toLocaleString()} />
                <Bar label="Average ELO" a={aggA.elo} b={aggB.elo} fmt={(v) => (v > 0 ? String(Math.round(v)) : '–')} />
              </div>
            </section>

            <section className="rounded-xl overflow-hidden bg-[#131A2B]">
              <div className="px-4 py-2.5 flex items-center justify-between">
                <h2 className="font-display text-lg text-[#E6EDF7]">Head to head</h2>
                <span className="text-xs text-[#8B98B0] tabular-nums">{reports.length} report{reports.length === 1 ? '' : 's'}</span>
              </div>
              {reports.length === 0 ? (
                <div className="px-4 pb-4 text-sm text-[#8B98B0]">No match reports between these two yet.</div>
              ) : (
                <ul className="divide-y divide-white/[0.06]">
                  {reports.map((r) => (
                    <li key={r.id}>
                      <Link href={`/league/match-reports/${r.id}`} className="flex items-center gap-3 px-4 py-2.5 hover:bg-white/[0.03]">
                        <span className="w-24 shrink-0 text-xs text-[#8B98B0] tabular-nums">{fmtDate(r.match_date)}</span>
                        <span className="min-w-0 flex-1 text-sm text-[#E6EDF7] truncate">{r.title}</span>
                        {r.season_name && <span className="text-[11px] text-[#8B98B0] shrink-0">{r.season_name}</span>}
                        <ChevronRight className="w-4 h-4 text-[#8B98B0] shrink-0" aria-hidden="true" />
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </>
        )}
      </main>
    </div>
  );
}

export default function SquadComparePage() {
  return (
    <Suspense fallback={<div className={`ctf-theme ${displayFont.variable} ${bodyFont.variable} min-h-screen`}><Navbar user={null} /></div>}>
      <ComparePage />
    </Suspense>
  );
}
