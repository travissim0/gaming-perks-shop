'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import Link from 'next/link';
import { useAuth } from '@/lib/AuthContext';
import Navbar from '@/components/Navbar';
import { getClassColor } from '@/utils/classColors';
import { ChevronDown, ChevronRight, Filter, X } from 'lucide-react';

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
  most_played_class?: string;
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
  const [sortBy, setSortBy] = useState('total_kills');
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

  // Tab state for switching between OvD and Mix statistics
  const [activeTab, setActiveTab] = useState<'OvD' | 'Mix'>('OvD');

  // Sidebar state for filters - responsive by default
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);

  // NEW: Desktop floating filter panel state - starts collapsed
  const [desktopFiltersOpen, setDesktopFiltersOpen] = useState(false);

  // Column visibility state
  const [visibleColumns, setVisibleColumns] = useState({
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
  const [gamesLoading, setGamesLoading] = useState(true);

  // Mock function to get most played class
  const getMostPlayedClass = (playerName: string): string => {
    const classes = ['Infantry', 'Field Medic', 'Heavy Weapons', 'Combat Engineer'];
    return classes[Math.floor(Math.random() * classes.length)];
  };

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
        // Add most played class to each player
        const playersWithClass = data.data.map(player => ({
          ...player,
          most_played_class: getMostPlayedClass(player.player_name)
        }));

        if (gameMode === 'OvD') {
          setOvdStats(playersWithClass);
          setOvdPagination(data.pagination);
        } else {
          setMixStats(playersWithClass);
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

  const fetchRecentGames = async () => {
    setGamesLoading(true);
    try {
      const response = await fetch('/api/player-stats/recent-games?limit=15');
      if (response.ok) {
        const data = await response.json();
        setRecentGames(data.games || []);
      } else {
        console.error('Failed to fetch recent games:', response.statusText);
      }
    } catch (error) {
      console.error('Error fetching recent games:', error);
    } finally {
      setGamesLoading(false);
    }
  };

  useEffect(() => {
    fetchAllStats();
    fetchRecentGames();
  }, [sortBy, sortOrder, dateFilter, playerName]);

  // Close floating filter panel on escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setDesktopFiltersOpen(false);
        setMobileFiltersOpen(false);
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, []);

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

  const renderStatsTable = (stats: PlayerAggregateStats[], gameMode: string, pagination: any) => (
    <div className="bg-white/10 backdrop-blur-lg rounded-xl overflow-hidden border border-white/20">
      <div className="overflow-x-auto">
        <table className="w-full text-xs lg:text-sm min-w-[600px]">
          <thead className="bg-white/20">
            <tr>
              {visibleColumns.player && <th className="px-2 lg:px-3 py-2 lg:py-3 text-left text-xs lg:text-sm font-semibold text-blue-200 w-24 lg:w-32">Player</th>}
              {visibleColumns.games && <th className="px-2 lg:px-3 py-2 lg:py-3 text-right text-xs lg:text-sm font-semibold text-blue-200 w-12 lg:w-16">Games</th>}
              {visibleColumns.winRate && <th className="px-2 lg:px-3 py-2 lg:py-3 text-right text-xs lg:text-sm font-semibold text-blue-200">Win%</th>}
              {visibleColumns.kills && <th className="px-2 lg:px-3 py-2 lg:py-3 text-right text-xs lg:text-sm font-semibold text-blue-200">Kills</th>}
              {visibleColumns.deaths && <th className="px-2 lg:px-3 py-2 lg:py-3 text-right text-xs lg:text-sm font-semibold text-blue-200">Deaths</th>}
              {visibleColumns.kd && <th className="px-2 lg:px-3 py-2 lg:py-3 text-right text-xs lg:text-sm font-semibold text-blue-200">K/D</th>}
              {visibleColumns.captures && <th className="px-2 lg:px-3 py-2 lg:py-3 text-right text-xs lg:text-sm font-semibold text-blue-200">Caps</th>}
              {visibleColumns.ebHits && <th className="px-2 lg:px-3 py-2 lg:py-3 text-right text-xs lg:text-sm font-semibold text-blue-200">EB</th>}
              {visibleColumns.turretDamage && <th className="px-2 lg:px-3 py-2 lg:py-3 text-right text-xs lg:text-sm font-semibold text-blue-200">Turret</th>}
              {visibleColumns.carryTime && <th className="px-2 lg:px-3 py-2 lg:py-3 text-right text-xs lg:text-sm font-semibold text-blue-200">Carry</th>}
              {visibleColumns.accuracy && <th className="px-2 lg:px-3 py-2 lg:py-3 text-right text-xs lg:text-sm font-semibold text-blue-200">Acc%</th>}
              {visibleColumns.classSwaps && <th className="px-2 lg:px-3 py-2 lg:py-3 text-right text-xs lg:text-sm font-semibold text-blue-200">Swaps</th>}
              {visibleColumns.lastActive && <th className="px-2 lg:px-3 py-2 lg:py-3 text-right text-xs lg:text-sm font-semibold text-blue-200">Last</th>}
            </tr>
          </thead>
          <tbody>
            {stats.map((player, index) => (
              <motion.tr
                key={player.id}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: index * 0.02 }}
                className={`border-b border-white/10 hover:bg-white/10 transition-colors ${
                  index % 2 === 0 ? 'bg-white/5' : 'bg-black/10'
                }`}
              >
                {visibleColumns.player && (
                  <td className="px-2 lg:px-3 py-2 lg:py-3 w-24 lg:w-32">
                    <Link
                      href={`/stats/player/${encodeURIComponent(player.player_name)}`}
                      className="hover:text-cyan-400 transition-colors font-medium text-xs lg:text-sm truncate block"
                      title={player.player_name}
                      style={{ color: getClassColor(player.most_played_class || 'Infantry') }}
                    >
                      {player.player_name}
                    </Link>
                  </td>
                )}
                {visibleColumns.games && <td className="px-2 lg:px-3 py-2 lg:py-3 text-right text-xs lg:text-sm text-white w-12 lg:w-16">{player.total_games}</td>}
                {visibleColumns.winRate && <td className="px-2 lg:px-3 py-2 lg:py-3 text-right text-xs lg:text-sm text-white">{formatPercentage(player.win_rate)}</td>}
                {visibleColumns.kills && <td className="px-2 lg:px-3 py-2 lg:py-3 text-right text-xs lg:text-sm text-white">{player.total_kills}</td>}
                {visibleColumns.deaths && <td className="px-2 lg:px-3 py-2 lg:py-3 text-right text-xs lg:text-sm text-white">{player.total_deaths}</td>}
                {visibleColumns.kd && <td className="px-2 lg:px-3 py-2 lg:py-3 text-right text-xs lg:text-sm text-white">{formatNumber(player.kill_death_ratio, 2)}</td>}
                {visibleColumns.captures && <td className="px-2 lg:px-3 py-2 lg:py-3 text-right text-xs lg:text-sm text-white">{player.total_captures}</td>}
                {visibleColumns.ebHits && <td className="px-2 lg:px-3 py-2 lg:py-3 text-right text-xs lg:text-sm text-white">{player.total_eb_hits}</td>}
                {visibleColumns.turretDamage && <td className="px-2 lg:px-3 py-2 lg:py-3 text-right text-xs lg:text-sm text-white">{formatNumber(player.total_turret_damage, 0)}</td>}
                {visibleColumns.carryTime && <td className="px-2 lg:px-3 py-2 lg:py-3 text-right text-xs lg:text-sm text-white">{formatCarryTime(player.total_carry_time_seconds)}</td>}
                {visibleColumns.accuracy && <td className="px-2 lg:px-3 py-2 lg:py-3 text-right text-xs lg:text-sm text-white">{formatPercentage(player.avg_accuracy)}</td>}
                {visibleColumns.classSwaps && <td className="px-2 lg:px-3 py-2 lg:py-3 text-right text-xs lg:text-sm text-white">{player.total_class_swaps}</td>}
                {visibleColumns.lastActive && (
                  <td className="px-2 lg:px-3 py-2 lg:py-3 text-right text-xs lg:text-sm text-blue-200">
                    {formatDate(player.last_game_date)}
                  </td>
                )}
              </motion.tr>
            ))}
          </tbody>
        </table>
      </div>

      {pagination.hasMore && (
        <div className="p-4 text-center border-t border-white/10">
          <button
            onClick={() => activeTab === 'OvD' ? fetchStats('OvD', pagination.offset + pagination.limit) : fetchStats('Mix', pagination.offset + pagination.limit)}
            disabled={loading}
            className="bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 disabled:opacity-50 disabled:cursor-not-allowed px-6 py-2 rounded-lg font-semibold transition-all duration-200 hover:scale-105"
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
      
      {/* Mobile Filters Button */}
      <div className="lg:hidden fixed top-20 right-4 z-40">
        <button
          onClick={() => setMobileFiltersOpen(!mobileFiltersOpen)}
          className="bg-cyan-600 hover:bg-cyan-700 text-white p-3 rounded-full shadow-lg transition-colors"
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 100 4m0-4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 100 4m0-4v2m0-6V4" />
          </svg>
        </button>
      </div>

      {/* Mobile Filters Overlay */}
      {mobileFiltersOpen && (
        <div className="lg:hidden fixed inset-0 bg-black bg-opacity-50 z-50" onClick={() => setMobileFiltersOpen(false)}>
          <div className="fixed right-0 top-0 h-full w-80 max-w-[80vw] bg-gray-800 shadow-xl transform transition-transform duration-300 overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="p-4 border-b border-gray-700 flex items-center justify-between">
              <h3 className="font-medium text-white">Filters & Quick Access</h3>
              <button
                onClick={() => setMobileFiltersOpen(false)}
                className="text-gray-400 hover:text-white transition-colors"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="p-4 space-y-6">
              {/* Filters */}
              <div className="space-y-4">
                <h3 className="text-sm font-semibold text-cyan-400 uppercase tracking-wide">📊 Filters</h3>
                
                {/* Sort By */}
                <div>
                  <label className="block text-xs font-medium text-blue-200 mb-1">Sort By</label>
                  <select
                    value={sortBy}
                    onChange={(e) => {setSortBy(e.target.value); setMobileFiltersOpen(false);}}
                    className="w-full bg-gray-700 border border-gray-600 rounded px-2 py-1 text-xs text-white focus:ring-2 focus:ring-cyan-400 focus:border-transparent"
                  >
                    {SORT_OPTIONS.map(option => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </select>
                </div>

                {/* Sort Order */}
                <div>
                  <label className="block text-xs font-medium text-blue-200 mb-1">Order</label>
                  <select
                    value={sortOrder}
                    onChange={(e) => {setSortOrder(e.target.value as 'asc' | 'desc'); setMobileFiltersOpen(false);}}
                    className="w-full bg-gray-700 border border-gray-600 rounded px-2 py-1 text-xs text-white focus:ring-2 focus:ring-cyan-400 focus:border-transparent"
                  >
                    <option value="desc">High to Low</option>
                    <option value="asc">Low to High</option>
                  </select>
                </div>

                {/* Date Filter */}
                <div>
                  <label className="block text-xs font-medium text-blue-200 mb-1">Time Period</label>
                  <select
                    value={dateFilter}
                    onChange={(e) => {setDateFilter(e.target.value); setMobileFiltersOpen(false);}}
                    className="w-full bg-gray-700 border border-gray-600 rounded px-2 py-1 text-xs text-white focus:ring-2 focus:ring-cyan-400 focus:border-transparent"
                  >
                    {DATE_FILTERS.map(filter => (
                      <option key={filter.value} value={filter.value}>{filter.label}</option>
                    ))}
                  </select>
                </div>

                {/* Player Search */}
                <div>
                  <label className="block text-xs font-medium text-blue-200 mb-1">Search Player</label>
                  <div className="flex gap-1">
                    <input
                      type="text"
                      placeholder="Player name..."
                      value={searchInput}
                      onChange={(e) => setSearchInput(e.target.value)}
                      onKeyPress={handleKeyPress}
                      className="flex-1 bg-gray-700 border border-gray-600 rounded px-2 py-1 text-xs text-white placeholder-gray-400 focus:ring-2 focus:ring-cyan-400 focus:border-transparent"
                    />
                    <button
                      onClick={() => {handleSearch(); setMobileFiltersOpen(false);}}
                      className="bg-cyan-600 hover:bg-cyan-700 px-2 py-1 rounded text-xs font-semibold transition-colors"
                    >
                      Go
                    </button>
                  </div>
                </div>
              </div>

              {/* Quick Access */}
              <div className="space-y-3">
                <h3 className="text-sm font-semibold text-indigo-400 uppercase tracking-wide">⚡ Quick Access</h3>
                
                <button 
                  onClick={() => {
                    setSortBy('total_kills');
                    setSortOrder('desc');
                    setDateFilter('all');
                    setPlayerName('');
                    setSearchInput('');
                    setMobileFiltersOpen(false);
                  }}
                  className="w-full p-2 bg-red-900/30 border border-red-500/30 rounded hover:bg-red-800/40 transition-colors text-xs"
                >
                  <div className="text-red-300 font-bold">🎯 Top Killers</div>
                </button>
                
                <button 
                  onClick={() => {
                    setSortBy('win_rate');
                    setSortOrder('desc');
                    setDateFilter('all');
                    setPlayerName('');
                    setSearchInput('');
                    setMobileFiltersOpen(false);
                  }}
                  className="w-full p-2 bg-green-900/30 border border-green-500/30 rounded hover:bg-green-800/40 transition-colors text-xs"
                >
                  <div className="text-green-300 font-bold">🏆 Win Rate</div>
                </button>
                
                <button 
                  onClick={() => {
                    setSortBy('total_captures');
                    setSortOrder('desc');
                    setDateFilter('all');
                    setPlayerName('');
                    setSearchInput('');
                    setMobileFiltersOpen(false);
                  }}
                  className="w-full p-2 bg-blue-900/30 border border-blue-500/30 rounded hover:bg-blue-800/40 transition-colors text-xs"
                >
                  <div className="text-blue-300 font-bold">🚩 Flag Caps</div>
                </button>
                
                <button 
                  onClick={() => {
                    setSortBy('total_games');
                    setSortOrder('desc');
                    setDateFilter('all');
                    setPlayerName('');
                    setSearchInput('');
                    setMobileFiltersOpen(false);
                  }}
                  className="w-full p-2 bg-purple-900/30 border border-purple-500/30 rounded hover:bg-purple-800/40 transition-colors text-xs"
                >
                  <div className="text-purple-300 font-bold">🎮 Most Active</div>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      
      {/* Desktop Filter Toggle Button */}
      <div className="hidden lg:block fixed top-28 right-6 z-40">
        <button
          onClick={() => setDesktopFiltersOpen(!desktopFiltersOpen)}
          className={`backdrop-blur-sm text-white p-3 rounded-full shadow-lg transition-all duration-200 hover:scale-105 ${
            desktopFiltersOpen 
              ? 'bg-cyan-700 ring-2 ring-cyan-400' 
              : 'bg-cyan-600/90 hover:bg-cyan-700'
          }`}
          title="Toggle Filters"
        >
          <Filter className="w-6 h-6" />
        </button>
      </div>

      {/* Desktop Floating Filter Panel */}
      {desktopFiltersOpen && (
        <motion.div 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="hidden lg:block fixed inset-0 z-30 bg-black/20 backdrop-blur-sm" 
          onClick={() => setDesktopFiltersOpen(false)}
        >
          <motion.div
            initial={{ opacity: 0, x: 300, scale: 0.95 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{ opacity: 0, x: 300, scale: 0.95 }}
            transition={{ 
              type: "spring", 
              stiffness: 300, 
              damping: 25,
              duration: 0.3 
            }}
            className="absolute top-28 right-6 w-80 bg-gray-800/95 backdrop-blur-md border border-gray-600/50 rounded-xl shadow-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-4 border-b border-gray-700/50 flex items-center justify-between">
              <h3 className="font-medium text-white">Filters & Quick Access</h3>
              <button
                onClick={() => setDesktopFiltersOpen(false)}
                className="text-gray-400 hover:text-white transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-4 space-y-6 max-h-[70vh] overflow-y-auto">
              {/* Filters */}
              <div className="space-y-4">
                <h3 className="text-sm font-semibold text-cyan-400 uppercase tracking-wide">📊 Filters</h3>
                
                {/* Sort By */}
                <div>
                  <label className="block text-xs font-medium text-blue-200 mb-1">Sort By</label>
                  <select
                    value={sortBy}
                    onChange={(e) => setSortBy(e.target.value)}
                    className="w-full bg-gray-700 border border-gray-600 rounded px-2 py-1 text-xs text-white focus:ring-2 focus:ring-cyan-400 focus:border-transparent"
                  >
                    {SORT_OPTIONS.map(option => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </select>
                </div>

                {/* Sort Order */}
                <div>
                  <label className="block text-xs font-medium text-blue-200 mb-1">Order</label>
                  <select
                    value={sortOrder}
                    onChange={(e) => setSortOrder(e.target.value as 'asc' | 'desc')}
                    className="w-full bg-gray-700 border border-gray-600 rounded px-2 py-1 text-xs text-white focus:ring-2 focus:ring-cyan-400 focus:border-transparent"
                  >
                    <option value="desc">High to Low</option>
                    <option value="asc">Low to High</option>
                  </select>
                </div>

                {/* Date Filter */}
                <div>
                  <label className="block text-xs font-medium text-blue-200 mb-1">Time Period</label>
                  <select
                    value={dateFilter}
                    onChange={(e) => setDateFilter(e.target.value)}
                    className="w-full bg-gray-700 border border-gray-600 rounded px-2 py-1 text-xs text-white focus:ring-2 focus:ring-cyan-400 focus:border-transparent"
                  >
                    {DATE_FILTERS.map(filter => (
                      <option key={filter.value} value={filter.value}>{filter.label}</option>
                    ))}
                  </select>
                </div>

                {/* Player Search */}
                <div>
                  <label className="block text-xs font-medium text-blue-200 mb-1">Search Player</label>
                  <div className="flex gap-1">
                    <input
                      type="text"
                      placeholder="Player name..."
                      value={searchInput}
                      onChange={(e) => setSearchInput(e.target.value)}
                      onKeyPress={handleKeyPress}
                      className="flex-1 bg-gray-700 border border-gray-600 rounded px-2 py-1 text-xs text-white placeholder-gray-400 focus:ring-2 focus:ring-cyan-400 focus:border-transparent"
                    />
                    <button
                      onClick={handleSearch}
                      className="bg-cyan-600 hover:bg-cyan-700 px-2 py-1 rounded text-xs font-semibold transition-colors"
                    >
                      Go
                    </button>
                  </div>
                </div>
              </div>

              {/* Quick Access */}
              <div className="space-y-3">
                <h3 className="text-sm font-semibold text-indigo-400 uppercase tracking-wide">⚡ Quick Access</h3>
                
                <button 
                  onClick={() => {
                    setSortBy('total_kills');
                    setSortOrder('desc');
                    setDateFilter('all');
                    setPlayerName('');
                    setSearchInput('');
                    setDesktopFiltersOpen(false);
                  }}
                  className="w-full p-2 bg-red-900/30 border border-red-500/30 rounded hover:bg-red-800/40 transition-colors text-xs"
                >
                  <div className="text-red-300 font-bold">🎯 Top Killers</div>
                </button>
                
                <button 
                  onClick={() => {
                    setSortBy('win_rate');
                    setSortOrder('desc');
                    setDateFilter('all');
                    setPlayerName('');
                    setSearchInput('');
                    setDesktopFiltersOpen(false);
                  }}
                  className="w-full p-2 bg-green-900/30 border border-green-500/30 rounded hover:bg-green-800/40 transition-colors text-xs"
                >
                  <div className="text-green-300 font-bold">🏆 Win Rate</div>
                </button>
                
                <button 
                  onClick={() => {
                    setSortBy('total_captures');
                    setSortOrder('desc');
                    setDateFilter('all');
                    setPlayerName('');
                    setSearchInput('');
                    setDesktopFiltersOpen(false);
                  }}
                  className="w-full p-2 bg-blue-900/30 border border-blue-500/30 rounded hover:bg-blue-800/40 transition-colors text-xs"
                >
                  <div className="text-blue-300 font-bold">🚩 Flag Caps</div>
                </button>
                
                <button 
                  onClick={() => {
                    setSortBy('total_games');
                    setSortOrder('desc');
                    setDateFilter('all');
                    setPlayerName('');
                    setSearchInput('');
                    setDesktopFiltersOpen(false);
                  }}
                  className="w-full p-2 bg-purple-900/30 border border-purple-500/30 rounded hover:bg-purple-800/40 transition-colors text-xs"
                >
                  <div className="text-purple-300 font-bold">🎮 Most Active</div>
                </button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}

      <div className="flex flex-col lg:flex-row">
        {/* Recent Games - Left Side (Hidden on mobile) - Expanded to 1.5x width */}
        <div className="hidden lg:block lg:w-[480px] p-6 border-r border-gray-700">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-gradient-to-b from-gray-800 to-gray-900 border border-cyan-500/30 rounded-xl shadow-2xl overflow-hidden"
          >
            <div className="bg-gray-700/50 px-4 py-3 border-b border-cyan-500/30">
              <h3 className="text-cyan-400 font-bold text-sm tracking-wide">🎮 Recent Games</h3>
            </div>
            
            <div className="p-4 bg-gray-900 max-h-[800px] overflow-y-auto">
              {gamesLoading ? (
                <div className="text-center py-8 text-gray-400">
                  <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-cyan-400 mx-auto mb-2"></div>
                  Loading recent games...
                </div>
              ) : recentGames.length === 0 ? (
                <div className="text-center py-8 text-gray-400">
                  No recent games found
                </div>
              ) : (
                                 <div className="space-y-2">
                   {recentGames.slice(0, 12).map((game, index) => (
                     <Link
                       key={game.gameId || index}
                       href={`/stats/game/${encodeURIComponent(game.gameId)}`}
                       className="block p-3 bg-gray-700/30 border border-gray-600/50 rounded-lg hover:bg-gray-600/40 hover:border-cyan-500/50 transition-all group"
                     >
                       {/* Compact header */}
                       <div className="flex items-center justify-between mb-2">
                         <div className="flex items-center gap-2">
                           <div className="bg-cyan-500/20 px-2 py-0.5 rounded text-xs text-cyan-300 font-bold">
                             {game.gameMode}
                           </div>
                           {game.mapName && (
                             <div className="text-xs text-purple-300 font-medium truncate max-w-20" title={game.mapName}>
                               {game.mapName}
                             </div>
                           )}
                         </div>
                         <div className="text-xs text-gray-400 font-medium">
                           {formatDate(game.gameDate)}
                         </div>
                       </div>
                       
                       {/* Optimized player display - All 5 players with flexible width */}
                       {game.players && game.players.length > 0 && (
                         <div className="space-y-1.5">
                           {/* Defense team - flexible grid layout */}
                           <div className="flex items-start gap-1">
                             <div className="text-blue-400 text-xs font-bold min-w-8 mt-0.5">🔵</div>
                             <div className="grid grid-cols-5 gap-1 flex-1 min-w-0">
                               {game.players
                                 .filter((player: any) => player.side === 'defense')
                                 .slice(0, 5)
                                 .map((player: any, pIndex: number) => {
                                   // Smart truncation based on name length distribution
                                   const playerName = player.player_name || player.name || 'Unknown';
                                   const maxLength = playerName.length > 12 ? 10 : playerName.length > 8 ? 12 : playerName.length;
                                   const displayName = playerName.length > maxLength ? playerName.substring(0, maxLength) + '...' : playerName;
                                   
                                   return (
                                     <span 
                                       key={pIndex}
                                       className="text-xs px-1.5 py-0.5 rounded-md font-medium text-center min-w-0 truncate"
                                       style={{
                                         color: getClassColor(player.main_class),
                                         backgroundColor: `${getClassColor(player.main_class)}15`,
                                         borderLeft: `2px solid ${getClassColor(player.main_class)}`
                                       }}
                                       title={`${playerName} (${player.main_class})`}
                                     >
                                       {displayName}
                                     </span>
                                   );
                                 })}
                               {/* Fill empty slots if less than 5 players */}
                               {Array.from({ length: Math.max(0, 5 - game.players.filter((player: any) => player.side === 'defense').length) }, (_, i) => (
                                 <div key={`empty-def-${i}`} className="text-xs py-0.5 opacity-30">
                                   <span className="text-gray-500">—</span>
                                 </div>
                               ))}
                             </div>
                           </div>
                           
                           {/* Offense team - flexible grid layout */}
                           <div className="flex items-start gap-1">
                             <div className="text-red-400 text-xs font-bold min-w-8 mt-0.5">🔴</div>
                             <div className="grid grid-cols-5 gap-1 flex-1 min-w-0">
                               {game.players
                                 .filter((player: any) => player.side === 'offense')
                                 .slice(0, 5)
                                 .map((player: any, pIndex: number) => {
                                   // Smart truncation based on name length distribution
                                   const playerName = player.player_name || player.name || 'Unknown';
                                   const maxLength = playerName.length > 12 ? 10 : playerName.length > 8 ? 12 : playerName.length;
                                   const displayName = playerName.length > maxLength ? playerName.substring(0, maxLength) + '...' : playerName;
                                   
                                   return (
                                     <span 
                                       key={pIndex + 100}
                                       className="text-xs px-1.5 py-0.5 rounded-md font-medium text-center min-w-0 truncate"
                                       style={{
                                         color: getClassColor(player.main_class),
                                         backgroundColor: `${getClassColor(player.main_class)}15`,
                                         borderLeft: `2px solid ${getClassColor(player.main_class)}`
                                       }}
                                       title={`${playerName} (${player.main_class})`}
                                     >
                                       {displayName}
                                     </span>
                                   );
                                 })}
                               {/* Fill empty slots if less than 5 players */}
                               {Array.from({ length: Math.max(0, 5 - game.players.filter((player: any) => player.side === 'offense').length) }, (_, i) => (
                                 <div key={`empty-off-${i}`} className="text-xs py-0.5 opacity-30">
                                   <span className="text-gray-500">—</span>
                                 </div>
                               ))}
                             </div>
                           </div>
                         </div>
                       )}
                     </Link>
                   ))}
                 </div>
              )}
            </div>
          </motion.div>
        </div>

        {/* Main Content Area - Statistics with Tabs - Now with full available width */}
        <div className="flex-1 p-3 lg:p-6 lg:pr-20">
          {/* Tab Navigation - Mobile Responsive */}
          <div className="flex items-center gap-1 mb-6 overflow-x-auto">
            <button
              onClick={() => setActiveTab('OvD')}
              className={`px-3 py-2 lg:px-6 lg:py-3 rounded-lg font-semibold transition-all duration-200 text-sm lg:text-base whitespace-nowrap ${
                activeTab === 'OvD'
                  ? 'bg-gradient-to-r from-red-500 to-orange-500 text-white shadow-lg'
                  : 'bg-white/10 text-blue-200 hover:bg-white/20'
              }`}
            >
              <span className="hidden sm:inline">⚔️ OvD Statistics</span>
              <span className="sm:hidden">⚔️ OvD</span>
            </button>
            <button
              onClick={() => setActiveTab('Mix')}
              className={`px-3 py-2 lg:px-6 lg:py-3 rounded-lg font-semibold transition-all duration-200 text-sm lg:text-base whitespace-nowrap ${
                activeTab === 'Mix'
                  ? 'bg-gradient-to-r from-purple-500 to-pink-500 text-white shadow-lg'
                  : 'bg-white/10 text-blue-200 hover:bg-white/20'
              }`}
            >
              <span className="hidden sm:inline">🏆 Mix Statistics</span>
              <span className="sm:hidden">🏆 Mix</span>
            </button>
          </div>

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

          {/* Statistics Table - Full Width */}
          {!loading && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="w-full"
            >
              {activeTab === 'OvD' && ovdStats.length > 0 && renderStatsTable(ovdStats, 'OvD', ovdPagination)}
              {activeTab === 'Mix' && mixStats.length > 0 && renderStatsTable(mixStats, 'Mix', mixPagination)}
            </motion.div>
          )}

          {/* No Results */}
          {!loading && 
            ((activeTab === 'OvD' && ovdStats.length === 0) || 
             (activeTab === 'Mix' && mixStats.length === 0)) && 
            !error && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="text-center py-12"
            >
              <p className="text-xl text-blue-200 mb-4">No {activeTab} statistics found</p>
              <p className="text-blue-300">Try adjusting your filters or search criteria</p>
            </motion.div>
          )}
        </div>


      </div>
    </div>
  );
} 