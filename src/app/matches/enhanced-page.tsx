'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/lib/AuthContext';
import { supabase } from '@/lib/supabase';
import Navbar from '@/components/Navbar';
import Link from 'next/link';
import { toast } from 'react-hot-toast';

interface Match {
  id: string;
  title: string;
  description: string;
  scheduled_at: string;
  match_type: 'squad_vs_squad' | 'pickup' | 'tournament';
  status: 'scheduled' | 'in_progress' | 'completed' | 'cancelled' | 'expired' | 'auto_logged';
  squad_a_id?: string;
  squad_b_id?: string;
  squad_a_name?: string;
  squad_b_name?: string;
  squad_a_score?: number;
  squad_b_score?: number;
  winner_name?: string;
  winner_tag?: string;
  game_id?: string;
  vod_url?: string;
  vod_title?: string;
  actual_start_time?: string;
  actual_end_time?: string;
  match_notes?: string;
  created_by: string;
  created_by_alias: string;
  created_at: string;
  participants: MatchParticipant[];
  gameStats?: any;
}

interface MatchParticipant {
  id: string;
  player_id: string;
  in_game_alias: string;
  role: 'player' | 'commentator' | 'recording' | 'referee';
  squad_name?: string;
  joined_at: string;
}

interface UnlinkedGame {
  gameId: string;
  gameDate: string;
  arenaName: string;
  gameMode: string;
  players: string[];
}

export default function EnhancedMatchesPage() {
  const { user, loading } = useAuth();
  const [plannedMatches, setPlannedMatches] = useState<Match[]>([]);
  const [expiredMatches, setExpiredMatches] = useState<Match[]>([]);
  const [completedMatches, setCompletedMatches] = useState<Match[]>([]);
  const [autoLoggedMatches, setAutoLoggedMatches] = useState<Match[]>([]);
  const [unlinkedGames, setUnlinkedGames] = useState<UnlinkedGame[]>([]);
  
  const [isExpiredCollapsed, setIsExpiredCollapsed] = useState(true);
  const [isCompletedCollapsed, setIsCompletedCollapsed] = useState(false);
  const [isAutoLoggedCollapsed, setIsAutoLoggedCollapsed] = useState(true);
  const [isUnlinkedCollapsed, setIsUnlinkedCollapsed] = useState(true);
  
  const [dataLoading, setDataLoading] = useState(true);
  const [showVodModal, setShowVodModal] = useState(false);
  const [vodMatchId, setVodMatchId] = useState<string>('');
  const [vodUrl, setVodUrl] = useState('');
  const [vodTitle, setVodTitle] = useState('');
  const [showLinkModal, setShowLinkModal] = useState(false);
  const [linkMatchId, setLinkMatchId] = useState<string>('');
  const [suggestedGames, setSuggestedGames] = useState<any[]>([]);

  useEffect(() => {
    if (user) {
      loadInitialData();
    }
  }, [user]);

  const loadInitialData = async () => {
    setDataLoading(true);
    await Promise.allSettled([
      fetchPlannedMatches(),
      fetchExpiredMatches(),
      fetchCompletedMatches(),
      fetchAutoLoggedMatches(),
      fetchUnlinkedGames()
    ]);
    setDataLoading(false);
  };

  const fetchPlannedMatches = async () => {
    try {
      const response = await fetch('/api/matches?status=scheduled&limit=50');
      if (response.ok) {
        const data = await response.json();
        setPlannedMatches(data.matches || []);
      }
    } catch (error) {
      console.error('Error fetching planned matches:', error);
    }
  };

  const fetchExpiredMatches = async () => {
    try {
      const response = await fetch('/api/matches?status=expired&limit=20');
      if (response.ok) {
        const data = await response.json();
        setExpiredMatches(data.matches || []);
      }
    } catch (error) {
      console.error('Error fetching expired matches:', error);
    }
  };

  const fetchCompletedMatches = async () => {
    try {
      const response = await fetch('/api/matches?status=completed&includeStats=true&limit=30');
      if (response.ok) {
        const data = await response.json();
        setCompletedMatches(data.matches || []);
      }
    } catch (error) {
      console.error('Error fetching completed matches:', error);
    }
  };

  const fetchAutoLoggedMatches = async () => {
    try {
      const response = await fetch('/api/matches?status=auto_logged&includeStats=true&limit=50');
      if (response.ok) {
        const data = await response.json();
        setAutoLoggedMatches(data.matches || []);
      }
    } catch (error) {
      console.error('Error fetching auto-logged matches:', error);
    }
  };

  const fetchUnlinkedGames = async () => {
    try {
      const response = await fetch('/api/matches/auto-create');
      if (response.ok) {
        const data = await response.json();
        setUnlinkedGames(data.unlinkedGames || []);
      }
    } catch (error) {
      console.error('Error fetching unlinked games:', error);
    }
  };

  const autoCreateMatches = async () => {
    try {
      const response = await fetch('/api/matches/auto-create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
      });
      
      if (response.ok) {
        const data = await response.json();
        alert(`✅ Created ${data.matchesCreated} matches from unlinked games`);
        // Refresh data
        fetchAutoLoggedMatches();
        fetchUnlinkedGames();
      } else {
        const error = await response.json();
        alert(`❌ Error: ${error.error}`);
      }
    } catch (error) {
      console.error('Error auto-creating matches:', error);
      alert('❌ Error creating matches');
    }
  };

  const formatDateTime = (dateString: string) => {
    const date = new Date(dateString);
    return {
      date: date.toLocaleDateString(),
      time: date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'scheduled': return 'text-blue-400';
      case 'expired': return 'text-orange-400';
      case 'completed': return 'text-green-400';
      case 'cancelled': return 'text-red-400';
      default: return 'text-gray-400';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'scheduled': return '📅';
      case 'expired': return '⏰';
      case 'completed': return '✅';
      case 'cancelled': return '❌';
      default: return '❓';
    }
  };

  const updateMatchVod = async () => {
    if (!vodMatchId || !vodUrl) {
      toast.error('VOD URL is required');
      return;
    }

    try {
      const response = await fetch('/api/matches', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          matchId: vodMatchId,
          userId: user?.id,
          vodUrl,
          vodTitle: vodTitle || 'Match VOD'
        }),
      });

      if (response.ok) {
        toast.success('VOD added successfully!');
        setShowVodModal(false);
        setVodUrl('');
        setVodTitle('');
        setVodMatchId('');
        loadInitialData();
      } else {
        const errorData = await response.json();
        toast.error(errorData.error || 'Failed to add VOD');
      }
    } catch (error) {
      console.error('Error adding VOD:', error);
      toast.error('Failed to add VOD');
    }
  };

  const linkGameToMatch = async (gameId: string, matchId: string) => {
    try {
      const response = await fetch('/api/matches/link-game', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gameId, matchId, userId: user?.id }),
      });

      if (response.ok) {
        const data = await response.json();
        toast.success(data.message);
        setShowLinkModal(false);
        loadInitialData();
      } else {
        const errorData = await response.json();
        toast.error(errorData.error || 'Failed to link game');
      }
    } catch (error) {
      console.error('Error linking game:', error);
      toast.error('Failed to link game');
    }
  };

  const openLinkModal = async (matchId: string) => {
    setLinkMatchId(matchId);
    
    const match = [...plannedMatches, ...expiredMatches].find(m => m.id === matchId);
    if (match) {
      const matchDate = new Date(match.scheduled_at);
      const potentialGames = unlinkedGames.filter(game => {
        const gameDate = new Date(game.gameDate);
        const timeDiff = Math.abs(matchDate.getTime() - gameDate.getTime()) / (1000 * 60 * 60);
        return timeDiff <= 6;
      });
      setSuggestedGames(potentialGames);
    }
    
    setShowLinkModal(true);
  };

  if (loading || dataLoading) {
    return (
      <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center">
        <div className="text-center">
          <div className="text-2xl font-bold mb-4">Loading matches...</div>
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-cyan-400 mx-auto"></div>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-4">Please log in to view matches</h1>
          <a href="/auth/login" className="bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded">
            Login
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      <Navbar user={user} />
      <div className="max-w-7xl mx-auto p-6">
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-3xl font-bold">Enhanced Match System</h1>
          <Link 
            href="/matches" 
            className="bg-blue-600 hover:bg-blue-700 px-6 py-2 rounded"
          >
            Create New Match
          </Link>
        </div>

        {/* Three-Tier Match System */}
        
        {/* 1. PLANNED MATCHES - Active and upcoming */}
        {plannedMatches.length > 0 && (
          <div className="mb-8">
            <h2 className="text-2xl font-bold text-cyan-400 mb-6 flex items-center gap-3">
              📅 Planned Matches ({plannedMatches.length})
            </h2>
            <div className="grid gap-6">
              {plannedMatches.map((match) => {
                const { date, time } = formatDateTime(match.scheduled_at);
                const canModify = match.created_by === user?.id;
                
                return (
                  <div key={match.id} className="bg-gray-800 border border-cyan-500/30 rounded-lg p-6 hover:border-cyan-400/50 transition-all">
                    <div className="flex flex-col lg:flex-row lg:justify-between lg:items-start mb-4">
                      <div className="flex-1">
                        <Link href={`/matches/${match.id}`}>
                          <h3 className="text-xl font-bold mb-2 text-cyan-400 hover:text-cyan-300 cursor-pointer">{match.title}</h3>
                        </Link>
                        <p className="text-gray-300 mb-3">{match.description}</p>
                        <div className="flex flex-wrap gap-4 text-sm text-gray-400 mb-2">
                          <span>📅 {date} at {time}</span>
                          <span className={getStatusColor(match.status)}>
                            {getStatusIcon(match.status)} {match.status.toUpperCase()}
                          </span>
                          <span>🎯 {match.match_type.replace('_', ' ').toUpperCase()}</span>
                        </div>
                        {match.match_type === 'squad_vs_squad' && (
                          <div className="text-sm text-blue-400 mb-2">
                            {match.squad_a_name} vs {match.squad_b_name || 'TBD'}
                          </div>
                        )}
                        <div className="text-sm text-gray-500">Created by {match.created_by_alias}</div>
                      </div>
                      
                      <div className="flex flex-col gap-2 lg:ml-6 mt-4 lg:mt-0">
                        <Link 
                          href={`/matches/${match.id}`}
                          className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded text-sm text-center transition-colors"
                        >
                          📋 Manage
                        </Link>
                        {canModify && (
                          <button
                            onClick={() => openLinkModal(match.id)}
                            className="bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded text-sm transition-colors"
                          >
                            🔗 Link Game
                          </button>
                        )}
                      </div>
                    </div>
                    
                    {match.participants.length > 0 && (
                      <div className="border-t border-gray-700 pt-4">
                        <div className="text-sm text-gray-400 mb-2">
                          <span className="font-medium">Registered:</span> {match.participants.length} players
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {match.participants.slice(0, 6).map(p => (
                            <span key={p.id} className="bg-gray-700 px-2 py-1 rounded text-xs text-gray-300">
                              {p.in_game_alias}
                            </span>
                          ))}
                          {match.participants.length > 6 && (
                            <span className="text-xs text-gray-500">+{match.participants.length - 6} more</span>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* 2. EXPIRED MATCHES - Scheduled but past due */}
        {expiredMatches.length > 0 && (
          <div className="mb-8">
            <div 
              className="bg-gray-800/50 border border-orange-500/30 rounded-lg p-4 cursor-pointer hover:bg-gray-800/70 transition-all"
              onClick={() => setIsExpiredCollapsed(!isExpiredCollapsed)}
            >
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-bold text-orange-400 flex items-center gap-3">
                  <span className={`transition-transform duration-200 ${isExpiredCollapsed ? 'rotate(-90deg)' : 'rotate(0deg)'}`}>
                    ▼
                  </span>
                  ⏰ Expired Matches ({expiredMatches.length})
                </h2>
                <div className="text-gray-500 text-sm">
                  {isExpiredCollapsed ? 'Click to expand' : 'Click to collapse'}
                </div>
              </div>
              <p className="text-gray-400 text-sm mt-2">Matches that were scheduled but are now past their time</p>
            </div>
            
            {!isExpiredCollapsed && (
              <div className="mt-4 space-y-4">
                {expiredMatches.map((match) => {
                  const { date, time } = formatDateTime(match.scheduled_at);
                  const canModify = match.created_by === user?.id;
                  
                  return (
                    <div key={match.id} className="bg-gray-800/60 border border-orange-500/20 rounded-lg p-4 opacity-80">
                      <div className="flex flex-col lg:flex-row lg:justify-between lg:items-start">
                        <div className="flex-1">
                          <Link href={`/matches/${match.id}`}>
                            <h3 className="text-lg font-bold mb-2 text-orange-300 hover:text-orange-200 cursor-pointer">{match.title}</h3>
                          </Link>
                          <div className="flex flex-wrap gap-3 text-sm text-gray-400 mb-2">
                            <span>📅 {date} at {time}</span>
                            <span className="text-orange-400">⏰ EXPIRED</span>
                            <span>👥 {match.participants.length} registered</span>
                          </div>
                          <div className="text-sm text-gray-500">Created by {match.created_by_alias}</div>
                        </div>
                        
                        <div className="flex gap-2 mt-3 lg:mt-0 lg:ml-6">
                          <Link 
                            href={`/matches/${match.id}`}
                            className="bg-gray-600 hover:bg-gray-700 text-white px-3 py-1 rounded text-sm transition-colors"
                          >
                            📋 View
                          </Link>
                          {canModify && (
                            <button
                              onClick={() => openLinkModal(match.id)}
                              className="bg-purple-600 hover:bg-purple-700 text-white px-3 py-1 rounded text-sm transition-colors"
                            >
                              🔗 Link Game
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* 3. COMPLETED MATCHES - With actual game data */}
        {completedMatches.length > 0 && (
          <div className="mb-8">
            <div 
              className="bg-gray-800/50 border border-green-500/30 rounded-lg p-4 cursor-pointer hover:bg-gray-800/70 transition-all"
              onClick={() => setIsCompletedCollapsed(!isCompletedCollapsed)}
            >
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-bold text-green-400 flex items-center gap-3">
                  <span className={`transition-transform duration-200 ${isCompletedCollapsed ? 'rotate(-90deg)' : 'rotate(0deg)'}`}>
                    ▼
                  </span>
                  ✅ Completed Matches ({completedMatches.length})
                </h2>
                <div className="text-gray-500 text-sm">
                  {isCompletedCollapsed ? 'Click to expand' : 'Click to collapse'}
                </div>
              </div>
              <p className="text-gray-400 text-sm mt-2">Matches with actual game statistics and results</p>
            </div>
            
            {!isCompletedCollapsed && (
              <div className="mt-4 space-y-4">
                {completedMatches.map((match) => {
                  const { date, time } = formatDateTime(match.actual_start_time || match.scheduled_at);
                  const canModify = match.created_by === user?.id;
                  const hasStats = match.game_id && match.gameStats;
                  
                  return (
                    <div key={match.id} className="bg-gray-800 border border-green-500/30 rounded-lg p-6 hover:border-green-400/50 transition-all">
                      <div className="flex flex-col lg:flex-row lg:justify-between lg:items-start mb-4">
                        <div className="flex-1">
                          <Link href={`/matches/${match.id}`}>
                            <h3 className="text-xl font-bold mb-2 text-green-400 hover:text-green-300 cursor-pointer">{match.title}</h3>
                          </Link>
                          <div className="flex flex-wrap gap-4 text-sm text-gray-400 mb-3">
                            <span>📅 {date} at {time}</span>
                            <span className="text-green-400">✅ COMPLETED</span>
                            {match.game_id && <span className="text-blue-400">🎮 Game ID: {match.game_id}</span>}
                          </div>
                          
                          {/* Match Results */}
                          {match.squad_a_name && match.squad_b_name && (
                            <div className="bg-gray-700/50 rounded-lg p-3 mb-3">
                              <div className="text-lg font-bold text-center">
                                <span className={match.winner_name === match.squad_a_name ? 'text-green-400' : 'text-gray-300'}>
                                  {match.squad_a_name}
                                </span>
                                <span className="mx-4 text-gray-500">
                                  {match.squad_a_score || 0} - {match.squad_b_score || 0}
                                </span>
                                <span className={match.winner_name === match.squad_b_name ? 'text-green-400' : 'text-gray-300'}>
                                  {match.squad_b_name}
                                </span>
                              </div>
                              {match.winner_name && (
                                <div className="text-center text-sm text-green-400 mt-2">
                                  🏆 Winner: {match.winner_name}
                                </div>
                              )}
                            </div>
                          )}

                          {/* Game Stats Summary */}
                          {hasStats && match.gameStats.players && match.gameStats.players.length > 0 && (
                            <div className="bg-gray-700/30 rounded-lg p-3 mb-3">
                              <div className="flex items-center justify-between mb-2">
                                <span className="text-sm font-medium text-gray-300">🎮 Game Details</span>
                                <Link 
                                  href={`/stats/game/${encodeURIComponent(match.game_id!)}`}
                                  className="text-xs text-blue-400 hover:text-blue-300 transition-colors"
                                >
                                  View Full Stats →
                                </Link>
                              </div>
                              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                                <div>
                                  <span className="text-gray-400">Arena:</span>
                                  <div className="font-medium text-blue-400">
                                    {match.gameStats.players[0]?.arena_name || 'Unknown'}
                                  </div>
                                </div>
                                <div>
                                  <span className="text-gray-400">Mode:</span>
                                  <div className="font-medium text-purple-400">
                                    {match.gameStats.players[0]?.game_mode || 'Unknown'}
                                  </div>
                                </div>
                                <div>
                                  <span className="text-gray-400">Players:</span>
                                  <div className="font-medium text-cyan-400">{match.gameStats.players.length}</div>
                                </div>
                                <div>
                                  <span className="text-gray-400">Date:</span>
                                  <div className="font-medium text-yellow-400">
                                    {match.gameStats.players[0]?.game_date ? 
                                      new Date(match.gameStats.players[0].game_date).toLocaleDateString() : 
                                      'Unknown'
                                    }
                                  </div>
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                        
                        <div className="flex flex-col gap-2 lg:ml-6 mt-4 lg:mt-0">
                          <Link 
                            href={`/matches/${match.id}`}
                            className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded text-sm text-center transition-colors"
                          >
                            📊 Match Details
                          </Link>
                          {match.game_id && (
                            <Link 
                              href={`/stats/game/${encodeURIComponent(match.game_id)}`}
                              className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded text-sm text-center transition-colors"
                            >
                              🎮 Game Stats
                            </Link>
                          )}
                          {match.vod_url ? (
                            <a 
                              href={match.vod_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded text-sm text-center transition-colors"
                            >
                              📺 Watch VOD
                            </a>
                          ) : canModify && (
                            <button
                              onClick={() => {
                                setVodMatchId(match.id);
                                setShowVodModal(true);
                              }}
                              className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded text-sm transition-colors"
                            >
                              📹 Add VOD
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Team Breakdown for completed matches */}
                      {hasStats && match.gameStats.teams && (
                        <div className="border-t border-gray-700 pt-4">
                          <h4 className="font-semibold mb-3 text-gray-300">Team Performance</h4>
                          <div className="grid md:grid-cols-2 gap-4">
                            {Object.entries(match.gameStats.teams).map(([teamName, stats]: [string, any]) => (
                              <div key={teamName} className="bg-gray-700/30 rounded p-3">
                                <div className="font-medium text-blue-400 mb-2">{teamName}</div>
                                <div className="text-sm space-y-1">
                                  <div>Players: <span className="text-cyan-400">{stats.playerCount}</span></div>
                                  <div>Kills: <span className="text-red-400">{stats.totalKills}</span></div>
                                  <div>Deaths: <span className="text-gray-400">{stats.totalDeaths}</span></div>
                                  <div>K/D: <span className="text-yellow-400">{stats.avgKD?.toFixed(2) || '0.00'}</span></div>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* 4. AUTO-LOGGED MATCHES - Matches created from game stats */}
        {autoLoggedMatches.length > 0 && (
          <div className="mb-8">
            <div 
              className="bg-gray-800/50 border border-yellow-500/30 rounded-lg p-4 cursor-pointer hover:bg-gray-800/70 transition-all"
              onClick={() => setIsAutoLoggedCollapsed(!isAutoLoggedCollapsed)}
            >
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-bold text-yellow-400 flex items-center gap-3">
                  <span className={`transition-transform duration-200 ${isAutoLoggedCollapsed ? 'rotate(-90deg)' : 'rotate(0deg)'}`}>
                    ▼
                  </span>
                  📊 Auto-Logged Matches ({autoLoggedMatches.length})
                </h2>
                <div className="text-gray-500 text-sm">
                  {isAutoLoggedCollapsed ? 'Click to expand' : 'Click to collapse'}
                </div>
              </div>
              <p className="text-gray-400 text-sm mt-2">Matches automatically created from game statistics</p>
            </div>
            
            {!isAutoLoggedCollapsed && (
              <div className="mt-4 space-y-4">
                {autoLoggedMatches.map((match) => {
                  const { date, time } = formatDateTime(match.actual_start_time || match.scheduled_at);
                  const hasStats = match.game_id && match.gameStats;
                  
                  return (
                    <div key={match.id} className="bg-gray-800 border border-yellow-500/30 rounded-lg p-6 hover:border-yellow-400/50 transition-all">
                      <div className="flex flex-col lg:flex-row lg:justify-between lg:items-start mb-4">
                        <div className="flex-1">
                          <Link href={`/matches/${match.id}`}>
                            <h3 className="text-xl font-bold mb-2 text-yellow-400 hover:text-yellow-300 cursor-pointer">{match.title}</h3>
                          </Link>
                          <div className="flex flex-wrap gap-4 text-sm text-gray-400 mb-3">
                            <span>📅 {date} at {time}</span>
                            <span className="text-yellow-400">📊 AUTO-LOGGED</span>
                            {match.game_id && <span className="text-blue-400">🎮 Game ID: {match.game_id}</span>}
                          </div>
                          
                          {/* Match Results */}
                          {match.squad_a_name && match.squad_b_name && (
                            <div className="bg-gray-700/50 rounded-lg p-3 mb-3">
                              <div className="text-lg font-bold text-center">
                                <span className={match.winner_name === match.squad_a_name ? 'text-green-400' : 'text-gray-300'}>
                                  {match.squad_a_name}
                                </span>
                                <span className="mx-4 text-gray-500">
                                  {match.squad_a_score || 0} - {match.squad_b_score || 0}
                                </span>
                                <span className={match.winner_name === match.squad_b_name ? 'text-green-400' : 'text-gray-300'}>
                                  {match.squad_b_name}
                                </span>
                              </div>
                              {match.winner_name && (
                                <div className="text-center text-sm text-green-400 mt-2">
                                  🏆 Winner: {match.winner_name}
                                </div>
                              )}
                            </div>
                          )}

                          {/* Game Stats Summary */}
                          {hasStats && match.gameStats.players && match.gameStats.players.length > 0 && (
                            <div className="bg-gray-700/30 rounded-lg p-3 mb-3">
                              <div className="flex items-center justify-between mb-2">
                                <span className="text-sm font-medium text-gray-300">🎮 Game Details</span>
                                <Link 
                                  href={`/stats/game/${encodeURIComponent(match.game_id!)}`}
                                  className="text-xs text-blue-400 hover:text-blue-300 transition-colors"
                                >
                                  View Full Stats →
                                </Link>
                              </div>
                              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                                <div>
                                  <span className="text-gray-400">Arena:</span>
                                  <div className="font-medium text-blue-400">
                                    {match.gameStats.players[0]?.arena_name || 'Unknown'}
                                  </div>
                                </div>
                                <div>
                                  <span className="text-gray-400">Mode:</span>
                                  <div className="font-medium text-purple-400">
                                    {match.gameStats.players[0]?.game_mode || 'Unknown'}
                                  </div>
                                </div>
                                <div>
                                  <span className="text-gray-400">Players:</span>
                                  <div className="font-medium text-cyan-400">{match.gameStats.players.length}</div>
                                </div>
                                <div>
                                  <span className="text-gray-400">Date:</span>
                                  <div className="font-medium text-yellow-400">
                                    {match.gameStats.players[0]?.game_date ? 
                                      new Date(match.gameStats.players[0].game_date).toLocaleDateString() : 
                                      'Unknown'
                                    }
                                  </div>
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                        
                        <div className="flex flex-col gap-2 lg:ml-6 mt-4 lg:mt-0">
                          <Link 
                            href={`/matches/${match.id}`}
                            className="bg-yellow-600 hover:bg-yellow-700 text-white px-4 py-2 rounded text-sm text-center transition-colors"
                          >
                            📊 Match Details
                          </Link>
                          {match.game_id && (
                            <Link 
                              href={`/stats/game/${encodeURIComponent(match.game_id)}`}
                              className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded text-sm text-center transition-colors"
                            >
                              🎮 Game Stats
                            </Link>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* UNLINKED GAMES - Games without associated matches */}
        {unlinkedGames.length > 0 && (
          <div className="mb-8">
            <div 
              className="bg-gray-800/50 border border-purple-500/30 rounded-lg p-4 cursor-pointer hover:bg-gray-800/70 transition-all"
              onClick={() => setIsUnlinkedCollapsed(!isUnlinkedCollapsed)}
            >
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-bold text-purple-400 flex items-center gap-3">
                  <span className={`transition-transform duration-200 ${isUnlinkedCollapsed ? 'rotate(-90deg)' : 'rotate(0deg)'}`}>
                    ▼
                  </span>
                  🎮 Unlinked Games ({unlinkedGames.length})
                </h2>
                <div className="flex items-center gap-3">
                  {unlinkedGames.length > 0 && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        autoCreateMatches();
                      }}
                      className="bg-purple-600 hover:bg-purple-700 text-white px-3 py-1 rounded text-sm transition-colors"
                    >
                      ✨ Auto-Create Matches
                    </button>
                  )}
                  <div className="text-gray-500 text-sm">
                    {isUnlinkedCollapsed ? 'Click to expand' : 'Click to collapse'}
                  </div>
                </div>
              </div>
              <p className="text-gray-400 text-sm mt-2">Recent games that could be linked to matches</p>
            </div>
            
            {!isUnlinkedCollapsed && (
              <div className="mt-4 space-y-3">
                {unlinkedGames.map((game) => {
                  const { date, time } = formatDateTime(game.gameDate);
                  
                  return (
                    <div key={game.gameId} className="bg-gray-800/40 border border-purple-500/20 rounded-lg p-4">
                      <div className="flex flex-col lg:flex-row lg:justify-between lg:items-start">
                        <div className="flex-1">
                          <h3 className="text-lg font-bold mb-2 text-purple-400">Game: {game.gameId}</h3>
                          <div className="flex flex-wrap gap-4 text-sm text-gray-400 mb-2">
                            <span>📅 {date} at {time}</span>
                            <span>🏟️ {game.arenaName}</span>
                            <span>🎯 {game.gameMode}</span>
                            <span>👥 {game.players.length} players</span>
                          </div>
                          <div className="text-sm text-gray-500">
                            Players: {game.players.slice(0, 5).join(', ')}{game.players.length > 5 ? '...' : ''}
                          </div>
                        </div>
                        
                        <div className="flex gap-2 mt-3 lg:mt-0 lg:ml-6">
                          <Link 
                            href={`/stats?gameId=${game.gameId}`}
                            className="bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-1 rounded text-sm transition-colors"
                          >
                            📊 View Stats
                          </Link>
                          <button
                            onClick={() => {
                              setSuggestedGames([game]);
                              setShowLinkModal(true);
                            }}
                            className="bg-purple-600 hover:bg-purple-700 text-white px-3 py-1 rounded text-sm transition-colors"
                          >
                            🔗 Link to Match
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Empty States */}
        {plannedMatches.length === 0 && expiredMatches.length === 0 && completedMatches.length === 0 && unlinkedGames.length === 0 && (
          <div className="text-center py-12">
            <div className="text-6xl mb-4">🎮</div>
            <div className="text-xl text-gray-400 mb-4">No matches or games found</div>
            <div className="text-gray-500">
              Create a new match or play some games to see them here!
            </div>
          </div>
        )}
      </div>

      {/* VOD Modal */}
      {showVodModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-800 rounded-lg p-6 w-full max-w-md">
            <h3 className="text-xl font-bold mb-4">Add Match VOD</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">YouTube URL</label>
                <input
                  type="url"
                  value={vodUrl}
                  onChange={(e) => setVodUrl(e.target.value)}
                  placeholder="https://youtube.com/watch?v=..."
                  className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white focus:border-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">VOD Title (optional)</label>
                <input
                  type="text"
                  value={vodTitle}
                  onChange={(e) => setVodTitle(e.target.value)}
                  placeholder="Match Highlights"
                  className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white focus:border-blue-500"
                />
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button
                onClick={updateMatchVod}
                className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded transition-colors"
              >
                Add VOD
              </button>
              <button
                onClick={() => {
                  setShowVodModal(false);
                  setVodUrl('');
                  setVodTitle('');
                  setVodMatchId('');
                }}
                className="bg-gray-600 hover:bg-gray-700 text-white px-4 py-2 rounded transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Game Linking Modal */}
      {showLinkModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-800 rounded-lg p-6 w-full max-w-2xl max-h-[80vh] overflow-y-auto">
            <h3 className="text-xl font-bold mb-4">Link Game to Match</h3>
            
            {suggestedGames.length > 0 ? (
              <div className="space-y-3">
                <p className="text-gray-300 mb-4">Select a game to link:</p>
                {suggestedGames.map((game) => {
                  const { date, time } = formatDateTime(game.gameDate);
                  return (
                    <div key={game.gameId} className="bg-gray-700 rounded-lg p-4 hover:bg-gray-600 cursor-pointer transition-colors">
                      <div className="flex justify-between items-start">
                        <div className="flex-1">
                          <h4 className="font-bold text-purple-400">{game.gameId}</h4>
                          <div className="text-sm text-gray-400 mt-1">
                            📅 {date} at {time} • 🏟️ {game.arena} • 🎯 {game.gameMode} • 👥 {game.totalPlayers} players
                          </div>
                          <div className="text-sm text-gray-500 mt-1">
                            Teams: {game.teams.join(', ')}
                          </div>
                        </div>
                        <button
                          onClick={() => linkGameToMatch(game.gameId, linkMatchId)}
                          className="bg-purple-600 hover:bg-purple-700 text-white px-3 py-1 rounded text-sm transition-colors ml-4"
                        >
                          Link This Game
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="text-center py-8">
                <div className="text-gray-400 mb-4">No games found near the match time</div>
                <div className="text-sm text-gray-500">
                  Games are suggested based on timing proximity to the scheduled match
                </div>
              </div>
            )}
            
            <div className="flex justify-end mt-6">
              <button
                onClick={() => {
                  setShowLinkModal(false);
                  setLinkMatchId('');
                  setSuggestedGames([]);
                }}
                className="bg-gray-600 hover:bg-gray-700 text-white px-4 py-2 rounded transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
} 