'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { motion } from 'framer-motion';
import Link from 'next/link';

interface PlayerGameStats {
  id: number;
  game_id: string;
  player_name: string;
  squad_name: string;
  kills: number;
  deaths: number;
  flag_captures: number;
  carrier_kills: number;
  carry_time_seconds: number;
  class_swaps: number;
  turret_damage: number;
  eb_hits: number;
  resource_unused_per_death: number;
  explosive_unused_per_death: number;
  accuracy: number;
  game_date: string;
  game_mode: string;
  map_name: string;
  server_name: string;
  duration_seconds: number;
  total_players: number;
}

interface GameData {
  gameId: string;
  gameDate: string;
  gameMode: string;
  mapName: string;
  serverName: string;
  duration: number;
  totalPlayers: number;
  players: PlayerGameStats[];
  linkedMatchId?: string;
  linkedMatchTitle?: string;
}

export default function GameStatsPage() {
  const params = useParams();
  const gameId = params.gameId as string;
  const [gameData, setGameData] = useState<GameData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (gameId) {
      fetchGameData();
    }
  }, [gameId]);

  const fetchGameData = async () => {
    try {
      setLoading(true);
      setError(null);

      const response = await fetch(`/api/player-stats/game/${gameId}`);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      if (data.success) {
        setGameData(data.data);
      } else {
        throw new Error(data.error || 'Failed to fetch game data');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  const formatTime = (seconds: number) => {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
  };

  const formatPercentage = (num: number) => {
    return `${(num * 100).toFixed(1)}%`;
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString();
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-900 via-blue-900 to-indigo-900 text-white flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-cyan-400 mx-auto mb-4"></div>
          <p className="text-blue-200">Loading game statistics...</p>
        </div>
      </div>
    );
  }

  if (error || !gameData) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-900 via-blue-900 to-indigo-900 text-white flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-4 text-red-400">Error Loading Game</h1>
          <p className="text-blue-200 mb-4">{error || 'Game not found'}</p>
          <Link href="/stats" className="bg-blue-600 hover:bg-blue-700 px-6 py-2 rounded">
            Back to Stats
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-900 via-blue-900 to-indigo-900 text-white">
      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-8"
        >
          <div className="flex items-center gap-4 mb-4">
            <Link href="/stats" className="text-cyan-400 hover:text-cyan-300">
              ← Back to Stats
            </Link>
            {gameData.linkedMatchId && (
              <Link 
                href={`/matches/${gameData.linkedMatchId}`}
                className="bg-green-600 hover:bg-green-700 px-3 py-1 rounded text-sm"
              >
                🔗 View Match: {gameData.linkedMatchTitle}
              </Link>
            )}
          </div>
          
          <h1 className="text-4xl font-bold bg-gradient-to-r from-cyan-400 to-purple-400 bg-clip-text text-transparent mb-2">
            Game Statistics
          </h1>
          <p className="text-xl text-blue-200">Game ID: {gameData.gameId}</p>
        </motion.div>

        {/* Game Info */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white/10 backdrop-blur-lg rounded-xl p-6 mb-8 border border-white/20"
        >
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
            <div>
              <div className="text-2xl font-bold text-cyan-400">{gameData.gameMode}</div>
              <div className="text-sm text-blue-200">Game Mode</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-purple-400">{gameData.mapName}</div>
              <div className="text-sm text-blue-200">Map</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-green-400">{gameData.totalPlayers}</div>
              <div className="text-sm text-blue-200">Players</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-orange-400">{formatTime(gameData.duration)}</div>
              <div className="text-sm text-blue-200">Duration</div>
            </div>
          </div>
          <div className="mt-4 text-center">
            <div className="text-lg text-blue-200">
              <span className="font-semibold">Server:</span> {gameData.serverName} | 
              <span className="font-semibold"> Date:</span> {formatDate(gameData.gameDate)}
            </div>
          </div>
        </motion.div>

        {/* Player Statistics Table */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white/10 backdrop-blur-lg rounded-xl overflow-hidden border border-white/20"
        >
          <div className="p-4 bg-white/20 border-b border-white/20">
            <h2 className="text-xl font-bold text-blue-200">Player Performance</h2>
          </div>
          
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-white/20">
                <tr>
                  <th className="px-3 py-2 text-left text-xs font-semibold text-blue-200">Player</th>
                  <th className="px-3 py-2 text-left text-xs font-semibold text-blue-200">Squad</th>
                  <th className="px-3 py-2 text-right text-xs font-semibold text-blue-200">Kills</th>
                  <th className="px-3 py-2 text-right text-xs font-semibold text-blue-200">Deaths</th>
                  <th className="px-3 py-2 text-right text-xs font-semibold text-blue-200">K/D</th>
                  <th className="px-3 py-2 text-right text-xs font-semibold text-blue-200">Captures</th>
                  <th className="px-3 py-2 text-right text-xs font-semibold text-blue-200">Carrier Kills</th>
                  <th className="px-3 py-2 text-right text-xs font-semibold text-blue-200">Carry Time</th>
                  <th className="px-3 py-2 text-right text-xs font-semibold text-blue-200">Class Swaps</th>
                  <th className="px-3 py-2 text-right text-xs font-semibold text-blue-200">EB Hits</th>
                  <th className="px-3 py-2 text-right text-xs font-semibold text-blue-200">Turret DMG</th>
                  <th className="px-3 py-2 text-right text-xs font-semibold text-blue-200">Accuracy</th>
                  <th className="px-3 py-2 text-right text-xs font-semibold text-blue-200">Res/Death</th>
                  <th className="px-3 py-2 text-right text-xs font-semibold text-blue-200">Exp/Death</th>
                </tr>
              </thead>
              <tbody>
                {gameData.players
                  .sort((a, b) => b.kills - a.kills)
                  .map((player, index) => (
                    <motion.tr
                      key={player.id}
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: index * 0.05 }}
                      className="border-b border-white/10 hover:bg-white/5 transition-colors"
                    >
                      <td className="px-3 py-2">
                        <Link 
                          href={`/stats/player/${encodeURIComponent(player.player_name)}`}
                          className="text-white hover:text-cyan-400 transition-colors font-medium"
                        >
                          {player.player_name}
                        </Link>
                      </td>
                      <td className="px-3 py-2">
                        <span className="bg-white/20 px-2 py-1 rounded text-xs">
                          {player.squad_name}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-right text-xs">{player.kills}</td>
                      <td className="px-3 py-2 text-right text-xs">{player.deaths}</td>
                      <td className="px-3 py-2 text-right text-xs">
                        {typeof player.deaths === 'number' && player.deaths > 0
                          ? (typeof player.kills === 'number' ? (player.kills / player.deaths).toFixed(2) : 'N/A')
                          : (typeof player.kills === 'number' ? player.kills.toFixed(2) : 'N/A')}
                      </td>
                      <td className="px-3 py-2 text-right text-xs">{player.flag_captures}</td>
                      <td className="px-3 py-2 text-right text-xs">{player.carrier_kills}</td>
                      <td className="px-3 py-2 text-right text-xs">{formatTime(player.carry_time_seconds)}</td>
                      <td className="px-3 py-2 text-right text-xs">{player.class_swaps}</td>
                      <td className="px-3 py-2 text-right text-xs">{player.eb_hits}</td>
                      <td className="px-3 py-2 text-right text-xs">{player.turret_damage}</td>
                      <td className="px-3 py-2 text-right text-xs">{formatPercentage(player.accuracy)}</td>
                      <td className="px-3 py-2 text-right text-xs">{typeof player.resource_unused_per_death === 'number' ? player.resource_unused_per_death.toFixed(1) : 'N/A'}</td>
                      <td className="px-3 py-2 text-right text-xs">{typeof player.explosive_unused_per_death === 'number' ? player.explosive_unused_per_death.toFixed(1) : 'N/A'}</td>
                    </motion.tr>
                  ))}
              </tbody>
            </table>
          </div>
        </motion.div>

        {/* Squad Performance Summary */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mt-8"
        >
          <h2 className="text-2xl font-bold text-blue-200 mb-4">Squad Performance</h2>
          <div className="grid gap-4">
            {Object.entries(
              gameData.players.reduce((squads, player) => {
                if (!squads[player.squad_name]) {
                  squads[player.squad_name] = [];
                }
                squads[player.squad_name].push(player);
                return squads;
              }, {} as Record<string, PlayerGameStats[]>)
            ).map(([squadName, players]) => {
              const totalKills = players.reduce((sum, p) => sum + p.kills, 0);
              const totalDeaths = players.reduce((sum, p) => sum + p.deaths, 0);
              const totalCaptures = players.reduce((sum, p) => sum + p.flag_captures, 0);
              
              return (
                <div key={squadName} className="bg-white/10 backdrop-blur-lg rounded-lg p-4 border border-white/20">
                  <h3 className="text-lg font-bold text-cyan-400 mb-2">{squadName}</h3>
                  <div className="grid grid-cols-4 gap-4 text-center text-sm">
                    <div>
                      <div className="text-xl font-bold">{totalKills}</div>
                      <div className="text-blue-200">Total Kills</div>
                    </div>
                    <div>
                      <div className="text-xl font-bold">{totalDeaths}</div>
                      <div className="text-blue-200">Total Deaths</div>
                    </div>
                    <div>
                      <div className="text-xl font-bold">{totalCaptures}</div>
                      <div className="text-blue-200">Flag Captures</div>
                    </div>
                    <div>
                      <div className="text-xl font-bold">{players.length}</div>
                      <div className="text-blue-200">Players</div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </motion.div>
      </div>
    </div>
  );
} 