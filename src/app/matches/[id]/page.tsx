'use client';

import { useState, useEffect, useMemo } from 'react';
import { useAuth } from '@/lib/AuthContext';
import { supabase } from '@/lib/supabase';
import Navbar from '@/components/Navbar';

import GameStatsViewer from '@/components/GameStatsViewer';
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

type SquadInfo = {
  id: string;
  name: string;
  banner_url?: string | null;
  members: { id: string; alias: string }[];
};

export default function MatchDetailPage() {
  const { user, loading } = useAuth();
  const params = useParams();
  const matchId = params.id as string;
  const [match, setMatch] = useState<Match | null>(null);
  const [pageLoading, setPageLoading] = useState(true);
  const [showParticipantModal, setShowParticipantModal] = useState(false);
  const [selectedRole, setSelectedRole] = useState<'player' | 'commentator' | 'recording' | 'referee'>('player');
  const [isJoining, setIsJoining] = useState(false);
  const [squadA, setSquadA] = useState<SquadInfo | null>(null);
  const [squadB, setSquadB] = useState<SquadInfo | null>(null);

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
          const m = data.matches[0] as Match;
          console.log('📋 Match data loaded:', { 
            id: m.id, 
            title: m.title, 
            match_type: m.match_type, 
            squad_a_id: m.squad_a_id, 
            squad_b_id: m.squad_b_id 
          });
          if ((m.match_type === 'squad_vs_squad' || m.match_type === 'tournament') && (m.squad_a_id || m.squad_b_id)) {
            fetchSquadInfos(m.squad_a_id || null, m.squad_b_id || null).catch(() => {});
          } else {
            setSquadA(null);
            setSquadB(null);
          }
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

  const fetchSquadInfos = async (squadAId: string | null, squadBId: string | null) => {
    try {
      console.log('🔍 Fetching squad infos for:', { squadAId, squadBId });
      const ids = [squadAId, squadBId].filter(Boolean) as string[];
      if (ids.length === 0) return;

      const { data: squadsData, error: squadsError } = await supabase
        .from('squads')
        .select('id, name, tag, banner_url')
        .in('id', ids);
      if (squadsError) throw squadsError;
      console.log('🎯 Squads data fetched:', squadsData);

      // Members for both squads
      const { data: membersData, error: membersError } = await supabase
        .from('squad_members')
        .select('id, squad_id, player_id, profiles!squad_members_player_id_fkey(in_game_alias)')
        .in('squad_id', ids);
      if (membersError) throw membersError;
      console.log('👥 Members data fetched:', membersData);

      const membersBySquad = new Map<string, { id: string; alias: string }[]>();
      (membersData || []).forEach((m: any) => {
        const arr = membersBySquad.get(m.squad_id) || [];
        arr.push({ id: m.player_id, alias: m.profiles?.in_game_alias || 'Unknown' });
        membersBySquad.set(m.squad_id, arr);
      });

      const makeInfo = (id: string | null): SquadInfo | null => {
        if (!id) return null;
        const s = (squadsData || []).find((x: any) => x.id === id);
        if (!s) return null;
        const members = (membersBySquad.get(id) || []).sort((a, b) => a.alias.localeCompare(b.alias));
        return { id: s.id, name: s.name, banner_url: s.banner_url, members };
      };

      const squadAInfo = makeInfo(squadAId);
      const squadBInfo = makeInfo(squadBId);
      console.log('✅ Final squad infos:', { squadAInfo, squadBInfo });
      setSquadA(squadAInfo);
      setSquadB(squadBInfo);
    } catch (error) {
      console.error('Error fetching squad infos:', error);
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

  const HeadToHeadPanel = () => {
    if (!match) return null;
    const show = (match.match_type === 'squad_vs_squad' || match.match_type === 'tournament') && (squadA || squadB);
    if (!show) return null;

    const Left = squadA;
    const Right = squadB;

    return (
      <div className="relative mb-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-stretch">
          {/* Left banner */}
          <div className="rounded-2xl border border-cyan-500/20 bg-gradient-to-br from-gray-800/70 to-gray-900/70 overflow-hidden shadow-lg">
            <div className="relative h-56 sm:h-64">
              {Left?.banner_url ? (
                <img src={Left.banner_url} alt={`${Left.name} banner`} className="absolute inset-0 w-full h-full object-cover object-center opacity-70" />
              ) : (
                <div className="absolute inset-0 bg-gray-700/40" />
              )}
              <div className="absolute inset-0 bg-gradient-to-tr from-cyan-500/15 via-transparent to-transparent" />
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="text-3xl sm:text-4xl font-extrabold tracking-wide text-white drop-shadow-[0_0_12px_rgba(34,211,238,0.45)]">
                  {Left?.name || 'TBD'}
                </div>
              </div>
            </div>
            {/* Members */}
            <div className="px-4 py-3">
              <div className="text-xs text-gray-400 mb-2">Projected Lineup</div>
              <div className="flex flex-wrap gap-2">
                {(Left?.members || []).slice(0, 12).map((m) => (
                  <span key={m.id} className="px-2 py-1 rounded-md text-[11px] font-medium border border-cyan-400/30 text-cyan-200 bg-cyan-500/10">
                    {m.alias}
                  </span>
                ))}
                {(Left?.members?.length || 0) > 12 && (
                  <span className="px-2 py-1 rounded-md text-[11px] text-gray-300 bg-gray-700/50">+{(Left?.members?.length || 0) - 12} more</span>
                )}
              </div>
            </div>
          </div>

          {/* VS center */}
          <div className="relative flex items-center justify-center">
            <div className="relative h-full w-full flex flex-col items-center justify-center">
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="w-48 h-48 rounded-full bg-gradient-to-br from-fuchsia-500/25 via-purple-500/20 to-cyan-500/20 blur-2xl" />
              </div>
              <div className="relative z-10 text-5xl sm:text-6xl font-extrabold tracking-widest text-white select-none mb-3">
                <span className="bg-clip-text text-transparent bg-gradient-to-r from-cyan-300 via-white to-fuchsia-300 drop-shadow-[0_0_12px_rgba(255,255,255,0.3)]">VS</span>
              </div>
              {/* Enhanced Date & Time */}
              <div className="relative z-10 flex flex-col items-center text-center">
                <div className="text-lg sm:text-xl font-bold bg-gradient-to-r from-yellow-300 to-orange-300 bg-clip-text text-transparent drop-shadow-lg">
                  {new Date(match.scheduled_at).toLocaleDateString('en-US', { 
                    weekday: 'short', 
                    month: 'short', 
                    day: 'numeric', 
                    year: 'numeric' 
                  })}
                </div>
                <div className="text-sm sm:text-base font-semibold text-cyan-300 mt-1 px-3 py-1 rounded-full bg-cyan-500/20 border border-cyan-400/30">
                  {new Date(match.scheduled_at).toLocaleTimeString('en-US', { 
                    hour: 'numeric', 
                    minute: '2-digit',
                    timeZone: 'America/New_York'
                  })} EST
                </div>
              </div>
            </div>
          </div>

          {/* Right banner */}
          <div className="rounded-2xl border border-purple-500/20 bg-gradient-to-br from-gray-800/70 to-gray-900/70 overflow-hidden shadow-lg">
            <div className="relative h-56 sm:h-64">
              {Right?.banner_url ? (
                <img src={Right.banner_url} alt={`${Right.name} banner`} className="absolute inset-0 w-full h-full object-cover object-center opacity-70" />
              ) : (
                <div className="absolute inset-0 bg-gray-700/40" />
              )}
              <div className="absolute inset-0 bg-gradient-to-tl from-purple-500/15 via-transparent to-transparent" />
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="text-3xl sm:text-4xl font-extrabold tracking-wide text-white drop-shadow-[0_0_12px_rgba(168,85,247,0.45)]">
                  {Right?.name || 'TBD'}
                </div>
              </div>
            </div>
            {/* Members */}
            <div className="px-4 py-3">
              <div className="text-xs text-gray-400 mb-2">Projected Lineup</div>
              <div className="flex flex-wrap gap-2">
                {(Right?.members || []).slice(0, 12).map((m) => (
                  <span key={m.id} className="px-2 py-1 rounded-md text-[11px] font-medium border border-purple-400/30 text-purple-200 bg-purple-500/10">
                    {m.alias}
                  </span>
                ))}
                {(Right?.members?.length || 0) > 12 && (
                  <span className="px-2 py-1 rounded-md text-[11px] text-gray-300 bg-gray-700/50">+{(Right?.members?.length || 0) - 12} more</span>
                )}
              </div>
            </div>
          </div>
        </div>
        

      </div>
    );
  };

  const ActionButtons = () => {
    const [showRoleDropdown, setShowRoleDropdown] = useState(false);
    const [isUpdating, setIsUpdating] = useState(false);
    const [hoverTimeout, setHoverTimeout] = useState<NodeJS.Timeout | null>(null);

    const availableRoles = (['player', 'commentator', 'recording', 'referee'] as const).filter(
      role => !getAllUserParticipations().some(p => p.role === role)
    );

    const handleMouseEnter = () => {
      if (hoverTimeout) {
        clearTimeout(hoverTimeout);
        setHoverTimeout(null);
      }
      setShowRoleDropdown(true);
    };

    const handleMouseLeave = () => {
      const timeout = setTimeout(() => {
        setShowRoleDropdown(false);
      }, 1000); // 1 second delay for better interaction
      setHoverTimeout(timeout);
    };

    const handleRoleToggle = async (role: 'player' | 'commentator' | 'recording' | 'referee') => {
      if (!user || !match) return;
      
      setIsUpdating(true);
      const isCurrentlyJoined = getAllUserParticipations().some(p => p.role === role);
      
      try {
        if (isCurrentlyJoined) {
          // Leave this role
          const participation = getAllUserParticipations().find(p => p.role === role);
          if (participation) {
            const { error } = await supabase
              .from('match_participants')
              .delete()
              .eq('id', participation.id);
            if (error) throw error;
            toast.success(`Left ${role} role`);
          }
        } else {
          // Join this role
          const { error } = await supabase
            .from('match_participants')
            .insert({
              match_id: match.id,
              player_id: user.id,
              role: role
            });
          if (error) throw error;
          toast.success(`Joined as ${role}!`);
        }
        
        fetchMatchDetails(); // Refresh match data
      } catch (error: any) {
        console.error('Error toggling role:', error);
        toast.error(error.message || 'Failed to update role');
      } finally {
        setIsUpdating(false);
      }
    };

    if (!user) return null;

    return (
      <>
        {/* Join Match Button with Dropdown */}
        <div className="relative">
          <button
            onMouseEnter={handleMouseEnter}
            onMouseLeave={handleMouseLeave}
            className="group relative bg-gradient-to-r from-blue-600 via-blue-500 to-cyan-500 hover:from-blue-500 hover:via-blue-400 hover:to-cyan-400 text-white px-6 py-3 rounded-xl font-semibold shadow-lg shadow-blue-500/25 transition-all duration-300 transform hover:scale-105 border border-blue-400/30"
            disabled={!canUserJoin() && getAllUserParticipations().length === 0}
          >
            <span className="flex items-center gap-2">
              🎮 Join Match
              <span className="text-xs opacity-75">({getAllUserParticipations().length}/4)</span>
            </span>
          </button>
          
          {/* Dropdown on hover */}
          <div 
            className={`absolute top-full left-0 right-0 mt-2 bg-gray-800/95 backdrop-blur-sm border border-gray-600/50 rounded-lg shadow-xl transition-all duration-300 z-50 ${
              showRoleDropdown ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2 pointer-events-none'
            }`}
            onMouseEnter={handleMouseEnter}
            onMouseLeave={handleMouseLeave}
          >
              <div className="p-3 space-y-3">
                {(['player', 'commentator', 'recording', 'referee'] as const).map(role => {
                  const isJoined = getAllUserParticipations().some(p => p.role === role);
                  const isDisabled = match?.status !== 'scheduled' || isUpdating;
                  const roleParticipants = match?.participants?.filter(p => p.role === role) || [];
                  
                  return (
                    <div key={role} className="border border-gray-600/30 rounded-lg bg-gray-700/30">
                      {/* Role Toggle Button */}
                      <button
                        onClick={() => handleRoleToggle(role)}
                        disabled={isDisabled}
                        className={`w-full flex items-center justify-between px-3 py-2 rounded-t-lg text-sm font-medium transition-all duration-200 ${
                          isJoined 
                            ? 'bg-green-600/20 text-green-300 border-b border-green-500/30' 
                            : 'bg-gray-700/50 text-gray-300 hover:bg-gray-600/50 border-b border-gray-600/30'
                        } ${isDisabled ? 'opacity-50 cursor-not-allowed' : 'hover:scale-[1.01]'} ${
                          roleParticipants.length === 0 ? 'rounded-b-lg border-b-0' : ''
                        }`}
                      >
                        <span className="flex items-center gap-2">
                          <span>{getRoleIcon(role)}</span>
                          <span>{getRoleDisplayName(role)}</span>
                        </span>
                        <span className="flex items-center gap-2">
                          <span className="text-xs text-gray-400">({roleParticipants.length})</span>
                          <span className={`text-xs ${isJoined ? 'text-green-400' : 'text-gray-400'}`}>
                            {isJoined ? '✓' : '+'}
                          </span>
                        </span>
                      </button>
                      
                      {/* Participants List */}
                      {roleParticipants.length > 0 && (
                        <div className="px-3 py-2 space-y-1 bg-gray-800/40 rounded-b-lg">
                          {roleParticipants.map(participant => (
                            <div key={participant.id} className="text-xs flex items-center justify-between text-gray-300">
                              <div className="flex-1 min-w-0">
                                <span className="font-medium">{participant.in_game_alias}</span>
                                {participant.squad_name && (
                                  <span className="text-gray-500 ml-1">({participant.squad_name})</span>
                                )}
                              </div>
                              {participant.player_id === user?.id && match?.status === 'scheduled' && (
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    leaveMatchRole(participant.id, role);
                                  }}
                                  className="bg-red-500/20 hover:bg-red-500/40 text-red-400 px-1.5 py-0.5 rounded text-xs ml-2 flex-shrink-0 transition-colors"
                                  title={`Leave ${role} role`}
                                >
                                  ✕
                                </button>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
                
                {/* Add Video Button in Dropdown */}
                <button 
                  onClick={() => {
                    // TODO: Implement video modal or redirect
                    toast.success('Video upload functionality coming soon!');
                  }}
                  className="w-full bg-gradient-to-r from-purple-600 via-purple-500 to-pink-500 hover:from-purple-500 hover:via-purple-400 hover:to-pink-400 text-white px-3 py-2 rounded-lg font-medium shadow-lg transition-all duration-300 transform hover:scale-[1.02] border border-purple-400/30"
                >
                  <span className="flex items-center justify-center gap-2">
                    📹 Add Video
                  </span>
                </button>
              </div>
          </div>
        </div>


      </>
    );
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

  const getAllUserParticipations = () => {
    if (!user || !match) return [];
    return match.participants.filter(p => p.player_id === user.id);
  };

  const canUserJoin = () => {
    if (!user || !match) return false;
    if (match.status !== 'scheduled') return false;
    
    // For additional roles, check if user can join more roles
    const userParticipations = getAllUserParticipations();
    const userRoleSet = new Set(userParticipations.map(p => p.role));
    const availableRoles = (['player', 'commentator', 'recording', 'referee'] as const).filter(role => !userRoleSet.has(role));
    
    return availableRoles.length > 0;
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

    const allParticipations = getAllUserParticipations();
    if (allParticipations.length === 0) {
      toast.error('You are not participating in this match');
      return;
    }

    const confirmMessage = allParticipations.length > 1 
      ? `Are you sure you want to leave this match? You will be removed from all roles: ${allParticipations.map(p => p.role).join(', ')}`
      : `Are you sure you want to leave this match as ${allParticipations[0].role}?`;

    if (!confirm(confirmMessage)) return;

    try {
      console.log('Attempting to delete participations:', {
        match_id: match.id,
        player_id: user.id,
        participationIds: allParticipations.map(p => p.id)
      });

      // Delete all participations for this user in this match
      const { data, error, count } = await supabase
        .from('match_participants')
        .delete({ count: 'exact' })
        .eq('match_id', match.id)
        .eq('player_id', user.id);

      console.log('Delete result:', { data, error, count });

      if (error) {
        console.error('Supabase error details:', error);
        throw error;
      }

      if (count === 0 || count === null) {
        toast.error('No participations were removed. You may not have permission to leave this match.');
        return;
      }

      toast.success(`Left match successfully (removed ${count} participation${count > 1 ? 's' : ''})`);
      fetchMatchDetails(); // Refresh match data
    } catch (error: any) {
      console.error('Error leaving match:', error);
      toast.error(error.message || 'Failed to leave match');
    }
  };

  const leaveMatchRole = async (participantId: string, role: string) => {
    if (!confirm(`Are you sure you want to leave as ${role}?`)) return;

    try {
      console.log('Attempting to delete individual participation:', {
        participantId,
        role,
        userId: user?.id
      });

      const { data, error, count } = await supabase
        .from('match_participants')
        .delete({ count: 'exact' })
        .eq('id', participantId);

      console.log('Delete individual role result:', { data, error, count });

      if (error) {
        console.error('Supabase error details:', error);
        throw error;
      }

      if (count === 0 || count === null) {
        toast.error('Role was not removed. You may not have permission to leave this role.');
        return;
      }

      toast.success(`Left ${role} role successfully`);
      fetchMatchDetails(); // Refresh match data
    } catch (error: any) {
      console.error('Error leaving match role:', error);
      toast.error(error.message || 'Failed to leave role');
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
  const allUserParticipations = getAllUserParticipations();
  const userRoles = allUserParticipations.map(p => p.role);

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

        {/* Action Buttons Above H2H */}
        <div className="mb-6 flex justify-center gap-4">
          <ActionButtons />
        </div>

        {/* Head-to-Head Showcase (for squad vs squad / tournament) */}
        <HeadToHeadPanel />






        {/* Game Statistics */}
        <div className="mt-8">
          <GameStatsViewer 
            matchId={match.id} 
            matchTitle={match.title} 
            matchStatus={match.status}
          />
        </div>
      </div>

      {/* Join Match Modal */}
      {showParticipantModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-gray-800 rounded-lg p-6 w-full max-w-md mx-4">
            <h3 className="text-xl font-bold mb-4">
              {allUserParticipations.length > 0 ? 'Join Additional Role' : 'Join Match'}
            </h3>
            <div className="mb-4">
              <label className="block text-sm font-medium mb-2">Select your role:</label>
              <select
                value={selectedRole}
                onChange={(e) => setSelectedRole(e.target.value as any)}
                className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2"
              >
                {(['player', 'commentator', 'recording', 'referee'] as const)
                  .filter(role => !getAllUserParticipations().some(p => p.role === role))
                  .map(role => (
                    <option key={role} value={role}>
                      {role === 'player' && '🎮 Player'}
                      {role === 'commentator' && '🎤 Commentator'}
                      {role === 'recording' && '📹 Recorder'}
                      {role === 'referee' && '👨‍⚖️ Referee'}
                    </option>
                  ))}
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