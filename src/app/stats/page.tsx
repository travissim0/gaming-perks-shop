'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import Link from 'next/link';
import { useAuth } from '@/lib/AuthContext';
import Navbar from '@/components/Navbar';
import { getClassColor } from '@/utils/classColors';
import { ChevronDown, ChevronRight } from 'lucide-react';

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

  // Sidebar state for filters (now on the right)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

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
        setRecentGames(data.data || []);
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
        <table className="w-full text-sm">
          <thead className="bg-white/20">
            <tr>
              {visibleColumns.player && <th className="px-3 py-3 text-left text-sm font-semibold text-blue-200 w-32">Player</th>}
              {visibleColumns.games && <th className="px-3 py-3 text-right text-sm font-semibold text-blue-200 w-16">Games</th>}
              {visibleColumns.winRate && <th className="px-3 py-3 text-right text-sm font-semibold text-blue-200">Win%</th>}
              {visibleColumns.kills && <th className="px-3 py-3 text-right text-sm font-semibold text-blue-200">Kills</th>}
              {visibleColumns.deaths && <th className="px-3 py-3 text-right text-sm font-semibold text-blue-200">Deaths</th>}
              {visibleColumns.kd && <th className="px-3 py-3 text-right text-sm font-semibold text-blue-200">K/D</th>}
              {visibleColumns.captures && <th className="px-3 py-3 text-right text-sm font-semibold text-blue-200">Caps</th>}
              {visibleColumns.ebHits && <th className="px-3 py-3 text-right text-sm font-semibold text-blue-200">EB</th>}
              {visibleColumns.turretDamage && <th className="px-3 py-3 text-right text-sm font-semibold text-blue-200">Turret</th>}
              {visibleColumns.carryTime && <th className="px-3 py-3 text-right text-sm font-semibold text-blue-200">Carry</th>}
              {visibleColumns.accuracy && <th className="px-3 py-3 text-right text-sm font-semibold text-blue-200">Acc%</th>}
              {visibleColumns.classSwaps && <th className="px-3 py-3 text-right text-sm font-semibold text-blue-200">Swaps</th>}
              {visibleColumns.lastActive && <th className="px-3 py-3 text-right text-sm font-semibold text-blue-200">Last</th>}
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
                  <td className="px-3 py-3 w-32">
                    <Link
                      href={`/stats/player/${encodeURIComponent(player.player_name)}`}
                      className="hover:text-cyan-400 transition-colors font-medium text-sm truncate block"
                      title={player.player_name}
                      style={{ color: getClassColor(player.most_played_class || 'Infantry') }}
                    >
                      {player.player_name}
                    </Link>
                  </td>
                )}
                {visibleColumns.games && <td className="px-3 py-3 text-right text-sm text-white w-16">{player.total_games}</td>}
                {visibleColumns.winRate && <td className="px-3 py-3 text-right text-sm text-white">{formatPercentage(player.win_rate)}</td>}
                {visibleColumns.kills && <td className="px-3 py-3 text-right text-sm text-white">{player.total_kills}</td>}
                {visibleColumns.deaths && <td className="px-3 py-3 text-right text-sm text-white">{player.total_deaths}</td>}
                {visibleColumns.kd && <td className="px-3 py-3 text-right text-sm text-white">{formatNumber(player.kill_death_ratio, 2)}</td>}
                {visibleColumns.captures && <td className="px-3 py-3 text-right text-sm text-white">{player.total_captures}</td>}
                {visibleColumns.ebHits && <td className="px-3 py-3 text-right text-sm text-white">{player.total_eb_hits}</td>}
                {visibleColumns.turretDamage && <td className="px-3 py-3 text-right text-sm text-white">{formatNumber(player.total_turret_damage, 0)}</td>}
                {visibleColumns.carryTime && <td className="px-3 py-3 text-right text-sm text-white">{formatCarryTime(player.total_carry_time_seconds)}</td>}
                {visibleColumns.accuracy && <td className="px-3 py-3 text-right text-sm text-white">{formatPercentage(player.avg_accuracy)}</td>}
                {visibleColumns.classSwaps && <td className="px-3 py-3 text-right text-sm text-white">{player.total_class_swaps}</td>}
                {visibleColumns.lastActive && (
                  <td className="px-3 py-3 text-right text-sm text-blue-200">
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
      
      <div className="flex">
        {/* Recent Games - Left Side */}
        <div className="w-80 p-6 border-r border-gray-700">
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
                       
                       {/* Improved player display */}
                       {game.playerDetails && game.playerDetails.length > 0 && (
                         <div className="space-y-1.5">
                           {/* Defense team - more compact */}
                           <div className="flex items-center gap-1">
                             <div className="text-blue-400 text-xs font-bold min-w-8">🔵</div>
                             <div className="flex flex-wrap gap-1 flex-1">
                               {game.playerDetails
                                 .filter((player: any) => player.side === 'defense')
                                 .slice(0, 4)
                                 .map((player: any, pIndex: number) => (
                                   <span 
                                     key={pIndex}
                                     className="text-xs px-1.5 py-0.5 rounded-md font-medium"
                                     style={{
                                       color: getClassColor(player.main_class),
                                       backgroundColor: `${getClassColor(player.main_class)}15`,
                                       borderLeft: `2px solid ${getClassColor(player.main_class)}`
                                     }}
                                     title={`${player.name} (${player.main_class})`}
                                   >
                                     {player.name.length > 8 ? player.name.substring(0, 8) + '...' : player.name}
                                   </span>
                                 ))}
                             </div>
                           </div>
                           
                           {/* Offense team - more compact */}
                           <div className="flex items-center gap-1">
                             <div className="text-red-400 text-xs font-bold min-w-8">🔴</div>
                             <div className="flex flex-wrap gap-1 flex-1">
                               {game.playerDetails
                                 .filter((player: any) => player.side === 'offense')
                                 .slice(0, 4)
                                 .map((player: any, pIndex: number) => (
                                   <span 
                                     key={pIndex + 100}
                                     className="text-xs px-1.5 py-0.5 rounded-md font-medium"
                                     style={{
                                       color: getClassColor(player.main_class),
                                       backgroundColor: `${getClassColor(player.main_class)}15`,
                                       borderLeft: `2px solid ${getClassColor(player.main_class)}`
                                     }}
                                     title={`${player.name} (${player.main_class})`}
                                   >
                                     {player.name.length > 8 ? player.name.substring(0, 8) + '...' : player.name}
                                   </span>
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

        {/* Main Content Area - Statistics with Tabs */}
        <div className="flex-1 p-6">
          {/* Tab Navigation */}
          <div className="flex items-center gap-1 mb-6">
            <button
              onClick={() => setActiveTab('OvD')}
              className={`px-6 py-3 rounded-lg font-semibold transition-all duration-200 ${
                activeTab === 'OvD'
                  ? 'bg-gradient-to-r from-red-500 to-orange-500 text-white shadow-lg'
                  : 'bg-white/10 text-blue-200 hover:bg-white/20'
              }`}
            >
              ⚔️ OvD Statistics
            </button>
            <button
              onClick={() => setActiveTab('Mix')}
              className={`px-6 py-3 rounded-lg font-semibold transition-all duration-200 ${
                activeTab === 'Mix'
                  ? 'bg-gradient-to-r from-purple-500 to-pink-500 text-white shadow-lg'
                  : 'bg-white/10 text-blue-200 hover:bg-white/20'
              }`}
            >
              🏆 Mix Statistics
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

        {/* Right Sidebar - Filters */}
        <div className={`${sidebarCollapsed ? 'w-12' : 'w-80'} transition-all duration-300 bg-gray-800/50 border-l border-gray-700 min-h-screen`}>
          {/* Collapse Toggle */}
          <div className="p-4 border-b border-gray-700">
            <button
              onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
              className="flex items-center gap-2 text-gray-400 hover:text-white transition-colors"
            >
              {sidebarCollapsed ? <ChevronRight size={20} /> : <ChevronDown size={20} />}
              {!sidebarCollapsed && <span className="font-medium">Filters & Quick Access</span>}
            </button>
          </div>

          {!sidebarCollapsed && (
            <div className="p-4 space-y-6">
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

                {/* Column Selector */}
                <div className="relative">
                  <button
                    onClick={() => setShowColumnSelector(!showColumnSelector)}
                    className="w-full bg-purple-600 hover:bg-purple-700 px-2 py-1 rounded text-xs font-semibold transition-colors"
                  >
                    Columns
                  </button>
                  {showColumnSelector && (
                    <div className="absolute top-full left-0 mt-1 bg-gray-800 border border-gray-600 rounded p-2 z-50 w-full shadow-xl">
                      {/* Quick Actions */}
                      <div className="flex gap-1 mb-2 pb-2 border-b border-gray-600">
                        <button
                          onClick={() => setVisibleColumns(prev => Object.keys(prev).reduce((acc, key) => ({ ...acc, [key]: true }), {} as typeof visibleColumns))}
                          className="flex-1 bg-green-600 hover:bg-green-700 px-2 py-1 rounded text-xs font-semibold transition-colors"
                        >
                          All
                        </button>
                        <button
                          onClick={() => setVisibleColumns(prev => Object.keys(prev).reduce((acc, key) => ({ ...acc, [key]: ['player', 'games', 'kills', 'kd'].includes(key) }), {} as typeof visibleColumns))}
                          className="flex-1 bg-blue-600 hover:bg-blue-700 px-2 py-1 rounded text-xs font-semibold transition-colors"
                        >
                          Basic
                        </button>
                      </div>
                      <div className="space-y-1">
                        {Object.entries(visibleColumns).map(([key, visible]) => (
                          <label key={key} className="flex items-center gap-2 text-xs cursor-pointer hover:text-cyan-400">
                            <input
                              type="checkbox"
                              checked={visible}
                              onChange={(e) => setVisibleColumns(prev => ({ ...prev, [key]: e.target.checked }))}
                              className="w-3 h-3 text-cyan-500 bg-gray-700 border-gray-600 rounded"
                            />
                            <span>{key.charAt(0).toUpperCase() + key.slice(1).replace(/([A-Z])/g, ' $1')}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                  )}
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
                  }}
                  className="w-full p-2 bg-purple-900/30 border border-purple-500/30 rounded hover:bg-purple-800/40 transition-colors text-xs"
                >
                  <div className="text-purple-300 font-bold">🎮 Most Active</div>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
} 