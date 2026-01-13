'use client';

import React, { useState, useEffect } from 'react';
import ZoneCard from './ZoneCard';

interface RecentSeries {
  id: string;
  winner_team_name: string;
  loser_team_name: string;
  winner_score: number;
  loser_score: number;
  completed_at: string;
}

interface TopPlayer {
  player_name: string;
  game_wins: number;
  series_wins: number;
}

export default function TripleThreatCard() {
  const [recentSeries, setRecentSeries] = useState<RecentSeries[]>([]);
  const [topPlayers, setTopPlayers] = useState<TopPlayer[]>([]);
  const [activeChallenges, setActiveChallenges] = useState(0);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchTTData = async () => {
      try {
        // Fetch recent series
        const seriesResponse = await fetch('/api/triple-threat/recent-series?limit=3');
        const seriesData = await seriesResponse.json();
        if (seriesData.series) {
          setRecentSeries(seriesData.series);
        }

        // Fetch top players
        const statsResponse = await fetch('/api/triple-threat/stats?type=top-game-wins&limit=5');
        const statsData = await statsResponse.json();
        if (statsData.players) {
          setTopPlayers(statsData.players);
        }

        // Note: Active challenges count would need auth, so showing static for now
        setActiveChallenges(0);
      } catch (error) {
        console.error('Failed to fetch Triple Threat data:', error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchTTData();
  }, []);

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
    });
  };

  return (
    <ZoneCard
      title="Triple Threat"
      icon="⚡"
      accentColor="orange"
      linkTo="/triple-threat"
      linkText="Enter Triple Threat"
    >
      {isLoading ? (
        <div className="animate-pulse space-y-3">
          <div className="h-4 bg-gray-700 rounded w-3/4"></div>
          <div className="h-4 bg-gray-700 rounded w-1/2"></div>
          <div className="h-4 bg-gray-700 rounded w-2/3"></div>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Recent Series */}
          {recentSeries.length > 0 && (
            <div>
              <h4 className="text-sm font-semibold text-gray-400 mb-2">Recent Series</h4>
              <div className="space-y-2">
                {recentSeries.map((series) => (
                  <div
                    key={series.id}
                    className="bg-gray-900/50 rounded-lg p-2 text-sm"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-green-400 font-medium truncate max-w-20">
                        {series.winner_team_name}
                      </span>
                      <span className="text-white font-bold">
                        {series.winner_score}-{series.loser_score}
                      </span>
                      <span className="text-red-400 truncate max-w-20">
                        {series.loser_team_name}
                      </span>
                    </div>
                    <div className="text-xs text-gray-500 text-center mt-1">
                      {formatDate(series.completed_at)}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Top Players */}
          {topPlayers.length > 0 && (
            <div className="pt-2 border-t border-gray-700/50">
              <h4 className="text-sm font-semibold text-gray-400 mb-2">Top Players</h4>
              <div className="space-y-1">
                {topPlayers.slice(0, 5).map((player, index) => (
                  <div
                    key={player.player_name}
                    className="flex items-center justify-between text-sm py-1"
                  >
                    <div className="flex items-center gap-2">
                      <span className={`font-bold ${index === 0 ? 'text-yellow-400' : index === 1 ? 'text-gray-300' : index === 2 ? 'text-orange-400' : 'text-gray-500'}`}>
                        #{index + 1}
                      </span>
                      <span className="text-white truncate max-w-32">{player.player_name}</span>
                    </div>
                    <span className="text-orange-400 font-medium">{player.game_wins} wins</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Quick Stats */}
          <div className="pt-2 border-t border-gray-700/50">
            <div className="grid grid-cols-2 gap-2 text-center">
              <div className="bg-gray-900/50 rounded-lg p-2">
                <div className="text-lg font-bold text-orange-400">3v3</div>
                <div className="text-xs text-gray-500">Format</div>
              </div>
              <div className="bg-gray-900/50 rounded-lg p-2">
                <div className="text-lg font-bold text-orange-400">Bo5</div>
                <div className="text-xs text-gray-500">Series</div>
              </div>
            </div>
          </div>

          {recentSeries.length === 0 && topPlayers.length === 0 && (
            <p className="text-gray-500 text-sm text-center py-4">
              No recent Triple Threat activity
            </p>
          )}
        </div>
      )}
    </ZoneCard>
  );
}
