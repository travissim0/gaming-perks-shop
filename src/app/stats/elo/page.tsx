'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import Link from 'next/link';
import { useAuth } from '@/lib/AuthContext';
import Navbar from '@/components/Navbar';
import { ChevronDown, ChevronRight } from 'lucide-react';

interface EloPlayer {
  player_name: string;
  player_name_normalized: string;
  profile_id: string;
  all_aliases: string;
  game_mode: string;
  elo_rating: string;
  weighted_elo: string;
  elo_peak: string;
  elo_confidence: string;
  total_games: number;
  total_wins: number;
  total_losses: number;
  win_rate: string;
  kill_death_ratio: string;
  last_game_date: string;
  elo_rank?: number;
  overall_elo_rank?: number;
  display_rank: number;
  elo_tier: {
    name: string;
    color: string;
    min: number;
    max: number;
  };
}

interface EloLeaderboardResponse {
  data: EloPlayer[];
  pagination: {
    total: number;
    limit: number;
    offset: number;
    hasMore: boolean;
  };
  filters: {
    gameMode: string;
    sortBy: string;
    sortOrder: string;
    minGames: number;
    playerName: string;
    availableGameModes: string[];
  };
}

const SORT_OPTIONS = [
  { value: 'weighted_elo', label: 'ELO Rating (Weighted)' },
  { value: 'elo_rating', label: 'Raw ELO' },
  { value: 'elo_peak', label: 'Peak ELO' },
  { value: 'elo_confidence', label: 'Rating Confidence' },
  { value: 'total_games', label: 'Games Played' },
  { value: 'win_rate', label: 'Win Rate' },
  { value: 'kill_death_ratio', label: 'K/D Ratio' },
  { value: 'last_game_date', label: 'Last Active' }
];

const MIN_GAMES_OPTIONS = [
  { value: 0, label: 'All Players' },
  { value: 3, label: '3+ Games' },
  { value: 5, label: '5+ Games' },
  { value: 10, label: '10+ Games' },
  { value: 20, label: '20+ Games' }
];

export default function EloLeaderboardPage() {
  const { user } = useAuth();
  const [players, setPlayers] = useState<EloPlayer[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [gameMode, setGameMode] = useState('Combined');
  const [availableGameModes, setAvailableGameModes] = useState<string[]>([]);
  const [sortBy, setSortBy] = useState('weighted_elo');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [minGames, setMinGames] = useState(3);
  const [playerName, setPlayerName] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const [currentRequestGameMode, setCurrentRequestGameMode] = useState('Combined');
  const [pagination, setPagination] = useState({
    total: 0,
    offset: 0,
    limit: 50,
    hasMore: false
  });

  const fetchEloLeaderboard = async (offset = 0, abortController?: AbortController) => {
    try {
      // Track which game mode this request is for
      const requestGameMode = gameMode;
      
      // Use different loading states for initial load vs load more
      if (offset === 0) {
        setLoading(true);
        setCurrentRequestGameMode(requestGameMode);
        // Clear existing data immediately when starting a fresh load (tab switch)
        setPlayers([]);
        setExpandedRows(new Set());
      } else {
        setLoadingMore(true);
      }
      setError(null);

      const params = new URLSearchParams({
        gameMode: requestGameMode,
        sortBy,
        sortOrder,
        minGames: minGames.toString(),
        playerName,
        limit: pagination.limit.toString(),
        offset: offset.toString()
      });

      const response = await fetch(`/api/player-stats/elo-leaderboard?${params}`, {
        signal: abortController?.signal
      });
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data: EloLeaderboardResponse = await response.json();
      
      // Check if request was aborted or if the game mode has changed since this request started
      if (abortController?.signal.aborted || requestGameMode !== gameMode) {
        return;
      }
      
      // If offset is 0, replace the data (refresh/filter change)
      // If offset > 0, append the data (load more)
      if (offset === 0) {
        setPlayers(data.data);
        setLoading(false);
      } else {
        setPlayers(prevPlayers => [...prevPlayers, ...data.data]);
        // Short delay to ensure smooth transition from skeleton to real data
        setTimeout(() => {
          setLoadingMore(false);
        }, 300);
      }
      
      setPagination(data.pagination);
      setAvailableGameModes(data.filters.availableGameModes || []);

      // Auto-expand rows when searching for aliases (not main names)
      if (offset === 0 && playerName && playerName.trim()) {
        const searchTerm = playerName.trim().toLowerCase();
        const newExpandedRows = new Set<string>();
        
        data.data.forEach(player => {
          const playerNameLower = player.player_name.toLowerCase();
          const hasAliases = player.all_aliases && player.all_aliases !== player.player_name;
          
          if (hasAliases && !playerNameLower.includes(searchTerm) && 
              player.all_aliases.toLowerCase().includes(searchTerm)) {
            newExpandedRows.add(`${player.player_name_normalized}-${player.game_mode}`);
          }
        });
        
        setExpandedRows(newExpandedRows);
      } else if (offset === 0) {
        setExpandedRows(new Set());
      }
    } catch (err) {
      // Don't show error if request was aborted (normal behavior when switching tabs)
      if (abortController?.signal.aborted) {
        return;
      }
      setError(err instanceof Error ? err.message : 'An error occurred');
      setLoading(false);
      setLoadingMore(false);
    }
  };

  useEffect(() => {
    const abortController = new AbortController();
    
    // Reset pagination when filters change
    setPagination(prev => ({
      ...prev,
      offset: 0,
      hasMore: false
    }));
    
    fetchEloLeaderboard(0, abortController);
    
    // Cleanup: abort any in-flight request when dependencies change
    return () => {
      abortController.abort();
    };
  }, [gameMode, sortBy, sortOrder, minGames, playerName]);

  const handleSearch = () => {
    setPlayerName(searchInput);
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSearch();
    }
  };

  const loadMore = () => {
    if (pagination.hasMore && !loading && !loadingMore) {
      fetchEloLeaderboard(pagination.offset + pagination.limit);
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString();
  };

  const getConfidenceColor = (confidence: string) => {
    const conf = parseFloat(confidence);
    if (conf >= 0.8) return 'text-green-400';
    if (conf >= 0.5) return 'text-yellow-400';
    return 'text-red-400';
  };

  const getConfidenceLabel = (confidence: string) => {
    const conf = parseFloat(confidence);
    if (conf >= 0.8) return 'High';
    if (conf >= 0.5) return 'Medium';
    return 'Low';
  };

  const toggleRowExpansion = (playerId: string) => {
    setExpandedRows(prev => {
      const newSet = new Set(prev);
      if (newSet.has(playerId)) {
        newSet.delete(playerId);
      } else {
        newSet.add(playerId);
      }
      return newSet;
    });
  };

  const isRowExpanded = (playerId: string) => {
    return expandedRows.has(playerId);
  };

  if (loading && players.length === 0) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-900 via-blue-900 to-indigo-900 text-white">
        <Navbar user={user} />
        <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-cyan-400 mx-auto mb-4"></div>
          <p className="text-xl">Loading ELO leaderboard...</p>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-900 via-blue-900 to-indigo-900 text-white">
        <Navbar user={user} />
        <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-4 text-red-400">Error Loading ELO Leaderboard</h1>
          <p className="text-blue-200 mb-4">{error}</p>
          <button 
            onClick={() => fetchEloLeaderboard(0)}
            className="bg-blue-600 hover:bg-blue-700 px-6 py-2 rounded"
          >
            Retry
          </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-900 via-blue-900 to-indigo-900 text-white">
      <Navbar user={user} />
      
      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-8"
        >
          <h1 className="text-4xl font-bold bg-gradient-to-r from-cyan-400 to-purple-400 bg-clip-text text-transparent mb-2">
            ELO Leaderboard
          </h1>
          <p className="text-xl text-blue-200">Competitive rankings based on skill and performance</p>
        </motion.div>

        {/* Filters */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white/10 backdrop-blur-lg rounded-xl p-6 mb-8 border border-white/20"
        >
          {/* Game Mode Buttons Row */}
          <div className="flex flex-col sm:flex-row justify-center gap-4 mb-6">
            <button
              className={`flex-1 px-6 py-3 rounded-lg text-lg font-bold transition-all duration-200 shadow border-2 max-w-xs ${gameMode === 'Combined' ? 'bg-cyan-600 border-cyan-400 text-white scale-105' : 'bg-white/10 border-cyan-700 text-cyan-200 hover:bg-cyan-700/30 hover:text-white'}`}
              onClick={() => setGameMode('Combined')}
            >
              Combined<br /><span className="text-xs font-normal">OvD + Mix</span>
            </button>
            <button
              className={`flex-1 px-6 py-3 rounded-lg text-lg font-bold transition-all duration-200 shadow border-2 max-w-xs ${gameMode === 'OvD' ? 'bg-blue-600 border-blue-400 text-white scale-105' : 'bg-white/10 border-blue-700 text-blue-200 hover:bg-blue-700/30 hover:text-white'}`}
              onClick={() => setGameMode('OvD')}
            >
              OvD<br /><span className="text-xs font-normal">Offense vs Defense</span>
            </button>
            <button
              className={`flex-1 px-6 py-3 rounded-lg text-lg font-bold transition-all duration-200 shadow border-2 max-w-xs ${gameMode === 'Mix' ? 'bg-purple-600 border-purple-400 text-white scale-105' : 'bg-white/10 border-purple-700 text-purple-200 hover:bg-purple-700/30 hover:text-white'}`}
              onClick={() => setGameMode('Mix')}
            >
              Mix<br /><span className="text-xs font-normal">10v10</span>
            </button>
          </div>

          {/* Filters Grid */}
          <div className="flex justify-center w-full">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 gap-x-6 mb-4 w-full max-w-2xl min-w-0">
              {/* Sort By */}
              <div className="lg:col-span-2">
                <label className="block text-sm font-medium text-blue-200 mb-2">Sort By</label>
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value)}
                  className="w-full min-w-[200px] max-w-xs bg-white/20 border border-white/30 rounded-lg px-3 py-2 text-white [&>option]:bg-gray-800 [&>option]:text-white"
                >
                  {SORT_OPTIONS.map(option => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* Sort Order */}
              <div>
                <label className="block text-sm font-medium text-blue-200 mb-2">Order</label>
                <select
                  value={sortOrder}
                  onChange={(e) => setSortOrder(e.target.value as 'asc' | 'desc')}
                  className="w-full bg-white/20 border border-white/30 rounded-lg px-3 py-2 text-white [&>option]:bg-gray-800 [&>option]:text-white"
                >
                  <option value="desc">Highest First</option>
                  <option value="asc">Lowest First</option>
                </select>
              </div>

              {/* Minimum Games */}
              <div>
                <label className="block text-sm font-medium text-blue-200 mb-2">Min Games</label>
                <select
                  value={minGames}
                  onChange={(e) => setMinGames(parseInt(e.target.value))}
                  className="w-full bg-white/20 border border-white/30 rounded-lg px-3 py-2 text-white [&>option]:bg-gray-800 [&>option]:text-white"
                >
                  {MIN_GAMES_OPTIONS.map(option => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* Player Search */}
              <div>
                <label className="block text-sm font-medium text-blue-200 mb-2">Search Player</label>
                <div className="flex">
                  <input
                    type="text"
                    value={searchInput}
                    onChange={(e) => setSearchInput(e.target.value)}
                    onKeyPress={handleKeyPress}
                    placeholder="Player name..."
                    className="flex-1 bg-white/20 border border-white/30 rounded-l-lg px-3 py-2 h-[42px] text-white placeholder-white/50"
                  />
                  <button
                    onClick={handleSearch}
                    className="bg-cyan-600 hover:bg-cyan-700 px-4 py-2 h-[42px] transition-colors"
                  >
                    🔍
                  </button>
                  {playerName && (
                    <button
                      onClick={() => { setSearchInput(''); setPlayerName(''); }}
                      className="bg-red-600 hover:bg-red-700 px-3 py-2 h-[42px] rounded-r-lg transition-colors text-white ml-1"
                      title="Clear search"
                    >
                      ❌
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Results Summary */}
          <div className="text-sm text-blue-200 text-center mt-2">
            Showing {players.length} of {pagination.total} players
            {minGames > 0 && ` with ${minGames}+ games`}
            {playerName && ` matching "${playerName}"`}
          </div>
        </motion.div>

        {/* ELO Leaderboard Table */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white/10 backdrop-blur-lg rounded-xl overflow-hidden border border-white/20"
        >
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-white/20">
                <tr>
                  {(!playerName || playerName.trim() === '') && (
                    <th className="px-4 py-3 text-left text-xs font-semibold text-blue-200">Rank</th>
                  )}
                  <th className="px-4 py-3 text-left text-xs font-semibold text-blue-200">Player</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-blue-200">Tier</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-blue-200">ELO</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-blue-200">Peak</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-blue-200">Confidence</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-blue-200">Games</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-blue-200">Win Rate</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-blue-200">K/D</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-blue-200">Last Active</th>
                  <th className="px-4 py-3 text-center text-xs font-semibold text-blue-200">Actions</th>
                </tr>
              </thead>
              <tbody>
                {players.map((player, index) => (
                  <motion.tr
                    key={`${gameMode}-${player.player_name_normalized}-${player.game_mode}-${index}`}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.3 }}
                    className="border-b border-white/10 hover:bg-white/5 transition-colors"
                  >
                    {(!playerName || playerName.trim() === '') && (
                      <td className="px-4 py-3">
                        <div className="flex items-center">
                          <span className="text-lg font-bold text-cyan-400">
                            #{player.display_rank}
                          </span>
                        </div>
                      </td>
                    )}
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        {player.all_aliases && player.all_aliases !== player.player_name && (
                          <button
                            onClick={() => toggleRowExpansion(`${player.player_name_normalized}-${player.game_mode}`)}
                            className="text-blue-400 hover:text-blue-300 transition-colors"
                          >
                            {isRowExpanded(`${player.player_name_normalized}-${player.game_mode}`) ? 
                              <ChevronDown size={16} /> : <ChevronRight size={16} />}
                          </button>
                        )}
                        <div>
                          <Link 
                            href={`/stats/player/${encodeURIComponent(player.player_name)}`}
                            className="text-white hover:text-cyan-400 transition-colors font-medium"
                          >
                            {player.player_name}
                          </Link>
                          {player.game_mode !== 'Combined' && (
                            <div className="text-xs text-blue-300">{player.game_mode}</div>
                          )}
                          {isRowExpanded(`${player.player_name_normalized}-${player.game_mode}`) && player.all_aliases && (
                            <div className="text-xs text-gray-400 mt-1">
                              <strong>Aliases:</strong> {player.all_aliases}
                            </div>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center">
                        <div 
                          className="w-3 h-3 rounded-full mr-2"
                          style={{ backgroundColor: player.elo_tier.color }}
                        ></div>
                        <span className="text-sm font-medium" style={{ color: player.elo_tier.color }}>
                          {player.elo_tier.name}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="font-bold text-lg">{player.weighted_elo}</div>
                      {player.elo_rating !== player.weighted_elo && (
                        <div className="text-xs text-blue-300">Raw: {player.elo_rating}</div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right text-yellow-400 font-medium">
                      {player.elo_peak}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className={getConfidenceColor(player.elo_confidence)}>
                        {getConfidenceLabel(player.elo_confidence)}
                      </span>
                      <div className="text-xs text-blue-300">
                        {(parseFloat(player.elo_confidence) * 100).toFixed(0)}%
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div>{player.total_games}</div>
                      <div className="text-xs text-green-400">
                        {player.total_wins}W-{player.total_losses}L
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right">
                      {(parseFloat(player.win_rate) * 100).toFixed(1)}%
                    </td>
                    <td className="px-4 py-3 text-right">
                      {parseFloat(player.kill_death_ratio).toFixed(2)}
                    </td>
                    <td className="px-4 py-3 text-right text-xs">
                      {formatDate(player.last_game_date)}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <Link
                        href={`/stats/player/${encodeURIComponent(player.player_name)}`}
                        className="bg-blue-600 hover:bg-blue-700 px-3 py-1 rounded text-xs transition-colors"
                      >
                        📊 Profile
                      </Link>
                    </td>
                  </motion.tr>
                ))}
                
                {/* Loading skeleton rows when loading more data */}
                {loadingMore && Array.from({ length: 5 }).map((_, index) => (
                  <tr
                    key={`loading-${index}`}
                    className="border-b border-white/10 animate-pulse"
                  >
                    <td className="px-4 py-3">
                      <div className="h-4 bg-white/20 rounded w-8"></div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="h-4 bg-white/20 rounded w-24 mb-1"></div>
                      <div className="h-3 bg-white/10 rounded w-12"></div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center">
                        <div className="w-3 h-3 bg-white/20 rounded-full mr-2"></div>
                        <div className="h-4 bg-white/20 rounded w-16"></div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="h-4 bg-white/20 rounded w-12 ml-auto mb-1"></div>
                      <div className="h-3 bg-white/10 rounded w-8 ml-auto"></div>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="h-4 bg-white/20 rounded w-12 ml-auto"></div>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="h-4 bg-white/20 rounded w-8 ml-auto mb-1"></div>
                      <div className="h-3 bg-white/10 rounded w-6 ml-auto"></div>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="h-4 bg-white/20 rounded w-6 ml-auto mb-1"></div>
                      <div className="h-3 bg-white/10 rounded w-12 ml-auto"></div>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="h-4 bg-white/20 rounded w-8 ml-auto"></div>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="h-4 bg-white/20 rounded w-6 ml-auto"></div>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="h-3 bg-white/20 rounded w-16 ml-auto"></div>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <div className="h-6 bg-white/20 rounded w-16 mx-auto"></div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Load More Button */}
          {pagination.hasMore && (
            <div className="p-4 text-center border-t border-white/20">
              <button
                onClick={loadMore}
                disabled={loadingMore}
                className="bg-cyan-600 hover:bg-cyan-700 disabled:bg-gray-600 px-6 py-2 rounded transition-colors"
              >
                {loadingMore ? 'Loading...' : 'Load More'}
              </button>
            </div>
          )}
        </motion.div>

        {/* ELO System Info */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mt-8 bg-white/10 backdrop-blur-lg rounded-xl p-6 border border-white/20"
        >
          <h3 className="text-xl font-bold text-cyan-400 mb-4">About ELO Rankings</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <h4 className="font-semibold text-blue-200 mb-2">How ELO Works</h4>
              <ul className="text-sm text-blue-200 space-y-1">
                <li>• Based on wins/losses against opponents of similar skill</li>
                <li>• New players start at 1200 ELO</li>
                <li>• Rating changes are larger for new players (low confidence)</li>
                <li>• Weighted ELO considers rating confidence for fair rankings</li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold text-blue-200 mb-2">Tier System</h4>
              <div className="grid grid-cols-3 gap-2 text-xs">
                <div className="flex items-center"><div className="w-2 h-2 rounded-full bg-gray-500 mr-1"></div>Unranked (0-999)</div>
                <div className="flex items-center"><div className="w-2 h-2 rounded-full mr-1" style={{backgroundColor: '#CD7F32'}}></div>Bronze (1000-1199)</div>
                <div className="flex items-center"><div className="w-2 h-2 rounded-full mr-1" style={{backgroundColor: '#C0C0C0'}}></div>Silver (1200-1399)</div>
                <div className="flex items-center"><div className="w-2 h-2 rounded-full mr-1" style={{backgroundColor: '#FFD700'}}></div>Gold (1400-1599)</div>
                <div className="flex items-center"><div className="w-2 h-2 rounded-full mr-1" style={{backgroundColor: '#E5E4E2'}}></div>Platinum (1600-1799)</div>
                <div className="flex items-center"><div className="w-2 h-2 rounded-full mr-1" style={{backgroundColor: '#B9F2FF'}}></div>Diamond (1800-1999)</div>
                <div className="flex items-center"><div className="w-2 h-2 rounded-full mr-1" style={{backgroundColor: '#FF6B6B'}}></div>Master (2000-2199)</div>
                <div className="flex items-center"><div className="w-2 h-2 rounded-full mr-1" style={{backgroundColor: '#9B59B6'}}></div>Grandmaster (2200-2399)</div>
                <div className="flex items-center"><div className="w-2 h-2 rounded-full mr-1" style={{backgroundColor: '#F39C12'}}></div>Legend (2400-2800)</div>
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  );
} 