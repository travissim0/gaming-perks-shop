'use client';

import { useEffect, useState } from 'react';
import { X } from 'lucide-react';

interface PlayerGame {
  id: string;
  recorded_at: string;
  result: string;
  kills: number;
  deaths: number;
  kd_ratio: number;
  primary_class: string | null;
  accuracy: number | null;
  total_hits: number;
  total_shots: number;
  teammates: string[] | null;
  opponent_team: string;
  game_duration_seconds: number | null;
  series_id: string | null;
  game_number_in_series: number;
}

interface ClassStat {
  primary_class: string;
  games_played: number;
  wins: number;
  losses: number;
  win_rate: number;
  avg_kills: number;
  avg_deaths: number;
  avg_kd_ratio: number;
  avg_accuracy: number | null;
}

interface PlayerProfileModalProps {
  playerAlias: string;
  isOpen: boolean;
  onClose: () => void;
  aggregateStats?: any;
}

interface SeriesInfo {
  series_id: string;
  games_in_series: number;
  first_game_date: string;
}

type TabType = 'overview' | 'recent-games' | 'series-history' | 'class-breakdown';

export default function PlayerProfileModal({ 
  playerAlias, 
  isOpen, 
  onClose,
  aggregateStats 
}: PlayerProfileModalProps) {
  const [activeTab, setActiveTab] = useState<TabType>('overview');
  const [recentGames, setRecentGames] = useState<PlayerGame[]>([]);
  const [classStats, setClassStats] = useState<ClassStat[]>([]);
  const [seriesList, setSeriesList] = useState<SeriesInfo[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isOpen && playerAlias) {
      loadPlayerData();
    }
  }, [isOpen, playerAlias, activeTab]);

  const loadPlayerData = async () => {
    setLoading(true);
    try {
      if (activeTab === 'recent-games') {
        const response = await fetch(`/api/triple-threat/player-games?alias=${encodeURIComponent(playerAlias)}&limit=20`);
        const data = await response.json();
        if (data.success) {
          setRecentGames(data.games || []);
        }
      } else if (activeTab === 'class-breakdown') {
        const response = await fetch(`/api/triple-threat/class-stats?alias=${encodeURIComponent(playerAlias)}`);
        const data = await response.json();
        if (data.success) {
          setClassStats(data.class_stats || []);
        }
      } else if (activeTab === 'series-history') {
        // Get all games and extract unique series
        const response = await fetch(`/api/triple-threat/player-games?alias=${encodeURIComponent(playerAlias)}&limit=100`);
        const data = await response.json();
        if (data.success) {
          const games = data.games || [];
          const seriesMap = new Map<string, SeriesInfo>();
          
          games.forEach((game: PlayerGame) => {
            if (game.series_id) {
              if (!seriesMap.has(game.series_id)) {
                seriesMap.set(game.series_id, {
                  series_id: game.series_id,
                  games_in_series: 1,
                  first_game_date: game.recorded_at
                });
              } else {
                const existing = seriesMap.get(game.series_id)!;
                existing.games_in_series++;
                if (new Date(game.recorded_at) < new Date(existing.first_game_date)) {
                  existing.first_game_date = game.recorded_at;
                }
              }
            }
          });
          
          setSeriesList(Array.from(seriesMap.values()).sort((a, b) => 
            new Date(b.first_game_date).getTime() - new Date(a.first_game_date).getTime()
          ));
        }
      }
    } catch (error) {
      console.error('Error loading player data:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatDuration = (seconds: number | null) => {
    if (!seconds) return 'N/A';
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}m ${secs}s`;
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[10000] p-4">
      <div className="bg-gray-800 rounded-lg shadow-xl max-w-6xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex justify-between items-center p-6 border-b border-gray-700">
          <div>
            <h2 className="text-2xl font-bold text-white">{playerAlias}</h2>
            <p className="text-gray-400 text-sm">Player Profile</p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white transition-colors"
            aria-label="Close modal"
          >
            <X size={24} />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-700">
          <button
            onClick={() => setActiveTab('overview')}
            className={`px-6 py-3 font-medium transition-colors ${
              activeTab === 'overview'
                ? 'text-blue-400 border-b-2 border-blue-400'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            Overview
          </button>
          <button
            onClick={() => setActiveTab('recent-games')}
            className={`px-6 py-3 font-medium transition-colors ${
              activeTab === 'recent-games'
                ? 'text-blue-400 border-b-2 border-blue-400'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            Recent Games
          </button>
          <button
            onClick={() => setActiveTab('series-history')}
            className={`px-6 py-3 font-medium transition-colors ${
              activeTab === 'series-history'
                ? 'text-blue-400 border-b-2 border-blue-400'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            Series History
          </button>
          <button
            onClick={() => setActiveTab('class-breakdown')}
            className={`px-6 py-3 font-medium transition-colors ${
              activeTab === 'class-breakdown'
                ? 'text-blue-400 border-b-2 border-blue-400'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            Class Breakdown
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {activeTab === 'overview' && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              <StatCard 
                title="Game Record" 
                value={`${aggregateStats?.game_wins || 0} - ${aggregateStats?.game_losses || 0}`}
                subtitle={`${aggregateStats?.game_win_percentage?.toFixed(1) || 0}% Win Rate`}
              />
              <StatCard 
                title="Series Record" 
                value={`${aggregateStats?.series_wins || 0} - ${aggregateStats?.series_losses || 0}`}
                subtitle={`${aggregateStats?.series_win_percentage?.toFixed(1) || 0}% Win Rate`}
              />
              <StatCard 
                title="K/D Ratio" 
                value={aggregateStats?.kd_ratio?.toFixed(2) || '0.00'}
                subtitle={`${aggregateStats?.kills || 0}K / ${aggregateStats?.deaths || 0}D`}
              />
            </div>
          )}

          {activeTab === 'recent-games' && (
            <div className="space-y-4">
              {loading ? (
                <div className="text-center text-gray-400 py-8">Loading games...</div>
              ) : recentGames.length === 0 ? (
                <div className="text-center text-gray-400 py-8">No games recorded yet</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="text-left text-gray-400 text-sm border-b border-gray-700">
                        <th className="pb-2">Date</th>
                        <th className="pb-2">Result</th>
                        <th className="pb-2">K/D</th>
                        <th className="pb-2">Class</th>
                        <th className="pb-2">Accuracy</th>
                        <th className="pb-2">Opponent</th>
                        <th className="pb-2">Duration</th>
                      </tr>
                    </thead>
                    <tbody>
                      {recentGames.map((game) => (
                        <tr key={game.id} className="border-b border-gray-700 hover:bg-gray-700/50">
                          <td className="py-3 text-sm text-gray-300">{formatDate(game.recorded_at)}</td>
                          <td className="py-3">
                            <span className={`px-2 py-1 rounded text-xs font-medium ${
                              game.result === 'win' 
                                ? 'bg-green-900/50 text-green-300' 
                                : 'bg-red-900/50 text-red-300'
                            }`}>
                              {game.result === 'win' ? 'WIN' : 'LOSS'}
                            </span>
                          </td>
                          <td className="py-3 text-white">
                            {game.kills}/{game.deaths} ({game.kd_ratio.toFixed(2)})
                          </td>
                          <td className="py-3 text-gray-300">{game.primary_class || 'Unknown'}</td>
                          <td className="py-3 text-gray-300">
                            {game.accuracy ? `${game.accuracy.toFixed(1)}%` : 'N/A'}
                          </td>
                          <td className="py-3 text-gray-300">{game.opponent_team}</td>
                          <td className="py-3 text-gray-300">{formatDuration(game.game_duration_seconds)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {activeTab === 'series-history' && (
            <div className="space-y-4">
              {loading ? (
                <div className="text-center text-gray-400 py-8">Loading series history...</div>
              ) : seriesList.length === 0 ? (
                <div className="text-center text-gray-400 py-8">No series recorded yet</div>
              ) : (
                <div className="grid grid-cols-1 gap-4">
                  {seriesList.map((series) => (
                    <div key={series.series_id} className="bg-gray-700 rounded-lg p-4 hover:bg-gray-600 transition-colors">
                      <div className="flex justify-between items-start">
                        <div>
                          <h3 className="text-lg font-bold text-white mb-1">
                            {series.series_id.split('_').slice(2).join(' ').replace(/-/g, ' ')}
                          </h3>
                          <p className="text-sm text-gray-400">
                            {series.games_in_series} game{series.games_in_series !== 1 ? 's' : ''} • {formatDate(series.first_game_date)}
                          </p>
                        </div>
                        <button
                          onClick={() => window.open(`/triple-threat/series/${series.series_id}`, '_blank')}
                          className="px-3 py-1 bg-blue-600 hover:bg-blue-500 text-white text-sm rounded transition-colors"
                        >
                          View Details
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {activeTab === 'class-breakdown' && (
            <div className="space-y-4">
              {loading ? (
                <div className="text-center text-gray-400 py-8">Loading class stats...</div>
              ) : classStats.length === 0 ? (
                <div className="text-center text-gray-400 py-8">No class data available yet</div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {classStats.map((classStat) => (
                    <div key={classStat.primary_class} className="bg-gray-700 rounded-lg p-4">
                      <h3 className="text-xl font-bold text-white mb-3">{classStat.primary_class}</h3>
                      <div className="grid grid-cols-2 gap-3 text-sm">
                        <div>
                          <p className="text-gray-400">Games Played</p>
                          <p className="text-white font-medium">{classStat.games_played}</p>
                        </div>
                        <div>
                          <p className="text-gray-400">Win Rate</p>
                          <p className="text-white font-medium">{classStat.win_rate.toFixed(1)}%</p>
                        </div>
                        <div>
                          <p className="text-gray-400">Record</p>
                          <p className="text-white font-medium">{classStat.wins}W - {classStat.losses}L</p>
                        </div>
                        <div>
                          <p className="text-gray-400">Avg K/D</p>
                          <p className="text-white font-medium">{classStat.avg_kd_ratio.toFixed(2)}</p>
                        </div>
                        <div>
                          <p className="text-gray-400">Avg Kills</p>
                          <p className="text-white font-medium">{classStat.avg_kills.toFixed(1)}</p>
                        </div>
                        <div>
                          <p className="text-gray-400">Avg Deaths</p>
                          <p className="text-white font-medium">{classStat.avg_deaths.toFixed(1)}</p>
                        </div>
                        {classStat.avg_accuracy !== null && (
                          <div>
                            <p className="text-gray-400">Avg Accuracy</p>
                            <p className="text-white font-medium">{classStat.avg_accuracy.toFixed(1)}%</p>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function StatCard({ title, value, subtitle }: { title: string; value: string; subtitle?: string }) {
  return (
    <div className="bg-gray-700 rounded-lg p-4">
      <h3 className="text-gray-400 text-sm font-medium mb-2">{title}</h3>
      <p className="text-2xl font-bold text-white mb-1">{value}</p>
      {subtitle && <p className="text-gray-400 text-sm">{subtitle}</p>}
    </div>
  );
}

