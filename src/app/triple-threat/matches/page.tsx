'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';

interface Match {
  id: string;
  tournament_id: string | null;
  team1_id: string;
  team2_id: string;
  team1_name: string;
  team2_name: string;
  team1_banner: string | null;
  team2_banner: string | null;
  scheduled_time: string | null;
  status: string;
  winner_team_id: string | null;
  winner_team_name: string | null;
  match_type: string;
  round_name: string | null;
  tournament_name: string | null;
}

interface Tournament {
  id: string;
  tournament_name: string;
  description: string | null;
  start_date: string | null;
  end_date: string | null;
  status: string;
  max_teams: number;
  registration_deadline: string | null;
}

export default function TripleThreatMatchesPage() {
  const [matches, setMatches] = useState<Match[]>([]);
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedFilter, setSelectedFilter] = useState('all');

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      await Promise.all([
        loadMatches(),
        loadTournaments()
      ]);
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadMatches = async () => {
    try {
      const { data, error } = await supabase
        .from('tt_matches')
        .select(`
          id, tournament_id, team1_id, team2_id, scheduled_time, status, 
          winner_team_id, match_type, round_name,
          team1:tt_teams!tt_matches_team1_id_fkey(team_name, team_banner_url),
          team2:tt_teams!tt_matches_team2_id_fkey(team_name, team_banner_url),
          winner:tt_teams!tt_matches_winner_team_id_fkey(team_name),
          tournament:tt_tournaments(tournament_name)
        `)
        .order('scheduled_time', { ascending: false });

      if (error) throw error;

      const formattedMatches: Match[] = (data || []).map((match: any) => ({
        id: match.id,
        tournament_id: match.tournament_id,
        team1_id: match.team1_id,
        team2_id: match.team2_id,
        team1_name: match.team1?.team_name || 'Unknown Team',
        team2_name: match.team2?.team_name || 'Unknown Team',
        team1_banner: match.team1?.team_banner_url,
        team2_banner: match.team2?.team_banner_url,
        scheduled_time: match.scheduled_time,
        status: match.status,
        winner_team_id: match.winner_team_id,
        winner_team_name: match.winner?.team_name,
        match_type: match.match_type,
        round_name: match.round_name,
        tournament_name: match.tournament?.tournament_name
      }));

      setMatches(formattedMatches);
    } catch (error) {
      console.error('Error loading matches:', error);
    }
  };

  const loadTournaments = async () => {
    try {
      const { data, error } = await supabase
        .from('tt_tournaments')
        .select('*')
        .order('start_date', { ascending: false });

      if (error) throw error;
      setTournaments(data || []);
    } catch (error) {
      console.error('Error loading tournaments:', error);
    }
  };

  const groupMatchesByDate = (matches: Match[]) => {
    const grouped: { [key: string]: Match[] } = {};
    
    matches.forEach(match => {
      if (match.scheduled_time) {
        const date = new Date(match.scheduled_time).toDateString();
        if (!grouped[date]) {
          grouped[date] = [];
        }
        grouped[date].push(match);
      } else {
        // Group unscheduled matches
        const key = 'Unscheduled';
        if (!grouped[key]) {
          grouped[key] = [];
        }
        grouped[key].push(match);
      }
    });

    return grouped;
  };

  const filteredMatches = matches.filter(match => {
    if (selectedFilter === 'all') return true;
    if (selectedFilter === 'scheduled') return match.status === 'scheduled';
    if (selectedFilter === 'completed') return match.status === 'completed';
    if (selectedFilter === 'tournament') return match.match_type === 'tournament';
    if (selectedFilter === 'league') return match.match_type === 'league';
    return true;
  });

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'scheduled': return 'text-blue-400';
      case 'in_progress': return 'text-yellow-400';
      case 'completed': return 'text-green-400';
      case 'cancelled': return 'text-red-400';
      case 'disputed': return 'text-orange-400';
      default: return 'text-gray-400';
    }
  };

  const getStatusBadge = (status: string) => {
    const baseClasses = 'px-2 py-1 rounded-full text-xs font-medium';
    switch (status) {
      case 'scheduled': return `${baseClasses} bg-blue-600/20 text-blue-400`;
      case 'in_progress': return `${baseClasses} bg-yellow-600/20 text-yellow-400`;
      case 'completed': return `${baseClasses} bg-green-600/20 text-green-400`;
      case 'cancelled': return `${baseClasses} bg-red-600/20 text-red-400`;
      case 'disputed': return `${baseClasses} bg-orange-600/20 text-orange-400`;
      default: return `${baseClasses} bg-gray-600/20 text-gray-400`;
    }
  };

  const MatchCard = ({ match }: { match: Match }) => {
    const isCompleted = match.status === 'completed';
    
    return (
      <div className="bg-gradient-to-r from-gray-800/80 to-gray-700/80 border border-gray-600/50 rounded-xl p-6 hover:border-cyan-400/50 transition-all duration-300 backdrop-blur-sm">
        {/* Match Header */}
        <div className="flex justify-between items-start mb-4">
          <div>
            {match.tournament_name && (
              <div className="text-sm text-purple-400 mb-1">
                🏆 {match.tournament_name}
              </div>
            )}
            {match.round_name && (
              <div className="text-sm text-yellow-400 mb-1">
                📅 {match.round_name}
              </div>
            )}
            <div className="text-xs text-gray-400">
              {match.match_type === 'tournament' ? '🏆 Tournament' : '⚔️ League'}
            </div>
          </div>
          <div className={getStatusBadge(match.status)}>
            {match.status.replace('_', ' ').toUpperCase()}
          </div>
        </div>

        {/* Teams */}
        <div className="flex items-center justify-between mb-4">
          {/* Team 1 */}
          <div className="flex items-center space-x-3 flex-1">
            {match.team1_banner ? (
              <img 
                src={match.team1_banner} 
                alt={match.team1_name}
                className="w-12 h-12 rounded-lg object-cover border-2 border-gray-600"
              />
            ) : (
              <div className="w-12 h-12 rounded-lg bg-gray-600 flex items-center justify-center border-2 border-gray-600">
                <span className="text-xl">🛡️</span>
              </div>
            )}
            <div className="flex-1">
              <div className={`font-bold text-lg ${match.winner_team_id === match.team1_id ? 'text-green-400' : 'text-white'}`}>
                {match.team1_name}
              </div>
              {isCompleted && match.winner_team_id === match.team1_id && (
                <div className="text-xs text-green-400">👑 Winner</div>
              )}
            </div>
          </div>

          {/* VS */}
          <div className="mx-6">
            <div className="text-2xl font-bold text-cyan-400 text-center">
              VS
            </div>
            {match.scheduled_time && (
              <div className="text-xs text-gray-400 text-center mt-1">
                {new Date(match.scheduled_time).toLocaleTimeString([], { 
                  hour: '2-digit', 
                  minute: '2-digit' 
                })}
              </div>
            )}
          </div>

          {/* Team 2 */}
          <div className="flex items-center space-x-3 flex-1 flex-row-reverse">
            {match.team2_banner ? (
              <img 
                src={match.team2_banner} 
                alt={match.team2_name}
                className="w-12 h-12 rounded-lg object-cover border-2 border-gray-600"
              />
            ) : (
              <div className="w-12 h-12 rounded-lg bg-gray-600 flex items-center justify-center border-2 border-gray-600">
                <span className="text-xl">🛡️</span>
              </div>
            )}
            <div className="flex-1 text-right">
              <div className={`font-bold text-lg ${match.winner_team_id === match.team2_id ? 'text-green-400' : 'text-white'}`}>
                {match.team2_name}
              </div>
              {isCompleted && match.winner_team_id === match.team2_id && (
                <div className="text-xs text-green-400">👑 Winner</div>
              )}
            </div>
          </div>
        </div>

        {/* Match Footer */}
        <div className="border-t border-gray-600/50 pt-3">
          <div className="flex justify-between items-center text-sm text-gray-400">
            <div>
              {match.scheduled_time ? (
                new Date(match.scheduled_time).toLocaleDateString()
              ) : (
                'Unscheduled'
              )}
            </div>
            {isCompleted && match.winner_team_name && (
              <div className="text-green-400">
                🏆 {match.winner_team_name} wins
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-black text-white">
        <div className="flex items-center justify-center pt-20">
          <div className="text-xl animate-pulse">Loading matches...</div>
        </div>
      </div>
    );
  }

  const groupedMatches = groupMatchesByDate(filteredMatches);
  const hasMatches = Object.keys(groupedMatches).length > 0;

  return (
    <div className="min-h-screen bg-black text-white relative overflow-hidden">
      
      {/* Custom Triple Threat Header */}
      <header className="fixed top-0 left-0 right-0 z-50 bg-black/80 backdrop-blur-md border-b border-cyan-500/30">
        <div className="max-w-6xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <Link href="/triple-threat" className="flex items-center space-x-3 hover:opacity-80 transition-opacity">
              <div className="text-2xl font-black bg-gradient-to-r from-cyan-400 to-purple-400 bg-clip-text text-transparent">
                TRIPLE THREAT
              </div>
            </Link>
            <nav className="flex items-center space-x-6">
              <Link href="/triple-threat" className="text-gray-300 hover:text-white transition-colors">
                Home
              </Link>
              <Link href="/triple-threat/rules" className="text-gray-300 hover:text-white transition-colors">
                Rules
              </Link>
              <Link href="/triple-threat/signup" className="text-gray-300 hover:text-white transition-colors">
                Teams
              </Link>
              <Link href="/triple-threat/matches" className="text-cyan-300 hover:text-cyan-100 transition-colors font-medium">
                Matches
              </Link>
              <Link href="/" className="bg-gradient-to-r from-cyan-600 to-purple-600 hover:from-cyan-500 hover:to-purple-500 px-4 py-2 rounded-lg transition-all text-sm font-medium">
                ← Back to CTFPL
              </Link>
            </nav>
          </div>
        </div>
      </header>
      
      {/* Header */}
      <div className="bg-gradient-to-br from-blue-900 via-purple-900 to-gray-900 pt-20 pb-12">
        <div className="max-w-6xl mx-auto px-6">
          <div className="text-center">
            <h1 className="text-5xl font-bold mb-4 bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent">
              ⚔️ Match Schedule
            </h1>
            <p className="text-xl text-gray-300 max-w-3xl mx-auto">
              View upcoming matches, results, and tournament brackets for Triple Threat competitions
            </p>
          </div>
        </div>
      </div>

      {/* Quick Navigation Links */}
      <div className="max-w-6xl mx-auto px-6 -mt-6 relative z-10 mb-8">
        <div className="flex justify-center gap-4">
          <Link href="/triple-threat" className="bg-purple-600/20 border border-purple-500/30 px-4 py-2 rounded-lg hover:border-purple-400/50 transition-all">
            ← Back to Triple Threat
          </Link>
          <Link href="/triple-threat/rules" className="bg-yellow-600/20 border border-yellow-500/30 px-4 py-2 rounded-lg hover:border-yellow-400/50 transition-all">
            📜 Rules
          </Link>
          <Link href="/triple-threat/signup" className="bg-blue-600/20 border border-blue-500/30 px-4 py-2 rounded-lg hover:border-blue-400/50 transition-all">
            🛡️ Team Signup
          </Link>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-6 pb-20">
        
        {/* Tournament Overview */}
        {tournaments.length > 0 && (
          <div className="bg-gray-800/50 border border-gray-700/50 rounded-xl p-6 mb-8">
            <h2 className="text-2xl font-bold text-purple-400 mb-4">🏆 Active Tournaments</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {tournaments.slice(0, 6).map((tournament) => (
                <div key={tournament.id} className="bg-gray-700/30 border border-gray-600/50 rounded-lg p-4">
                  <h3 className="font-bold text-white mb-2">{tournament.tournament_name}</h3>
                  <p className="text-sm text-gray-400 mb-2">
                    Max Teams: {tournament.max_teams}
                  </p>
                  <div className={`text-sm ${getStatusColor(tournament.status)}`}>
                    {tournament.status.replace('_', ' ').toUpperCase()}
                  </div>
                  {tournament.start_date && (
                    <div className="text-xs text-gray-500 mt-1">
                      {new Date(tournament.start_date).toLocaleDateString()}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Filter Controls */}
        <div className="bg-gray-800/50 border border-gray-700/50 rounded-xl p-4 mb-8">
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setSelectedFilter('all')}
              className={`px-4 py-2 rounded-lg transition-colors ${
                selectedFilter === 'all' 
                  ? 'bg-cyan-600 text-white' 
                  : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
              }`}
            >
              All Matches
            </button>
            <button
              onClick={() => setSelectedFilter('scheduled')}
              className={`px-4 py-2 rounded-lg transition-colors ${
                selectedFilter === 'scheduled' 
                  ? 'bg-blue-600 text-white' 
                  : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
              }`}
            >
              Scheduled
            </button>
            <button
              onClick={() => setSelectedFilter('completed')}
              className={`px-4 py-2 rounded-lg transition-colors ${
                selectedFilter === 'completed' 
                  ? 'bg-green-600 text-white' 
                  : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
              }`}
            >
              Completed
            </button>
            <button
              onClick={() => setSelectedFilter('tournament')}
              className={`px-4 py-2 rounded-lg transition-colors ${
                selectedFilter === 'tournament' 
                  ? 'bg-purple-600 text-white' 
                  : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
              }`}
            >
              Tournament
            </button>
            <button
              onClick={() => setSelectedFilter('league')}
              className={`px-4 py-2 rounded-lg transition-colors ${
                selectedFilter === 'league' 
                  ? 'bg-yellow-600 text-white' 
                  : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
              }`}
            >
              League
            </button>
          </div>
        </div>

        {/* Matches Display */}
        {!hasMatches ? (
          <div className="text-center py-20">
            <div className="text-6xl mb-4">⚔️</div>
            <h2 className="text-2xl font-bold text-gray-400 mb-4">No Matches Found</h2>
            <p className="text-gray-500 mb-8">
              {selectedFilter === 'all' 
                ? 'No matches have been scheduled yet.' 
                : `No ${selectedFilter} matches found.`}
            </p>
            <Link 
              href="/triple-threat/signup" 
              className="bg-blue-600 hover:bg-blue-700 px-6 py-3 rounded-lg transition-colors"
            >
              Create a Team to Get Started
            </Link>
          </div>
        ) : (
          <div className="space-y-8">
            {Object.entries(groupedMatches).map(([date, dayMatches]) => (
              <div key={date}>
                <h2 className="text-2xl font-bold text-cyan-400 mb-4 flex items-center">
                  <span className="mr-3">📅</span>
                  {date}
                  <span className="ml-3 text-sm text-gray-400 font-normal">
                    ({dayMatches.length} match{dayMatches.length !== 1 ? 'es' : ''})
                  </span>
                </h2>
                <div className="grid grid-cols-1 gap-4">
                  {dayMatches.map((match) => (
                    <MatchCard key={match.id} match={match} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Call to Action */}
        {hasMatches && (
          <div className="text-center mt-16 p-8 bg-gradient-to-r from-purple-900/30 to-blue-900/30 border border-purple-500/30 rounded-xl">
            <h3 className="text-2xl font-bold text-white mb-4">Ready to Compete?</h3>
            <p className="text-gray-300 mb-6">
              Join the Triple Threat league and face off against the best teams in Infantry.
            </p>
            <Link 
              href="/triple-threat/signup" 
              className="bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-500 hover:to-blue-500 px-8 py-3 rounded-lg transition-all font-bold"
            >
              Create or Join a Team
            </Link>
          </div>
        )}

      </div>
    </div>
  );
}
