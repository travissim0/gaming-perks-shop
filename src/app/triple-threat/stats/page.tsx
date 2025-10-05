'use client';

import React, { useState, useEffect } from 'react';
import TripleThreatBackground from '@/components/TripleThreatBackground';
import TripleThreatHeader from '@/components/TripleThreatHeader';

interface PlayerRecord {
  player_id: string | null;
  player_alias: string;
  game_wins: number;
  game_losses: number;
  series_wins: number;
  series_losses: number;
  total_games: number;
  total_series: number;
  game_win_rate: number;
  series_win_rate: number;
  created_at: string;
  updated_at: string;
}

interface TopPlayer {
  player_id: string | null;
  player_alias: string;
  game_wins: number;
  game_losses: number;
  total_games: number;
  win_rate: number;
  series_wins: number;
  series_losses: number;
  updated_at: string;
}

export default function TripleThreatStatsPage() {
  const [topGameWins, setTopGameWins] = useState<TopPlayer[]>([]);
  const [topSeriesWins, setTopSeriesWins] = useState<TopPlayer[]>([]);
  const [allPlayers, setAllPlayers] = useState<PlayerRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState('game_wins');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [showAllPlayers, setShowAllPlayers] = useState(false);

  useEffect(() => {
    loadStats();
  }, []);

  useEffect(() => {
    if (showAllPlayers) {
      loadAllPlayers();
    }
  }, [showAllPlayers, searchTerm, sortBy, sortOrder]);

  const loadStats = async () => {
    try {
      setLoading(true);
      setError(null);

      // Load top 5 game wins and series wins
      const [gameWinsResponse, seriesWinsResponse] = await Promise.all([
        fetch('/api/triple-threat/stats?type=top-game-wins&limit=5'),
        fetch('/api/triple-threat/stats?type=top-series-wins&limit=5')
      ]);

      if (!gameWinsResponse.ok || !seriesWinsResponse.ok) {
        throw new Error('Failed to fetch stats');
      }

      const gameWinsData = await gameWinsResponse.json();
      const seriesWinsData = await seriesWinsResponse.json();

      setTopGameWins(gameWinsData.data || []);
      setTopSeriesWins(seriesWinsData.data || []);

    } catch (err: any) {
      console.error('Error loading stats:', err);
      setError(err.message || 'Failed to load statistics');
    } finally {
      setLoading(false);
    }
  };

  const loadAllPlayers = async () => {
    try {
      const params = new URLSearchParams({
        type: 'all',
        limit: '100',
        search: searchTerm,
        sortBy: sortBy,
        sortOrder: sortOrder
      });

      const response = await fetch(`/api/triple-threat/stats?${params}`);
      if (!response.ok) {
        throw new Error('Failed to fetch all players');
      }

      const data = await response.json();
      setAllPlayers(data.data || []);
    } catch (err: any) {
      console.error('Error loading all players:', err);
      setError(err.message || 'Failed to load player records');
    }
  };

  const handleSort = (column: string) => {
    if (sortBy === column) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(column);
      setSortOrder('desc');
    }
  };

  const getSortIcon = (column: string) => {
    if (sortBy !== column) return '↕️';
    return sortOrder === 'asc' ? '↑' : '↓';
  };

  if (loading) {
    return (
      <TripleThreatBackground opacity={0.18}>
        <TripleThreatHeader currentPage="stats" showTeamStatus={false} />
        <div className="min-h-screen flex items-center justify-center pt-20">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-cyan-500 mx-auto mb-4"></div>
            <p className="text-gray-400 font-mono">Loading statistics...</p>
          </div>
        </div>
      </TripleThreatBackground>
    );
  }

  if (error) {
    return (
      <TripleThreatBackground opacity={0.18}>
        <TripleThreatHeader currentPage="stats" showTeamStatus={false} />
        <div className="min-h-screen flex items-center justify-center pt-20">
          <div className="text-center">
            <div className="text-6xl mb-4">⚠️</div>
            <h1 className="text-2xl font-bold text-red-400 mb-4">Error Loading Stats</h1>
            <p className="text-gray-400 mb-6">{error}</p>
            <button
              onClick={loadStats}
              className="bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white px-6 py-3 rounded-lg font-medium transition-all duration-300"
            >
              Try Again
            </button>
          </div>
        </div>
      </TripleThreatBackground>
    );
  }

  return (
    <TripleThreatBackground opacity={0.18}>
      <TripleThreatHeader currentPage="stats" showTeamStatus={false} />
      
      <div className="max-w-7xl mx-auto px-6 pt-24 pb-16">
        {/* Page Header */}
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold bg-gradient-to-r from-cyan-300 via-purple-300 to-pink-300 bg-clip-text text-transparent mb-4">
            Triple Threat Statistics
          </h1>
          <p className="text-gray-400 text-lg">
            Player performance leaderboards and comprehensive statistics
          </p>
        </div>

        {/* Top 5 Leaderboards */}
        <div className="grid lg:grid-cols-2 gap-8 mb-12">
          
          {/* Top 5 Game Wins */}
          <div className="bg-gradient-to-br from-cyan-400/10 to-cyan-600/20 backdrop-blur-sm border border-cyan-300/50 rounded-2xl p-6">
            <div className="flex items-center mb-6">
              <div className="text-3xl mr-3">🏆</div>
              <h2 className="text-2xl font-bold text-cyan-200">Top 5 Game Wins</h2>
            </div>
            
            {topGameWins.length === 0 ? (
              <div className="text-center py-8">
                <div className="text-4xl mb-4">📊</div>
                <p className="text-gray-400">No game statistics available yet</p>
              </div>
            ) : (
              <div className="space-y-3">
                {topGameWins.map((player, index) => (
                  <div key={player.player_id || player.player_alias || index} className="flex items-center justify-between bg-black/20 rounded-lg p-4">
                    <div className="flex items-center space-x-3">
                      <div className="text-2xl font-bold text-cyan-300">#{index + 1}</div>
                      <div>
                        <div className="font-semibold text-white">{player.player_alias}</div>
                        <div className="text-sm text-gray-400">
                          {player.total_games} games • {player.win_rate}% win rate
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-xl font-bold text-cyan-300">{player.game_wins}</div>
                      <div className="text-sm text-gray-400">wins</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Top 5 Series Wins */}
          <div className="bg-gradient-to-br from-purple-400/10 to-purple-600/20 backdrop-blur-sm border border-purple-300/50 rounded-2xl p-6">
            <div className="flex items-center mb-6">
              <div className="text-3xl mr-3">🥇</div>
              <h2 className="text-2xl font-bold text-purple-200">Top 5 Series Wins</h2>
            </div>
            
            {topSeriesWins.length === 0 ? (
              <div className="text-center py-8">
                <div className="text-4xl mb-4">📊</div>
                <p className="text-gray-400">No series statistics available yet</p>
              </div>
            ) : (
              <div className="space-y-3">
                {topSeriesWins.map((player, index) => (
                  <div key={player.player_id || player.player_alias || index} className="flex items-center justify-between bg-black/20 rounded-lg p-4">
                    <div className="flex items-center space-x-3">
                      <div className="text-2xl font-bold text-purple-300">#{index + 1}</div>
                      <div>
                        <div className="font-semibold text-white">{player.player_alias}</div>
                        <div className="text-sm text-gray-400">
                          {player.series_wins + player.series_losses} series • {player.series_win_rate}% win rate
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-xl font-bold text-purple-300">{player.series_wins}</div>
                      <div className="text-sm text-gray-400">wins</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* All Players Section */}
        <div className="bg-gradient-to-br from-gray-800/40 to-gray-900/60 backdrop-blur-sm border border-gray-600/50 rounded-2xl p-6">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center">
              <div className="text-3xl mr-3">📋</div>
              <h2 className="text-2xl font-bold text-white">All Player Records</h2>
            </div>
            <button
              onClick={() => setShowAllPlayers(!showAllPlayers)}
              className="bg-gradient-to-r from-cyan-600 to-purple-600 hover:from-cyan-500 hover:to-purple-500 text-white px-4 py-2 rounded-lg transition-all duration-300"
            >
              {showAllPlayers ? 'Hide' : 'Show'} All Records
            </button>
          </div>

          {showAllPlayers && (
            <>
              {/* Search and Controls */}
              <div className="mb-6 space-y-4">
                <div className="flex flex-col sm:flex-row gap-4">
                  <div className="flex-1">
                    <input
                      type="text"
                      placeholder="Search players..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="w-full bg-black/30 border border-gray-600 rounded-lg px-4 py-2 text-white placeholder-gray-400 focus:border-cyan-400 focus:outline-none"
                    />
                  </div>
                  <div className="flex gap-2">
                    <select
                      value={sortBy}
                      onChange={(e) => setSortBy(e.target.value)}
                      className="bg-black/30 border border-gray-600 rounded-lg px-3 py-2 text-white focus:border-cyan-400 focus:outline-none"
                    >
                      <option value="game_wins">Game Wins</option>
                      <option value="series_wins">Series Wins</option>
                      <option value="game_win_rate">Game Win Rate</option>
                      <option value="series_win_rate">Series Win Rate</option>
                      <option value="player_alias">Player Name</option>
                      <option value="updated_at">Last Updated</option>
                    </select>
                    <button
                      onClick={() => setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')}
                      className="bg-black/30 border border-gray-600 rounded-lg px-3 py-2 text-white hover:border-cyan-400 transition-colors"
                    >
                      {sortOrder === 'asc' ? '↑' : '↓'}
                    </button>
                  </div>
                </div>
              </div>

              {/* Data Grid */}
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead>
                    <tr className="border-b border-gray-600">
                      <th 
                        className="pb-3 cursor-pointer hover:text-cyan-300 transition-colors"
                        onClick={() => handleSort('player_alias')}
                      >
                        Player {getSortIcon('player_alias')}
                      </th>
                      <th 
                        className="pb-3 cursor-pointer hover:text-cyan-300 transition-colors text-center"
                        onClick={() => handleSort('game_wins')}
                      >
                        Game W/L {getSortIcon('game_wins')}
                      </th>
                      <th 
                        className="pb-3 cursor-pointer hover:text-cyan-300 transition-colors text-center"
                        onClick={() => handleSort('series_wins')}
                      >
                        Series W/L {getSortIcon('series_wins')}
                      </th>
                      <th 
                        className="pb-3 cursor-pointer hover:text-cyan-300 transition-colors text-center"
                        onClick={() => handleSort('game_win_rate')}
                      >
                        Game Win % {getSortIcon('game_win_rate')}
                      </th>
                      <th 
                        className="pb-3 cursor-pointer hover:text-cyan-300 transition-colors text-center"
                        onClick={() => handleSort('series_win_rate')}
                      >
                        Series Win % {getSortIcon('series_win_rate')}
                      </th>
                      <th 
                        className="pb-3 cursor-pointer hover:text-cyan-300 transition-colors text-center"
                        onClick={() => handleSort('updated_at')}
                      >
                        Last Updated {getSortIcon('updated_at')}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {allPlayers.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="text-center py-8">
                          <div className="text-4xl mb-4">📊</div>
                          <p className="text-gray-400">
                            {searchTerm ? 'No players found matching your search' : 'No player records available yet'}
                          </p>
                        </td>
                      </tr>
                    ) : (
                      allPlayers.map((player, index) => (
                        <tr key={player.player_id || player.player_alias || index} className="border-b border-gray-700/50 hover:bg-white/5 transition-colors">
                          <td className="py-3 font-medium text-white">{player.player_alias}</td>
                          <td className="py-3 text-center">
                            <span className="text-green-400 font-semibold">{player.game_wins}</span>
                            <span className="text-gray-400 mx-1">/</span>
                            <span className="text-red-400 font-semibold">{player.game_losses}</span>
                          </td>
                          <td className="py-3 text-center">
                            <span className="text-green-400 font-semibold">{player.series_wins}</span>
                            <span className="text-gray-400 mx-1">/</span>
                            <span className="text-red-400 font-semibold">{player.series_losses}</span>
                          </td>
                          <td className="py-3 text-center">
                            <span className={`font-semibold ${player.game_win_rate >= 50 ? 'text-green-400' : 'text-yellow-400'}`}>
                              {player.game_win_rate}%
                            </span>
                          </td>
                          <td className="py-3 text-center">
                            <span className={`font-semibold ${player.series_win_rate >= 50 ? 'text-green-400' : 'text-yellow-400'}`}>
                              {player.series_win_rate}%
                            </span>
                          </td>
                          <td className="py-3 text-center text-gray-400 text-sm">
                            {new Date(player.updated_at).toLocaleDateString()}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              {allPlayers.length > 0 && (
                <div className="mt-4 text-center text-gray-400 text-sm">
                  Showing {allPlayers.length} player{allPlayers.length !== 1 ? 's' : ''}
                  {searchTerm && ` matching "${searchTerm}"`}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </TripleThreatBackground>
  );
}
