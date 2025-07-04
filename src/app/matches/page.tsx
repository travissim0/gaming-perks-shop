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
  game_mode?: string;
  map_name?: string;
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

interface Squad {
  id: string;
  name: string;
  tag: string;
}

interface UserSquad {
  id: string;
  name: string;
  tag: string;
  role: string;
}

interface UnlinkedGame {
  gameId: string;
  gameDate: string;
  arena: string;
  gameMode: string;
  totalPlayers: number;
  teams: string[];
}

export default function MatchesPage() {
  const { user, loading } = useAuth();
  const [plannedMatches, setPlannedMatches] = useState<Match[]>([]);
  const [expiredMatches, setExpiredMatches] = useState<Match[]>([]);
  const [completedMatches, setCompletedMatches] = useState<Match[]>([]);
  const [autoLoggedMatches, setAutoLoggedMatches] = useState<Match[]>([]);
  const [unlinkedGames, setUnlinkedGames] = useState<UnlinkedGame[]>([]);
  
  const [isExpiredCollapsed, setIsExpiredCollapsed] = useState(true);
  const [isCompletedCollapsed, setIsCompletedCollapsed] = useState(false);
  const [isAutoLoggedCollapsed, setIsAutoLoggedCollapsed] = useState(false);
  const [isUnlinkedCollapsed, setIsUnlinkedCollapsed] = useState(true);
  
  const [userSquad, setUserSquad] = useState<UserSquad | null>(null);
  const [allSquads, setAllSquads] = useState<Squad[]>([]);
  const [dataLoading, setDataLoading] = useState(true);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [selectedMatch, setSelectedMatch] = useState<Match | null>(null);
  const [showParticipantModal, setShowParticipantModal] = useState(false);
  const [selectedRole, setSelectedRole] = useState<'player' | 'commentator' | 'recording' | 'referee'>('player');
  const [allowMultipleRoles, setAllowMultipleRoles] = useState(false);
  const [selectedMatchId, setSelectedMatchId] = useState<string>('');

  // Form states
  const [matchTitle, setMatchTitle] = useState('');
  const [matchDescription, setMatchDescription] = useState('');
  const [scheduledDate, setScheduledDate] = useState('');
  const [scheduledTime, setScheduledTime] = useState('');
  const [matchType, setMatchType] = useState<'squad_vs_squad' | 'pickup' | 'tournament'>('pickup');
  const [selectedSquadB, setSelectedSquadB] = useState('');

  // VOD management states
  const [showVodModal, setShowVodModal] = useState(false);
  const [vodMatchId, setVodMatchId] = useState<string>('');
  const [vodUrl, setVodUrl] = useState('');
  const [vodTitle, setVodTitle] = useState('');

  // Game linking states
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
    
    const promises = [
      fetchPlannedMatches().catch(error => {
        console.error('Error fetching planned matches:', error);
        setPlannedMatches([]);
      }),
      fetchExpiredMatches().catch(error => {
        console.error('Error fetching expired matches:', error);
        setExpiredMatches([]);
      }),
      fetchCompletedMatches().catch(error => {
        console.error('Error fetching completed matches:', error);
        setCompletedMatches([]);
      }),
      fetchAutoLoggedMatches().catch((error: any) => {
        console.error('Error fetching auto-logged matches:', error);
        setAutoLoggedMatches([]);
      }),
      fetchUnlinkedGames().catch(error => {
        console.error('Error fetching unlinked games:', error);
        setUnlinkedGames([]);
      }),
      fetchUserSquad().catch(error => {
        console.error('Error fetching user squad:', error);
        setUserSquad(null);
      }),
      fetchAllSquads().catch(error => {
        console.error('Error fetching all squads:', error);
        setAllSquads([]);
      })
    ];
    
    await Promise.allSettled(promises);
    setDataLoading(false);
  };

  // Set default date and time when create form is opened
  useEffect(() => {
    if (showCreateForm && !scheduledDate) {
      // Set default date to today
      const today = new Date();
      const todayString = today.toISOString().split('T')[0];
      setScheduledDate(todayString);
      
      // Set default time to 9 PM EST (21:00)
      setScheduledTime('21:00');
    }
  }, [showCreateForm, scheduledDate]);

  const fetchPlannedMatches = async () => {
    try {
      const response = await fetch('/api/matches?status=scheduled&limit=50');
      if (response.ok) {
        const data = await response.json();
        setPlannedMatches(data.matches || []);
      } else {
        console.error('Failed to fetch planned matches:', response.status, response.statusText);
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
      } else {
        console.error('Failed to fetch expired matches:', response.status, response.statusText);
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
      } else {
        console.error('Failed to fetch completed matches:', response.status, response.statusText);
      }
    } catch (error) {
      console.error('Error fetching completed matches:', error);
    }
  };

  const fetchAutoLoggedMatches = async () => {
    try {
      const response = await fetch('/api/matches?status=auto_logged&includeStats=true&limit=30');
      if (response.ok) {
        const data = await response.json();
        setAutoLoggedMatches(data.matches || []);
      } else {
        console.error('Failed to fetch auto-logged matches:', response.status, response.statusText);
      }
    } catch (error) {
      console.error('Error fetching auto-logged matches:', error);
    }
  };

  const fetchUnlinkedGames = async () => {
    try {
      // Get recent games that aren't linked to any match
      const response = await fetch('/api/player-stats/leaderboard?limit=100&sortBy=game_date&sortOrder=desc');
      if (response.ok) {
        const data = await response.json();
        
        // Group by game_id and get unique games
        const gameMap = new Map();
        data.players?.forEach((player: any) => {
          if (player.game_id && !gameMap.has(player.game_id)) {
            gameMap.set(player.game_id, {
              gameId: player.game_id,
              gameDate: player.game_date,
              arena: player.arena,
              gameMode: player.game_mode,
              totalPlayers: 1,
              teams: [player.team]
            });
          } else if (player.game_id) {
            const game = gameMap.get(player.game_id);
            game.totalPlayers++;
            if (!game.teams.includes(player.team)) {
              game.teams.push(player.team);
            }
          }
        });

        // Check which games are already linked to matches
        const gameIds = Array.from(gameMap.keys());
        const { data: linkedMatches } = await supabase
          .from('matches')
          .select('game_id')
          .in('game_id', gameIds)
          .not('game_id', 'is', null);

        const linkedGameIds = new Set(linkedMatches?.map(m => m.game_id) || []);
        
        const unlinked = Array.from(gameMap.values())
          .filter(game => !linkedGameIds.has(game.gameId))
          .sort((a, b) => new Date(b.gameDate).getTime() - new Date(a.gameDate).getTime())
          .slice(0, 10); // Show last 10 unlinked games

        setUnlinkedGames(unlinked);
      }
    } catch (error) {
      console.error('Error fetching unlinked games:', error);
    }
  };

  const fetchUserSquad = async () => {
    try {
      // Get user's squad membership
      const { data: squadData, error } = await supabase
        .from('squad_members')
        .select(`
          role,
          squads!inner(id, name, tag)
        `)
        .eq('player_id', user?.id)
        .eq('status', 'active')
        .maybeSingle();

      if (error) {
        console.error('Error fetching user squad:', error);
        return;
      }

      if (squadData) {
        setUserSquad({
          id: (squadData.squads as any).id,
          name: (squadData.squads as any).name,
          tag: (squadData.squads as any).tag,
          role: squadData.role
        });
      }
    } catch (error) {
      console.error('Error fetching user squad:', error);
    }
  };

  const fetchAllSquads = async () => {
    try {
      const response = await fetch('/api/squads');
      if (response.ok) {
        const data = await response.json();
        setAllSquads(data.squads || []);
      }
    } catch (error) {
      console.error('Error fetching all squads:', error);
    }
  };

  const createMatch = async (e: React.FormEvent) => {
    e.preventDefault();
    
    const scheduledDateTime = new Date(`${scheduledDate}T${scheduledTime}`).toISOString();
    
    try {
      const response = await fetch('/api/matches', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          title: matchTitle,
          description: matchDescription,
          matchType,
          scheduledAt: scheduledDateTime,
          squadAId: userSquad?.id,
          squadBId: selectedSquadB || null,
          createdBy: user?.id
        }),
      });

      if (response.ok) {
        const data = await response.json();
        toast.success('Match created successfully!');
        setShowCreateForm(false);
        resetForm();
        loadInitialData(); // Refresh the match list
      } else {
        const errorData = await response.json();
        toast.error(errorData.error || 'Failed to create match');
      }
    } catch (error) {
      console.error('Error creating match:', error);
      toast.error('Failed to create match');
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
        headers: {
          'Content-Type': 'application/json',
        },
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
        loadInitialData(); // Refresh the match list
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
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          gameId,
          matchId,
          userId: user?.id
        }),
      });

      if (response.ok) {
        const data = await response.json();
        toast.success(data.message);
        setShowLinkModal(false);
        loadInitialData(); // Refresh all data
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
    
    // Find potential games around the match time
    const match = [...plannedMatches, ...expiredMatches].find(m => m.id === matchId);
    if (match) {
      const matchDate = new Date(match.scheduled_at);
      const potentialGames = unlinkedGames.filter(game => {
        const gameDate = new Date(game.gameDate);
        const timeDiff = Math.abs(matchDate.getTime() - gameDate.getTime()) / (1000 * 60 * 60); // hours
        return timeDiff <= 6; // Games within 6 hours of match time
      });
      setSuggestedGames(potentialGames);
    }
    
    setShowLinkModal(true);
  };

  const joinMatch = async (matchId: string, role: string) => {
    try {
      const { error } = await supabase
        .from('match_participants')
        .insert({
          match_id: matchId,
          player_id: user?.id,
          role: role
        });

      if (error) throw error;

      loadInitialData();
      setShowParticipantModal(false);
    } catch (error) {
      console.error('Error joining match:', error);
      alert('Error joining match');
    }
  };

  const leaveMatch = async (matchId: string) => {
    try {
      const { error } = await supabase
        .from('match_participants')
        .delete()
        .eq('match_id', matchId)
        .eq('player_id', user?.id);

      if (error) throw error;

      loadInitialData();
    } catch (error) {
      console.error('Error leaving match:', error);
      alert('Error leaving match');
    }
  };

  const leaveMatchRole = async (participantId: string, role: string) => {
    try {
      const { error } = await supabase
        .from('match_participants')
        .delete()
        .eq('id', participantId);

      if (error) throw error;

      loadInitialData();
    } catch (error) {
      console.error('Error leaving match role:', error);
      alert('Error leaving match role');
    }
  };

  const deleteMatch = async (matchId: string) => {
    if (!confirm('Are you sure you want to delete this match?')) return;
    
    try {
      const response = await fetch(`/api/matches?id=${matchId}&userId=${user?.id}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        loadInitialData();
      } else {
        const error = await response.json();
        alert(`Error deleting match: ${error.error}`);
      }
    } catch (error) {
      console.error('Error deleting match:', error);
      alert('Error deleting match');
    }
  };

  const resetForm = () => {
    setMatchTitle('');
    setMatchDescription('');
    setScheduledDate('');
    setScheduledTime('');
    setMatchType('pickup');
    setSelectedSquadB('');
  };

  const getRoleIcon = (role: string) => {
    switch (role) {
      case 'player': return '🎮';
      case 'commentator': return '🎤';
      case 'recording': return '📹';
      case 'referee': return '👨‍⚖️';
      default: return '👤';
    }
  };

  const getRoleDisplayName = (role: string) => {
    switch (role) {
      case 'player': return 'PLAYERS';
      case 'commentator': return 'COMMENTATORS';
      case 'recording': return 'RECORDERS';
      case 'referee': return 'REFEREES';
      default: return role.toUpperCase() + 'S';
    }
  };

  const getRoleColor = (role: string) => {
    switch (role) {
      case 'player': return 'text-green-400';
      case 'commentator': return 'text-blue-400';
      case 'recording': return 'text-purple-400';
      case 'referee': return 'text-yellow-400';
      default: return 'text-gray-400';
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'scheduled': return 'text-blue-400';
      case 'in_progress': return 'text-green-400';
      case 'completed': return 'text-gray-400';
      case 'cancelled': return 'text-red-400';
      default: return 'text-gray-400';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'scheduled': return '📅';
      case 'in_progress': return '🎮';
      case 'completed': return '✅';
      case 'cancelled': return '❌';
      default: return '❓';
    }
  };

  const isUserParticipant = (match: Match) => {
    return match.participants.some(p => p.player_id === user?.id);
  };

  const getUserRoles = (match: Match) => {
    return match.participants
      .filter(p => p.player_id === user?.id)
      .map(p => p.role);
  };

  const canCreateSquadMatch = userSquad && ['captain', 'co_captain'].includes(userSquad.role);

  const formatDateTime = (dateString: string) => {
    const date = new Date(dateString);
    return {
      date: date.toLocaleDateString(),
      time: date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };
  };

  // Generate time options in 15-minute intervals
  const generateTimeOptions = () => {
    const options = [];
    for (let hour = 0; hour < 24; hour++) {
      for (let minute = 0; minute < 60; minute += 15) {
        const timeString = `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
        const displayTime = new Date(`2000-01-01T${timeString}`).toLocaleTimeString([], { 
          hour: 'numeric', 
          minute: '2-digit',
          hour12: true 
        });
        options.push({ value: timeString, label: displayTime });
      }
    }
    return options;
  };

  const timeOptions = generateTimeOptions();

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center">
        <div className="text-xl">Loading...</div>
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
          <h1 className="text-3xl font-bold">Match Management</h1>
          <button
            onClick={() => setShowCreateForm(true)}
            className="bg-blue-600 hover:bg-blue-700 px-6 py-2 rounded"
          >
            Create Match
          </button>
        </div>

        {/* Matches Grid */}
        {plannedMatches.length > 0 && (
          <div className="grid gap-6">
            {plannedMatches.map((match) => {
              const { date, time } = formatDateTime(match.scheduled_at);
              const isParticipant = isUserParticipant(match);
              const userRoles = getUserRoles(match);
              
              return (
                <div key={match.id} className="bg-gray-800 rounded-lg p-4 md:p-6">
                  <div className="flex flex-col lg:flex-row lg:justify-between lg:items-start mb-4 space-y-4 lg:space-y-0">
                    <div className="flex-1">
                      <Link href={`/matches/${match.id}`}>
                        <h3 className="text-xl font-bold mb-2 text-cyan-400 hover:text-cyan-300 cursor-pointer">{match.title}</h3>
                      </Link>
                      <p className="text-gray-300 mb-3">{match.description}</p>
                      <div className="flex flex-wrap gap-2 md:gap-4 text-sm text-gray-400 mb-2">
                        <span>📅 {date} at {time}</span>
                        <span className={getStatusColor(match.status)}>
                          {getStatusIcon(match.status)} {match.status.replace('_', ' ').toUpperCase()}
                        </span>
                        <span>🎯 {match.match_type.replace('_', ' ').toUpperCase()}</span>
                      </div>
                      {match.match_type === 'squad_vs_squad' && (
                        <div className="text-sm text-blue-400 mb-2">
                          {match.squad_a_name} vs {match.squad_b_name || 'TBD'}
                        </div>
                      )}
                      <div className="text-sm text-gray-500">
                        Created by {match.created_by_alias}
                      </div>
                    </div>
                    
                    {/* Action Buttons - Mobile Responsive */}
                    <div className="flex flex-col sm:flex-row gap-2 lg:ml-6 min-w-0 lg:min-w-[200px]">
                      {match.created_by === user?.id && (
                        <button
                          onClick={() => deleteMatch(match.id)}
                          className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded text-sm font-medium transition-colors"
                        >
                          🗑️ Delete
                        </button>
                      )}
                      
                      {match.status === 'scheduled' && (
                        <>
                          {!isParticipant ? (
                            <button
                              onClick={() => {
                                setSelectedMatchId(match.id);
                                setSelectedRole('player');
                                setAllowMultipleRoles(false);
                                setShowParticipantModal(true);
                              }}
                              className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded text-sm font-medium transition-colors"
                            >
                              ✅ Join
                            </button>
                          ) : (
                            <div className="flex flex-col gap-2">
                              <button
                                onClick={() => leaveMatch(match.id)}
                                className="bg-yellow-600 hover:bg-yellow-700 text-white px-4 py-2 rounded text-sm font-medium transition-colors"
                              >
                                🚫 Leave
                              </button>
                              {userRoles.length < 4 && (
                                <button
                                  onClick={() => {
                                    setSelectedMatchId(match.id);
                                    setSelectedRole(userRoles.includes('player') ? 'commentator' : 'player');
                                    setAllowMultipleRoles(true);
                                    setShowParticipantModal(true);
                                  }}
                                  className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded text-sm font-medium transition-colors"
                                >
                                  ➕ Add Role
                                </button>
                              )}
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                  
                  {/* Participants */}
                  {match.participants.length > 0 && (
                    <div>
                      <h4 className="text-lg font-semibold mb-3">Participants ({match.participants.length})</h4>
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                        {['player', 'commentator', 'recording', 'referee'].map(role => {
                          const roleParticipants = match.participants.filter(p => p.role === role);
                          return (
                            <div key={role} className="bg-gray-700 rounded p-3">
                              <div className={`font-semibold mb-2 ${getRoleColor(role)}`}>
                                {getRoleIcon(role)} {getRoleDisplayName(role)} ({roleParticipants.length})
                              </div>
                              {roleParticipants.map(participant => (
                                <div key={participant.id} className="text-sm mb-1 flex items-center justify-between">
                                  <div className="flex-1 min-w-0">
                                    <span className="font-medium truncate block">{participant.in_game_alias}</span>
                                    {participant.squad_name && (
                                      <span className="text-gray-400 text-xs truncate block">({participant.squad_name})</span>
                                    )}
                                  </div>
                                  {participant.player_id === user?.id && match.status === 'scheduled' && (
                                    <button
                                      onClick={() => leaveMatchRole(participant.id, role)}
                                      className="bg-red-500 hover:bg-red-600 text-white px-2 py-1 rounded text-xs ml-2 flex-shrink-0"
                                      title={`Leave as ${role}`}
                                    >
                                      ✕
                                    </button>
                                  )}
                                </div>
                              ))}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Auto-Logged Matches - Collapsible Section */}
        {autoLoggedMatches.length > 0 && (
          <div className="mt-8">
            <div 
              className="bg-yellow-900/20 border border-yellow-600/30 rounded-lg p-4 cursor-pointer hover:bg-yellow-900/30 transition-all duration-300"
              onClick={() => setIsAutoLoggedCollapsed(!isAutoLoggedCollapsed)}
            >
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-bold text-yellow-400 flex items-center gap-3">
                  <span className={`transition-transform duration-200 ${isAutoLoggedCollapsed ? 'rotate(-90deg)' : 'rotate(0deg)'}`}>
                    ▼
                  </span>
                  🎮 Recent Games ({autoLoggedMatches.length})
                </h2>
                <div className="text-yellow-500 text-sm">
                  {isAutoLoggedCollapsed ? 'Click to expand' : 'Click to collapse'}
                </div>
              </div>
            </div>
            
            {!isAutoLoggedCollapsed && (
              <div className="mt-4 space-y-4">
                {autoLoggedMatches.map((match) => {
                  const { date, time } = formatDateTime(match.scheduled_at);
                  
                  return (
                    <div key={match.id} className="bg-yellow-900/10 border border-yellow-700/30 rounded-lg p-4">
                      <div className="flex flex-col lg:flex-row lg:justify-between lg:items-start">
                        <div className="flex-1">
                          <h3 className="text-lg font-bold mb-2 text-yellow-300">{match.title}</h3>
                          <div className="flex flex-wrap gap-2 text-sm text-yellow-400/80 mb-3">
                            <span>📅 {date} at {time}</span>
                            <span>🎯 {match.match_type?.replace('_', ' ').toUpperCase()}</span>
                            {match.game_mode && <span>🎮 {match.game_mode}</span>}
                            {match.map_name && <span>🗺️ {match.map_name}</span>}
                          </div>
                          
                          {/* Game Stats Players */}
                          {match.gameStats && match.gameStats.length > 0 && (
                            <div className="mt-3">
                              <div className="text-sm text-yellow-200 mb-2">
                                <span className="font-medium">Players ({match.gameStats.length}):</span>
                              </div>
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                {match.gameStats.map((player: any, index: number) => (
                                  <div key={index} className="flex items-center justify-between bg-yellow-900/20 rounded px-3 py-2">
                                    <div className="flex-1">
                                      <span className="font-medium text-yellow-200">{player.player_name}</span>
                                      {player.team && (
                                        <span className="text-yellow-400/80 text-xs ml-2">({player.team})</span>
                                      )}
                                    </div>
                                    <div className="flex gap-2 text-xs">
                                      <span className="text-green-400">{player.kills || 0}K</span>
                                      <span className="text-red-400">{player.deaths || 0}D</span>
                                      {player.captures > 0 && <span className="text-blue-400">{player.captures}C</span>}
                                    </div>
                                  </div>
                                ))}
                              </div>
                              
                              {/* Team Results */}
                              {match.gameStats.some((p: any) => p.team) && (
                                <div className="mt-3 pt-3 border-t border-yellow-700/30">
                                  <div className="text-sm">
                                    {Array.from(new Set(match.gameStats.map((p: any) => p.team).filter(Boolean))).map((team: any) => {
                                      const teamPlayers = match.gameStats.filter((p: any) => p.team === team);
                                      const teamScore = teamPlayers.reduce((sum: number, p: any) => sum + (p.captures || 0), 0);
                                      return (
                                        <span key={team} className="inline-block mr-4 text-yellow-200">
                                          <span className="font-medium">{team}:</span> {teamScore} points
                                        </span>
                                      );
                                    })}
                                  </div>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                        
                        <div className="mt-3 lg:mt-0 lg:ml-6 flex gap-2">
                          {match.game_id && (
                            <Link 
                              href={`/stats/game/${match.game_id}`}
                              className="bg-yellow-600 hover:bg-yellow-700 text-white px-4 py-2 rounded text-sm font-medium transition-colors"
                            >
                              🎮 Game Stats
                            </Link>
                          )}
                          <Link 
                            href={`/matches/${match.id}`}
                            className="bg-gray-600 hover:bg-gray-700 text-white px-4 py-2 rounded text-sm font-medium transition-colors"
                          >
                            📋 Match Details
                          </Link>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Past Matches - Collapsible Section */}
        {expiredMatches.length > 0 && (
          <div className="mt-8">
            <div 
              className="bg-gray-800/50 border border-gray-600/30 rounded-lg p-4 cursor-pointer hover:bg-gray-800/70 transition-all duration-300"
              onClick={() => setIsExpiredCollapsed(!isExpiredCollapsed)}
            >
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-bold text-gray-400 flex items-center gap-3">
                  <span className={`transition-transform duration-200 ${isExpiredCollapsed ? 'rotate(-90deg)' : 'rotate(0deg)'}`}>
                    ▼
                  </span>
                  📚 Expired Matches ({expiredMatches.length})
                </h2>
                <div className="text-gray-500 text-sm">
                  {isExpiredCollapsed ? 'Click to expand' : 'Click to collapse'}
                </div>
              </div>
            </div>
            
            {!isExpiredCollapsed && (
              <div className="mt-4 space-y-4">
                {expiredMatches.map((match) => {
                  const { date, time } = formatDateTime(match.scheduled_at);
                  
                  return (
                    <div key={match.id} className="bg-gray-800/30 border border-gray-700/50 rounded-lg p-4 opacity-75">
                      <div className="flex flex-col lg:flex-row lg:justify-between lg:items-start">
                        <div className="flex-1">
                          <Link href={`/matches/${match.id}`}>
                            <h3 className="text-lg font-bold mb-2 text-gray-400 hover:text-gray-300 cursor-pointer">{match.title}</h3>
                          </Link>
                          <p className="text-gray-400 mb-2 text-sm">{match.description}</p>
                          <div className="flex flex-wrap gap-2 text-sm text-gray-500 mb-2">
                            <span>📅 {date} at {time}</span>
                            <span className={getStatusColor(match.status)}>
                              {getStatusIcon(match.status)} {match.status.replace('_', ' ').toUpperCase()}
                            </span>
                            <span>🎯 {match.match_type.replace('_', ' ').toUpperCase()}</span>
                          </div>
                          {match.match_type === 'squad_vs_squad' && (
                            <div className="text-sm text-gray-500 mb-2">
                              {match.squad_a_name} vs {match.squad_b_name || 'TBD'}
                            </div>
                          )}
                          <div className="text-sm text-gray-600">
                            Created by {match.created_by_alias}
                          </div>
                        </div>
                        
                        <div className="mt-3 lg:mt-0 lg:ml-6">
                          <Link 
                            href={`/matches/${match.id}`}
                            className="bg-gray-600 hover:bg-gray-700 text-white px-4 py-2 rounded text-sm font-medium transition-colors inline-block"
                          >
                            📋 View Details
                          </Link>
                        </div>
                      </div>
                      
                      {/* Simplified participants display for past matches */}
                      {match.participants.length > 0 && (
                        <div className="mt-3 pt-3 border-t border-gray-700/50">
                          <div className="text-sm text-gray-500">
                            <span className="font-medium">Participants:</span> {' '}
                            {match.participants.slice(0, 3).map(p => p.in_game_alias).join(', ')}
                            {match.participants.length > 3 && ` +${match.participants.length - 3} more`}
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

        {completedMatches.length > 0 && (
          <div className="mt-8">
            <div 
              className="bg-gray-800/50 border border-gray-600/30 rounded-lg p-4 cursor-pointer hover:bg-gray-800/70 transition-all duration-300"
              onClick={() => setIsCompletedCollapsed(!isCompletedCollapsed)}
            >
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-bold text-gray-400 flex items-center gap-3">
                  <span className={`transition-transform duration-200 ${isCompletedCollapsed ? 'rotate(-90deg)' : 'rotate(0deg)'}`}>
                    ▼
                  </span>
                  📚 Completed Matches ({completedMatches.length})
                </h2>
                <div className="text-gray-500 text-sm">
                  {isCompletedCollapsed ? 'Click to expand' : 'Click to collapse'}
                </div>
              </div>
            </div>
            
            {!isCompletedCollapsed && (
              <div className="mt-4 space-y-4">
                {completedMatches.map((match) => {
                  const { date, time } = formatDateTime(match.scheduled_at);
                  
                  return (
                    <div key={match.id} className="bg-gray-800/30 border border-gray-700/50 rounded-lg p-4 opacity-75">
                      <div className="flex flex-col lg:flex-row lg:justify-between lg:items-start">
                        <div className="flex-1">
                          <Link href={`/matches/${match.id}`}>
                            <h3 className="text-lg font-bold mb-2 text-gray-400 hover:text-gray-300 cursor-pointer">{match.title}</h3>
                          </Link>
                          <p className="text-gray-400 mb-2 text-sm">{match.description}</p>
                          <div className="flex flex-wrap gap-2 text-sm text-gray-500 mb-2">
                            <span>📅 {date} at {time}</span>
                            <span className={getStatusColor(match.status)}>
                              {getStatusIcon(match.status)} {match.status.replace('_', ' ').toUpperCase()}
                            </span>
                            <span>🎯 {match.match_type.replace('_', ' ').toUpperCase()}</span>
                          </div>
                          {match.match_type === 'squad_vs_squad' && (
                            <div className="text-sm text-gray-500 mb-2">
                              {match.squad_a_name} vs {match.squad_b_name || 'TBD'}
                            </div>
                          )}
                          <div className="text-sm text-gray-600">
                            Created by {match.created_by_alias}
                          </div>
                        </div>
                        
                        <div className="mt-3 lg:mt-0 lg:ml-6">
                          <Link 
                            href={`/matches/${match.id}`}
                            className="bg-gray-600 hover:bg-gray-700 text-white px-4 py-2 rounded text-sm font-medium transition-colors inline-block"
                          >
                            📋 View Details
                          </Link>
                        </div>
                      </div>
                      
                      {/* Simplified participants display for past matches */}
                      {match.participants.length > 0 && (
                        <div className="mt-3 pt-3 border-t border-gray-700/50">
                          <div className="text-sm text-gray-500">
                            <span className="font-medium">Participants:</span> {' '}
                            {match.participants.slice(0, 3).map(p => p.in_game_alias).join(', ')}
                            {match.participants.length > 3 && ` +${match.participants.length - 3} more`}
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

        {plannedMatches.length === 0 && expiredMatches.length === 0 && completedMatches.length === 0 && autoLoggedMatches.length === 0 && !dataLoading && (
          <div className="text-center py-12">
            <h2 className="text-xl font-semibold mb-4">No matches scheduled</h2>
            <p className="text-gray-400 mb-6">Be the first to create a match!</p>
            <button
              onClick={() => setShowCreateForm(true)}
              className="bg-blue-600 hover:bg-blue-700 px-6 py-2 rounded"
            >
              Create Match
            </button>
          </div>
        )}

        {/* Create Match Modal */}
        {showCreateForm && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-gray-800 rounded-lg p-6 w-full max-w-md max-h-[90vh] overflow-y-auto">
              <h3 className="text-xl font-bold mb-4">Create New Match</h3>
              <form onSubmit={createMatch}>
                <div className="mb-4">
                  <label className="block text-sm font-medium mb-2">Match Title</label>
                  <input
                    type="text"
                    value={matchTitle}
                    onChange={(e) => setMatchTitle(e.target.value)}
                    className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2"
                    required
                  />
                </div>
                <div className="mb-4">
                  <label className="block text-sm font-medium mb-2">Description</label>
                  <textarea
                    value={matchDescription}
                    onChange={(e) => setMatchDescription(e.target.value)}
                    className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2"
                    rows={3}
                    required
                  />
                </div>
                <div className="mb-4">
                  <label className="block text-sm font-medium mb-2">Match Type</label>
                  <select
                    value={matchType}
                    onChange={(e) => setMatchType(e.target.value as any)}
                    className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2"
                  >
                    <option value="pickup">Pickup Game</option>
                    <option value="tournament">Tournament</option>
                    {canCreateSquadMatch && <option value="squad_vs_squad">Squad vs Squad</option>}
                  </select>
                </div>
                {matchType === 'squad_vs_squad' && (
                  <div className="mb-4">
                    <label className="block text-sm font-medium mb-2">Opponent Squad</label>
                    <select
                      value={selectedSquadB}
                      onChange={(e) => setSelectedSquadB(e.target.value)}
                      className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2"
                      required
                    >
                      <option value="">Select opponent...</option>
                      {allSquads
                        .filter(squad => squad.id !== userSquad?.id)
                        .map(squad => (
                          <option key={squad.id} value={squad.id}>
                            [{squad.tag}] {squad.name}
                          </option>
                        ))}
                    </select>
                  </div>
                )}
                <div className="mb-4">
                  <label className="block text-sm font-medium mb-2">Date</label>
                  <input
                    type="date"
                    value={scheduledDate}
                    onChange={(e) => setScheduledDate(e.target.value)}
                    className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2"
                    required
                  />
                </div>
                <div className="mb-6">
                  <label className="block text-sm font-medium mb-2">Time (EST)</label>
                  <select
                    value={scheduledTime}
                    onChange={(e) => setScheduledTime(e.target.value)}
                    className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2"
                    required
                  >
                    <option value="">Select time...</option>
                    {timeOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex gap-3">
                  <button
                    type="submit"
                    className="flex-1 bg-blue-600 hover:bg-blue-700 py-2 rounded"
                  >
                    Create Match
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowCreateForm(false);
                      resetForm();
                    }}
                    className="flex-1 bg-gray-600 hover:bg-gray-700 py-2 rounded"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Join Match Modal */}
        {showParticipantModal && selectedMatchId && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-gray-800 rounded-lg p-6 w-full max-w-md">
              {(() => {
                const selectedMatch = plannedMatches.find(m => m.id === selectedMatchId);
                if (!selectedMatch) return null;
                
                return (
                  <>
                    <h3 className="text-xl font-bold mb-4">
                      {allowMultipleRoles ? 'Join Additional Role' : 'Join Match'}: {selectedMatch.title}
                    </h3>
                    
                    {allowMultipleRoles && (
                      <div className="mb-4 p-3 bg-gray-700 rounded">
                        <div className="text-sm text-gray-300 mb-2">Currently joined as:</div>
                        <div className="text-sm text-cyan-400">
                          {getUserRoles(selectedMatch).join(', ')}
                        </div>
                      </div>
                    )}
                    
                    <div className="mb-6">
                      <label className="block text-sm font-medium mb-2">Select Role</label>
                      <select
                        value={selectedRole}
                        onChange={(e) => setSelectedRole(e.target.value as any)}
                        className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2"
                      >
                        <option value="player" disabled={allowMultipleRoles && getUserRoles(selectedMatch).includes('player')}>
                          🎮 Player {allowMultipleRoles && getUserRoles(selectedMatch).includes('player') ? '(Already joined)' : ''}
                        </option>
                        <option value="commentator" disabled={allowMultipleRoles && getUserRoles(selectedMatch).includes('commentator')}>
                          🎤 Commentator {allowMultipleRoles && getUserRoles(selectedMatch).includes('commentator') ? '(Already joined)' : ''}
                        </option>
                        <option value="recording" disabled={allowMultipleRoles && getUserRoles(selectedMatch).includes('recording')}>
                          📹 Recorder {allowMultipleRoles && getUserRoles(selectedMatch).includes('recording') ? '(Already joined)' : ''}
                        </option>
                        <option value="referee" disabled={allowMultipleRoles && getUserRoles(selectedMatch).includes('referee')}>
                          👨‍⚖️ Referee {allowMultipleRoles && getUserRoles(selectedMatch).includes('referee') ? '(Already joined)' : ''}
                        </option>
                      </select>
                    </div>
                    <div className="flex gap-3">
                      <button
                        onClick={() => joinMatch(selectedMatch.id, selectedRole)}
                        className={`flex-1 py-2 rounded ${
                          allowMultipleRoles && getUserRoles(selectedMatch).includes(selectedRole)
                            ? 'bg-gray-500 cursor-not-allowed'
                            : 'bg-green-600 hover:bg-green-700'
                        }`}
                        disabled={allowMultipleRoles && getUserRoles(selectedMatch).includes(selectedRole)}
                      >
                        Join as {selectedRole}
                      </button>
                      <button
                        onClick={() => setShowParticipantModal(false)}
                        className="flex-1 bg-gray-600 hover:bg-gray-700 py-2 rounded"
                      >
                        Cancel
                      </button>
                    </div>
                  </>
                );
              })()}
            </div>
          </div>
        )}

        {/* VOD Modal */}
        {showVodModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-gray-800 rounded-lg p-6 w-full max-w-md">
              <h3 className="text-xl font-bold mb-4">Update Match VOD</h3>
              <form onSubmit={updateMatchVod}>
                <div className="mb-4">
                  <label className="block text-sm font-medium mb-2">VOD URL</label>
                  <input
                    type="text"
                    value={vodUrl}
                    onChange={(e) => setVodUrl(e.target.value)}
                    className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2"
                    required
                  />
                </div>
                <div className="mb-4">
                  <label className="block text-sm font-medium mb-2">VOD Title</label>
                  <input
                    type="text"
                    value={vodTitle}
                    onChange={(e) => setVodTitle(e.target.value)}
                    className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2"
                  />
                </div>
                <div className="flex gap-3">
                  <button
                    type="submit"
                    className="flex-1 bg-blue-600 hover:bg-blue-700 py-2 rounded"
                  >
                    Update VOD
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowVodModal(false);
                      setVodUrl('');
                      setVodTitle('');
                    }}
                    className="flex-1 bg-gray-600 hover:bg-gray-700 py-2 rounded"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Link Game Modal */}
        {showLinkModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-gray-800 rounded-lg p-6 w-full max-w-md">
              <h3 className="text-xl font-bold mb-4">Link Game to Match</h3>
              <form onSubmit={openLinkModal}>
                <div className="mb-4">
                  <label className="block text-sm font-medium mb-2">Suggested Games</label>
                  <select
                    value={linkMatchId}
                    onChange={(e) => setLinkMatchId(e.target.value)}
                    className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2"
                  >
                    <option value="">Select a game...</option>
                    {suggestedGames.map((game) => (
                      <option key={game.gameId} value={game.gameId}>
                        {game.gameDate} - {game.arena} - {game.gameMode}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex gap-3">
                  <button
                    type="submit"
                    className="flex-1 bg-blue-600 hover:bg-blue-700 py-2 rounded"
                  >
                    Link Game
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowLinkModal(false);
                      setLinkMatchId('');
                    }}
                    className="flex-1 bg-gray-600 hover:bg-gray-700 py-2 rounded"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </div>
  );
} 