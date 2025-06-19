'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import Link from 'next/link';
import { useAuth } from '@/lib/AuthContext';
import Navbar from '@/components/Navbar';

interface PlayerAggregateStats {
  id: number;
  player_name: string;
  game_mode: string;
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
  avg_resource_unused_per_death: number;
  avg_explosive_unused_per_death: number;
  kill_death_ratio: number;
  win_rate: number;
  first_game_date: string;
  last_game_date: string;
  updated_at: string;
}

interface LeaderboardResponse {
  success: boolean;
  data: PlayerAggregateStats[];
  pagination: {
    total: number;
    offset: number;
    limit: number;
    hasMore: boolean;
  };
  filters: {
    gameMode: string;
    sortBy: string;
    sortOrder: string;
    dateFilter: string;
    playerName: string;
    availableGameModes: string[];
  };
}

const SORT_OPTIONS = [
  { value: 'weighted_elo', label: 'ELO Rating' },
  { value: 'elo_rating', label: 'Raw ELO' },
  { value: 'elo_peak', label: 'Peak ELO' },
  { value: 'total_kills', label: 'Total Kills' },
  { value: 'total_deaths', label: 'Total Deaths' },
  { value: 'kill_death_ratio', label: 'K/D Ratio' },
  { value: 'win_rate', label: 'Win Rate' },
  { value: 'total_games', label: 'Games Played' },
  { value: 'avg_kills_per_game', label: 'Avg Kills/Game' },
  { value: 'total_captures', label: 'Total Captures' },
  { value: 'total_eb_hits', label: 'EB Hits' },
  { value: 'total_turret_damage', label: 'Turret Damage' },
  { value: 'last_game_date', label: 'Last Active' }
];

const DATE_FILTERS = [
  { value: 'all', label: 'All Time' },
  { value: 'day', label: 'Last 24 Hours' },
  { value: 'week', label: 'Last Week' },
  { value: 'month', label: 'Last Month' },
  { value: 'year', label: 'Last Year' }
];

export default function PlayerStatsPage() {
  const { user } = useAuth();
  const [ovdStats, setOvdStats] = useState<PlayerAggregateStats[]>([]);
  const [mixStats, setMixStats] = useState<PlayerAggregateStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState('weighted_elo');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [dateFilter, setDateFilter] = useState('all');
  const [playerName, setPlayerName] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [availableGameModes, setAvailableGameModes] = useState<string[]>([]);
  const [ovdPagination, setOvdPagination] = useState({
    total: 0,
    offset: 0,
    limit: 25,
    hasMore: false
  });
  const [mixPagination, setMixPagination] = useState({
    total: 0,
    offset: 0,
    limit: 25,
    hasMore: false
  });

  // Column visibility state
  const [visibleColumns, setVisibleColumns] = useState({
    rank: true,
    player: true,
    gameMode: false, // Hide since we're separating by mode
    games: true,
    winRate: true,
    kills: true,
    deaths: false,
    kd: true,
    captures: true,
    ebHits: false,
    turretDamage: false,
    carryTime: false,
    accuracy: false,
    classSwaps: false,
    lastActive: true
  });

  const [showColumnSelector, setShowColumnSelector] = useState(false);

  // Recent games state
  const [recentGames, setRecentGames] = useState<any[]>([]);

  const fetchStats = async (gameMode: 'OvD' | 'Mix', offset = 0) => {
    try {
      const params = new URLSearchParams({
        gameMode,
        sortBy,
        sortOrder,
        dateFilter,
        playerName,
        limit: '25',
        offset: offset.toString()
      });

      const response = await fetch(`/api/player-stats/leaderboard?${params}`);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data: LeaderboardResponse = await response.json();
      
      if (data.success) {
        if (gameMode === 'OvD') {
          setOvdStats(data.data);
          setOvdPagination(data.pagination);
        } else {
          setMixStats(data.data);
          setMixPagination(data.pagination);
        }
        setAvailableGameModes(data.filters.availableGameModes);
      } else {
        throw new Error('Failed to fetch stats');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    }
  };

  const fetchAllStats = async () => {
    setLoading(true);
    setError(null);
    
    try {
      await Promise.all([
        fetchStats('OvD', 0),
        fetchStats('Mix', 0)
      ]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch stats');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAllStats();
    fetchRecentGames();
  }, [sortBy, sortOrder, dateFilter, playerName]);

  const handleSearch = () => {
    setPlayerName(searchInput);
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSearch();
    }
  };

  const formatNumber = (num: number, decimals = 0) => {
    return Number(num).toFixed(decimals);
  };

  const formatPercentage = (num: number) => {
    return `${(num * 100).toFixed(1)}%`;
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString();
  };

  const formatCarryTime = (seconds: number) => {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
  };

  const fetchRecentGames = async () => {
    try {
      const response = await fetch('/api/player-stats/recent-games?limit=5');
      if (response.ok) {
        const data = await response.json();
        if (data.success) {
          setRecentGames(data.data);
        }
      }
    } catch (error) {
      console.error('Error fetching recent games:', error);
    }
  };

  const renderStatsTable = (stats: PlayerAggregateStats[], gameMode: string, pagination: any) => (
    <div className="bg-white/10 backdrop-blur-lg rounded-xl overflow-hidden border border-white/20">
      <div className="bg-white/20 px-4 py-3 border-b border-white/20">
        <h3 className="text-lg font-bold text-blue-200 flex items-center gap-2">
          {gameMode === 'OvD' ? '⚔️ OvD Leaderboard' : '🏆 Mix Leaderboard'}
        </h3>
      </div>
      
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-white/20">
            <tr>
              {visibleColumns.rank && <th className="px-2 py-2 text-left text-xs font-semibold text-blue-200">Rank</th>}
              {visibleColumns.player && <th className="px-2 py-2 text-left text-xs font-semibold text-blue-200">Player</th>}
              {visibleColumns.games && <th className="px-2 py-2 text-right text-xs font-semibold text-blue-200">Games</th>}
              {visibleColumns.winRate && <th className="px-2 py-2 text-right text-xs font-semibold text-blue-200">Win%</th>}
              {visibleColumns.kills && <th className="px-2 py-2 text-right text-xs font-semibold text-blue-200">Kills</th>}
              {visibleColumns.deaths && <th className="px-2 py-2 text-right text-xs font-semibold text-blue-200">Deaths</th>}
              {visibleColumns.kd && <th className="px-2 py-2 text-right text-xs font-semibold text-blue-200">K/D</th>}
              {visibleColumns.captures && <th className="px-2 py-2 text-right text-xs font-semibold text-blue-200">Caps</th>}
              {visibleColumns.ebHits && <th className="px-2 py-2 text-right text-xs font-semibold text-blue-200">EB</th>}
              {visibleColumns.turretDamage && <th className="px-2 py-2 text-right text-xs font-semibold text-blue-200">Turret</th>}
              {visibleColumns.carryTime && <th className="px-2 py-2 text-right text-xs font-semibold text-blue-200">Carry</th>}
              {visibleColumns.accuracy && <th className="px-2 py-2 text-right text-xs font-semibold text-blue-200">Acc%</th>}
              {visibleColumns.classSwaps && <th className="px-2 py-2 text-right text-xs font-semibold text-blue-200">Swaps</th>}
              {visibleColumns.lastActive && <th className="px-2 py-2 text-right text-xs font-semibold text-blue-200">Last</th>}
            </tr>
          </thead>
          <tbody>
            {stats.map((player, index) => (
              <motion.tr
                key={player.id}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: index * 0.02 }}
                className="border-b border-white/10 hover:bg-white/5 transition-colors"
              >
                {visibleColumns.rank && (
                  <td className="px-2 py-2 text-xs font-medium text-cyan-400">
                    #{pagination.offset + index + 1}
                  </td>
                )}
                {visibleColumns.player && (
                  <td className="px-2 py-2">
                    <Link
                      href={`/stats/player/${encodeURIComponent(player.player_name)}`}
                      className="text-white hover:text-cyan-400 transition-colors font-medium text-xs truncate max-w-[100px] block"
                      title={player.player_name}
                    >
                      {player.player_name}
                    </Link>
                  </td>
                )}
                {visibleColumns.games && <td className="px-2 py-2 text-right text-xs">{player.total_games}</td>}
                {visibleColumns.winRate && <td className="px-2 py-2 text-right text-xs">{formatPercentage(player.win_rate)}</td>}
                {visibleColumns.kills && <td className="px-2 py-2 text-right text-xs">{player.total_kills}</td>}
                {visibleColumns.deaths && <td className="px-2 py-2 text-right text-xs">{player.total_deaths}</td>}
                {visibleColumns.kd && <td className="px-2 py-2 text-right text-xs">{formatNumber(player.kill_death_ratio, 2)}</td>}
                {visibleColumns.captures && <td className="px-2 py-2 text-right text-xs">{player.total_captures}</td>}
                {visibleColumns.ebHits && <td className="px-2 py-2 text-right text-xs">{player.total_eb_hits}</td>}
                {visibleColumns.turretDamage && <td className="px-2 py-2 text-right text-xs">{formatNumber(player.total_turret_damage, 0)}</td>}
                {visibleColumns.carryTime && <td className="px-2 py-2 text-right text-xs">{formatCarryTime(player.total_carry_time_seconds)}</td>}
                {visibleColumns.accuracy && <td className="px-2 py-2 text-right text-xs">{formatPercentage(player.avg_accuracy)}</td>}
                {visibleColumns.classSwaps && <td className="px-2 py-2 text-right text-xs">{player.total_class_swaps}</td>}
                {visibleColumns.lastActive && (
                  <td className="px-2 py-2 text-right text-xs text-blue-200">
                    {formatDate(player.last_game_date)}
                  </td>
                )}
              </motion.tr>
            ))}
          </tbody>
        </table>
      </div>

      {pagination.hasMore && (
        <div className="p-3 text-center border-t border-white/10">
          <button
            onClick={() => gameMode === 'OvD' ? fetchStats('OvD', pagination.offset + pagination.limit) : fetchStats('Mix', pagination.offset + pagination.limit)}
            disabled={loading}
            className="bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 disabled:opacity-50 disabled:cursor-not-allowed px-4 py-2 rounded-lg font-semibold transition-all duration-200 hover:scale-105 text-sm"
          >
            {loading ? 'Loading...' : 'Load More'}
          </button>
        </div>
      )}
    </div>
  );

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-900 via-blue-900 to-indigo-900 text-white">
      <Navbar user={user} />
      
      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center mb-8"
        >
          <h1 className="text-4xl md:text-5xl font-bold bg-gradient-to-r from-cyan-400 to-purple-400 bg-clip-text text-transparent mb-4">
            Player Statistics
          </h1>
          <p className="text-xl text-blue-200">
            Comprehensive player performance tracking and leaderboards
          </p>
        </motion.div>

        {/* Filters Section with Recent Games and Quick Stats Widget */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="grid grid-cols-1 lg:grid-cols-8 gap-6 mb-8"
        >
          {/* Main Filters - Takes up 4/8 of the width on large screens */}
          <div className="lg:col-span-4">
            <div className="bg-white/10 backdrop-blur-lg rounded-xl p-6 border border-white/20">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
                {/* Sort By */}
                <div>
                  <label className="block text-sm font-medium text-blue-200 mb-2">
                    Sort By
                  </label>
                  <select
                    value={sortBy}
                    onChange={(e) => setSortBy(e.target.value)}
                    className="w-full bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-white focus:ring-2 focus:ring-cyan-400 focus:border-transparent [&>option]:bg-gray-800 [&>option]:text-white"
                  >
                    {SORT_OPTIONS.map(option => (
                      <option key={option.value} value={option.value} className="bg-gray-800 text-white">
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Sort Order */}
                <div>
                  <label className="block text-sm font-medium text-blue-200 mb-2">
                    Order
                  </label>
                  <select
                    value={sortOrder}
                    onChange={(e) => setSortOrder(e.target.value as 'asc' | 'desc')}
                    className="w-full bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-white focus:ring-2 focus:ring-cyan-400 focus:border-transparent [&>option]:bg-gray-800 [&>option]:text-white"
                  >
                    <option value="desc" className="bg-gray-800 text-white">High to Low</option>
                    <option value="asc" className="bg-gray-800 text-white">Low to High</option>
                  </select>
                </div>

                {/* Date Filter */}
                <div>
                  <label className="block text-sm font-medium text-blue-200 mb-2">
                    Time Period
                  </label>
                  <select
                    value={dateFilter}
                    onChange={(e) => setDateFilter(e.target.value)}
                    className="w-full bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-white focus:ring-2 focus:ring-cyan-400 focus:border-transparent [&>option]:bg-gray-800 [&>option]:text-white"
                  >
                    {DATE_FILTERS.map(filter => (
                      <option key={filter.value} value={filter.value} className="bg-gray-800 text-white">
                        {filter.label}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Column Selector */}
                <div className="relative">
                  <label className="block text-sm font-medium text-blue-200 mb-2">
                    Display
                  </label>
                  <button
                    onClick={() => setShowColumnSelector(!showColumnSelector)}
                    className="w-full bg-gradient-to-r from-purple-500 to-indigo-500 hover:from-purple-600 hover:to-indigo-600 px-4 py-2 rounded-lg font-semibold transition-all duration-200 hover:scale-105"
                  >
                    Columns
                  </button>
                  {showColumnSelector && (
                    <div className="absolute top-full left-0 mt-2 bg-gray-800/95 backdrop-blur-sm border border-gray-600 rounded-lg p-4 z-50 min-w-64 shadow-2xl">
                      <div className="flex items-center justify-between mb-3">
                        <h3 className="text-sm font-semibold text-cyan-400">Column Visibility</h3>
                        <button
                          onClick={() => setShowColumnSelector(false)}
                          className="text-gray-400 hover:text-white text-lg leading-none"
                        >
                          ×
                        </button>
                      </div>
                      <div className="grid grid-cols-2 gap-3 text-sm">
                        {Object.entries(visibleColumns).map(([key, visible]) => (
                          <label key={key} className="flex items-center gap-2 text-white hover:text-cyan-400 cursor-pointer py-1">
                            <input
                              type="checkbox"
                              checked={visible}
                              onChange={(e) => setVisibleColumns(prev => ({ ...prev, [key]: e.target.checked }))}
                              className="w-4 h-4 text-cyan-500 bg-gray-700 border-gray-600 rounded focus:ring-cyan-500 focus:ring-2"
                            />
                            <span className="select-none">
                              {key.charAt(0).toUpperCase() + key.slice(1).replace(/([A-Z])/g, ' $1')}
                            </span>
                          </label>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Player Search */}
              <div className="flex gap-2 items-end">
                <div className="flex-1">
                  <input
                    type="text"
                    placeholder="Search player name..."
                    value={searchInput}
                    onChange={(e) => setSearchInput(e.target.value)}
                    onKeyPress={handleKeyPress}
                    className="w-full bg-white/10 border border-white/20 rounded-lg px-4 py-2 text-white placeholder-blue-300 focus:ring-2 focus:ring-cyan-400 focus:border-transparent"
                  />
                </div>
                <button
                  onClick={handleSearch}
                  className="bg-gradient-to-r from-cyan-500 to-blue-500 hover:from-cyan-600 hover:to-blue-600 px-6 py-2 rounded-lg font-semibold transition-all duration-200 hover:scale-105"
                >
                  Search
                </button>
              </div>
            </div>
          </div>

          {/* Recent Games Widget - Takes up 3/8 of the width on large screens */}
          <div className="lg:col-span-3">
            <div className="bg-gradient-to-b from-gray-800 to-gray-900 border border-cyan-500/30 rounded-xl shadow-2xl overflow-hidden h-full">
              <div className="bg-gray-700/50 px-3 py-2 border-b border-cyan-500/30">
                <h3 className="text-cyan-400 font-bold text-sm tracking-wide">🎮 Recent Games</h3>
              </div>
              
              <div className="p-3 h-80 overflow-y-auto">
                {recentGames.length === 0 ? (
                  <div className="text-center py-8 text-gray-400">
                    <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-cyan-400 mx-auto mb-2"></div>
                    Loading recent games...
                  </div>
                ) : (
                  <div className="space-y-2">
                    {recentGames.slice(0, 5).map((game, index) => (
                      <Link
                        key={index}
                        href={`/stats/game/${encodeURIComponent(game.gameId)}`}
                        className="block p-3 bg-gray-700/30 border border-gray-600/50 rounded-lg hover:bg-gray-600/40 hover:border-cyan-500/50 transition-all group"
                      >
                        <div className="flex items-center justify-between mb-1">
                          <div className="flex items-center gap-2">
                            <div className="bg-cyan-500/20 px-2 py-1 rounded text-xs text-cyan-300 font-medium">
                              {game.gameMode}
                            </div>
                            <div className="text-xs text-gray-400">
                              {formatDate(game.gameDate)}
                            </div>
                          </div>
                          <div className="text-cyan-400 group-hover:text-cyan-300 transition-colors text-sm">
                            →
                          </div>
                        </div>
                        {game.mapName && (
                          <div className="text-xs text-purple-400 flex items-center gap-1">
                            <span>📍</span>
                            <span>{game.mapName}</span>
                          </div>
                        )}
                        {game.players && (
                          <div className="text-xs text-gray-500 mt-1">
                            {game.players} players
                          </div>
                        )}
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Quick Stats Access Widget - Takes up 1/8 of the width on large screens */}
          <div className="lg:col-span-1">
            <div className="bg-gradient-to-b from-gray-800 to-gray-900 border border-indigo-500/30 rounded-xl shadow-2xl overflow-hidden h-full">
              <div className="bg-gray-700/50 px-3 py-2 border-b border-indigo-500/30">
                <h3 className="text-indigo-400 font-bold text-sm tracking-wide">📊 Quick Access</h3>
              </div>
              
              <div className="p-3">
                <div className="grid grid-cols-2 gap-2">
                  <button 
                    onClick={() => {
                      setSortBy('total_kills');
                      setSortOrder('desc');
                      setDateFilter('all');
                      setPlayerName('');
                      setSearchInput('');
                    }}
                    className="bg-gray-700/50 border border-gray-600 rounded-lg p-2 hover:border-indigo-500/50 transition-all duration-300 cursor-pointer group"
                  >
                    <div className="text-center">
                      <div className="text-red-400 text-sm mb-1">🎯</div>
                      <div className="text-xs text-gray-400 group-hover:text-indigo-300">Top Killers</div>
                    </div>
                  </button>
                  
                  <button 
                    onClick={() => {
                      setSortBy('win_rate');
                      setSortOrder('desc');
                      setDateFilter('all');
                      setPlayerName('');
                      setSearchInput('');
                    }}
                    className="bg-gray-700/50 border border-gray-600 rounded-lg p-2 hover:border-indigo-500/50 transition-all duration-300 cursor-pointer group"
                  >
                    <div className="text-center">
                      <div className="text-green-400 text-sm mb-1">🏆</div>
                      <div className="text-xs text-gray-400 group-hover:text-indigo-300">Win Rate</div>
                    </div>
                  </button>
                  
                  <button 
                    onClick={() => {
                      setSortBy('total_captures');
                      setSortOrder('desc');
                      setDateFilter('all');
                      setPlayerName('');
                      setSearchInput('');
                    }}
                    className="bg-gray-700/50 border border-gray-600 rounded-lg p-2 hover:border-indigo-500/50 transition-all duration-300 cursor-pointer group"
                  >
                    <div className="text-center">
                      <div className="text-blue-400 text-sm mb-1">🚩</div>
                      <div className="text-xs text-gray-400 group-hover:text-indigo-300">Flag Caps</div>
                    </div>
                  </button>
                  
                  <button 
                    onClick={() => {
                      setSortBy('total_games');
                      setSortOrder('desc');
                      setDateFilter('all');
                      setPlayerName('');
                      setSearchInput('');
                    }}
                    className="bg-gray-700/50 border border-gray-600 rounded-lg p-2 hover:border-indigo-500/50 transition-all duration-300 cursor-pointer group"
                  >
                    <div className="text-center">
                      <div className="text-purple-400 text-sm mb-1">🎮</div>
                      <div className="text-xs text-gray-400 group-hover:text-indigo-300">Most Active</div>
                    </div>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </motion.div>



        {/* Error State */}
        {error && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="bg-red-500/20 border border-red-500/50 rounded-lg p-4 mb-6 text-red-200"
          >
            Error: {error}
          </motion.div>
        )}

        {/* Loading State */}
        {loading && !ovdStats.length && !mixStats.length && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="text-center py-12"
          >
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-cyan-400 mx-auto mb-4"></div>
            <p className="text-blue-200">Loading player statistics...</p>
          </motion.div>
        )}

        {/* Side-by-Side Leaderboards */}  
        {!loading && (ovdStats.length > 0 || mixStats.length > 0) && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="grid grid-cols-1 lg:grid-cols-2 gap-6"
          >
            {/* OvD Leaderboard */}
            <div>
              {renderStatsTable(ovdStats, 'OvD', ovdPagination)}
            </div>

            {/* Mix Leaderboard */}
            <div>
              {renderStatsTable(mixStats, 'Mix', mixPagination)}
            </div>
          </motion.div>
        )}

        {/* No Results */}
        {!loading && ovdStats.length === 0 && mixStats.length === 0 && !error && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="text-center py-12"
          >
            <p className="text-xl text-blue-200 mb-4">No player statistics found</p>
            <p className="text-blue-300">Try adjusting your filters or search criteria</p>
          </motion.div>
        )}
      </div>
    </div>
  );
} 