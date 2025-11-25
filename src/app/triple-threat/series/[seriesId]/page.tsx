'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import TripleThreatBackground from '@/components/TripleThreatBackground';
import TripleThreatHeader from '@/components/TripleThreatHeader';
import { ArrowLeft } from 'lucide-react';

interface GameStat {
  game_number: number;
  player_alias: string;
  result: string;
  kills: number;
  deaths: number;
  kd_ratio: number;
  accuracy: number | null;
  primary_class: string | null;
  recorded_at: string;
}

interface PlayerSeriesData {
  player_alias: string;
  games: GameStat[];
  total_games: number;
  wins: number;
  losses: number;
  avg_kills: number;
  avg_deaths: number;
  avg_kd_ratio: number;
  avg_accuracy: number | null;
  most_used_class: string | null;
}

export default function SeriesDetailPage() {
  const params = useParams();
  const router = useRouter();
  const seriesId = params.seriesId as string;
  
  const [seriesData, setSeriesData] = useState<GameStat[]>([]);
  const [playerData, setPlayerData] = useState<PlayerSeriesData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (seriesId) {
      loadSeriesData();
    }
  }, [seriesId]);

  const loadSeriesData = async () => {
    setLoading(true);
    try {
      // Get all games in this series
      const response = await fetch(`/api/triple-threat/player-games?series_id=${encodeURIComponent(seriesId)}`);
      const data = await response.json();

      if (data.success) {
        const games: GameStat[] = data.games || [];
        setSeriesData(games);

        // Group by player
        const playerMap = new Map<string, GameStat[]>();
        games.forEach(game => {
          if (!playerMap.has(game.player_alias)) {
            playerMap.set(game.player_alias, []);
          }
          playerMap.get(game.player_alias)!.push(game);
        });

        // Calculate player stats
        const players: PlayerSeriesData[] = Array.from(playerMap.entries()).map(([alias, playerGames]) => {
          const wins = playerGames.filter(g => g.result === 'win').length;
          const losses = playerGames.filter(g => g.result === 'loss').length;
          const avgKills = playerGames.reduce((sum, g) => sum + g.kills, 0) / playerGames.length;
          const avgDeaths = playerGames.reduce((sum, g) => sum + g.deaths, 0) / playerGames.length;
          const avgKdRatio = playerGames.reduce((sum, g) => sum + g.kd_ratio, 0) / playerGames.length;
          
          const accuracies = playerGames.filter(g => g.accuracy !== null).map(g => g.accuracy!);
          const avgAccuracy = accuracies.length > 0 
            ? accuracies.reduce((sum, a) => sum + a, 0) / accuracies.length 
            : null;
          
          const classes = playerGames.filter(g => g.primary_class).map(g => g.primary_class!);
          const classCount = classes.reduce((acc, c) => {
            acc[c] = (acc[c] || 0) + 1;
            return acc;
          }, {} as Record<string, number>);
          const mostUsedClass = Object.keys(classCount).length > 0
            ? Object.entries(classCount).sort((a, b) => b[1] - a[1])[0][0]
            : null;

          return {
            player_alias: alias,
            games: playerGames.sort((a, b) => a.game_number - b.game_number),
            total_games: playerGames.length,
            wins,
            losses,
            avg_kills: avgKills,
            avg_deaths: avgDeaths,
            avg_kd_ratio: avgKdRatio,
            avg_accuracy: avgAccuracy,
            most_used_class: mostUsedClass
          };
        });

        setPlayerData(players);
      } else {
        setError(data.error || 'Failed to load series data');
      }
    } catch (err: any) {
      console.error('Error loading series data:', err);
      setError(err.message || 'Failed to load series data');
    } finally {
      setLoading(false);
    }
  };

  const formatSeriesName = (id: string) => {
    // series_20241124_162503_TeamA_vs_TeamB -> TeamA vs TeamB
    const parts = id.split('_');
    if (parts.length >= 5) {
      const teams = parts.slice(3).join(' ');
      return teams.replace(/-/g, ' ');
    }
    return id;
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getGameNumbersPlayed = () => {
    if (seriesData.length === 0) return [];
    const gameNumbers = [...new Set(seriesData.map(g => g.game_number))].sort((a, b) => a - b);
    return gameNumbers;
  };

  if (loading) {
    return (
      <TripleThreatBackground opacity={0.18}>
        <TripleThreatHeader currentPage="stats" showTeamStatus={false} />
        <div className="min-h-screen flex items-center justify-center pt-20">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-cyan-500 mx-auto mb-4"></div>
            <p className="text-gray-400 font-mono">Loading series data...</p>
          </div>
        </div>
      </TripleThreatBackground>
    );
  }

  if (error || seriesData.length === 0) {
    return (
      <TripleThreatBackground opacity={0.18}>
        <TripleThreatHeader currentPage="stats" showTeamStatus={false} />
        <div className="min-h-screen flex items-center justify-center pt-20">
          <div className="text-center">
            <div className="text-6xl mb-4">⚠️</div>
            <h1 className="text-2xl font-bold text-red-400 mb-4">
              {error || 'No data found for this series'}
            </h1>
            <button
              onClick={() => router.push('/triple-threat/stats')}
              className="bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white px-6 py-3 rounded-lg font-medium transition-all duration-300"
            >
              Back to Stats
            </button>
          </div>
        </div>
      </TripleThreatBackground>
    );
  }

  const gameNumbers = getGameNumbersPlayed();
  const seriesName = formatSeriesName(seriesId);
  const firstGameDate = seriesData[0]?.recorded_at;

  return (
    <TripleThreatBackground opacity={0.18}>
      <TripleThreatHeader currentPage="stats" showTeamStatus={false} />
      
      <div className="max-w-7xl mx-auto px-6 pt-24 pb-16">
        {/* Back Button */}
        <button
          onClick={() => router.push('/triple-threat/stats')}
          className="flex items-center text-cyan-300 hover:text-cyan-200 mb-6 transition-colors"
        >
          <ArrowLeft size={20} className="mr-2" />
          Back to Stats
        </button>

        {/* Page Header */}
        <div className="mb-8">
          <h1 className="text-4xl font-bold bg-gradient-to-r from-cyan-300 via-purple-300 to-pink-300 bg-clip-text text-transparent mb-2">
            {seriesName}
          </h1>
          <p className="text-gray-400 text-lg">
            {gameNumbers.length} game{gameNumbers.length !== 1 ? 's' : ''} • {formatDate(firstGameDate)}
          </p>
        </div>

        {/* Series Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-12">
          {playerData.map(player => (
            <div key={player.player_alias} className="bg-gradient-to-br from-gray-800/80 to-gray-900/80 backdrop-blur-sm border border-gray-700 rounded-lg p-6">
              <h3 className="text-xl font-bold text-white mb-4">{player.player_alias}</h3>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-400">Record:</span>
                  <span className="text-white font-medium">{player.wins}W - {player.losses}L</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Avg K/D:</span>
                  <span className={`font-medium ${player.avg_kd_ratio >= 1 ? 'text-green-400' : 'text-yellow-400'}`}>
                    {player.avg_kills.toFixed(1)}/{player.avg_deaths.toFixed(1)} ({player.avg_kd_ratio.toFixed(2)})
                  </span>
                </div>
                {player.avg_accuracy !== null && (
                  <div className="flex justify-between">
                    <span className="text-gray-400">Avg Accuracy:</span>
                    <span className="text-white font-medium">{player.avg_accuracy.toFixed(1)}%</span>
                  </div>
                )}
                {player.most_used_class && (
                  <div className="flex justify-between">
                    <span className="text-gray-400">Main Class:</span>
                    <span className="text-cyan-300 font-medium">{player.most_used_class}</span>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Game-by-Game Breakdown */}
        <div className="bg-gradient-to-br from-gray-800/80 to-gray-900/80 backdrop-blur-sm border border-gray-700 rounded-lg p-6">
          <h2 className="text-2xl font-bold text-white mb-6">Game-by-Game Breakdown</h2>
          
          {gameNumbers.map(gameNum => {
            const gameStats = seriesData.filter(g => g.game_number === gameNum);
            const winners = gameStats.filter(g => g.result === 'win');
            const losers = gameStats.filter(g => g.result === 'loss');
            
            return (
              <div key={gameNum} className="mb-8 last:mb-0">
                <h3 className="text-xl font-bold text-cyan-300 mb-4">Game {gameNum}</h3>
                
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="text-left text-gray-400 text-sm border-b border-gray-700">
                        <th className="pb-3 pr-4">Player</th>
                        <th className="pb-3 pr-4">Result</th>
                        <th className="pb-3 pr-4 text-center">Kills</th>
                        <th className="pb-3 pr-4 text-center">Deaths</th>
                        <th className="pb-3 pr-4 text-center">K/D</th>
                        <th className="pb-3 pr-4">Class</th>
                        <th className="pb-3 text-center">Accuracy</th>
                      </tr>
                    </thead>
                    <tbody>
                      {/* Winners first */}
                      {winners.map((stat, idx) => (
                        <tr key={`${stat.player_alias}-${idx}`} className="border-b border-gray-700/50 hover:bg-white/5">
                          <td className="py-3 pr-4 font-medium text-white">{stat.player_alias}</td>
                          <td className="py-3 pr-4">
                            <span className="px-2 py-1 bg-green-900/50 text-green-300 rounded text-xs font-medium">
                              WIN
                            </span>
                          </td>
                          <td className="py-3 pr-4 text-center text-green-400 font-semibold">{stat.kills}</td>
                          <td className="py-3 pr-4 text-center text-red-400 font-semibold">{stat.deaths}</td>
                          <td className="py-3 pr-4 text-center text-white font-semibold">{stat.kd_ratio.toFixed(2)}</td>
                          <td className="py-3 pr-4 text-gray-300">{stat.primary_class || 'Unknown'}</td>
                          <td className="py-3 text-center text-gray-300">
                            {stat.accuracy ? `${stat.accuracy.toFixed(1)}%` : 'N/A'}
                          </td>
                        </tr>
                      ))}
                      
                      {/* Then losers */}
                      {losers.map((stat, idx) => (
                        <tr key={`${stat.player_alias}-${idx}`} className="border-b border-gray-700/50 hover:bg-white/5">
                          <td className="py-3 pr-4 font-medium text-white">{stat.player_alias}</td>
                          <td className="py-3 pr-4">
                            <span className="px-2 py-1 bg-red-900/50 text-red-300 rounded text-xs font-medium">
                              LOSS
                            </span>
                          </td>
                          <td className="py-3 pr-4 text-center text-green-400 font-semibold">{stat.kills}</td>
                          <td className="py-3 pr-4 text-center text-red-400 font-semibold">{stat.deaths}</td>
                          <td className="py-3 pr-4 text-center text-white font-semibold">{stat.kd_ratio.toFixed(2)}</td>
                          <td className="py-3 pr-4 text-gray-300">{stat.primary_class || 'Unknown'}</td>
                          <td className="py-3 text-center text-gray-300">
                            {stat.accuracy ? `${stat.accuracy.toFixed(1)}%` : 'N/A'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </TripleThreatBackground>
  );
}

