'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import Navbar from '@/components/Navbar';
import PlayerProfileHero from '@/components/PlayerProfileHero';
import { useAuth } from '@/lib/AuthContext';
import { getClassColor, getClassColorStyle } from '@/utils/classColors';
import type { EloTier } from '@/utils/eloTiers';

// ---------- Types ----------

interface PlayerStat {
  id: number;
  player_name: string;
  team: string;
  game_mode: string;
  arena_name: string;
  base_used: string;
  side: string;
  result: string;
  main_class: string;
  kills: number;
  deaths: number;
  captures: number;
  carrier_kills: number;
  carry_time_seconds: number;
  class_swaps: number;
  turret_damage: number;
  eb_hits: number;
  accuracy: number;
  avg_resource_unused_per_death: number;
  avg_explosive_unused_per_death: number;
  game_length_minutes: number;
  game_date: string;
  game_id?: string;
}

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
  kill_death_ratio: number;
  win_rate: number;
  avg_kills_per_game: number;
  avg_deaths_per_game: number;
  avg_captures_per_game: number;
  total_eb_hits: number;
  total_turret_damage: number;
  first_game_date: string;
  last_game_date: string;
}

interface PlayerResponse {
  success: boolean;
  player: {
    name: string;
    aggregateStats: PlayerAggregateStats[];
    recentGames: PlayerStat[];
    gameModeBreakdown: PlayerAggregateStats[];
    calculatedStats: {
      avgKillsPerGame: number;
      avgDeathsPerGame: number;
      avgCapturesPerGame: number;
      killDeathRatio: number;
      winRate: number;
      avgAccuracy: number;
    } | null;
    filters: {
      gameMode: string;
      dateFilter: string;
      limit: number;
    };
  };
}

interface ProfileResponse {
  profile: {
    id: string;
    in_game_alias: string | null;
    avatar_url: string | null;
    created_at: string;
    is_league_banned: boolean;
    ctf_role: string | null;
  } | null;
  aliases: string[];
  squad: {
    id: string;
    name: string;
    tag: string;
    banner_url: string | null;
    role: string;
  } | null;
  freeAgent: {
    preferred_roles: string[];
    skill_level: string;
    availability: string | null;
  } | null;
  elo: {
    weighted_elo: number;
    elo_rating: number;
    elo_peak: number;
    elo_confidence: number;
    total_games: number;
    win_rate: number;
    kill_death_ratio: number;
    tier: EloTier;
  } | null;
  isRegistered: boolean;
}

const DATE_FILTERS = [
  { value: 'all', label: 'All Time' },
  { value: 'day', label: 'Last 24 Hours' },
  { value: 'week', label: 'Last Week' },
  { value: 'month', label: 'Last Month' },
  { value: 'year', label: 'Last Year' }
];

// ---------- Component ----------

export default function PlayerPage() {
  const params = useParams();
  const playerName = decodeURIComponent(params.name as string);
  const { user } = useAuth();

  const [playerData, setPlayerData] = useState<PlayerResponse['player'] | null>(null);
  const [profileData, setProfileData] = useState<ProfileResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [profileLoading, setProfileLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [gameMode, setGameMode] = useState('all');
  const [dateFilter, setDateFilter] = useState('all');

  // Fetch profile data once on mount (independent of filters)
  useEffect(() => {
    const fetchProfile = async () => {
      try {
        setProfileLoading(true);
        const response = await fetch(
          `/api/player-stats/player/${encodeURIComponent(playerName)}/profile`
        );
        if (response.ok) {
          const data: ProfileResponse = await response.json();
          setProfileData(data);
        }
      } catch (err) {
        console.error('Failed to fetch profile:', err);
      } finally {
        setProfileLoading(false);
      }
    };
    fetchProfile();
  }, [playerName]);

  // Fetch stats data (re-fetches on filter changes)
  const fetchPlayerData = async () => {
    try {
      setLoading(true);
      setError(null);

      const queryParams = new URLSearchParams({
        gameMode,
        dateFilter,
        limit: '50'
      });

      const response = await fetch(
        `/api/player-stats/player/${encodeURIComponent(playerName)}?${queryParams}`
      );
      if (!response.ok) {
        if (response.status === 404) {
          throw new Error('Player not found');
        }
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data: PlayerResponse = await response.json();
      if (data.success) {
        setPlayerData(data.player);
      } else {
        throw new Error('Failed to fetch player data');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPlayerData();
  }, [gameMode, dateFilter]);

  // ---------- Formatters ----------

  const formatNumber = (num: number, decimals = 0) => Number(num).toFixed(decimals);
  const formatPercentage = (num: number) => `${(num * 100).toFixed(1)}%`;
  const formatDate = (dateString: string) => new Date(dateString).toLocaleDateString();

  // ---------- Compute aggregate totals from all-time stats ----------

  const aggregateTotals = playerData?.aggregateStats?.reduce(
    (acc, s) => ({
      totalGames: acc.totalGames + s.total_games,
      totalKills: acc.totalKills + s.total_kills,
      totalCaptures: acc.totalCaptures + s.total_captures,
    }),
    { totalGames: 0, totalKills: 0, totalCaptures: 0 }
  );

  // ---------- Render ----------

  if (error && !playerData) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-slate-800 to-gray-900 text-white">
        <Navbar user={user} />
        <div className="container mx-auto px-4 py-8">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="text-center py-12"
          >
            <h1 className="text-3xl font-bold text-red-400 mb-4">Error</h1>
            <p className="text-red-200 mb-6">{error}</p>
            <button
              onClick={() => window.history.back()}
              className="bg-gradient-to-r from-cyan-500 to-blue-500 hover:from-cyan-600 hover:to-blue-600 px-6 py-2 rounded-lg font-semibold transition-all duration-200 hover:scale-105"
            >
              Go Back
            </button>
          </motion.div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-slate-800 to-gray-900 text-white">
      <Navbar user={user} />
      <div className="container mx-auto px-4 py-6">
        {/* Breadcrumb */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="mb-4"
        >
          <Link
            href="/stats"
            className="text-sm text-gray-400 hover:text-cyan-400 transition-colors"
          >
            ← Back to Leaderboard
          </Link>
        </motion.div>

        {/* Profile Hero */}
        <PlayerProfileHero
          playerName={playerName}
          profile={profileData?.profile ?? null}
          aliases={profileData?.aliases ?? []}
          squad={profileData?.squad ?? null}
          freeAgent={profileData?.freeAgent ?? null}
          elo={profileData?.elo ?? null}
          isRegistered={profileData?.isRegistered ?? false}
          loading={profileLoading}
          stats={playerData?.calculatedStats ? {
            totalGames: aggregateTotals?.totalGames,
            winRate: playerData.calculatedStats.winRate,
            killDeathRatio: playerData.calculatedStats.killDeathRatio,
            avgAccuracy: playerData.calculatedStats.avgAccuracy,
            totalKills: aggregateTotals?.totalKills,
            totalCaptures: aggregateTotals?.totalCaptures,
          } : null}
        />

        {/* Loading overlay for stats */}
        {loading && !playerData && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="text-center py-12"
          >
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-cyan-400 mx-auto mb-4" />
            <p className="text-gray-400">Loading player statistics...</p>
          </motion.div>
        )}

        {playerData && (
          <>
            {/* Filters */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-white/5 backdrop-blur-lg rounded-xl p-5 mb-8 border border-white/10"
            >
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-400 mb-2">
                    Game Mode
                  </label>
                  <select
                    value={gameMode}
                    onChange={(e) => setGameMode(e.target.value)}
                    className="w-full bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-white focus:ring-2 focus:ring-cyan-400 focus:border-transparent"
                  >
                    <option value="all">All Modes</option>
                    {playerData.gameModeBreakdown.map(stats => (
                      <option key={stats.game_mode} value={stats.game_mode}>
                        {stats.game_mode}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-400 mb-2">
                    Time Period
                  </label>
                  <select
                    value={dateFilter}
                    onChange={(e) => setDateFilter(e.target.value)}
                    className="w-full bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-white focus:ring-2 focus:ring-cyan-400 focus:border-transparent"
                  >
                    {DATE_FILTERS.map(filter => (
                      <option key={filter.value} value={filter.value}>
                        {filter.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </motion.div>

            {/* Stats Overview */}
            {playerData.calculatedStats && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8"
              >
                <div className="bg-white/5 backdrop-blur-lg rounded-xl p-6 border border-white/10">
                  <h3 className="text-lg font-semibold text-cyan-400 mb-4">Combat Stats</h3>
                  <div className="space-y-2">
                    <div className="flex justify-between">
                      <span className="text-gray-400">Avg Kills/Game:</span>
                      <span className="font-bold">{formatNumber(playerData.calculatedStats.avgKillsPerGame, 1)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-400">Avg Deaths/Game:</span>
                      <span className="font-bold">{formatNumber(playerData.calculatedStats.avgDeathsPerGame, 1)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-400">K/D Ratio:</span>
                      <span className="font-bold text-cyan-400">{formatNumber(playerData.calculatedStats.killDeathRatio, 2)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-400">Avg Accuracy:</span>
                      <span className="font-bold text-purple-400">{formatPercentage(playerData.calculatedStats.avgAccuracy)}</span>
                    </div>
                  </div>
                </div>

                <div className="bg-white/5 backdrop-blur-lg rounded-xl p-6 border border-white/10">
                  <h3 className="text-lg font-semibold text-purple-400 mb-4">Game Performance</h3>
                  <div className="space-y-2">
                    <div className="flex justify-between">
                      <span className="text-gray-400">Win Rate:</span>
                      <span className="font-bold text-green-400">{formatPercentage(playerData.calculatedStats.winRate)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-400">Avg Captures/Game:</span>
                      <span className="font-bold">{formatNumber(playerData.calculatedStats.avgCapturesPerGame, 1)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-400">Recent Games:</span>
                      <span className="font-bold">{playerData.recentGames.length}</span>
                    </div>
                  </div>
                </div>

                <div className="bg-white/5 backdrop-blur-lg rounded-xl p-6 border border-white/10">
                  <h3 className="text-lg font-semibold text-green-400 mb-4">Game Mode Breakdown</h3>
                  <div className="space-y-2">
                    {playerData.gameModeBreakdown.slice(0, 3).map(stats => (
                      <div key={stats.game_mode} className="flex justify-between">
                        <span className="text-gray-400">{stats.game_mode}:</span>
                        <span className="font-bold">{stats.total_games} games</span>
                      </div>
                    ))}
                  </div>
                </div>
              </motion.div>
            )}

            {/* Class/Role Breakdown */}
            {playerData.recentGames && playerData.recentGames.length > 0 && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-white/5 backdrop-blur-lg rounded-xl overflow-hidden border border-white/10 mb-8"
              >
                <div className="p-6 border-b border-white/10">
                  <h2 className="text-2xl font-bold text-cyan-400">Class/Role Breakdown</h2>
                  <p className="text-gray-400 text-sm mt-1">Performance statistics by class played</p>
                </div>
                <div className="overflow-x-auto">
                  {(() => {
                    const classStats = playerData.recentGames.reduce((acc: any, game) => {
                      const className = game.main_class;
                      if (!acc[className]) {
                        acc[className] = {
                          games: 0, wins: 0, kills: 0, deaths: 0,
                          captures: 0, accuracy: 0, totalAccuracy: 0
                        };
                      }
                      acc[className].games += 1;
                      if (game.result === 'Win') acc[className].wins += 1;
                      acc[className].kills += game.kills;
                      acc[className].deaths += game.deaths;
                      acc[className].captures += game.captures;
                      acc[className].totalAccuracy += game.accuracy;
                      return acc;
                    }, {});

                    const sortedClasses = Object.entries(classStats)
                      .map(([className, stats]: [string, any]) => ({
                        className,
                        ...stats,
                        winRate: stats.games > 0 ? stats.wins / stats.games : 0,
                        kd: stats.deaths > 0 ? stats.kills / stats.deaths : stats.kills,
                        avgAccuracy: stats.games > 0 ? stats.totalAccuracy / stats.games : 0,
                        avgKills: stats.games > 0 ? stats.kills / stats.games : 0,
                        avgDeaths: stats.games > 0 ? stats.deaths / stats.games : 0,
                        avgCaptures: stats.games > 0 ? stats.captures / stats.games : 0
                      }))
                      .sort((a, b) => b.games - a.games);

                    return (
                      <table className="w-full">
                        <thead className="bg-white/5">
                          <tr>
                            <th className="px-4 py-3 text-left text-sm font-semibold text-gray-400">Class</th>
                            <th className="px-4 py-3 text-right text-sm font-semibold text-gray-400">Games</th>
                            <th className="px-4 py-3 text-right text-sm font-semibold text-gray-400">Win Rate</th>
                            <th className="px-4 py-3 text-right text-sm font-semibold text-gray-400">K/D</th>
                            <th className="px-4 py-3 text-right text-sm font-semibold text-gray-400">Avg K</th>
                            <th className="px-4 py-3 text-right text-sm font-semibold text-gray-400">Avg D</th>
                            <th className="px-4 py-3 text-right text-sm font-semibold text-gray-400">Avg Caps</th>
                            <th className="px-4 py-3 text-right text-sm font-semibold text-gray-400">Avg Acc</th>
                          </tr>
                        </thead>
                        <tbody>
                          {sortedClasses.map((classData, index) => (
                            <motion.tr
                              key={classData.className}
                              initial={{ opacity: 0, x: -20 }}
                              animate={{ opacity: 1, x: 0 }}
                              transition={{ delay: index * 0.05 }}
                              className="border-b border-white/5 hover:bg-white/5 transition-colors"
                            >
                              <td className="px-4 py-3 text-sm" style={getClassColorStyle(classData.className)}>
                                <div className="flex items-center gap-2">
                                  <span className="font-bold">{classData.className}</span>
                                  <span className="text-xs text-gray-500">(#{index + 1})</span>
                                </div>
                              </td>
                              <td className="px-4 py-3 text-right text-sm font-bold text-cyan-400">
                                {classData.games}
                              </td>
                              <td className="px-4 py-3 text-right text-sm">
                                <span className={`px-2 py-1 rounded text-xs font-bold ${
                                  classData.winRate >= 0.6 ? 'bg-green-500/20 text-green-400' :
                                  classData.winRate >= 0.4 ? 'bg-yellow-500/20 text-yellow-400' :
                                  'bg-red-500/20 text-red-400'
                                }`}>
                                  {formatPercentage(classData.winRate)}
                                </span>
                              </td>
                              <td className="px-4 py-3 text-right text-sm font-bold text-purple-400">
                                {formatNumber(classData.kd, 2)}
                              </td>
                              <td className="px-4 py-3 text-right text-sm text-green-400">
                                {formatNumber(classData.avgKills, 1)}
                              </td>
                              <td className="px-4 py-3 text-right text-sm text-red-400">
                                {formatNumber(classData.avgDeaths, 1)}
                              </td>
                              <td className="px-4 py-3 text-right text-sm text-cyan-400">
                                {formatNumber(classData.avgCaptures, 1)}
                              </td>
                              <td className="px-4 py-3 text-right text-sm text-blue-300">
                                {formatPercentage(classData.avgAccuracy)}
                              </td>
                            </motion.tr>
                          ))}
                        </tbody>
                      </table>
                    );
                  })()}
                </div>
              </motion.div>
            )}

            {/* Recent Games */}
            {playerData.recentGames && playerData.recentGames.length > 0 && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-white/5 backdrop-blur-lg rounded-xl overflow-hidden border border-white/10 mb-8"
              >
                <div className="p-6 border-b border-white/10">
                  <h2 className="text-2xl font-bold text-cyan-400">Recent Games</h2>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-white/5">
                      <tr>
                        <th className="px-4 py-3 text-left text-sm font-semibold text-gray-400">Date</th>
                        <th className="px-4 py-3 text-left text-sm font-semibold text-gray-400">Mode</th>
                        <th className="px-4 py-3 text-left text-sm font-semibold text-gray-400">Arena</th>
                        <th className="px-4 py-3 text-left text-sm font-semibold text-gray-400">Result</th>
                        <th className="px-4 py-3 text-left text-sm font-semibold text-gray-400">Class</th>
                        <th className="px-4 py-3 text-right text-sm font-semibold text-gray-400">K</th>
                        <th className="px-4 py-3 text-right text-sm font-semibold text-gray-400">D</th>
                        <th className="px-4 py-3 text-right text-sm font-semibold text-gray-400">K/D</th>
                        <th className="px-4 py-3 text-right text-sm font-semibold text-gray-400">Caps</th>
                        <th className="px-4 py-3 text-right text-sm font-semibold text-gray-400">Accuracy</th>
                        <th className="px-4 py-3 text-center text-sm font-semibold text-gray-400">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {playerData.recentGames.map((game, index) => (
                        <motion.tr
                          key={game.id}
                          initial={{ opacity: 0, x: -20 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: index * 0.05 }}
                          className="border-b border-white/5 hover:bg-white/5 transition-colors"
                        >
                          <td className="px-4 py-3 text-sm">{formatDate(game.game_date)}</td>
                          <td className="px-4 py-3 text-sm">
                            <span className="bg-white/10 px-2 py-1 rounded text-xs">
                              {game.game_mode}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-300">{game.arena_name}</td>
                          <td className="px-4 py-3 text-sm">
                            <span className={`px-2 py-1 rounded text-xs font-bold ${
                              game.result === 'Win'
                                ? 'bg-green-500/20 text-green-400'
                                : 'bg-red-500/20 text-red-400'
                            }`}>
                              {game.result}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-sm" style={getClassColorStyle(game.main_class)}>
                            <span className="font-medium">{game.main_class}</span>
                          </td>
                          <td className="px-4 py-3 text-right text-sm font-bold text-green-400">{game.kills}</td>
                          <td className="px-4 py-3 text-right text-sm font-bold text-red-400">{game.deaths}</td>
                          <td className="px-4 py-3 text-right text-sm font-bold">
                            {game.deaths > 0 ? formatNumber(game.kills / game.deaths, 2) : game.kills.toString()}
                          </td>
                          <td className="px-4 py-3 text-right text-sm text-cyan-400">{game.captures}</td>
                          <td className="px-4 py-3 text-right text-sm text-purple-400">
                            {formatPercentage(game.accuracy)}
                          </td>
                          <td className="px-4 py-3 text-center">
                            {game.game_id && (
                              <Link
                                href={`/stats/game/${encodeURIComponent(game.game_id)}`}
                                className="bg-blue-600 hover:bg-blue-700 text-white px-2 py-1 rounded text-xs transition-colors"
                              >
                                View Game
                              </Link>
                            )}
                          </td>
                        </motion.tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </motion.div>
            )}

            {/* All-Time Stats by Game Mode */}
            {playerData.aggregateStats && playerData.aggregateStats.length > 0 && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-white/5 backdrop-blur-lg rounded-xl overflow-hidden border border-white/10"
              >
                <div className="p-6 border-b border-white/10">
                  <h2 className="text-2xl font-bold text-purple-400">All-Time Statistics</h2>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-white/5">
                      <tr>
                        <th className="px-4 py-3 text-left text-sm font-semibold text-gray-400">Game Mode</th>
                        <th className="px-4 py-3 text-right text-sm font-semibold text-gray-400">Games</th>
                        <th className="px-4 py-3 text-right text-sm font-semibold text-gray-400">Win Rate</th>
                        <th className="px-4 py-3 text-right text-sm font-semibold text-gray-400">Total Kills</th>
                        <th className="px-4 py-3 text-right text-sm font-semibold text-gray-400">Total Deaths</th>
                        <th className="px-4 py-3 text-right text-sm font-semibold text-gray-400">K/D Ratio</th>
                        <th className="px-4 py-3 text-right text-sm font-semibold text-gray-400">Total Caps</th>
                        <th className="px-4 py-3 text-right text-sm font-semibold text-gray-400">EB Hits</th>
                        <th className="px-4 py-3 text-right text-sm font-semibold text-gray-400">Last Active</th>
                      </tr>
                    </thead>
                    <tbody>
                      {playerData.aggregateStats.map((stats, index) => (
                        <motion.tr
                          key={stats.game_mode}
                          initial={{ opacity: 0, x: -20 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: index * 0.1 }}
                          className="border-b border-white/5 hover:bg-white/5 transition-colors"
                        >
                          <td className="px-4 py-3 text-sm font-medium">
                            <span className="bg-white/10 px-2 py-1 rounded text-xs">
                              {stats.game_mode}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-right text-sm">{stats.total_games}</td>
                          <td className="px-4 py-3 text-right text-sm text-green-400">{formatPercentage(stats.win_rate)}</td>
                          <td className="px-4 py-3 text-right text-sm font-bold">{stats.total_kills}</td>
                          <td className="px-4 py-3 text-right text-sm">{stats.total_deaths}</td>
                          <td className="px-4 py-3 text-right text-sm font-bold text-cyan-400">
                            {formatNumber(stats.kill_death_ratio, 2)}
                          </td>
                          <td className="px-4 py-3 text-right text-sm text-purple-400">{stats.total_captures}</td>
                          <td className="px-4 py-3 text-right text-sm text-yellow-400">{stats.total_eb_hits}</td>
                          <td className="px-4 py-3 text-right text-sm text-gray-400">
                            {formatDate(stats.last_game_date)}
                          </td>
                        </motion.tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </motion.div>
            )}

            {/* No Data */}
            {(!playerData.recentGames?.length && !playerData.aggregateStats?.length) && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="text-center py-12"
              >
                <p className="text-xl text-gray-300 mb-4">No game statistics found</p>
                <p className="text-gray-500">This player hasn&apos;t played any games yet or they may be filtered out by your current settings</p>
              </motion.div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
