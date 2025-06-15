'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import Link from 'next/link';

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
  const [stats, setStats] = useState<PlayerAggregateStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [gameMode, setGameMode] = useState('all');
  const [sortBy, setSortBy] = useState('weighted_elo');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [dateFilter, setDateFilter] = useState('all');
  const [playerName, setPlayerName] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [availableGameModes, setAvailableGameModes] = useState<string[]>([]);
  const [pagination, setPagination] = useState({
    total: 0,
    offset: 0,
    limit: 50,
    hasMore: false
  });

  // Column visibility state
  const [visibleColumns, setVisibleColumns] = useState({
    rank: true,
    player: true,
    gameMode: true,
    games: true,
    winRate: true,
    kills: true,
    deaths: true,
    kd: true,
    captures: true,
    ebHits: true,
    turretDamage: true,
    carryTime: true,
    accuracy: true,
    classSwaps: true,
    lastActive: true
  });

  const [showColumnSelector, setShowColumnSelector] = useState(false);

  // Recent games state
  const [recentGames, setRecentGames] = useState<any[]>([]);
  const [showRecentGames, setShowRecentGames] = useState(false);

  const fetchStats = async (offset = 0) => {
    try {
      setLoading(true);
      setError(null);

      const params = new URLSearchParams({
        gameMode,
        sortBy,
        sortOrder,
        dateFilter,
        playerName,
        limit: pagination.limit.toString(),
        offset: offset.toString()
      });

      const response = await fetch(`/api/player-stats/leaderboard?${params}`);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data: LeaderboardResponse = await response.json();
      
      if (data.success) {
        setStats(data.data);
        setPagination(data.pagination);
        setAvailableGameModes(data.filters.availableGameModes);
      } else {
        throw new Error('Failed to fetch stats');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStats(0);
  }, [gameMode, sortBy, sortOrder, dateFilter, playerName]);

  const handleSearch = () => {
    setPlayerName(searchInput);
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSearch();
    }
  };

  const loadMore = () => {
    if (pagination.hasMore && !loading) {
      fetchStats(pagination.offset + pagination.limit);
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
      const response = await fetch('/api/player-stats/recent-games?limit=15');
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

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-900 via-blue-900 to-indigo-900 text-white">
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

        {/* Player Statistics Quick Access Widget */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-gradient-to-b from-gray-800 to-gray-900 border border-indigo-500/30 rounded-lg shadow-2xl overflow-hidden mb-8"
        >
          <div className="bg-gray-700/50 px-4 py-3 border-b border-indigo-500/30">
            <h3 className="text-indigo-400 font-bold text-lg tracking-wider">📊 QUICK STATS ACCESS</h3>
            <p className="text-gray-400 text-sm mt-1">Jump to popular leaderboards</p>
          </div>
          
          <div className="p-4 bg-gray-900">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <button 
                onClick={() => {
                  setGameMode('all');
                  setSortBy('total_kills');
                  setSortOrder('desc');
                  setDateFilter('all');
                  setPlayerName('');
                  setSearchInput('');
                }}
                className="bg-gray-700/50 border border-gray-600 rounded-lg p-3 hover:border-indigo-500/50 transition-all duration-300 cursor-pointer group"
              >
                <div className="text-center">
                  <div className="text-red-400 text-lg mb-1">🎯</div>
                  <div className="text-xs text-gray-400 group-hover:text-indigo-300">Top Killers</div>
                </div>
              </button>
              
              <button 
                onClick={() => {
                  setGameMode('all');
                  setSortBy('win_rate');
                  setSortOrder('desc');
                  setDateFilter('all');
                  setPlayerName('');
                  setSearchInput('');
                }}
                className="bg-gray-700/50 border border-gray-600 rounded-lg p-3 hover:border-indigo-500/50 transition-all duration-300 cursor-pointer group"
              >
                <div className="text-center">
                  <div className="text-green-400 text-lg mb-1">🏆</div>
                  <div className="text-xs text-gray-400 group-hover:text-indigo-300">Win Rate</div>
                </div>
              </button>
              
              <button 
                onClick={() => {
                  setGameMode('CTF');
                  setSortBy('total_captures');
                  setSortOrder('desc');
                  setDateFilter('all');
                  setPlayerName('');
                  setSearchInput('');
                }}
                className="bg-gray-700/50 border border-gray-600 rounded-lg p-3 hover:border-indigo-500/50 transition-all duration-300 cursor-pointer group"
              >
                <div className="text-center">
                  <div className="text-blue-400 text-lg mb-1">🚩</div>
                  <div className="text-xs text-gray-400 group-hover:text-indigo-300">Flag Caps</div>
                </div>
              </button>
              
              <button 
                onClick={() => {
                  setGameMode('all');
                  setSortBy('total_games');
                  setSortOrder('desc');
                  setDateFilter('all');
                  setPlayerName('');
                  setSearchInput('');
                }}
                className="bg-gray-700/50 border border-gray-600 rounded-lg p-3 hover:border-indigo-500/50 transition-all duration-300 cursor-pointer group"
              >
                <div className="text-center">
                  <div className="text-purple-400 text-lg mb-1">🎮</div>
                  <div className="text-xs text-gray-400 group-hover:text-indigo-300">Most Active</div>
                </div>
              </button>
            </div>
            
            <div className="mt-4 pt-3 border-t border-gray-700">
              <div className="text-xs text-gray-500 text-center">
                Track performance across all game modes
              </div>
            </div>
          </div>
        </motion.div>

        {/* Filters */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white/10 backdrop-blur-lg rounded-xl p-6 mb-8 border border-white/20"
        >
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
            {/* Game Mode Filter */}
            <div>
              <label className="block text-sm font-medium text-blue-200 mb-2">
                Game Mode
              </label>
              <select
                value={gameMode}
                onChange={(e) => setGameMode(e.target.value)}
                className="w-full bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-white focus:ring-2 focus:ring-cyan-400 focus:border-transparent [&>option]:bg-gray-800 [&>option]:text-white"
              >
                <option value="all" className="bg-gray-800 text-white">All Modes</option>
                {availableGameModes.map(mode => (
                  <option key={mode} value={mode} className="bg-gray-800 text-white">{mode}</option>
                ))}
              </select>
            </div>

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
          </div>

          {/* Player Search and Column Selector */}
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
            <div className="relative">
              <button
                onClick={() => setShowColumnSelector(!showColumnSelector)}
                className="bg-gradient-to-r from-purple-500 to-indigo-500 hover:from-purple-600 hover:to-indigo-600 px-4 py-2 rounded-lg font-semibold transition-all duration-200 hover:scale-105"
              >
                Columns
              </button>
              {showColumnSelector && (
                <div className="absolute bottom-full right-0 mb-2 bg-gray-800/95 backdrop-blur-sm border border-gray-600 rounded-lg p-4 z-50 min-w-64 shadow-2xl">
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
        </motion.div>

        {/* Recent Games Section */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-8"
        >
          <div className="bg-white/10 backdrop-blur-lg rounded-xl border border-white/20 overflow-hidden">
            <div 
              className="p-4 bg-white/20 border-b border-white/20 cursor-pointer hover:bg-white/25 transition-all"
              onClick={() => {
                setShowRecentGames(!showRecentGames);
                if (!showRecentGames && recentGames.length === 0) {
                  fetchRecentGames();
                }
              }}
            >
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-bold text-blue-200 flex items-center gap-2">
                  🎮 Recent Games
                  <span className="text-sm font-normal text-blue-300">
                    (Click to view individual game stats)
                  </span>
                </h2>
                <span className="text-cyan-400">
                  {showRecentGames ? '▼' : '▶'}
                </span>
              </div>
            </div>
            
            {showRecentGames && (
              <div className="p-4">
                {recentGames.length === 0 ? (
                  <div className="text-center py-4 text-blue-300">
                    Loading recent games...
                  </div>
                ) : (
                  <div className="grid gap-2">
                    {recentGames.map((game, index) => (
                      <Link
                        key={index}
                        href={`/stats/game/${encodeURIComponent(game.gameId)}`}
                        className="flex items-center justify-between p-3 bg-white/10 rounded-lg hover:bg-white/20 transition-all group"
                      >
                        <div className="flex items-center gap-4">
                          <div className="bg-cyan-500/20 px-2 py-1 rounded text-xs text-cyan-300">
                            {game.gameMode}
                          </div>
                          <div className="text-sm text-blue-200">
                            {formatDate(game.gameDate)}
                          </div>
                          {game.mapName && (
                            <div className="text-xs text-purple-400">
                              📍 {game.mapName}
                            </div>
                          )}
                          <div className="text-xs text-gray-400">
                            {game.players.length} player{game.players.length !== 1 ? 's' : ''}
                          </div>
                        </div>
                        <div className="text-cyan-400 group-hover:text-cyan-300 transition-colors">
                          →
                        </div>
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            )}
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
        {loading && !stats.length && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="text-center py-12"
          >
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-cyan-400 mx-auto mb-4"></div>
            <p className="text-blue-200">Loading player statistics...</p>
          </motion.div>
        )}

        {/* Stats Table */}
        {!loading && stats.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-white/10 backdrop-blur-lg rounded-xl overflow-hidden border border-white/20"
          >
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-white/20">
                  <tr>
                    {visibleColumns.rank && <th className="px-2 py-2 text-left text-xs font-semibold text-blue-200">Rank</th>}
                    {visibleColumns.player && <th className="px-2 py-2 text-left text-xs font-semibold text-blue-200">Player</th>}
                    {visibleColumns.gameMode && <th className="px-2 py-2 text-left text-xs font-semibold text-blue-200">Mode</th>}
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
                    <th className="px-2 py-2 text-center text-xs font-semibold text-blue-200">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.map((player, index) => (
                    <motion.tr
                      key={player.id}
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: index * 0.05 }}
                      className="border-b border-white/10 hover:bg-white/5 transition-colors"
                    >
                      {visibleColumns.rank && (
                        <td className="px-2 py-2 text-xs font-medium text-cyan-400">
                          #{pagination.offset + index + 1}
                        </td>
                      )}
                      {visibleColumns.player && (
                        <td className="px-2 py-2">
                          <button
                            onClick={() => window.location.href = `/stats/player/${encodeURIComponent(player.player_name)}`}
                            className="text-white hover:text-cyan-400 transition-colors font-medium text-xs truncate max-w-[120px] block"
                            title={player.player_name}
                          >
                            {player.player_name}
                          </button>
                        </td>
                      )}
                      {visibleColumns.gameMode && (
                        <td className="px-2 py-2 text-xs text-blue-200">
                          <span className="bg-white/20 px-1 py-0.5 rounded text-xs">
                            {player.game_mode}
                          </span>
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
                      <td className="px-2 py-2">
                        <Link
                          href={`/stats/player/${encodeURIComponent(player.player_name)}`}
                          className="bg-blue-600 hover:bg-blue-700 px-2 py-1 rounded text-xs transition-colors"
                        >
                          📊 Profile
                        </Link>
                      </td>
                    </motion.tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {pagination.hasMore && (
              <div className="p-4 text-center border-t border-white/10">
                <button
                  onClick={loadMore}
                  disabled={loading}
                  className="bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 disabled:opacity-50 disabled:cursor-not-allowed px-6 py-2 rounded-lg font-semibold transition-all duration-200 hover:scale-105"
                >
                  {loading ? 'Loading...' : 'Load More'}
                </button>
                <p className="text-sm text-blue-300 mt-2">
                  Showing {stats.length} of {pagination.total} players
                </p>
              </div>
            )}
          </motion.div>
        )}

        {/* No Results */}
        {!loading && stats.length === 0 && !error && (
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