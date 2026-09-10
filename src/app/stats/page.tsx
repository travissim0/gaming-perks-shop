'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { ChevronDown, ChevronRight, ArrowDown, ArrowUp, Columns3, X } from 'lucide-react';
import { useAuth } from '@/lib/AuthContext';
import Navbar from '@/components/Navbar';
import { getClassColor } from '@/utils/classColors';
import { displayFont, bodyFont } from '@/lib/fonts';

/*
 * Player stats — the leaderboard over every recorded game. Mode chips (All /
 * OvD / Mix), period chips, sortable columns, a column picker, alias expander,
 * and a recent-games rail. Data comes from /api/player-stats/leaderboard and
 * /api/player-stats/recent-games, unchanged.
 */

interface Row {
  id: number;
  player_name: string;
  total_games: number;
  total_wins: number;
  total_losses: number;
  total_kills: number;
  total_deaths: number;
  total_captures: number;
  total_carrier_kills: number;
  total_carry_time_seconds: number;
  total_class_swaps: number;
  total_turret_damage: number;
  total_eb_hits: number;
  avg_kills_per_game: number;
  avg_deaths_per_game: number;
  avg_captures_per_game: number;
  avg_accuracy: number;
  kill_death_ratio: number;
  win_rate: number;
  first_game_date: string;
  last_game_date: string;
  all_aliases?: string;
}

interface Pagination { total: number; offset: number; limit: number; hasMore: boolean }

type Mode = 'Combined' | 'OvD' | 'Mix';
const MODES: { key: Mode; label: string }[] = [
  { key: 'Combined', label: 'All modes' },
  { key: 'OvD', label: 'OvD' },
  { key: 'Mix', label: 'Mix' },
];

const PERIODS = [
  { value: 'all', label: 'All time' },
  { value: 'day', label: '24 hours' },
  { value: 'week', label: 'Week' },
  { value: 'month', label: 'Month' },
  { value: 'year', label: 'Year' },
];

const MIN_GAMES = [1, 3, 5, 10, 15, 25, 50, 100];

interface Col {
  key: string;
  label: string;
  sort?: string;
  align?: 'left' | 'right';
  default: boolean;
  render: (r: Row) => React.ReactNode;
  cls?: (r: Row) => string;
}

const pct = (n: number) => `${(Number(n) * 100).toFixed(1)}%`;
const fix = (n: number, d = 0) => Number(n).toFixed(d);
const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
const relDate = (iso: string) => {
  const d = new Date(iso);
  const days = Math.floor((Date.now() - d.getTime()) / 86_400_000);
  if (days <= 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 30) return `${days}d ago`;
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', ...(d.getFullYear() !== new Date().getFullYear() ? { year: 'numeric' } : {}) });
};

const COLUMNS: Col[] = [
  { key: 'games', label: 'Games', sort: 'total_games', default: true, render: (r) => r.total_games },
  { key: 'winRate', label: 'Win %', sort: 'win_rate', default: true, render: (r) => pct(r.win_rate), cls: (r) => (r.win_rate >= 0.5 ? 'text-[#34D399]' : 'text-[#E6EDF7]') },
  { key: 'kills', label: 'Kills', sort: 'total_kills', default: true, render: (r) => r.total_kills },
  { key: 'deaths', label: 'Deaths', sort: 'total_deaths', default: true, render: (r) => r.total_deaths },
  { key: 'kd', label: 'K/D', sort: 'kill_death_ratio', default: true, render: (r) => fix(r.kill_death_ratio, 2), cls: (r) => (r.kill_death_ratio >= 1 ? 'text-[#34D399]' : 'text-[#F87171]') },
  { key: 'kpg', label: 'K/game', sort: 'avg_kills_per_game', default: false, render: (r) => fix(r.avg_kills_per_game, 1) },
  { key: 'caps', label: 'Caps', sort: 'total_captures', default: true, render: (r) => r.total_captures },
  { key: 'carrierKills', label: 'Carrier kills', default: false, render: (r) => r.total_carrier_kills },
  { key: 'carry', label: 'Carry time', default: false, render: (r) => mmss(r.total_carry_time_seconds) },
  { key: 'eb', label: 'EB hits', sort: 'total_eb_hits', default: false, render: (r) => r.total_eb_hits },
  { key: 'turret', label: 'Turret dmg', sort: 'total_turret_damage', default: false, render: (r) => fix(r.total_turret_damage) },
  { key: 'acc', label: 'Accuracy', default: false, render: (r) => pct(r.avg_accuracy) },
  { key: 'swaps', label: 'Class swaps', default: false, render: (r) => r.total_class_swaps },
  { key: 'last', label: 'Last game', sort: 'last_game_date', default: true, render: (r) => relDate(r.last_game_date), cls: () => 'text-[#8B98B0]' },
];

const PRESETS: { label: string; sort: string }[] = [
  { label: 'Top killers', sort: 'total_kills' },
  { label: 'Win rate', sort: 'win_rate' },
  { label: 'Flag caps', sort: 'total_captures' },
  { label: 'Most active', sort: 'total_games' },
  { label: 'Best K/D', sort: 'kill_death_ratio' },
];

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} className={`px-3 py-1.5 rounded-md text-sm transition-colors ${active ? 'bg-[#22D3EE]/15 text-[#22D3EE]' : 'text-[#8B98B0] hover:text-[#E6EDF7] hover:bg-white/5'}`}>
      {children}
    </button>
  );
}

const inputCls = 'bg-[#0B0F1A] border border-white/10 rounded-md px-3 py-1.5 text-sm text-[#E6EDF7] placeholder-[#8B98B0]/70 focus:border-[#22D3EE] focus:outline-none';

export default function PlayerStatsPage() {
  const { user } = useAuth();
  const [mode, setMode] = useState<Mode>('Combined');
  const [sortBy, setSortBy] = useState('total_kills');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [period, setPeriod] = useState('all');
  const [minGames, setMinGames] = useState(10);
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [rows, setRows] = useState<Row[]>([]);
  const [pagination, setPagination] = useState<Pagination>({ total: 0, offset: 0, limit: 25, hasMore: false });
  const [loading, setLoading] = useState(true);
  const [more, setMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [visible, setVisible] = useState<Set<string>>(() => new Set(COLUMNS.filter((c) => c.default).map((c) => c.key)));
  const [showCols, setShowCols] = useState(false);
  // Keyed by player name: combined-mode rows have no unique id.
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [games, setGames] = useState<any[]>([]);
  const [gamesLoading, setGamesLoading] = useState(true);

  const load = useCallback(async (offset: number) => {
    offset === 0 ? setLoading(true) : setMore(true);
    setError(null);
    try {
      const params = new URLSearchParams({ gameMode: mode, sortBy, sortOrder, dateFilter: period, playerName: query, minGames: String(minGames), limit: '25', offset: String(offset) });
      const r = await fetch(`/api/player-stats/leaderboard?${params}`);
      if (!r.ok) throw new Error(`Could not load stats (${r.status})`);
      const j = await r.json();
      if (!j.success) throw new Error('Could not load stats');
      setRows((prev) => (offset === 0 ? j.data : [...prev, ...j.data]));
      setPagination(j.pagination);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
      setMore(false);
    }
  }, [mode, sortBy, sortOrder, period, query, minGames]);

  useEffect(() => { load(0); setExpanded(new Set()); }, [load]);

  useEffect(() => {
    (async () => {
      try {
        const r = await fetch('/api/player-stats/recent-games?limit=12');
        if (r.ok) setGames((await r.json()).games || []);
      } catch { /* ignore */ } finally { setGamesLoading(false); }
    })();
  }, []);

  // Search runs on Enter or after a short pause.
  useEffect(() => {
    const t = setTimeout(() => setQuery(search.trim()), 400);
    return () => clearTimeout(t);
  }, [search]);

  const sortOn = (col: Col) => {
    if (!col.sort) return;
    if (sortBy === col.sort) setSortOrder((o) => (o === 'desc' ? 'asc' : 'desc'));
    else { setSortBy(col.sort); setSortOrder('desc'); }
  };
  const reset = () => { setMode('Combined'); setSortBy('total_kills'); setSortOrder('desc'); setPeriod('all'); setMinGames(10); setSearch(''); setQuery(''); };
  const isDefault = mode === 'Combined' && sortBy === 'total_kills' && sortOrder === 'desc' && period === 'all' && minGames === 10 && !query;

  const aliasesOf = (r: Row) => {
    const list = [r.player_name];
    (r.all_aliases || '').split(',').map((a) => a.trim()).forEach((a) => { if (a && !list.includes(a)) list.push(a); });
    return list;
  };
  const cols = useMemo(() => COLUMNS.filter((c) => visible.has(c.key)), [visible]);
  const sortLabel = COLUMNS.find((c) => c.sort === sortBy)?.label || sortBy;

  return (
    <div className={`ctf-theme ${displayFont.variable} ${bodyFont.variable} min-h-screen`}>
      <Navbar user={user} />
      <main className="container mx-auto px-4 py-6 space-y-4">
        {/* Header strip */}
        <section className="relative overflow-hidden rounded-xl bg-[#131A2B]">
          <div className="absolute inset-0 pointer-events-none" style={{ backgroundImage: 'radial-gradient(circle at 10% 20%, rgba(34,211,238,0.12), transparent 40%)' }} />
          <div className="relative px-5 sm:px-6 py-5 flex flex-col lg:flex-row lg:items-end gap-4">
            <div className="min-w-0 flex-1">
              <div className="text-[11px] uppercase tracking-[0.25em] text-[#22D3EE]/80 mb-1">Free Infantry · CTF</div>
              <h1 className="font-display text-5xl leading-none text-[#E6EDF7]">Player stats</h1>
              <div className="mt-2 flex items-center gap-x-3 gap-y-1 flex-wrap text-sm text-[#8B98B0]">
                <span><span className="text-[#E6EDF7] tabular-nums">{pagination.total}</span> players</span>
                <span className="text-white/20">·</span>
                <span>{MODES.find((m) => m.key === mode)?.label}</span>
                <span className="text-white/20">·</span>
                <span>{PERIODS.find((p) => p.value === period)?.label}</span>
                <span className="text-white/20">·</span>
                <span>{minGames}+ games</span>
                <span className="text-white/20">·</span>
                <span>Sorted by {sortLabel.toLowerCase()}</span>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2 lg:justify-end">
              <Link href="/stats/elo" className="px-3 py-1.5 rounded-md text-sm bg-white/5 text-[#E6EDF7] hover:bg-white/10 transition-colors">ELO leaderboard</Link>
              <Link href="/league/compare" className="px-3 py-1.5 rounded-md text-sm bg-white/5 text-[#E6EDF7] hover:bg-white/10 transition-colors">Compare squads</Link>
              <Link href="/matches" className="inline-flex items-center gap-1 px-2 py-1.5 text-sm text-[#8B98B0] hover:text-[#22D3EE] transition-colors">
                Match log <ChevronRight className="w-3.5 h-3.5" aria-hidden="true" />
              </Link>
            </div>
          </div>
          <div className="relative border-t border-white/[0.06] px-3 sm:px-4 py-2 flex flex-wrap items-center gap-x-4 gap-y-1">
            <div className="flex gap-1">{MODES.map((m) => <Chip key={m.key} active={mode === m.key} onClick={() => setMode(m.key)}>{m.label}</Chip>)}</div>
            <span className="hidden sm:block w-px h-5 bg-white/10" />
            <div className="flex gap-1">{PERIODS.map((p) => <Chip key={p.value} active={period === p.value} onClick={() => setPeriod(p.value)}>{p.label}</Chip>)}</div>
          </div>
        </section>

        <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_340px] gap-4">
          {/* Table */}
          <section className="rounded-xl overflow-hidden bg-[#131A2B] min-w-0">
            <div className="px-3 py-2.5 flex flex-wrap items-center gap-2">
              <div className="relative">
                <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search players…" className={`${inputCls} w-52 pr-7`} />
                {search && <button type="button" onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-[#8B98B0] hover:text-[#E6EDF7]" aria-label="Clear search"><X className="w-3.5 h-3.5" /></button>}
              </div>
              <select value={minGames} onChange={(e) => setMinGames(Number(e.target.value))} className={inputCls} style={{ colorScheme: 'dark' }}>
                {MIN_GAMES.map((n) => <option key={n} value={n}>{n}+ games</option>)}
              </select>
              <div className="flex gap-1">
                {PRESETS.map((p) => (
                  <Chip key={p.sort} active={sortBy === p.sort && sortOrder === 'desc'} onClick={() => { setSortBy(p.sort); setSortOrder('desc'); }}>{p.label}</Chip>
                ))}
              </div>
              <div className="ml-auto flex items-center gap-1">
                {!isDefault && <button type="button" onClick={reset} className="text-xs text-[#8B98B0] hover:text-[#E6EDF7] px-2">Reset</button>}
                <div className="relative">
                  <button type="button" onClick={() => setShowCols((v) => !v)} className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm ${showCols ? 'bg-[#22D3EE]/15 text-[#22D3EE]' : 'text-[#8B98B0] hover:text-[#E6EDF7] hover:bg-white/5'}`}>
                    <Columns3 className="w-4 h-4" aria-hidden="true" /> Columns
                  </button>
                  {showCols && (
                    <div className="absolute right-0 z-20 mt-1 w-48 rounded-lg bg-[#1B2438] p-2 shadow-xl ring-1 ring-white/10">
                      {COLUMNS.map((c) => (
                        <label key={c.key} className="flex items-center gap-2 px-2 py-1 text-sm text-[#E6EDF7] rounded hover:bg-white/5 cursor-pointer">
                          <input type="checkbox" checked={visible.has(c.key)} onChange={() => setVisible((v) => { const n = new Set(v); n.has(c.key) ? n.delete(c.key) : n.add(c.key); return n; })} className="text-[#22D3EE]" />
                          {c.label}
                        </label>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {error ? (
              <div className="px-4 pb-5 text-sm text-[#F87171]">{error}</div>
            ) : loading ? (
              <div className="px-4 pb-4 space-y-2 animate-pulse">{[0, 1, 2, 3, 4, 5].map((i) => <div key={i} className="h-9 rounded-md bg-white/5" />)}</div>
            ) : rows.length === 0 ? (
              <div className="px-4 pb-5 text-sm text-[#8B98B0]">No players match. {!isDefault && <button type="button" onClick={reset} className="text-[#22D3EE] hover:text-[#67E8F9]">Reset the filters.</button>}</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm min-w-[720px]">
                  <thead>
                    <tr className="text-[11px] uppercase tracking-wide text-[#8B98B0]">
                      <th className="w-10 px-3 py-2 text-left font-normal">#</th>
                      <th className="px-2 py-2 text-left font-normal">Player</th>
                      {cols.map((c) => (
                        <th key={c.key} className="px-2 py-2 text-right font-normal whitespace-nowrap">
                          {c.sort ? (
                            <button type="button" onClick={() => sortOn(c)} className={`inline-flex items-center gap-1 hover:text-[#E6EDF7] ${sortBy === c.sort ? 'text-[#22D3EE]' : ''}`}>
                              {c.label}
                              {sortBy === c.sort && (sortOrder === 'desc' ? <ArrowDown className="w-3 h-3" /> : <ArrowUp className="w-3 h-3" />)}
                            </button>
                          ) : c.label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r, i) => {
                      const aliases = aliasesOf(r);
                      const open = expanded.has(r.player_name);
                      return (
                        <React.Fragment key={`${r.player_name}-${i}`}>
                          <tr className={`border-t border-white/[0.06] hover:bg-white/[0.03] ${open ? 'bg-[#22D3EE]/[0.04]' : ''}`}>
                            <td className="px-3 py-2 text-[#8B98B0] tabular-nums">{pagination.offset === 0 ? i + 1 : i + 1}</td>
                            <td className="px-2 py-2">
                              <div className="flex items-center gap-1.5 min-w-0">
                                {aliases.length > 1 ? (
                                  <button type="button" onClick={() => setExpanded((s) => { const n = new Set(s); n.has(r.player_name) ? n.delete(r.player_name) : n.add(r.player_name); return n; })} className="text-[#8B98B0] hover:text-[#22D3EE] shrink-0" title={`${aliases.length - 1} other alias${aliases.length > 2 ? 'es' : ''}`}>
                                    <ChevronRight className={`w-3.5 h-3.5 transition-transform ${open ? 'rotate-90' : ''}`} />
                                  </button>
                                ) : <span className="w-3.5 shrink-0" />}
                                <Link href={`/stats/player/${encodeURIComponent(r.player_name)}`} className="text-[#E6EDF7] hover:text-[#22D3EE] transition-colors truncate">{r.player_name}</Link>
                              </div>
                            </td>
                            {cols.map((c) => (
                              <td key={c.key} className={`px-2 py-2 text-right tabular-nums whitespace-nowrap ${c.cls ? c.cls(r) : 'text-[#E6EDF7]'}`}>{c.render(r)}</td>
                            ))}
                          </tr>
                          {open && (
                            <tr className="bg-[#22D3EE]/[0.04]">
                              <td />
                              <td colSpan={cols.length + 1} className="px-2 pb-2 pt-0">
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
                <span>{rows.length} of {pagination.total}</span>
                <button type="button" onClick={() => load(rows.length)} disabled={more} className="px-3 py-1.5 rounded-md text-sm bg-white/5 text-[#E6EDF7] hover:bg-white/10 disabled:opacity-50">{more ? 'Loading…' : 'Show more'}</button>
              </div>
            )}
            {!loading && !error && rows.length > 0 && (
              <p className="px-3 pb-3 text-[11px] text-[#8B98B0]">Click a column heading to sort by it. The arrow next to a name lists the other aliases those games were played under.</p>
            )}
          </section>

          {/* Recent games rail */}
          <section className="rounded-xl overflow-hidden bg-[#131A2B] self-start">
            <div className="px-4 py-2.5 flex items-center justify-between">
              <h2 className="font-display text-lg text-[#E6EDF7]">Recent games</h2>
              <Link href="/matches" className="text-xs text-[#8B98B0] hover:text-[#22D3EE]">Match log</Link>
            </div>
            {gamesLoading ? (
              <div className="px-3 pb-3 space-y-2 animate-pulse">{[0, 1, 2].map((i) => <div key={i} className="h-16 rounded-md bg-white/5" />)}</div>
            ) : games.length === 0 ? (
              <div className="px-4 pb-4 text-sm text-[#8B98B0]">No recent games.</div>
            ) : (
              <ul className="divide-y divide-white/[0.06]">
                {games.map((g, i) => {
                  const side = (s: string) => (g.players || []).filter((p: any) => p.side === s).slice(0, 5);
                  const def = side('defense');
                  const off = side('offense');
                  const names = (list: any[]) => list.map((p: any, j: number) => (
                    <span key={j} className="truncate" style={{ color: getClassColor(p.main_class) }} title={`${p.player_name || p.name} · ${p.main_class || ''}`}>{p.player_name || p.name}</span>
                  ));
                  return (
                    <li key={g.gameId || i}>
                      <Link href={`/stats/game/${encodeURIComponent(g.gameId)}`} className="block px-4 py-2.5 hover:bg-white/[0.03]">
                        <div className="flex items-center justify-between text-xs mb-1">
                          <span><span className="text-[#22D3EE] font-medium">{g.gameMode}</span>{g.mapName && <span className="text-[#8B98B0]"> · {g.mapName}</span>}</span>
                          <span className="text-[#8B98B0]">{relDate(g.gameDate)}</span>
                        </div>
                        {(def.length > 0 || off.length > 0) && (
                          <div className="space-y-0.5 text-[11px]">
                            <div className="flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-[#22D3EE] shrink-0" /><div className="flex flex-wrap gap-x-2 min-w-0">{names(def)}</div></div>
                            <div className="flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-[#F87171] shrink-0" /><div className="flex flex-wrap gap-x-2 min-w-0">{names(off)}</div></div>
                          </div>
                        )}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </div>
      </main>
    </div>
  );
}
