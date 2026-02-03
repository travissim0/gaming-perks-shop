'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import NeutralNavbar from '@/components/home/NeutralNavbar';
import { useAuth } from '@/lib/AuthContext';

// ─── Types ──────────────────────────────────────────────────────────────────────

interface BO9Series {
  id: string;
  series_id: string;
  player1_alias: string;
  player2_alias: string;
  winner_alias: string;
  completion_reason: string;
  final_score: string;
  draws: number;
  total_rounds: number;
  total_duration_seconds: number;
  player1_total_shots_fired: number;
  player1_total_shots_hit: number;
  player1_accuracy_pct: number;
  player1_total_kills: number;
  player2_total_shots_fired: number;
  player2_total_shots_hit: number;
  player2_accuracy_pct: number;
  player2_total_kills: number;
  arena_name: string;
  started_at: string;
  completed_at: string;
}

interface BO9Round {
  id: string;
  series_id: string;
  round_number: number;
  winner_alias: string;
  loser_alias: string;
  is_draw: boolean;
  winner_hp_remaining: number;
  duration_seconds: number;
  winner_shots_fired: number;
  winner_shots_hit: number;
  loser_shots_fired: number;
  loser_shots_hit: number;
  winner_kills: number;
  loser_kills: number;
  player1_series_score: number;
  player2_series_score: number;
}

interface AggregateStats {
  total_series: number;
  total_rounds: number;
  avg_series_duration_seconds: number;
  avg_accuracy_pct: number;
}

interface SeriesLeaderEntry {
  player1_alias: string;
  player2_alias: string;
  winner_alias: string;
  final_score: string;
  total_duration_seconds: number;
  completion_reason?: string;
  completed_at: string;
}

interface PlayerLeaderEntry {
  alias: string;
  series_played: number;
  series_won: number;
  series_lost: number;
  win_rate: number;
  accuracy_pct: number;
  total_kills: number;
}

interface LeaderboardData {
  fastest_series: SeriesLeaderEntry[];
  longest_series: SeriesLeaderEntry[];
  highest_accuracy: PlayerLeaderEntry[];
  most_played: PlayerLeaderEntry[];
  most_wins: PlayerLeaderEntry[];
  highest_win_rate: PlayerLeaderEntry[];
}

// ─── Helpers ────────────────────────────────────────────────────────────────────

function formatDuration(totalSeconds: number): string {
  if (!totalSeconds) return '—';
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes === 0) return `${seconds}s`;
  return `${minutes}m ${seconds}s`;
}

function formatDate(dateStr: string): string {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatDateTime(dateStr: string): string {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  return d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function accuracyColor(pct: number): string {
  if (pct >= 70) return 'text-green-400';
  if (pct >= 50) return 'text-yellow-400';
  if (pct >= 30) return 'text-orange-400';
  return 'text-red-400';
}

function reasonBadge(reason: string): { label: string; className: string } | null {
  if (!reason || reason === 'COMPLETED') return null;
  switch (reason.toUpperCase()) {
    case 'FORFEIT': return { label: 'Forfeit', className: 'bg-orange-500/20 text-orange-400' };
    case 'LEFT': return { label: 'Left', className: 'bg-red-500/20 text-red-400' };
    case 'SPECTATED': return { label: 'Spectated', className: 'bg-yellow-500/20 text-yellow-400' };
    default: return { label: reason, className: 'bg-gray-500/20 text-gray-400' };
  }
}

// ─── Component ──────────────────────────────────────────────────────────────────

export default function BO9StatsPage() {
  const { user } = useAuth();

  // Data state
  const [recentSeries, setRecentSeries] = useState<BO9Series[]>([]);
  const [aggregates, setAggregates] = useState<AggregateStats>({ total_series: 0, total_rounds: 0, avg_series_duration_seconds: 0, avg_accuracy_pct: 0 });
  const [expandedSeries, setExpandedSeries] = useState<string | null>(null);
  const [seriesRounds, setSeriesRounds] = useState<Record<string, BO9Round[]>>({});

  // UI state
  const [loading, setLoading] = useState(true);
  const [roundsLoading, setRoundsLoading] = useState<string | null>(null);
  const [searchInput, setSearchInput] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState('completed_at');

  // Pagination
  const [pagination, setPagination] = useState({ total: 0, offset: 0, limit: 20, hasMore: false });

  // Leaderboards
  const [leaderboards, setLeaderboards] = useState<LeaderboardData | null>(null);

  // ── Data loading ──

  useEffect(() => {
    loadAggregates();
    loadRecentSeries();
    loadLeaderboards();
  }, []);

  useEffect(() => {
    loadRecentSeries();
  }, [searchTerm, sortBy, pagination.offset]);

  const loadAggregates = async () => {
    try {
      const res = await fetch('/api/dueling/bo9-stats?type=aggregates');
      const json = await res.json();
      if (json.success) setAggregates(json.data);
    } catch (err) {
      console.error('Failed to load aggregates:', err);
    }
  };

  const loadLeaderboards = async () => {
    try {
      const res = await fetch('/api/dueling/bo9-stats?type=leaderboards');
      const json = await res.json();
      if (json.success) setLeaderboards(json.data);
    } catch (err) {
      console.error('Failed to load leaderboards:', err);
    }
  };

  const loadRecentSeries = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams({
        type: 'recent_series',
        limit: String(pagination.limit),
        offset: String(pagination.offset),
      });
      if (searchTerm) params.set('player', searchTerm);

      const res = await fetch(`/api/dueling/bo9-stats?${params}`);
      const json = await res.json();
      if (json.success) {
        setRecentSeries(json.data);
        setPagination(prev => ({ ...prev, total: json.pagination.total, hasMore: json.pagination.hasMore }));
      }
    } catch (err) {
      console.error('Failed to load series:', err);
    } finally {
      setLoading(false);
    }
  };

  const loadSeriesRounds = async (seriesId: string) => {
    if (seriesRounds[seriesId]) return; // Already loaded

    try {
      setRoundsLoading(seriesId);
      const res = await fetch(`/api/dueling/bo9-stats?type=series_detail&series_id=${seriesId}`);
      const json = await res.json();
      if (json.success) {
        setSeriesRounds(prev => ({ ...prev, [seriesId]: json.rounds }));
      }
    } catch (err) {
      console.error('Failed to load rounds:', err);
    } finally {
      setRoundsLoading(null);
    }
  };

  const toggleExpand = (seriesId: string) => {
    if (expandedSeries === seriesId) {
      setExpandedSeries(null);
    } else {
      setExpandedSeries(seriesId);
      loadSeriesRounds(seriesId);
    }
  };

  const handleSearch = () => {
    setPagination(prev => ({ ...prev, offset: 0 }));
    setSearchTerm(searchInput.trim());
  };

  // ── Render ──

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-950 via-gray-900 to-gray-950 text-white">
      <NeutralNavbar />

      <div className="container mx-auto px-4 py-8">
        {/* Aggregate Stat Cards */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8"
        >
          <StatCard label="Total Series" value={aggregates.total_series} />
          <StatCard label="Total Rounds" value={aggregates.total_rounds} />
          <StatCard label="Avg Duration" value={formatDuration(aggregates.avg_series_duration_seconds)} />
          <StatCard label="Avg Accuracy" value={`${aggregates.avg_accuracy_pct}%`} />
        </motion.div>

        {/* Leaderboards - All side by side */}
        {leaderboards && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15 }}
            className="mb-8"
          >
            <h2 className="text-xl font-bold text-cyan-400 mb-4">Top 10 Leaderboards</h2>

            {/* Player-based leaderboards - 2x2 grid on desktop */}
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 mb-4">
              <LeaderboardList title="Most Wins" entries={leaderboards.most_wins} statKey="wins" />
              <LeaderboardList title="Win Rate" entries={leaderboards.highest_win_rate} statKey="win_rate" />
              <LeaderboardList title="Most Played" entries={leaderboards.most_played} statKey="played" />
              <LeaderboardList title="Accuracy" entries={leaderboards.highest_accuracy} statKey="accuracy" />
            </div>

            {/* Series-based leaderboards - side by side */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <SeriesLeaderboardList title="Fastest Series" entries={leaderboards.fastest_series} />
              <SeriesLeaderboardList title="Longest Series" entries={leaderboards.longest_series} />
            </div>
          </motion.div>
        )}

        {/* Search & Sort Bar */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="bg-white/10 backdrop-blur-lg rounded-xl p-4 mb-6 border border-white/20"
        >
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="flex-1 flex gap-2">
              <input
                type="text"
                placeholder="Search player..."
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                className="flex-1 bg-white/10 border border-white/20 rounded-lg px-4 py-2 text-white placeholder-blue-300 focus:outline-none focus:border-cyan-400"
              />
              <button
                onClick={handleSearch}
                className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 rounded-lg font-medium transition-colors"
              >
                Search
              </button>
            </div>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="bg-white/10 border border-white/20 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-cyan-400"
            >
              <option value="completed_at">Sort: Most Recent</option>
              <option value="total_duration_seconds">Sort: Duration</option>
              <option value="total_rounds">Sort: Total Rounds</option>
            </select>
          </div>
        </motion.div>

        {/* Series List */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
        >
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-cyan-400"></div>
            </div>
          ) : recentSeries.length === 0 ? (
            <div className="text-center py-20">
              <div className="text-6xl mb-4">&#9876;</div>
              <h3 className="text-2xl font-semibold text-blue-200 mb-2">No BO9 Series Yet</h3>
              <p className="text-blue-300">Completed series will appear here as they are played.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {recentSeries.map((series, index) => (
                <SeriesCard
                  key={series.series_id}
                  series={series}
                  index={index}
                  isExpanded={expandedSeries === series.series_id}
                  onToggle={() => toggleExpand(series.series_id)}
                  rounds={seriesRounds[series.series_id]}
                  roundsLoading={roundsLoading === series.series_id}
                />
              ))}
            </div>
          )}

          {/* Pagination */}
          {pagination.total > pagination.limit && (
            <div className="flex justify-center gap-4 mt-8">
              <button
                disabled={pagination.offset === 0}
                onClick={() => setPagination(prev => ({ ...prev, offset: Math.max(0, prev.offset - prev.limit) }))}
                className="px-4 py-2 bg-white/10 hover:bg-white/20 rounded-lg disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                Previous
              </button>
              <span className="px-4 py-2 text-blue-200">
                {pagination.offset + 1}–{Math.min(pagination.offset + pagination.limit, pagination.total)} of {pagination.total}
              </span>
              <button
                disabled={!pagination.hasMore}
                onClick={() => setPagination(prev => ({ ...prev, offset: prev.offset + prev.limit }))}
                className="px-4 py-2 bg-white/10 hover:bg-white/20 rounded-lg disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                Next
              </button>
            </div>
          )}
        </motion.div>
      </div>
    </div>
  );
}

// ─── Stat Card ──────────────────────────────────────────────────────────────────

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="bg-white/10 backdrop-blur-lg rounded-xl p-4 border border-white/20 text-center">
      <div className="text-3xl font-bold text-cyan-400">{value}</div>
      <div className="text-sm text-blue-200 mt-1">{label}</div>
    </div>
  );
}

// ─── Series Card ────────────────────────────────────────────────────────────────

function SeriesCard({
  series,
  index,
  isExpanded,
  onToggle,
  rounds,
  roundsLoading,
}: {
  series: BO9Series;
  index: number;
  isExpanded: boolean;
  onToggle: () => void;
  rounds?: BO9Round[];
  roundsLoading: boolean;
}) {
  const p1IsWinner = series.winner_alias === series.player1_alias;
  const p2IsWinner = series.winner_alias === series.player2_alias;
  const badge = reasonBadge(series.completion_reason);

  return (
    <motion.div
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: index * 0.03 }}
    >
      {/* Summary row */}
      <button
        onClick={onToggle}
        className="w-full bg-white/10 backdrop-blur-lg rounded-xl border border-white/20 hover:border-cyan-400/50 transition-all p-4 text-left"
      >
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          {/* Players & Score */}
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-1 min-w-0">
              <span className={`font-semibold truncate ${p1IsWinner ? 'text-green-400' : 'text-white'}`}>
                {series.player1_alias}
              </span>
              <span className="text-blue-300 font-mono text-lg font-bold shrink-0">
                {series.final_score || '—'}
              </span>
              <span className={`font-semibold truncate ${p2IsWinner ? 'text-green-400' : 'text-white'}`}>
                {series.player2_alias}
              </span>
              {series.draws > 0 && (
                <span className="text-xs bg-amber-500/20 text-amber-400 px-2 py-0.5 rounded-full shrink-0">
                  {series.draws}T
                </span>
              )}
            </div>
            {series.winner_alias && (
              <span className="text-xs bg-green-500/20 text-green-400 px-2 py-0.5 rounded-full shrink-0 hidden sm:inline">
                W: {series.winner_alias}
              </span>
            )}
            {badge && (
              <span className={`text-xs ${badge.className} px-2 py-0.5 rounded-full shrink-0`}>
                {badge.label}
              </span>
            )}
          </div>

          {/* Meta */}
          <div className="flex items-center gap-4 text-sm text-blue-300 shrink-0">
            <span>{series.total_rounds} rds</span>
            <span>{formatDuration(series.total_duration_seconds)}</span>
            <span className="hidden md:inline">{formatDate(series.completed_at)}</span>
            <svg
              className={`w-4 h-4 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
              fill="none" viewBox="0 0 24 24" stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </div>
        </div>
      </button>

      {/* Expanded detail */}
      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="bg-white/5 border-x border-b border-white/10 rounded-b-xl p-4 mt-[-4px]">
              {roundsLoading ? (
                <div className="flex items-center justify-center py-8">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-cyan-400"></div>
                </div>
              ) : (
                <>
                  {/* Player comparison header */}
                  <div className="grid grid-cols-2 gap-4 mb-6">
                    <PlayerSummary
                      alias={series.player1_alias}
                      isWinner={p1IsWinner}
                      kills={series.player1_total_kills}
                      shotsFired={series.player1_total_shots_fired}
                      shotsHit={series.player1_total_shots_hit}
                      accuracy={series.player1_accuracy_pct}
                    />
                    <PlayerSummary
                      alias={series.player2_alias}
                      isWinner={p2IsWinner}
                      kills={series.player2_total_kills}
                      shotsFired={series.player2_total_shots_fired}
                      shotsHit={series.player2_total_shots_hit}
                      accuracy={series.player2_accuracy_pct}
                    />
                  </div>

                  {/* Round-by-round table */}
                  {rounds && rounds.length > 0 ? (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="text-blue-300 border-b border-white/10">
                            <th className="text-left py-2 px-2">Rd</th>
                            <th className="text-left py-2 px-2">Winner</th>
                            <th className="text-right py-2 px-2">HP Left</th>
                            <th className="text-right py-2 px-2">Duration</th>
                            <th className="text-right py-2 px-2 hidden sm:table-cell">W Acc</th>
                            <th className="text-right py-2 px-2 hidden sm:table-cell">L Acc</th>
                            <th className="text-right py-2 px-2 hidden md:table-cell">W Shots</th>
                            <th className="text-right py-2 px-2 hidden md:table-cell">L Shots</th>
                            <th className="text-right py-2 px-2">W Kills</th>
                            <th className="text-right py-2 px-2">L Kills</th>
                            <th className="text-right py-2 px-2">Score</th>
                          </tr>
                        </thead>
                        <tbody>
                          {rounds.map((round) => {
                            const isDraw = round.is_draw;
                            const wAcc = round.winner_shots_fired > 0
                              ? Math.round((round.winner_shots_hit / round.winner_shots_fired) * 100)
                              : 0;
                            const lAcc = round.loser_shots_fired > 0
                              ? Math.round((round.loser_shots_hit / round.loser_shots_fired) * 100)
                              : 0;

                            return (
                              <tr
                                key={round.id || round.round_number}
                                className={`border-b border-white/5 ${isDraw ? 'bg-amber-500/10 hover:bg-amber-500/15' : 'hover:bg-white/5'}`}
                              >
                                <td className="py-2 px-2 font-mono text-blue-300">{round.round_number}</td>
                                <td className="py-2 px-2">
                                  {isDraw ? (
                                    <span className="text-amber-400 font-medium">TIE</span>
                                  ) : (
                                    <span className="text-green-400 font-medium">{round.winner_alias}</span>
                                  )}
                                </td>
                                <td className="py-2 px-2 text-right font-mono">
                                  {isDraw ? '—' : (round.winner_hp_remaining != null ? round.winner_hp_remaining : '—')}
                                </td>
                                <td className="py-2 px-2 text-right">{formatDuration(round.duration_seconds)}</td>
                                <td className={`py-2 px-2 text-right hidden sm:table-cell ${isDraw ? 'text-blue-300' : accuracyColor(wAcc)}`}>
                                  {isDraw ? '—' : `${wAcc}%`}
                                </td>
                                <td className={`py-2 px-2 text-right hidden sm:table-cell ${isDraw ? 'text-blue-300' : accuracyColor(lAcc)}`}>
                                  {isDraw ? '—' : `${lAcc}%`}
                                </td>
                                <td className="py-2 px-2 text-right hidden md:table-cell text-blue-200">
                                  {isDraw ? '—' : `${round.winner_shots_hit ?? 0}/${round.winner_shots_fired ?? 0}`}
                                </td>
                                <td className="py-2 px-2 text-right hidden md:table-cell text-blue-200">
                                  {isDraw ? '—' : `${round.loser_shots_hit ?? 0}/${round.loser_shots_fired ?? 0}`}
                                </td>
                                <td className="py-2 px-2 text-right font-mono">{isDraw ? '—' : (round.winner_kills ?? 0)}</td>
                                <td className="py-2 px-2 text-right font-mono">{isDraw ? '—' : (round.loser_kills ?? 0)}</td>
                                <td className="py-2 px-2 text-right font-mono text-cyan-400">
                                  {round.player1_series_score}-{round.player2_series_score}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <p className="text-blue-300 text-sm text-center py-4">No round data available for this series.</p>
                  )}

                  {/* Series metadata */}
                  <div className="flex flex-wrap gap-4 mt-4 pt-3 border-t border-white/10 text-xs text-blue-300">
                    <span>Arena: {series.arena_name || '—'}</span>
                    <span>Started: {formatDateTime(series.started_at)}</span>
                    <span>Completed: {formatDateTime(series.completed_at)}</span>
                    <span>Total: {formatDuration(series.total_duration_seconds)}</span>
                    {series.completion_reason && series.completion_reason !== 'COMPLETED' && (
                      <span className="text-orange-400">Ended: {series.completion_reason}</span>
                    )}
                  </div>
                </>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// ─── Player Summary Card ────────────────────────────────────────────────────────

function PlayerSummary({
  alias,
  isWinner,
  kills,
  shotsFired,
  shotsHit,
  accuracy,
}: {
  alias: string;
  isWinner: boolean;
  kills: number;
  shotsFired: number;
  shotsHit: number;
  accuracy: number;
}) {
  return (
    <div className={`bg-white/5 rounded-lg p-3 border ${isWinner ? 'border-green-500/30' : 'border-white/10'}`}>
      <div className="flex items-center gap-2 mb-2">
        <span className={`font-semibold ${isWinner ? 'text-green-400' : 'text-white'}`}>{alias}</span>
        {isWinner && <span className="text-xs bg-green-500/20 text-green-400 px-1.5 py-0.5 rounded">WIN</span>}
      </div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
        <div className="text-blue-300">Kills</div>
        <div className="text-right font-mono">{kills ?? 0}</div>
        <div className="text-blue-300">Accuracy</div>
        <div className={`text-right font-mono ${accuracyColor(accuracy ?? 0)}`}>{accuracy ?? 0}%</div>
        <div className="text-blue-300">Shots Hit</div>
        <div className="text-right font-mono">{shotsHit ?? 0}/{shotsFired ?? 0}</div>
      </div>
    </div>
  );
}

// ─── Leaderboard List (Player-based) ─────────────────────────────────────────

function LeaderboardList({
  title,
  entries,
  statKey,
}: {
  title: string;
  entries: PlayerLeaderEntry[];
  statKey: 'wins' | 'win_rate' | 'played' | 'accuracy';
}) {
  const getStat = (e: PlayerLeaderEntry) => {
    switch (statKey) {
      case 'wins': return String(e.series_won);
      case 'win_rate': return `${e.win_rate}%`;
      case 'played': return String(e.series_played);
      case 'accuracy': return `${e.accuracy_pct}%`;
    }
  };

  return (
    <div className="bg-white/5 backdrop-blur-lg rounded-xl border border-white/10 overflow-hidden">
      <div className="px-3 py-2 border-b border-white/10 bg-white/5">
        <h3 className="text-sm font-bold text-cyan-400">{title}</h3>
      </div>
      {entries.length === 0 ? (
        <p className="text-center py-4 text-blue-300 text-xs">No data yet</p>
      ) : (
        <div className="divide-y divide-white/5">
          {entries.map((entry, i) => (
            <div key={i} className="flex items-center gap-2 px-3 py-1.5 hover:bg-white/5 transition-colors">
              <span className={`w-5 text-right text-xs font-mono ${i < 3 ? 'text-yellow-400 font-bold' : 'text-blue-400'}`}>
                {i + 1}
              </span>
              <span className="flex-1 text-sm text-white truncate">{entry.alias}</span>
              <span className="text-xs font-mono text-cyan-400 font-bold">{getStat(entry)}</span>
              <span className="text-xs font-mono text-blue-400 w-10 text-right">{entry.series_won}-{entry.series_lost}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Leaderboard List (Series-based) ─────────────────────────────────────────

function SeriesLeaderboardList({
  title,
  entries,
}: {
  title: string;
  entries: SeriesLeaderEntry[];
}) {
  return (
    <div className="bg-white/5 backdrop-blur-lg rounded-xl border border-white/10 overflow-hidden">
      <div className="px-3 py-2 border-b border-white/10 bg-white/5">
        <h3 className="text-sm font-bold text-cyan-400">{title}</h3>
      </div>
      {entries.length === 0 ? (
        <p className="text-center py-4 text-blue-300 text-xs">No data yet</p>
      ) : (
        <div className="divide-y divide-white/5">
          {entries.map((entry, i) => {
            const badge = reasonBadge(entry.completion_reason || '');
            return (
              <div key={i} className="flex items-center gap-2 px-3 py-1.5 hover:bg-white/5 transition-colors">
                <span className={`w-5 text-right text-xs font-mono ${i < 3 ? 'text-yellow-400 font-bold' : 'text-blue-400'}`}>
                  {i + 1}
                </span>
                <div className="flex-1 min-w-0 text-sm truncate">
                  <span className={entry.winner_alias === entry.player1_alias ? 'text-green-400' : 'text-white'}>
                    {entry.player1_alias}
                  </span>
                  <span className="text-blue-400 mx-1">v</span>
                  <span className={entry.winner_alias === entry.player2_alias ? 'text-green-400' : 'text-white'}>
                    {entry.player2_alias}
                  </span>
                  {badge && <span className={`text-xs ${badge.className} px-1 py-0.5 rounded-full ml-1`}>{badge.label}</span>}
                </div>
                <span className="text-xs font-mono text-cyan-400 font-bold">{formatDuration(entry.total_duration_seconds)}</span>
                <span className="text-xs font-mono text-blue-400">{entry.final_score}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
