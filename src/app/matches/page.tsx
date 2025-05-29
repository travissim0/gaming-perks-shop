'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/lib/AuthContext';
import { supabase } from '@/lib/supabase';
import Navbar from '@/components/Navbar';
import Link from 'next/link';

interface Match {
  id: string;
  title: string;
  description: string;
  scheduled_at: string;
  match_type: 'squad_vs_squad' | 'pickup' | 'tournament';
  status: 'scheduled' | 'in_progress' | 'completed' | 'cancelled';
  squad_a_id?: string;
  squad_b_id?: string;
  squad_a_name?: string;
  squad_b_name?: string;
  created_by: string;
  created_by_alias: string;
  created_at: string;
  participants: MatchParticipant[];
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

export default function MatchesPage() {
  const { user, loading } = useAuth();
  const [matches, setMatches] = useState<Match[]>([]);
  const [userSquad, setUserSquad] = useState<UserSquad | null>(null);
  const [allSquads, setAllSquads] = useState<Squad[]>([]);
  const [dataLoading, setDataLoading] = useState(true);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [selectedMatch, setSelectedMatch] = useState<Match | null>(null);
  const [showParticipantModal, setShowParticipantModal] = useState(false);
  const [selectedRole, setSelectedRole] = useState<'player' | 'commentator' | 'recording' | 'referee'>('player');
  const [allowMultipleRoles, setAllowMultipleRoles] = useState(false);

  // Form states
  const [matchTitle, setMatchTitle] = useState('');
  const [matchDescription, setMatchDescription] = useState('');
  const [scheduledDate, setScheduledDate] = useState('');
  const [scheduledTime, setScheduledTime] = useState('');
  const [matchType, setMatchType] = useState<'squad_vs_squad' | 'pickup' | 'tournament'>('pickup');
  const [selectedSquadB, setSelectedSquadB] = useState('');

  useEffect(() => {
    if (user) {
      loadInitialData();
    }
  }, [user]);

  const loadInitialData = async () => {
    setDataLoading(true);
    
    const promises = [
      fetchMatches().catch(error => {
        console.error('Error fetching matches:', error);
        setMatches([]);
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

  const fetchMatches = async () => {
    try {
      const response = await fetch('/api/matches?status=scheduled&limit=50');
      if (response.ok) {
        const data = await response.json();

        setMatches(data.matches || []);
      } else {
        console.error('Failed to fetch matches:', response.status, response.statusText);
      }
    } catch (error) {
      console.error('Error fetching matches:', error);
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
          matchType: matchType,
          scheduledAt: scheduledDateTime,
          squadAId: matchType === 'squad_vs_squad' ? userSquad?.id : null,
          squadBId: matchType === 'squad_vs_squad' ? selectedSquadB : null,
          createdBy: user?.id,
        }),
      });

      if (response.ok) {
        setShowCreateForm(false);
        resetForm();
        fetchMatches();
      } else {
        const error = await response.json();
        alert(`Error creating match: ${error.error}`);
      }
    } catch (error) {
      console.error('Error creating match:', error);
      alert('Error creating match');
    }
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

      fetchMatches();
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

      fetchMatches();
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

      fetchMatches();
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
        fetchMatches();
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

        {/* Matches List */}
        {dataLoading ? (
          <div className="grid gap-6">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="bg-gray-800 rounded-lg p-6 animate-pulse">
                <div className="h-6 bg-gray-700 rounded w-1/3 mb-4"></div>
                <div className="h-4 bg-gray-700 rounded w-2/3 mb-3"></div>
                <div className="h-4 bg-gray-700 rounded w-1/2 mb-2"></div>
                <div className="h-4 bg-gray-700 rounded w-1/4"></div>
              </div>
            ))}
          </div>
        ) : (
          <div className="grid gap-6">
            {matches.map((match) => {
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
                    <div className="flex flex-col sm:flex-row gap-2 lg:ml-4">
                      {match.status === 'scheduled' && (
                        <button
                          onClick={() => {
                            setSelectedMatch(match);
                            setAllowMultipleRoles(isParticipant);
                            
                            // If joining additional roles, set to first available role
                            if (isParticipant) {
                              const currentRoles = getUserRoles(match);
                              const availableRoles = ['player', 'commentator', 'recording', 'referee'] as const;
                              const firstAvailable = availableRoles.find(role => !currentRoles.includes(role));
                              if (firstAvailable) {
                                setSelectedRole(firstAvailable);
                              }
                            } else {
                              setSelectedRole('player');
                            }
                            
                            setShowParticipantModal(true);
                          }}
                          className={`px-3 py-2 rounded text-sm whitespace-nowrap ${
                            isParticipant 
                              ? 'bg-blue-600 hover:bg-blue-700' 
                              : 'bg-green-600 hover:bg-green-700'
                          }`}
                        >
                          {isParticipant ? 'Join Additional Role' : 'Join Match'}
                        </button>
                      )}
                      {isParticipant && match.status === 'scheduled' && (
                        <div className="flex flex-col gap-1">
                          <button
                            onClick={() => leaveMatch(match.id)}
                            className="bg-red-600 hover:bg-red-700 px-3 py-2 rounded text-sm whitespace-nowrap"
                          >
                            Leave All Roles
                          </button>
                          <div className="text-xs text-gray-400 text-center">
                            Joined as: {userRoles.join(', ')}
                          </div>
                        </div>
                      )}
                      {match.created_by === user?.id && match.status === 'scheduled' && (
                        <button
                          onClick={() => deleteMatch(match.id)}
                          className="bg-red-800 hover:bg-red-900 px-3 py-2 rounded text-sm whitespace-nowrap"
                        >
                          Delete Match
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Participants - Mobile Responsive */}
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

        {matches.length === 0 && !dataLoading && (
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
        {showParticipantModal && selectedMatch && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-gray-800 rounded-lg p-6 w-full max-w-md">
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
            </div>
          </div>
        )}
      </div>
    </div>
  );
} 