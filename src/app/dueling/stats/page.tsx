'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';
import Link from 'next/link';
import { toast } from 'react-hot-toast';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

interface DuelingStats {
  id: string;
  player_id: string;
  player_alias: string;
  total_duels: number;
  total_wins: number;
  total_losses: number;
  win_rate: number;
  pickup_duels: number;
  pickup_wins: number;
  pickup_losses: number;
  pickup_win_rate: number;
  tournament_duels: number;
  tournament_wins: number;
  tournament_losses: number;
  tournament_win_rate: number;
  tournaments_entered: number;
  tournaments_won: number;
  tournaments_runner_up: number;
  tournaments_top_3: number;
  current_win_streak: number;
  longest_win_streak: number;
  current_loss_streak: number;
  longest_loss_streak: number;
  first_duel_date: string;
  last_duel_date: string;
}

interface RecentDuel {
  id: string;
  duel_id: string;
  player1_alias: string;
  player2_alias: string;
  winner_alias: string;
  loser_alias: string;
  duel_type: string;
  arena_name: string;
  player1_score: number;
  player2_score: number;
  duel_date: string;
  duel_length_minutes: number;
}

export default function DuelingStatsPage() {
  const [duelingStats, setDuelingStats] = useState<DuelingStats[]>([]);
  const [recentDuels, setRecentDuels] = useState<RecentDuel[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'rankings' | 'recent' | 'head-to-head'>('rankings');
  const [sortBy, setSortBy] = useState<'win_rate' | 'total_duels' | 'total_wins' | 'tournaments_won'>('win_rate');
  const [filterType, setFilterType] = useState<'all' | 'pickup' | 'tournament'>('all');

  useEffect(() => {
    fetchDuelingStats();
    fetchRecentDuels();
  }, []);

  const fetchDuelingStats = async () => {
    try {
      // Check if dueling tables exist first
      const { data: tables, error: tableError } = await supabase
        .from('information_schema.tables')
        .select('table_name')
        .eq('table_schema', 'public')
        .eq('table_name', 'dueling_aggregate_stats');

      if (tableError || !tables || tables.length === 0) {
        // Tables don't exist yet, show placeholder data
        console.log('Dueling tables not yet created');
        setDuelingStats([]);
        return;
      }

      const { data, error } = await supabase
        .from('dueling_aggregate_stats')
        .select('*')
        .order(sortBy, { ascending: false })
        .limit(50);

      if (error) throw error;
      setDuelingStats(data || []);
    } catch (error: any) {
      console.error('Error fetching dueling stats:', error);
      // Don't show error toast if tables don't exist yet
      if (!error.message?.includes('relation') && !error.message?.includes('does not exist')) {
        toast.error('Failed to fetch dueling statistics');
      }
    }
  };

  const fetchRecentDuels = async () => {
    try {
      // Check if dueling tables exist first
      const { data: tables, error: tableError } = await supabase
        .from('information_schema.tables')
        .select('table_name')
        .eq('table_schema', 'public')
        .eq('table_name', 'dueling_stats');

      if (tableError || !tables || tables.length === 0) {
        console.log('Dueling stats table not yet created');
        setRecentDuels([]);
        return;
      }

      const { data, error } = await supabase
        .from('dueling_stats')
        .select('*')
        .order('duel_date', { ascending: false })
        .limit(20);

      if (error) throw error;
      setRecentDuels(data || []);
    } catch (error: any) {
      console.error('Error fetching recent duels:', error);
      if (!error.message?.includes('relation') && !error.message?.includes('does not exist')) {
        toast.error('Failed to fetch recent duels');
      }
    } finally {
      setLoading(false);
    }
  };

  const generateSampleStats = (): DuelingStats[] => {
    // Generate sample data for demonstration
    const samplePlayers = [
      'Shadowblade', 'Lightspeed', 'Quantum', 'Phoenix', 'Vortex', 
      'Eclipse', 'Storm', 'Blaze', 'Frost', 'Thunder'
    ];

    return samplePlayers.map((alias, index) => ({
      id: `sample-${index}`,
      player_id: `player-${index}`,
      player_alias: alias,
      total_duels: Math.floor(Math.random() * 50) + 10,
      total_wins: 0,
      total_losses: 0,
      win_rate: Math.random() * 0.4 + 0.3, // 30-70% win rate
      pickup_duels: Math.floor(Math.random() * 30) + 5,
      pickup_wins: 0,
      pickup_losses: 0,
      pickup_win_rate: Math.random() * 0.4 + 0.3,
      tournament_duels: Math.floor(Math.random() * 20),
      tournament_wins: 0,
      tournament_losses: 0,
      tournament_win_rate: Math.random() * 0.4 + 0.4,
      tournaments_entered: Math.floor(Math.random() * 8) + 1,
      tournaments_won: Math.floor(Math.random() * 3),
      tournaments_runner_up: Math.floor(Math.random() * 2),
      tournaments_top_3: Math.floor(Math.random() * 4) + 1,
      current_win_streak: Math.floor(Math.random() * 8),
      longest_win_streak: Math.floor(Math.random() * 15) + 3,
      current_loss_streak: Math.floor(Math.random() * 3),
      longest_loss_streak: Math.floor(Math.random() * 8) + 1,
      first_duel_date: new Date(2025, 0, Math.floor(Math.random() * 30) + 1).toISOString(),
      last_duel_date: new Date().toISOString(),
    })).map(stat => ({
      ...stat,
      total_wins: Math.floor(stat.total_duels * stat.win_rate),
      total_losses: stat.total_duels - Math.floor(stat.total_duels * stat.win_rate),
      pickup_wins: Math.floor(stat.pickup_duels * stat.pickup_win_rate),
      pickup_losses: stat.pickup_duels - Math.floor(stat.pickup_duels * stat.pickup_win_rate),
      tournament_wins: Math.floor(stat.tournament_duels * stat.tournament_win_rate),
      tournament_losses: stat.tournament_duels - Math.floor(stat.tournament_duels * stat.tournament_win_rate),
    }));
  };

  const generateSampleDuels = (): RecentDuel[] => {
    const players = ['Shadowblade', 'Lightspeed', 'Quantum', 'Phoenix', 'Vortex'];
    const arenas = ['Duel Arena 1', 'Combat Zone', 'Battle Chamber', 'Training Grounds'];
    
    return Array.from({ length: 10 }, (_, index) => {
      const player1 = players[Math.floor(Math.random() * players.length)];
      let player2 = players[Math.floor(Math.random() * players.length)];
      while (player2 === player1) {
        player2 = players[Math.floor(Math.random() * players.length)];
      }
      
      const winner = Math.random() > 0.5 ? player1 : player2;
      const loser = winner === player1 ? player2 : player1;
      const winnerScore = Math.floor(Math.random() * 3) + 8;
      const loserScore = Math.floor(Math.random() * winnerScore);
      
      return {
        id: `duel-${index}`,
        duel_id: `duel_${Date.now()}_${index}`,
        player1_alias: player1,
        player2_alias: player2,
        winner_alias: winner,
        loser_alias: loser,
        duel_type: Math.random() > 0.7 ? 'tournament' : 'pickup',
        arena_name: arenas[Math.floor(Math.random() * arenas.length)],
        player1_score: player1 === winner ? winnerScore : loserScore,
        player2_score: player2 === winner ? winnerScore : loserScore,
        duel_date: new Date(Date.now() - Math.random() * 7 * 24 * 60 * 60 * 1000).toISOString(),
        duel_length_minutes: Math.random() * 10 + 2,
      };
    });
  };

  const displayStats = duelingStats.length > 0 ? duelingStats : generateSampleStats();
  const displayDuels = recentDuels.length > 0 ? recentDuels : generateSampleDuels();

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-cyan-500 mx-auto"></div>
          <p className="text-white mt-4 text-lg">Loading dueling statistics...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900">
      {/* Header */}
      <div className="bg-gray-800/50 border-b border-gray-700">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="py-6">
            <div className="flex items-center justify-between">
              <div>
                <div className="flex items-center gap-4">
                  <Link 
                    href="/dueling"
                    className="text-cyan-400 hover:text-cyan-300 transition-colors"
                  >
                    ← Back to Dueling
                  </Link>
                </div>
                <h1 className="text-3xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-purple-400 mt-2">
                  📊 Dueling Statistics
                </h1>
                <p className="text-gray-400 mt-2">Player rankings, records, and match history</p>
              </div>
              <div className="text-right">
                {duelingStats.length === 0 && (
                  <div className="bg-yellow-600/20 border border-yellow-500 rounded-lg p-3">
                    <p className="text-yellow-300 text-sm font-bold">📋 Sample Data</p>
                    <p className="text-yellow-400 text-xs">Showing demonstration data. Run setup-dueling-system.sql to enable real tracking.</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Navigation Tabs */}
        <div className="bg-gray-800/30 border border-gray-700 rounded-xl p-6 mb-8">
          <div className="flex flex-wrap gap-4 mb-6">
            {[
              { id: 'rankings', label: '🏆 Rankings', icon: '🏆' },
              { id: 'recent', label: '⚔️ Recent Duels', icon: '⚔️' },
              { id: 'head-to-head', label: '🤝 Head-to-Head', icon: '🤝' }
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`px-6 py-3 rounded-lg font-bold transition-all duration-300 ${
                  activeTab === tab.id
                    ? 'bg-gradient-to-r from-cyan-600 to-purple-600 text-white'
                    : 'bg-gray-700/50 text-gray-300 hover:bg-gray-600/50'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Filters */}
          {activeTab === 'rankings' && (
            <div className="flex flex-wrap gap-4">
              <div>
                <label className="block text-sm text-gray-400 mb-1">Sort By</label>
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as any)}
                  className="bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm"
                >
                  <option value="win_rate">Win Rate</option>
                  <option value="total_duels">Total Duels</option>
                  <option value="total_wins">Total Wins</option>
                  <option value="tournaments_won">Tournament Wins</option>
                </select>
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1">Filter</label>
                <select
                  value={filterType}
                  onChange={(e) => setFilterType(e.target.value as any)}
                  className="bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm"
                >
                  <option value="all">All Duels</option>
                  <option value="pickup">Pickup Only</option>
                  <option value="tournament">Tournament Only</option>
                </select>
              </div>
            </div>
          )}
        </div>

        {/* Tab Content */}
        {activeTab === 'rankings' && (
          <div className="bg-gray-800/30 border border-gray-700 rounded-xl p-6">
            <h2 className="text-2xl font-bold text-cyan-400 mb-6">🏆 Player Rankings</h2>
            
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-700">
                    <th className="text-left py-3 text-gray-400 font-bold">Rank</th>
                    <th className="text-left py-3 text-gray-400 font-bold">Player</th>
                    <th className="text-center py-3 text-gray-400 font-bold">Duels</th>
                    <th className="text-center py-3 text-gray-400 font-bold">W-L</th>
                    <th className="text-center py-3 text-gray-400 font-bold">Win Rate</th>
                    <th className="text-center py-3 text-gray-400 font-bold">Pickup W-L</th>
                    <th className="text-center py-3 text-gray-400 font-bold">Tournament W-L</th>
                    <th className="text-center py-3 text-gray-400 font-bold">Tournaments</th>
                    <th className="text-center py-3 text-gray-400 font-bold">Streak</th>
                  </tr>
                </thead>
                <tbody>
                  {displayStats
                    .sort((a, b) => {
                      switch (sortBy) {
                        case 'win_rate': return b.win_rate - a.win_rate;
                        case 'total_duels': return b.total_duels - a.total_duels;
                        case 'total_wins': return b.total_wins - a.total_wins;
                        case 'tournaments_won': return b.tournaments_won - a.tournaments_won;
                        default: return b.win_rate - a.win_rate;
                      }
                    })
                    .map((stat, index) => (
                    <tr key={stat.id} className="border-b border-gray-700/50 hover:bg-gray-700/20">
                      <td className="py-3">
                        <div className="flex items-center">
                          {index < 3 && (
                            <span className="mr-2">
                              {index === 0 ? '🥇' : index === 1 ? '🥈' : '🥉'}
                            </span>
                          )}
                          <span className="font-bold text-cyan-400">#{index + 1}</span>
                        </div>
                      </td>
                      <td className="py-3">
                        <span className="font-mono font-bold text-white">{stat.player_alias}</span>
                      </td>
                      <td className="py-3 text-center text-gray-300">{stat.total_duels}</td>
                      <td className="py-3 text-center">
                        <span className="text-green-400">{stat.total_wins}</span>
                        <span className="text-gray-500">-</span>
                        <span className="text-red-400">{stat.total_losses}</span>
                      </td>
                      <td className="py-3 text-center">
                        <span className={`font-bold ${
                          stat.win_rate >= 0.6 ? 'text-green-400' :
                          stat.win_rate >= 0.4 ? 'text-yellow-400' :
                          'text-red-400'
                        }`}>
                          {(stat.win_rate * 100).toFixed(1)}%
                        </span>
                      </td>
                      <td className="py-3 text-center text-gray-300">
                        {stat.pickup_wins}-{stat.pickup_losses}
                      </td>
                      <td className="py-3 text-center text-gray-300">
                        {stat.tournament_wins}-{stat.tournament_losses}
                      </td>
                      <td className="py-3 text-center">
                        <div className="text-xs text-gray-400">
                          <div>{stat.tournaments_won}🏆 {stat.tournaments_runner_up}🥈</div>
                          <div>{stat.tournaments_entered} entered</div>
                        </div>
                      </td>
                      <td className="py-3 text-center">
                        {stat.current_win_streak > 0 ? (
                          <span className="text-green-400 font-bold">W{stat.current_win_streak}</span>
                        ) : stat.current_loss_streak > 0 ? (
                          <span className="text-red-400 font-bold">L{stat.current_loss_streak}</span>
                        ) : (
                          <span className="text-gray-500">-</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeTab === 'recent' && (
          <div className="bg-gray-800/30 border border-gray-700 rounded-xl p-6">
            <h2 className="text-2xl font-bold text-purple-400 mb-6">⚔️ Recent Duels</h2>
            
            <div className="space-y-4">
              {displayDuels.map((duel) => (
                <div key={duel.id} className="bg-gray-700/30 border border-gray-600 rounded-lg p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className="text-center">
                        <div className={`font-mono font-bold ${
                          duel.winner_alias === duel.player1_alias ? 'text-green-400' : 'text-gray-400'
                        }`}>
                          {duel.player1_alias}
                        </div>
                        <div className="text-xs text-gray-500">vs</div>
                        <div className={`font-mono font-bold ${
                          duel.winner_alias === duel.player2_alias ? 'text-green-400' : 'text-gray-400'
                        }`}>
                          {duel.player2_alias}
                        </div>
                      </div>
                      
                      <div className="text-center">
                        <div className="text-lg font-bold text-white">
                          {duel.player1_score} - {duel.player2_score}
                        </div>
                        <div className="text-xs text-green-400 font-bold">
                          {duel.winner_alias} wins
                        </div>
                      </div>
                    </div>
                    
                    <div className="text-right text-xs text-gray-400">
                      <div className="flex items-center gap-2 mb-1">
                        <span className={`px-2 py-1 rounded text-xs font-bold ${
                          duel.duel_type === 'tournament' 
                            ? 'bg-purple-600/20 text-purple-300' 
                            : 'bg-blue-600/20 text-blue-300'
                        }`}>
                          {duel.duel_type.toUpperCase()}
                        </span>
                      </div>
                      <div>{duel.arena_name}</div>
                      <div>{new Date(duel.duel_date).toLocaleDateString()}</div>
                      <div>{duel.duel_length_minutes.toFixed(1)} min</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === 'head-to-head' && (
          <div className="bg-gray-800/30 border border-gray-700 rounded-xl p-6">
            <h2 className="text-2xl font-bold text-yellow-400 mb-6">🤝 Head-to-Head Records</h2>
            
            <div className="text-center py-12 text-gray-500">
              <div className="text-6xl mb-4">🔜</div>
              <p className="text-lg">Head-to-head comparison tool coming soon!</p>
              <p className="text-sm text-gray-400 mt-2">
                Select two players to see their complete match history and statistics against each other.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
} 