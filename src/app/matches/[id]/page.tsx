'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/lib/AuthContext';
import { supabase } from '@/lib/supabase';
import Navbar from '@/components/Navbar';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { toast } from 'react-hot-toast';

interface MatchParticipant {
  id: string;
  player_id: string;
  in_game_alias: string;
  role: 'player' | 'commentator' | 'recording' | 'referee';
  squad_name?: string;
  joined_at: string;
}

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

export default function MatchDetailPage() {
  const { user, loading } = useAuth();
  const params = useParams();
  const matchId = params.id as string;
  const [match, setMatch] = useState<Match | null>(null);
  const [pageLoading, setPageLoading] = useState(true);
  const [showParticipantModal, setShowParticipantModal] = useState(false);
  const [selectedRole, setSelectedRole] = useState<'player' | 'commentator' | 'recording' | 'referee'>('player');
  const [isJoining, setIsJoining] = useState(false);

  useEffect(() => {
    if (matchId) {
      fetchMatchDetails();
    }
  }, [matchId]);

  const fetchMatchDetails = async () => {
    try {
      setPageLoading(true);
      
      const response = await fetch(`/api/matches?id=${matchId}&limit=1`);
      if (response.ok) {
        const data = await response.json();
        if (data.matches && data.matches.length > 0) {
          setMatch(data.matches[0]);
        }
      } else {
        console.error('Failed to fetch match details:', response.status, response.statusText);
      }
    } catch (error) {
      console.error('Error fetching match details:', error);
    } finally {
      setPageLoading(false);
    }
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

  const getRoleColor = (role: string) => {
    switch (role) {
      case 'player': return 'text-green-400';
      case 'commentator': return 'text-blue-400';
      case 'recording': return 'text-purple-400';
      case 'referee': return 'text-yellow-400';
      default: return 'text-gray-400';
    }
  };

  const getRoleDisplayName = (role: string) => {
    switch (role) {
      case 'player': return 'Players';
      case 'commentator': return 'Commentators';
      case 'recording': return 'Recorders';
      case 'referee': return 'Referees';
      default: return role;
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

  const formatDateTime = (dateString: string) => {
    const date = new Date(dateString);
    return {
      date: date.toLocaleDateString(),
      time: date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };
  };

  const isUserParticipant = () => {
    if (!user || !match) return false;
    return match.participants.some(p => p.player_id === user.id);
  };

  const getUserParticipation = () => {
    if (!user || !match) return null;
    return match.participants.find(p => p.player_id === user.id);
  };

  const canUserJoin = () => {
    if (!user || !match) return false;
    if (match.status !== 'scheduled') return false;
    return !isUserParticipant();
  };

  const joinMatch = async () => {
    if (!user || !match) return;

    setIsJoining(true);
    try {
      const { error } = await supabase
        .from('match_participants')
        .insert({
          match_id: match.id,
          player_id: user.id,
          role: selectedRole
        });

      if (error) throw error;

      toast.success(`Joined match as ${selectedRole}!`);
      setShowParticipantModal(false);
      fetchMatchDetails(); // Refresh match data
    } catch (error: any) {
      console.error('Error joining match:', error);
      toast.error(error.message || 'Failed to join match');
    } finally {
      setIsJoining(false);
    }
  };

  const leaveMatch = async () => {
    if (!user || !match) return;

    const participation = getUserParticipation();
    if (!participation) return;

    if (!confirm('Are you sure you want to leave this match?')) return;

    try {
      const { error } = await supabase
        .from('match_participants')
        .delete()
        .eq('id', participation.id);

      if (error) throw error;

      toast.success('Left match successfully');
      fetchMatchDetails(); // Refresh match data
    } catch (error: any) {
      console.error('Error leaving match:', error);
      toast.error(error.message || 'Failed to leave match');
    }
  };

  if (loading || pageLoading) {
    return (
      <div className="min-h-screen bg-gray-900 text-white">
        <Navbar user={user} />
        <div className="flex items-center justify-center pt-20">
          <div className="text-xl">Loading...</div>
        </div>
      </div>
    );
  }

  if (!match) {
    return (
      <div className="min-h-screen bg-gray-900 text-white">
        <Navbar user={user} />
        <div className="max-w-7xl mx-auto p-6">
          <div className="text-center py-12">
            <h1 className="text-2xl font-bold mb-4">Match Not Found</h1>
            <p className="text-gray-400 mb-6">The match you're looking for doesn't exist or has been deleted.</p>
            <Link href="/matches" className="bg-blue-600 hover:bg-blue-700 px-6 py-2 rounded">
              Back to Matches
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const { date, time } = formatDateTime(match.scheduled_at);
  const userParticipation = getUserParticipation();

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      <Navbar user={user} />
      <div className="max-w-7xl mx-auto p-6">
        {/* Back Button */}
        <div className="mb-6">
          <Link href="/matches" className="text-cyan-400 hover:text-cyan-300 flex items-center gap-2">
            ← Back to Matches
          </Link>
        </div>

        {/* Match Header */}
        <div className="bg-gray-800 rounded-lg p-6 mb-8">
          <div className="flex justify-between items-start mb-6">
            <div className="flex-1">
              <h1 className="text-3xl font-bold mb-2">{match.title}</h1>
              <p className="text-gray-300 mb-4">{match.description}</p>
              <div className="flex flex-wrap gap-4 text-sm text-gray-400 mb-2">
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
                Created by {match.created_by_alias} • {new Date(match.created_at).toLocaleDateString()}
              </div>
            </div>
            
            {/* Action Buttons */}
            {user && (
              <div className="flex flex-col gap-2 ml-4">
                {userParticipation ? (
                  <div className="text-center">
                    <div className="bg-green-600 text-white px-4 py-2 rounded mb-2">
                      ✅ Joined as {userParticipation.role}
                    </div>
                    <button
                      onClick={leaveMatch}
                      className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded transition-colors"
                    >
                      Leave Match
                    </button>
                  </div>
                ) : canUserJoin() ? (
                  <button
                    onClick={() => setShowParticipantModal(true)}
                    className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded transition-colors"
                  >
                    Join Match
                  </button>
                ) : (
                  <div className="text-gray-400 text-sm text-center">
                    {match.status !== 'scheduled' ? 'Match not available' : 'Already joined'}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Participants */}
        <div className="bg-gray-800 rounded-lg p-6">
          <h2 className="text-2xl font-bold mb-6">Participants ({match.participants.length})</h2>
          
          {match.participants.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              {['player', 'commentator', 'recording', 'referee'].map(role => {
                const roleParticipants = match.participants.filter(p => p.role === role);
                return (
                  <div key={role} className="bg-gray-700 rounded p-4">
                    <div className={`font-semibold mb-3 ${getRoleColor(role)}`}>
                      {getRoleIcon(role)} {getRoleDisplayName(role)} ({roleParticipants.length})
                    </div>
                    <div className="space-y-2">
                      {roleParticipants.map(participant => (
                        <div key={participant.id} className="text-sm">
                          <span className="font-medium">{participant.in_game_alias}</span>
                          {participant.squad_name && (
                            <span className="text-gray-400 ml-2">({participant.squad_name})</span>
                          )}
                          <div className="text-xs text-gray-500">
                            Joined {new Date(participant.joined_at).toLocaleDateString()}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="text-center py-8">
              <div className="text-gray-500">No participants yet</div>
              <div className="text-gray-600 text-sm mt-1">Be the first to join this match!</div>
            </div>
          )}
        </div>
      </div>

      {/* Join Match Modal */}
      {showParticipantModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-gray-800 rounded-lg p-6 w-full max-w-md mx-4">
            <h3 className="text-xl font-bold mb-4">Join Match</h3>
            <div className="mb-4">
              <label className="block text-sm font-medium mb-2">Select your role:</label>
              <select
                value={selectedRole}
                onChange={(e) => setSelectedRole(e.target.value as any)}
                className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2"
              >
                <option value="player">🎮 Player</option>
                <option value="commentator">🎤 Commentator</option>
                <option value="recording">📹 Recorder</option>
                <option value="referee">👨‍⚖️ Referee</option>
              </select>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setShowParticipantModal(false)}
                className="flex-1 bg-gray-600 hover:bg-gray-700 text-white px-4 py-2 rounded transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={joinMatch}
                disabled={isJoining}
                className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-800 text-white px-4 py-2 rounded transition-colors"
              >
                {isJoining ? 'Joining...' : 'Join'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
} 