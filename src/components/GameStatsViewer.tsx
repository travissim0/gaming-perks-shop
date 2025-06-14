'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { getClassColor, getClassColorStyle } from '@/utils/classColors';

interface PlayerStats {
  id: number;
  game_id: string;
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
}

interface GameStatsData {
  gameId: string;
  gameMode: string;
  arenaName: string;
  gameDate: string;
  gameLength: number;
  summary: {
    totalKills: number;
    totalDeaths: number;
    totalCaptures: number;
    playerCount: number;
  };
  players: PlayerStats[];
  teamStats: Record<string, PlayerStats[]>;
}

interface GameStatsResponse {
  success: boolean;
  data?: GameStatsData;
  error?: string;
}

interface GameStatsViewerProps {
  matchId: string;
  matchTitle: string;
  matchStatus: string;
}

export default function GameStatsViewer({ matchId, matchTitle, matchStatus }: GameStatsViewerProps) {
  const [gameStats, setGameStats] = useState<GameStatsData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);

  const fetchGameStats = async () => {
    if (matchStatus !== 'completed') return;
    
    setLoading(true);
    setError(null);
    
    try {
      // First, try to find games for this match by searching for any game stats
      // where the game_id might be related to this match
      const searchResponse = await fetch(`/api/player-stats/leaderboard?limit=200`);
      const searchData = await searchResponse.json();
      
      if (searchData.success && searchData.data) {
        // Try to find a game that might be associated with this match
        // This is a temporary solution - in production you'd want a better linking mechanism
        console.log('Available games:', searchData.data.map((p: any) => p.game_id).filter((id: any) => id));
      }
      
      // For now, try a few potential game ID patterns
      const potentialGameIds = [
        `${matchId}_game`,
        matchId,
        `match_${matchId}`,
        // Could add more patterns based on how your game generates IDs
      ];

      let foundStats = null;
      for (const gameId of potentialGameIds) {
        try {
          const response = await fetch(`/api/player-stats/game/${encodeURIComponent(gameId)}`);
          const data: GameStatsResponse = await response.json();
          
          if (data.success && data.data) {
            foundStats = data.data;
            break;
          }
        } catch (err) {
          // Continue trying other IDs
        }
      }
      
      if (foundStats) {
        setGameStats(foundStats);
      } else {
        setError('No game stats found for this match. Stats are only available for games played through the in-game system.');
      }
    } catch (err) {
      setError('Failed to fetch game stats');
    } finally {
      setLoading(false);
    }
  };

  const formatKD = (kills: number, deaths: number) => {
    if (deaths === 0) return kills.toString();
    return (kills / deaths).toFixed(2);
  };

  const formatTime = (seconds: number) => {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
  };

  const formatPercentage = (value: number) => {
    return `${(value * 100).toFixed(1)}%`;
  };

  // Only show for completed matches
  if (matchStatus !== 'completed') {
    return null;
  }

  return (
    <div className="bg-gray-800 rounded-lg p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-2xl font-bold flex items-center gap-2">
          📊 Game Statistics
        </h2>
        {!gameStats && !loading && !error && (
          <button
            onClick={fetchGameStats}
            className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded transition-colors"
          >
            Load Game Stats
          </button>
        )}
      </div>

      {loading && (
        <div className="text-center py-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-cyan-400 mx-auto mb-4"></div>
          <p className="text-gray-400">Loading game statistics...</p>
        </div>
      )}

      {error && (
        <div className="bg-red-500/20 border border-red-500/50 rounded-lg p-4 text-red-200">
          <p className="font-medium">Unable to load game stats</p>
          <p className="text-sm text-red-300 mt-1">{error}</p>
          <p className="text-xs text-red-400 mt-2">
            Game stats are only available for matches played through the in-game system.
          </p>
        </div>
      )}

      {gameStats && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-6"
        >
          {/* Game Summary */}
          <div className="bg-gray-700 rounded-lg p-4">
            <h3 className="text-lg font-semibold mb-3">Game Summary</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              <div>
                <span className="text-gray-400">Arena:</span>
                <div className="font-medium">{gameStats.arenaName}</div>
              </div>
              <div>
                <span className="text-gray-400">Game Mode:</span>
                <div className="font-medium">{gameStats.gameMode}</div>
              </div>
              <div>
                <span className="text-gray-400">Duration:</span>
                <div className="font-medium">{gameStats.gameLength.toFixed(1)} min</div>
              </div>
              <div>
                <span className="text-gray-400">Players:</span>
                <div className="font-medium">{gameStats.summary.playerCount}</div>
              </div>
            </div>
          </div>

          {/* Team-based view */}
          {Object.keys(gameStats.teamStats).length > 1 && (
            <div className="space-y-4">
              <h3 className="text-lg font-semibold">Team Statistics</h3>
              <div className="grid gap-4">
                {Object.entries(gameStats.teamStats).map(([teamName, players]) => (
                  <div key={teamName} className="bg-gray-700 rounded-lg overflow-hidden">
                    <div className="bg-gray-600 px-4 py-2 font-medium">
                      Team {teamName} ({players.length} players)
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead className="bg-gray-600/50">
                          <tr>
                            <th className="px-3 py-2 text-left">Player</th>
                            <th className="px-3 py-2 text-right">K/D</th>
                            <th className="px-3 py-2 text-right">Captures</th>
                            <th className="px-3 py-2 text-right">Accuracy</th>
                            <th className="px-3 py-2 text-right">Class</th>
                          </tr>
                        </thead>
                        <tbody>
                          {players
                            .sort((a, b) => b.kills - a.kills)
                            .map((player) => (
                              <tr key={player.id} className="border-b border-gray-600">
                                <td className="px-3 py-2 font-medium">{player.player_name}</td>
                                <td className="px-3 py-2 text-right">
                                  {player.kills}/{player.deaths} ({formatKD(player.kills, player.deaths)})
                                </td>
                                <td className="px-3 py-2 text-right">{player.captures}</td>
                                <td className="px-3 py-2 text-right">{formatPercentage(player.accuracy)}</td>
                                <td className="px-3 py-2 text-right" style={getClassColorStyle(player.main_class)}>
                                  {player.main_class || 'Unknown'}
                                </td>
                              </tr>
                            ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* All Players View */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-lg font-semibold">All Players</h3>
              <button
                onClick={() => setExpanded(!expanded)}
                className="text-cyan-400 hover:text-cyan-300 text-sm"
              >
                {expanded ? 'Show Less' : 'Show More Stats'}
              </button>
            </div>
            
            <div className="bg-gray-700 rounded-lg overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-600">
                    <tr>
                      <th className="px-3 py-2 text-left">Player</th>
                      <th className="px-3 py-2 text-right">Kills</th>
                      <th className="px-3 py-2 text-right">Deaths</th>
                      <th className="px-3 py-2 text-right">K/D</th>
                      <th className="px-3 py-2 text-right">Captures</th>
                      {expanded && (
                        <>
                          <th className="px-3 py-2 text-right">Carrier Kills</th>
                          <th className="px-3 py-2 text-right">Carry Time</th>
                          <th className="px-3 py-2 text-right">EB Hits</th>
                          <th className="px-3 py-2 text-right">Accuracy</th>
                          <th className="px-3 py-2 text-right">Class Swaps</th>
                        </>
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {gameStats.players
                      .sort((a, b) => b.kills - a.kills)
                      .map((player, index) => (
                        <motion.tr
                          key={player.id}
                          initial={{ opacity: 0, x: -20 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: index * 0.05 }}
                          className="border-b border-gray-600 hover:bg-gray-600/50"
                        >
                          <td className="px-3 py-2">
                            <div className="font-medium">{player.player_name}</div>
                            <div className="text-xs text-gray-400">
                              <span style={getClassColorStyle(player.main_class)}>{player.main_class || 'Unknown'}</span> • 
                              <span className={player.side === 'offense' ? 'text-red-400' : player.side === 'defense' ? 'text-blue-400' : 'text-gray-400'}>
                                {player.side || 'N/A'}
                              </span> • 
                              <span className={`${
                                player.result === 'Win' ? 'text-green-400' : 'text-red-400'
                              }`}>{player.result}</span>
                            </div>
                          </td>
                          <td className="px-3 py-2 text-right font-medium">{player.kills}</td>
                          <td className="px-3 py-2 text-right">{player.deaths}</td>
                          <td className="px-3 py-2 text-right">{formatKD(player.kills, player.deaths)}</td>
                          <td className="px-3 py-2 text-right">{player.captures}</td>
                          {expanded && (
                            <>
                              <td className="px-3 py-2 text-right">{player.carrier_kills}</td>
                              <td className="px-3 py-2 text-right">{formatTime(player.carry_time_seconds)}</td>
                              <td className="px-3 py-2 text-right">{player.eb_hits}</td>
                              <td className="px-3 py-2 text-right">{formatPercentage(player.accuracy)}</td>
                              <td className="px-3 py-2 text-right">{player.class_swaps}</td>
                            </>
                          )}
                        </motion.tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* Link to detailed stats */}
          <div className="text-center pt-4">
            <a
              href={`/stats`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-cyan-400 hover:text-cyan-300 text-sm"
            >
              View detailed player statistics →
            </a>
          </div>
        </motion.div>
      )}
    </div>
  );
} 