'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

interface SeriesInfo {
  series_id: string;
  game_count: number;
  first_game_date: string;
  winning_team: string;
  losing_team: string;
  winning_players: string[];
  losing_players: string[];
  series_type: string;
}

export default function RecentSeriesList() {
  const [series, setSeries] = useState<SeriesInfo[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadRecentSeries();
  }, []);

  const loadRecentSeries = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/triple-threat/recent-series?limit=10');
      const data = await response.json();
      
      if (data.success) {
        setSeries(data.series || []);
      }
    } catch (error) {
      console.error('Error loading recent series:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  if (loading) {
    return (
      <div className="bg-gradient-to-br from-gray-800/80 to-gray-900/80 backdrop-blur-sm border border-gray-700 rounded-lg p-6">
        <h2 className="text-2xl font-bold text-white mb-4">Recent Series</h2>
        <div className="text-center py-8 text-gray-400">Loading series...</div>
      </div>
    );
  }

  if (series.length === 0) {
    return (
      <div className="bg-gradient-to-br from-gray-800/80 to-gray-900/80 backdrop-blur-sm border border-gray-700 rounded-lg p-6">
        <h2 className="text-2xl font-bold text-white mb-4">Recent Series</h2>
        <div className="text-center py-8 text-gray-400">
          No series recorded yet. Play a best-of match to see it here!
        </div>
      </div>
    );
  }

  return (
    <div className="bg-gradient-to-br from-gray-800/80 to-gray-900/80 backdrop-blur-sm border border-gray-700 rounded-lg p-6">
      <h2 className="text-2xl font-bold text-white mb-4">Recent Series</h2>
      
      {/* Excel-like table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-600">
              <th className="text-left py-2 px-3 font-semibold text-gray-300">Winning Team</th>
              <th className="text-left py-2 px-3 font-semibold text-gray-300">Losing Team</th>
              <th className="text-center py-2 px-3 font-semibold text-gray-300">Type</th>
              <th className="text-center py-2 px-3 font-semibold text-gray-300">Date</th>
              <th className="w-8"></th>
            </tr>
          </thead>
          <tbody>
            {series.map((s, idx) => (
              <tr 
                key={s.series_id}
                className={`border-b border-gray-700/50 hover:bg-gray-700/30 transition-colors ${
                  idx % 2 === 0 ? 'bg-gray-800/20' : 'bg-transparent'
                }`}
              >
                <td className="py-1.5 px-3">
                  <div className="flex items-center gap-2">
                    <span className="text-green-400 font-medium">✓</span>
                    <span className="text-white text-xs">
                      {s.winning_players && s.winning_players.length > 0 
                        ? s.winning_players.join(', ')
                        : s.winning_team || 'Unknown'}
                    </span>
                  </div>
                </td>
                <td className="py-1.5 px-3">
                  <span className="text-gray-400 text-xs">
                    {s.losing_players && s.losing_players.length > 0
                      ? s.losing_players.join(', ')
                      : s.losing_team || 'Unknown'}
                  </span>
                </td>
                <td className="py-1.5 px-3 text-center">
                  <span className="inline-block bg-cyan-900/40 text-cyan-300 px-2 py-0.5 rounded text-xs font-medium">
                    {s.series_type || 'N/A'}
                  </span>
                </td>
                <td className="py-1.5 px-3 text-center text-gray-400 text-xs">
                  {formatDate(s.first_game_date)}
                </td>
                <td className="py-1.5 px-2 text-center">
                  <Link
                    href={`/triple-threat/series/${s.series_id}`}
                    className="text-cyan-400 hover:text-cyan-300 transition-colors inline-block"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

