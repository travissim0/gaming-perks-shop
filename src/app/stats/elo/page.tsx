'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowDown, ArrowUp, ChevronRight, X } from 'lucide-react';
import { useAuth } from '@/lib/AuthContext';
import Navbar from '@/components/Navbar';
import { displayFont, bodyFont } from '@/lib/fonts';
import { ELO_TIERS } from '@/utils/eloTiers';
import { Card, Tag, relDate, fmtPct } from '@/components/ctf-stats/CtfStats';

/*
 * ELO leaderboard over /api/player-stats/elo-leaderboard (unchanged). Same rules as before: a
 * player is "in placement" until 10 games and is listed but not tiered; the ladder is per game
 * mode with a "Combined" rollup; mode chips come from what the API reports so a new ladder (Pub,
 * since 2026-09-11) appears on its own.
 */

interface EloPlayer {
  player_name: string;
  player_name_normalized: string;
  profile_id: string;
  all_aliases: string;
  game_mode: string;
  elo_rating: string | number;
  weighted_elo: string | number;
  elo_peak: string | number;
  elo_confidence: string;
  total_games: number;
  total_wins: number;
  total_losses: number;
  win_rate: string;
  kill_death_ratio: string;
  last_game_date: string;
  display_rank: number;
  elo_tier: { name: string; color: string; min: number; max: number };
}

interface Pagination { total: number; limit: number; offset: number; hasMore: boolean }

const PLACEMENT_GAMES = 10;
const MODE_ORDER = ['Combined', 'OvD', 'Mix', 'Pub'];
const MODE_LABEL: Record<string, string> = { Combined: 'All modes' };
const MIN_GAMES = [0, 3, 5, 10, 20];

interface Col { key: string; label: string; sort?: string; title?: string }
const COLUMNS: Col[] = [
  { key: 'elo', label: 'ELO', sort: 'weighted_elo', title: 'Weighted ELO - raw rating pulled toward 1200 until the rating is confident' },
  { key: 'peak', label: 'Peak', sort: 'elo_peak' },
  { key: 'conf', label: 'Confidence', sort: 'elo_confidence', title: 'How settled the rating is; full after 20 games' },
  { key: 'games', label: 'Games', sort: 'total_games' },
  { key: 'wr', label: 'Win %', sort: 'win_rate' },
  { key: 'kd', label: 'K/D', sort: 'kill_death_ratio' },
  { key: 'last', label: 'Last game', sort: 'last_game_date' },
];

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} className={`px-3 py-1.5 rounded-md text-sm transition-colors ${active ? 'bg-[#22D3EE]/15 text-[#22D3EE]' : 'text-[#8B98B0] hover:text-[#E6EDF7] hover:bg-white/5'}`}>
      {children}
    </button>
  );
}

const inputCls = 'bg-[#0B0F1A] border border-white/10 rounded-md px-3 py-1.5 text-sm text-[#E6EDF7] placeholder-[#8B98B0]/70 focus:border-[#22D3EE] focus:outline-none';

export default function EloLeaderboardPage() {
  const { user } = useAuth();
  const [players, setPlayers] = useState<EloPlayer[]>([]);
  const [loading, setLoading] = useState(true);
  const [more, setMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [gameMode, setGameMode] = useState('Combined');
  const [modes, setModes] = useState<string[]>(['Combined', 'OvD', 'Mix']);
  const [sortBy, setSortBy] = useState('weighted_elo');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [minGames, setMinGames] = useState(10);
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [pagination, setPagination] = useState<Pagination>({ total: 0, offset: 0, limit: 50, hasMore: false });

  const load = useCallback(async (offset: number, signal?: AbortSignal) => {
    offset === 0 ? setLoading(true) : setMore(true);
    setError(null);
    try {
      const params = new URLSearchParams({ gameMode, sortBy, sortOrder, minGames: String(minGames), playerName: query, limit: '50', offset: String(offset) });
      const r = await fetch(`/api/player-stats/elo-leaderboard?${params}`, { signal });
      if (!r.ok) throw new Error(`Could not load the leaderboard (${r.status})`);
      const j = await r.json();
      if (signal?.aborted) return;
      setPlayers((prev) => (offset === 0 ? j.data : [...prev, ...j.data]));
      setPagination(j.pagination);
      const available: string[] = j.filters?.availableGameModes || [];
      const rank = (m: string) => { const i = MODE_ORDER.indexOf(m); return i < 0 ? 99 : i; };
      if (available.length) setModes([...new Set(['Combined', ...available])].sort((a, b) => rank(a) - rank(b)));
      // Searching for an alias: open the rows whose main name does not match, so the hit is visible.
      if (offset === 0) {
        const q = query.trim().toLowerCase();
        const open = new Set<string>();
        if (q) j.data.forEach((p: EloPlayer) => { if (!p.player_name.toLowerCase().includes(q) && (p.all_aliases || '').toLowerCase().includes(q)) open.add(p.player_name_normalized); });
        setExpanded(open);
      }
    } catch (e: any) {
      if (e?.name === 'AbortError') return;
      setError(e.message);
    } finally {
      if (!signal?.aborted) { setLoading(false); setMore(false); }
    }
  }, [gameMode, sortBy, sortOrder, minGames, query]);

  useEffect(() => {
    const ac = new AbortController();
    load(0, ac.signal);
    return () => ac.abort();
  }, [load]);

  useEffect(() => {
    const t = setTimeout(() => setQuery(search.trim()), 400);
    return () => clearTimeout(t);
  }, [search]);

  const sortOn = (col: Col) => {
    if (!col.sort) return;
    if (sortBy === col.sort) setSortOrder((o) => (o === 'desc' ? 'asc' : 'desc'));
    else { setSortBy(col.sort); setSortOrder('desc'); }
  };
  const reset = () => { setGameMode('Combined'); setSortBy('weighted_elo'); setSortOrder('desc'); setMinGames(10); setSearch(''); setQuery(''); };
  const isDefault = gameMode === 'Combined' && sortBy === 'weighted_elo' && sortOrder === 'desc' && minGames === 10 && !query;

  const aliasesOf = (p: EloPlayer) => {
    const list = [p.player_name];
    (p.all_aliases || '').split(',').map((a) => a.trim()).forEach((a) => { if (a && !list.includes(a)) list.push(a); });
    return list;
  };
  const showRank = !query;
  const ranked = useMemo(() => players.filter((p) => p.total_games >= PLACEMENT_GAMES).length, [players]);

  const confColor = (c: number) => (c >= 0.8 ? '#34D399' : c >= 0.5 ? '#F59E0B' : '#F87171');
  const rankBadge = (rank: number) => {
    if (rank > 3) return <span className="text-[#8B98B0] tabular-nums">{rank}</span>;
    const color = rank === 1 ? '#F59E0B' : rank === 2 ? '#CBD5E1' : '#CD7F32';
    return <span className="inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold text-[#0B0F1A]" style={{ background: color }}>{rank}</span>;
  };

  return (
    <div className={`ctf-theme ${displayFont.variable} ${bodyFont.variable} min-h-screen`}>
      <Navbar user={user} />
      <main className="container mx-auto px-4 py-6 space-y-4">
        {/* Header strip */}
        <section className="relative overflow-hidden rounded-xl bg-[#131A2B]">
          <div className="absolute inset-0 pointer-events-none" style={{ backgroundImage: 'radial-gradient(circle at 10% 20%, rgba(245,158,11,0.12), transparent 40%)' }} />
          <div className="relative px-5 sm:px-6 py-5 flex flex-col lg:flex-row lg:items-end gap-4">
            <div className="min-w-0 flex-1">
              <div className="text-[11px] uppercase tracking-[0.25em] text-[#F59E0B]/80 mb-1">Free Infantry · CTF</div>
              <h1 className="font-display text-5xl leading-none text-[#E6EDF7]">ELO leaderboard</h1>
              <div className="mt-2 flex items-center gap-x-3 gap-y-1 flex-wrap text-sm text-[#8B98B0]">
                <span><span className="text-[#E6EDF7] tabular-nums">{pagination.total}</span> players</span>
                <span className="text-white/20">·</span>
                <span>{MODE_LABEL[gameMode] || gameMode}</span>
                <span className="text-white/20">·</span>
                <span>{minGames > 0 ? `${minGames}+ games` : 'All players'}</span>
                <span className="text-white/20">·</span>
                <span>Sorted by {(COLUMNS.find((c) => c.sort === sortBy)?.label || sortBy).toLowerCase()}</span>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2 lg:justify-end">
              <Link href="/stats" className="px-3 py-1.5 rounded-md text-sm bg-white/5 text-[#E6EDF7] hover:bg-white/10 transition-colors">Player stats</Link>
              <Link href="/matches" className="inline-flex items-center gap-1 px-2 py-1.5 text-sm text-[#8B98B0] hover:text-[#22D3EE] transition-colors">Match log <ChevronRight className="w-3.5 h-3.5" aria-hidden="true" /></Link>
            </div>
          </div>
          <div className="relative border-t border-white/[0.06] px-3 sm:px-4 py-2 flex flex-wrap items-center gap-x-4 gap-y-1">
            <div className="flex gap-1">{modes.map((m) => <Chip key={m} active={gameMode === m} onClick={() => setGameMode(m)}>{MODE_LABEL[m] || m}</Chip>)}</div>
            <span className="hidden sm:block w-px h-5 bg-white/10" />
            <div className="flex gap-1">{MIN_GAMES.map((n) => <Chip key={n} active={minGames === n} onClick={() => setMinGames(n)}>{n === 0 ? 'Everyone' : `${n}+ games`}</Chip>)}</div>
          </div>
        </section>

        <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_300px] gap-4">
          <section className="rounded-xl overflow-hidden bg-[#131A2B] min-w-0">
            <div className="px-3 py-2.5 flex flex-wrap items-center gap-2">
              <div className="relative">
                <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search players or aliases…" className={`${inputCls} w-60 pr-7`} />
                {search && <button type="button" onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-[#8B98B0] hover:text-[#E6EDF7]" aria-label="Clear search"><X className="w-3.5 h-3.5" /></button>}
              </div>
              <span className="text-xs text-[#8B98B0]">{players.length} shown{ranked < players.length ? ` · ${players.length - ranked} in placement` : ''}</span>
              <div className="ml-auto flex items-center gap-1">
                {!isDefault && <button type="button" onClick={reset} className="text-xs text-[#8B98B0] hover:text-[#E6EDF7] px-2">Reset</button>}
              </div>
            </div>

            {error ? (
              <div className="px-4 pb-5 text-sm text-[#F87171]">{error} <button type="button" onClick={() => load(0)} className="text-[#22D3EE] hover:text-[#67E8F9]">Retry.</button></div>
            ) : loading ? (
              <div className="px-4 pb-4 space-y-2 animate-pulse">{[0, 1, 2, 3, 4, 5].map((i) => <div key={i} className="h-9 rounded-md bg-white/5" />)}</div>
            ) : players.length === 0 ? (
              <div className="px-4 pb-5 text-sm text-[#8B98B0]">Nobody matches. {!isDefault && <button type="button" onClick={reset} className="text-[#22D3EE] hover:text-[#67E8F9]">Reset the filters.</button>}</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm min-w-[760px]">
                  <thead>
                    <tr className="text-[11px] uppercase tracking-wide text-[#8B98B0]">
                      {showRank && <th className="w-12 px-3 py-2 text-left font-normal">#</th>}
                      <th className="px-2 py-2 text-left font-normal">Player</th>
                      <th className="px-2 py-2 text-left font-normal">Tier</th>
                      {COLUMNS.map((c) => (
                        <th key={c.key} className="px-2 py-2 text-right font-normal whitespace-nowrap" title={c.title}>
                          <button type="button" onClick={() => sortOn(c)} className={`inline-flex items-center gap-1 hover:text-[#E6EDF7] ${sortBy === c.sort ? 'text-[#22D3EE]' : ''}`}>
                            {c.label}
                            {sortBy === c.sort && (sortOrder === 'desc' ? <ArrowDown className="w-3 h-3" /> : <ArrowUp className="w-3 h-3" />)}
                          </button>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {players.map((p, i) => {
                      const aliases = aliasesOf(p);
                      const open = expanded.has(p.player_name_normalized);
                      const placement = p.total_games < PLACEMENT_GAMES;
                      const conf = parseFloat(p.elo_confidence);
                      const elo = Math.round(Number(p.weighted_elo));
                      const raw = Math.round(Number(p.elo_rating));
                      return (
                        <React.Fragment key={`${p.player_name_normalized}-${p.game_mode}-${i}`}>
                          <tr className={`border-t border-white/[0.06] hover:bg-white/[0.03] ${open ? 'bg-[#22D3EE]/[0.04]' : ''}`}>
                            {showRank && <td className="px-3 py-2">{placement ? <span className="text-[#8B98B0]/60">—</span> : rankBadge(p.display_rank)}</td>}
                            <td className="px-2 py-2">
                              <div className="flex items-center gap-1.5 min-w-0">
                                {aliases.length > 1 ? (
                                  <button type="button" onClick={() => setExpanded((s) => { const n = new Set(s); n.has(p.player_name_normalized) ? n.delete(p.player_name_normalized) : n.add(p.player_name_normalized); return n; })} className="text-[#8B98B0] hover:text-[#22D3EE] shrink-0" title={`${aliases.length - 1} other alias${aliases.length > 2 ? 'es' : ''}`}>
                                    <ChevronRight className={`w-3.5 h-3.5 transition-transform ${open ? 'rotate-90' : ''}`} />
                                  </button>
                                ) : <span className="w-3.5 shrink-0" />}
                                <Link href={`/stats/player/${encodeURIComponent(p.player_name)}`} className="text-[#E6EDF7] hover:text-[#22D3EE] transition-colors truncate">{p.player_name}</Link>
                                {p.game_mode !== 'Combined' && gameMode === 'Combined' && <Tag>{p.game_mode}</Tag>}
                              </div>
                            </td>
                            <td className="px-2 py-2 whitespace-nowrap">
                              {placement ? (
                                <span className="text-xs text-[#8B98B0] italic">Placement · {p.total_games}/{PLACEMENT_GAMES}</span>
                              ) : (
                                <span className="inline-flex items-center gap-1.5 text-xs font-medium" style={{ color: p.elo_tier.color }}><span className="w-2 h-2 rounded-full" style={{ background: p.elo_tier.color }} />{p.elo_tier.name}</span>
                              )}
                            </td>
                            <td className="px-2 py-2 text-right tabular-nums whitespace-nowrap">
                              {placement ? <span className="text-[#8B98B0]">—</span> : <span className="font-display text-lg text-[#E6EDF7]" title={raw !== elo ? `Raw ${raw}` : undefined}>{elo}</span>}
                            </td>
                            <td className="px-2 py-2 text-right tabular-nums text-[#F59E0B]">{Math.round(Number(p.elo_peak))}</td>
                            <td className="px-2 py-2 text-right tabular-nums" style={{ color: confColor(conf) }}>{Math.round(conf * 100)}%</td>
                            <td className="px-2 py-2 text-right tabular-nums text-[#E6EDF7]">{p.total_games} <span className="text-xs text-[#8B98B0]">{p.total_wins}–{p.total_losses}</span></td>
                            <td className={`px-2 py-2 text-right tabular-nums ${parseFloat(p.win_rate) >= 0.5 ? 'text-[#34D399]' : 'text-[#E6EDF7]'}`}>{fmtPct(parseFloat(p.win_rate))}</td>
                            <td className={`px-2 py-2 text-right tabular-nums ${parseFloat(p.kill_death_ratio) >= 1 ? 'text-[#34D399]' : 'text-[#F87171]'}`}>{parseFloat(p.kill_death_ratio).toFixed(2)}</td>
                            <td className="px-2 py-2 text-right tabular-nums text-[#8B98B0] whitespace-nowrap">{relDate(p.last_game_date)}</td>
                          </tr>
                          {open && (
                            <tr className="bg-[#22D3EE]/[0.04]">
                              {showRank && <td />}
                              <td colSpan={COLUMNS.length + 2} className="px-2 pb-2 pt-0">
                                <div className="flex flex-wrap items-center gap-1 text-xs">
                                  <span className="text-[#8B98B0] mr-1">Also known as</span>
                                  {aliases.slice(1).map((a) => (
                                    <Link key={a} href={`/stats/player/${encodeURIComponent(a)}`} className="px-1.5 py-0.5 rounded bg-[#1B2438] text-[#E6EDF7] hover:text-[#22D3EE]">{a}</Link>
                                  ))}
                                </div>
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {!loading && !error && pagination.hasMore && (
              <div className="px-3 py-3 border-t border-white/[0.06] flex items-center justify-between text-xs text-[#8B98B0]">
                <span>{players.length} of {pagination.total}</span>
                <button type="button" onClick={() => load(pagination.offset + pagination.limit)} disabled={more} className="px-3 py-1.5 rounded-md text-sm bg-white/5 text-[#E6EDF7] hover:bg-white/10 disabled:opacity-50">{more ? 'Loading…' : 'Show more'}</button>
              </div>
            )}
          </section>

          <div className="space-y-4 self-start">
            <Card title="How the rating works">
              <ul className="space-y-1.5 text-sm text-[#8B98B0]">
                <li>Everyone starts at <span className="text-[#E6EDF7]">1200</span>. A win against a stronger team moves you more than a win against a weaker one.</li>
                <li>The first <span className="text-[#E6EDF7]">{PLACEMENT_GAMES} games</span> are placement: listed, not ranked.</li>
                <li>The shown ELO is pulled toward 1200 until the rating is confident, which takes 20 games.</li>
                <li>Each mode has its own ladder. &ldquo;All modes&rdquo; is the rollup.</li>
                <li>Only games with a recorded winner move the rating.</li>
              </ul>
            </Card>
            <Card title="Tiers">
              <ul className="grid grid-cols-1 gap-1 text-sm">
                {[...ELO_TIERS].reverse().map((t) => (
                  <li key={t.name} className="flex items-center justify-between gap-2">
                    <span className="inline-flex items-center gap-2" style={{ color: t.color }}><span className="w-2 h-2 rounded-full" style={{ background: t.color }} />{t.name}</span>
                    <span className="text-xs text-[#8B98B0] tabular-nums">{t.max >= 2500 ? `${t.min}+` : t.min === 0 ? `< ${t.max + 1}` : `${t.min}–${t.max}`}</span>
                  </li>
                ))}
              </ul>
            </Card>
          </div>
        </div>
      </main>
    </div>
  );
}
