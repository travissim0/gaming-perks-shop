'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import Navbar from '@/components/Navbar';
import { useAuth } from '@/lib/AuthContext';
import { getEloTier } from '@/utils/eloTiers';

interface DuelingPlayer {
  player_name: string;
  match_type: string;
  total_matches: number;
  matches_won: number;
  matches_lost: number;
  win_rate: number;
  total_kills: number;
  total_deaths: number;
  kill_death_ratio: number;
  overall_accuracy: number;
  double_hits: number;
  triple_hits: number;
  burst_damage_ratio: number;
  current_elo: number;
  peak_elo: number;
  rank: number;
}

interface DuelingMatch {
  id: number;
  match_type: string;
  player1_name: string;
  player2_name: string;
  winner_name: string;
  player1_rounds_won: number;
  player2_rounds_won: number;
  total_rounds: number;
  match_status: string;
  arena_name: string;
  started_at: string;
  completed_at: string;
  duration_seconds: number;
  formatted_duration: string;
  rounds_data: any[];
  match_stats?: {
    player1_accuracy?: number;
    player1_shots_fired?: number;
    player1_shots_hit?: number;
    player1_double_hits?: number;
    player1_triple_hits?: number;
    player2_accuracy?: number;
    player2_shots_fired?: number;
    player2_shots_hit?: number;
    player2_double_hits?: number;
    player2_triple_hits?: number;
  };
}

interface DuelingResponse {
  success: boolean;
  data: DuelingPlayer[];
  pagination: {
    total: number;
    offset: number;
    limit: number;
    hasMore: boolean;
  };
  filters: {
    matchType: string;
    sortBy: string;
    sortOrder: string;
    playerName: string;
    availableMatchTypes: string[];
  };
}

interface MatchesResponse {
  success: boolean;
  data: DuelingMatch[];
  pagination: {
    total: number;
    offset: number;
    limit: number;
    hasMore: boolean;
  };
}

const SORT_OPTIONS = [
  { value: 'win_rate', label: 'Win Rate' },
  { value: 'current_elo', label: 'Current ELO' },
  { value: 'peak_elo', label: 'Peak ELO' },
  { value: 'total_matches', label: 'Total Matches' },
  { value: 'matches_won', label: 'Matches Won' },
  { value: 'kill_death_ratio', label: 'K/D Ratio' },
  { value: 'overall_accuracy', label: 'Accuracy' },
  { value: 'burst_damage_ratio', label: 'Burst Damage' },
  { value: 'double_hits', label: 'Double Hits' },
  { value: 'triple_hits', label: 'Triple Hits' }
];

const MATCH_TYPE_OPTIONS = [
  { value: 'all', label: 'All Types' },
  { value: 'ranked_bo3', label: 'Ranked Bo3' },
  { value: 'ranked_bo5', label: 'Ranked Bo5' },
  { value: 'unranked', label: 'Unranked' },
  { value: 'overall', label: 'Overall Rankings' }
];

export default function DuelingPage() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'leaderboard' | 'matches'>('matches');
  const [duelingPlayers, setDuelingPlayers] = useState<DuelingPlayer[]>([]);
  const [duelingMatches, setDuelingMatches] = useState<DuelingMatch[]>([]);
  const [matchesLoading, setMatchesLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [matchType, setMatchType] = useState('all');
  const [sortBy, setSortBy] = useState('current_elo');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [playerName, setPlayerName] = useState('');
  const [searchInput, setSearchInput] = useState('');

  // Match sorting
  const [matchSortBy, setMatchSortBy] = useState('completed_at');
  const [matchSortOrder, setMatchSortOrder] = useState<'asc' | 'desc'>('desc');

  // Pagination
  const [pagination, setPagination] = useState({
    total: 0,
    offset: 0,
    limit: 50,
    hasMore: false
  });

  const fetchLeaderboard = async (offset = 0) => {
    try {
      setLoading(true);
      setError(null);

      const params = new URLSearchParams({
        matchType,
        sortBy,
        sortOrder,
        playerName,
        limit: pagination.limit.toString(),
        offset: offset.toString()
      });

      const response = await fetch(`/api/dueling/stats?${params}`);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data: DuelingResponse = await response.json();

      if (data.success) {
        setDuelingPlayers(data.data);
        setPagination(data.pagination);
      } else {
        throw new Error('Failed to fetch dueling leaderboard');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  const fetchRecentMatches = async (offset = 0) => {
    try {
      setMatchesLoading(true);

      const params = new URLSearchParams({
        limit: '20',
        offset: offset.toString(),
        matchType: matchType !== 'all' ? matchType : '',
        playerName: playerName
      });

      const response = await fetch(`/api/dueling/matches?${params}`);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data: MatchesResponse = await response.json();

      if (data.success) {
        setDuelingMatches(data.data);
      } else {
        throw new Error('Failed to fetch recent matches');
      }
    } catch (err) {
      console.error('Error fetching matches:', err);
    } finally {
      setMatchesLoading(false);
    }
  };

  useEffect(() => {
    fetchRecentMatches();
  }, []);

  useEffect(() => {
    fetchLeaderboard(0);
  }, [matchType, sortBy, sortOrder, playerName]);

  useEffect(() => {
    if (activeTab === 'matches') {
      if (matchType === 'overall') {
        setMatchType('all');
      } else {
        fetchRecentMatches(0);
      }
    }
  }, [activeTab, matchType, playerName]);

  // Auto-switch match type when changing tabs
  useEffect(() => {
    if (activeTab === 'leaderboard' && matchType === 'all') {
      setMatchType('overall');
    } else if (activeTab === 'matches' && matchType === 'overall') {
      setMatchType('all');
    }
  }, [activeTab]);

  const handleSearch = () => {
    setPlayerName(searchInput);
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSearch();
    }
  };

  const handleMatchSort = (column: string) => {
    if (matchSortBy === column) {
      setMatchSortOrder(matchSortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setMatchSortBy(column);
      setMatchSortOrder('desc');
    }
  };

  const sortedMatches = [...duelingMatches].sort((a, b) => {
    let aValue: any = a[matchSortBy as keyof DuelingMatch];
    let bValue: any = b[matchSortBy as keyof DuelingMatch];

    if (matchSortBy === 'completed_at') {
      aValue = new Date(a.completed_at).getTime();
      bValue = new Date(b.completed_at).getTime();
    }

    if (typeof aValue === 'number' && typeof bValue === 'number') {
      return matchSortOrder === 'asc' ? aValue - bValue : bValue - aValue;
    }

    if (typeof aValue === 'string' && typeof bValue === 'string') {
      return matchSortOrder === 'asc'
        ? aValue.localeCompare(bValue)
        : bValue.localeCompare(aValue);
    }

    return 0;
  });

  const formatPercentage = (num: number) => {
    return `${(num * 100).toFixed(1)}%`;
  };

  if (loading && duelingPlayers.length === 0 && duelingMatches.length === 0) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-slate-800 to-gray-900 text-white flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-purple-500 mx-auto mb-4"></div>
          <p className="text-gray-400">Loading dueling statistics...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-slate-800 to-gray-900 text-white">
      <Navbar user={user} />

      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-8"
        >
          <h1 className="text-3xl font-bold text-purple-400 tracking-wider mb-2">
            Dueling Arena
          </h1>
          <p className="text-gray-400">Compete in 1v1 battles and climb the rankings</p>
        </motion.div>

        {/* Tabs */}
        <div className="flex mb-6">
          <button
            onClick={() => setActiveTab('leaderboard')}
            className={`px-6 py-3 rounded-l-lg font-medium transition-colors ${
              activeTab === 'leaderboard'
                ? 'bg-cyan-600 text-white'
                : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
            }`}
          >
            Leaderboard
          </button>
          <button
            onClick={() => setActiveTab('matches')}
            className={`px-6 py-3 font-medium transition-colors ${
              activeTab === 'matches'
                ? 'bg-cyan-600 text-white'
                : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
            }`}
          >
            Recent Matches
          </button>
          <Link
            href="/dueling/bo9-stats"
            className="px-6 py-3 rounded-r-lg font-medium transition-colors bg-gray-700 text-gray-300 hover:bg-gray-600"
          >
            BO9 Series
          </Link>
        </div>

        {/* Filters */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-gradient-to-br from-gray-800 to-gray-900 rounded-xl p-6 mb-8 border border-purple-500/30"
        >
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
            {/* Match Type Filter */}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">Match Type</label>
              <select
                value={matchType}
                onChange={(e) => setMatchType(e.target.value)}
                className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-purple-500"
              >
                {MATCH_TYPE_OPTIONS.map(option => (
                  <option key={option.value} value={option.value} className="bg-gray-800">
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Sort By Filter */}
            {activeTab === 'leaderboard' && (
              <>
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">Sort By</label>
                  <select
                    value={sortBy}
                    onChange={(e) => setSortBy(e.target.value)}
                    className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-purple-500"
                  >
                    {SORT_OPTIONS.map(option => (
                      <option key={option.value} value={option.value} className="bg-gray-800">
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">Order</label>
                  <select
                    value={sortOrder}
                    onChange={(e) => setSortOrder(e.target.value as 'asc' | 'desc')}
                    className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-purple-500"
                  >
                    <option value="desc" className="bg-gray-800">Highest First</option>
                    <option value="asc" className="bg-gray-800">Lowest First</option>
                  </select>
                </div>
              </>
            )}

            {/* Player Search */}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">Search Player</label>
              <div className="flex">
                <input
                  type="text"
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  onKeyPress={handleKeyPress}
                  placeholder="Player name..."
                  className="flex-1 bg-gray-700 border border-gray-600 rounded-l-lg px-3 py-2 text-white placeholder-gray-400 focus:outline-none focus:border-purple-500"
                />
                <button
                  onClick={handleSearch}
                  className="bg-cyan-600 hover:bg-cyan-700 px-4 py-2 rounded-r-lg transition-colors"
                >
                  Search
                </button>
              </div>
            </div>
          </div>
        </motion.div>

        {/* Content */}
        {activeTab === 'leaderboard' ? (
          /* Leaderboard Table */
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-gradient-to-br from-gray-800 to-gray-900 rounded-xl overflow-hidden border border-purple-500/30"
          >
            {error ? (
              <div className="p-8 text-center">
                <p className="text-red-400 mb-4">{error}</p>
                <button
                  onClick={() => fetchLeaderboard(0)}
                  className="bg-purple-600 hover:bg-purple-700 px-6 py-2 rounded-lg transition-colors"
                >
                  Retry
                </button>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-gray-600">
                      <th className="px-6 py-4 text-left text-sm font-medium text-gray-300">Rank</th>
                      <th className="px-6 py-4 text-left text-sm font-medium text-gray-300">Player</th>
                      <th className="px-6 py-4 text-left text-sm font-medium text-gray-300">Type</th>
                      <th className="px-6 py-4 text-left text-sm font-medium text-gray-300">Matches</th>
                      <th className="px-6 py-4 text-left text-sm font-medium text-gray-300">Win Rate</th>
                      <th className="px-6 py-4 text-left text-sm font-medium text-gray-300">K/D</th>
                      <th className="px-6 py-4 text-left text-sm font-medium text-gray-300">Accuracy</th>
                      <th className="px-6 py-4 text-left text-sm font-medium text-gray-300">ELO</th>
                    </tr>
                  </thead>
                  <tbody>
                    {duelingPlayers.map((player) => {
                      const tier = getEloTier(player.current_elo);
                      return (
                        <tr key={`${player.player_name}-${player.match_type}`} className="border-b border-gray-700/50 hover:bg-gray-700/30 transition-colors">
                          <td className="px-6 py-4">
                            <span className="text-lg font-bold text-cyan-400">#{player.rank}</span>
                          </td>
                          <td className="px-6 py-4">
                            <div className="font-medium text-white">{player.player_name}</div>
                          </td>
                          <td className="px-6 py-4">
                            <span className="px-2 py-1 bg-purple-600/50 rounded text-xs">
                              {player.match_type.replace('_', ' ').toUpperCase()}
                            </span>
                          </td>
                          <td className="px-6 py-4">
                            <div className="text-white">{player.total_matches}</div>
                            <div className="text-xs text-gray-400">{player.matches_won}W-{player.matches_lost}L</div>
                          </td>
                          <td className="px-6 py-4">
                            <div className="text-lg font-bold text-green-400">
                              {formatPercentage(player.win_rate)}
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            <div className="text-white">{player.kill_death_ratio.toFixed(2)}</div>
                            <div className="text-xs text-gray-400">{player.total_kills}K-{player.total_deaths}D</div>
                          </td>
                          <td className="px-6 py-4">
                            <div className="text-white">{formatPercentage(player.overall_accuracy)}</div>
                          </td>
                          <td className="px-6 py-4">
                            {player.match_type.startsWith('ranked') || player.match_type === 'overall' ? (
                              <div>
                                <div className={`font-bold ${tier.tailwind}`}>{player.current_elo}</div>
                                <div className="text-xs text-gray-400">Peak: {player.peak_elo}</div>
                                <div className={`text-xs ${tier.tailwind}`}>{tier.name}</div>
                              </div>
                            ) : (
                              <span className="text-gray-500">N/A</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </motion.div>
        ) : (
          /* Recent Matches Table */
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-gradient-to-br from-gray-800 to-gray-900 rounded-xl overflow-hidden border border-purple-500/30"
          >
            {matchesLoading ? (
              <div className="text-center py-8">
                <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-purple-500 mx-auto mb-4"></div>
                <p className="text-gray-400">Loading recent matches...</p>
              </div>
            ) : duelingMatches.length === 0 ? (
              <div className="p-8 text-center">
                <p className="text-gray-400">No matches found</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-gray-600">
                      <th
                        className="px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase cursor-pointer hover:text-cyan-400"
                        onClick={() => handleMatchSort('completed_at')}
                      >
                        Date {matchSortBy === 'completed_at' && (matchSortOrder === 'asc' ? '↑' : '↓')}
                      </th>
                      <th
                        className="px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase cursor-pointer hover:text-cyan-400"
                        onClick={() => handleMatchSort('match_type')}
                      >
                        Type {matchSortBy === 'match_type' && (matchSortOrder === 'asc' ? '↑' : '↓')}
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase">Players</th>
                      <th
                        className="px-4 py-3 text-center text-xs font-medium text-gray-300 uppercase cursor-pointer hover:text-cyan-400"
                        onClick={() => handleMatchSort('total_rounds')}
                      >
                        Score {matchSortBy === 'total_rounds' && (matchSortOrder === 'asc' ? '↑' : '↓')}
                      </th>
                      <th
                        className="px-4 py-3 text-center text-xs font-medium text-gray-300 uppercase cursor-pointer hover:text-cyan-400"
                        onClick={() => handleMatchSort('duration_seconds')}
                      >
                        Duration {matchSortBy === 'duration_seconds' && (matchSortOrder === 'asc' ? '↑' : '↓')}
                      </th>
                      <th className="px-4 py-3 text-center text-xs font-medium text-gray-300 uppercase">Player 1 Stats</th>
                      <th className="px-4 py-3 text-center text-xs font-medium text-gray-300 uppercase">Player 2 Stats</th>
                      <th className="px-4 py-3 text-center text-xs font-medium text-gray-300 uppercase">Rounds</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedMatches.map((match) => (
                      <tr key={match.id} className="border-b border-gray-700/50 hover:bg-gray-700/30 transition-colors">
                        <td className="px-4 py-3 text-sm text-gray-400">
                          {new Date(match.completed_at).toLocaleDateString()}
                          <div className="text-xs text-gray-500">
                            {new Date(match.completed_at).toLocaleTimeString()}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <span className="px-2 py-1 bg-purple-600/50 rounded text-xs">
                            {match.match_type.replace('_', ' ').toUpperCase()}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="space-y-1">
                            <div className={`text-sm font-medium ${match.winner_name === match.player1_name ? 'text-green-400' : 'text-red-400'}`}>
                              {match.player1_name} {match.winner_name === match.player1_name ? '👑' : ''}
                            </div>
                            <div className="text-xs text-gray-500">vs</div>
                            <div className={`text-sm font-medium ${match.winner_name === match.player2_name ? 'text-green-400' : 'text-red-400'}`}>
                              {match.player2_name} {match.winner_name === match.player2_name ? '👑' : ''}
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <div className="text-lg font-bold text-white">
                            {match.player1_rounds_won} - {match.player2_rounds_won}
                          </div>
                          <div className="text-xs text-gray-400">
                            {match.total_rounds} rounds
                          </div>
                        </td>
                        <td className="px-4 py-3 text-center text-sm text-gray-400">
                          {match.formatted_duration}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <div className="text-xs space-y-1">
                            {match.match_stats?.player1_accuracy !== undefined && (
                              <div className="text-green-400">
                                {(match.match_stats.player1_accuracy * 100).toFixed(1)}% acc
                              </div>
                            )}
                            {match.match_stats?.player1_shots_fired !== undefined && (
                              <div className="text-gray-400">
                                {match.match_stats.player1_shots_hit || 0}/{match.match_stats.player1_shots_fired || 0}
                              </div>
                            )}
                            {match.match_stats && (match.match_stats.player1_double_hits || 0) > 0 && (
                              <div className="text-yellow-400">
                                {match.match_stats.player1_double_hits}x2
                              </div>
                            )}
                            {match.match_stats && (match.match_stats.player1_triple_hits || 0) > 0 && (
                              <div className="text-red-400">
                                {match.match_stats.player1_triple_hits}x3
                              </div>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <div className="text-xs space-y-1">
                            {match.match_stats?.player2_accuracy !== undefined && (
                              <div className="text-green-400">
                                {(match.match_stats.player2_accuracy * 100).toFixed(1)}% acc
                              </div>
                            )}
                            {match.match_stats?.player2_shots_fired !== undefined && (
                              <div className="text-gray-400">
                                {match.match_stats.player2_shots_hit || 0}/{match.match_stats.player2_shots_fired || 0}
                              </div>
                            )}
                            {match.match_stats && (match.match_stats.player2_double_hits || 0) > 0 && (
                              <div className="text-yellow-400">
                                {match.match_stats.player2_double_hits}x2
                              </div>
                            )}
                            {match.match_stats && (match.match_stats.player2_triple_hits || 0) > 0 && (
                              <div className="text-red-400">
                                {match.match_stats.player2_triple_hits}x3
                              </div>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-center">
                          {match.rounds_data && match.rounds_data.length > 0 ? (
                            <div className="flex flex-wrap gap-1 justify-center">
                              {match.rounds_data.map((round: any, index: number) => (
                                <div key={index} className="bg-gray-700/50 rounded px-1 py-0.5 text-xs">
                                  R{round.round_number}: {round.winner_name === match.player1_name ? 'P1' : 'P2'}
                                  <div className="text-xs text-gray-500">({round.winner_hp}HP)</div>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <span className="text-gray-500 text-xs">No details</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </motion.div>
        )}
      </div>
    </div>
  );
}
