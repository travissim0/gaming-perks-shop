'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import Link from 'next/link';
import { useAuth } from '@/lib/AuthContext';
import Navbar from '@/components/Navbar';

interface EloPlayer {
  player_name: string;
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
  elo_rank: number;
  overall_elo_rank: number;
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
  const [error, setError] = useState<string | null>(null);
  const [gameMode, setGameMode] = useState('all');
  const [sortBy, setSortBy] = useState('weighted_elo');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [minGames, setMinGames] = useState(3);
  const [playerName, setPlayerName] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [pagination, setPagination] = useState({
    total: 0,
    offset: 0,
    limit: 50,
    hasMore: false
  });

  const fetchEloLeaderboard = async (offset = 0) => {
    try {
      setLoading(true);
      setError(null);

      const params = new URLSearchParams({
        gameMode,
        sortBy,
        sortOrder,
        minGames: minGames.toString(),
        playerName,
        limit: pagination.limit.toString(),
        offset: offset.toString()
      });

      const response = await fetch(`/api/player-stats/elo-leaderboard?${params}`);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data: EloLeaderboardResponse = await response.json();
      setPlayers(data.data);
      setPagination(data.pagination);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchEloLeaderboard(0);
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
    if (pagination.hasMore && !loading) {
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
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 mb-4">
            {/* Game Mode Filter */}
            <div>
              <label className="block text-sm font-medium text-blue-200 mb-2">Game Mode</label>
              <select
                value={gameMode}
                onChange={(e) => setGameMode(e.target.value)}
                className="w-full bg-white/20 border border-white/30 rounded-lg px-3 py-2 text-white [&>option]:bg-gray-800 [&>option]:text-white"
              >
                <option value="all">All Modes</option>
                <option value="OvD">Offense vs Defense</option>
                <option value="Mix">Mixed Mode</option>
              </select>
            </div>

            {/* Sort By */}
            <div>
              <label className="block text-sm font-medium text-blue-200 mb-2">Sort By</label>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
                className="w-full bg-white/20 border border-white/30 rounded-lg px-3 py-2 text-white [&>option]:bg-gray-800 [&>option]:text-white"
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
                  className="flex-1 bg-white/20 border border-white/30 rounded-l-lg px-3 py-2 text-white placeholder-white/50"
                />
                <button
                  onClick={handleSearch}
                  className="bg-cyan-600 hover:bg-cyan-700 px-4 py-2 rounded-r-lg transition-colors"
                >
                  🔍
                </button>
              </div>
            </div>
          </div>

          {/* Results Summary */}
          <div className="text-sm text-blue-200">
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
                  <th className="px-4 py-3 text-left text-xs font-semibold text-blue-200">Rank</th>
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
                    key={`${player.player_name}-${player.game_mode}`}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: index * 0.05 }}
                    className="border-b border-white/10 hover:bg-white/5 transition-colors"
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center">
                        <span className="text-lg font-bold text-cyan-400">
                          #{player.display_rank}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <Link 
                        href={`/stats/player/${encodeURIComponent(player.player_name)}`}
                        className="text-white hover:text-cyan-400 transition-colors font-medium"
                      >
                        {player.player_name}
                      </Link>
                      {player.game_mode !== 'all' && (
                        <div className="text-xs text-blue-300">{player.game_mode}</div>
                      )}
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
              </tbody>
            </table>
          </div>

          {/* Load More Button */}
          {pagination.hasMore && (
            <div className="p-4 text-center border-t border-white/20">
              <button
                onClick={loadMore}
                disabled={loading}
                className="bg-cyan-600 hover:bg-cyan-700 disabled:bg-gray-600 px-6 py-2 rounded transition-colors"
              >
                {loading ? 'Loading...' : 'Load More'}
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