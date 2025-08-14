'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useAuth } from '@/lib/AuthContext';
import { supabase } from '@/lib/supabase';

interface Team {
  id: string;
  team_name: string;
  team_banner_url: string | null;
  owner_id: string;
  owner_alias: string;
  created_at: string;
  member_count: number;
  max_players: number;
}

interface TeamMember {
  id: string;
  player_id: string;
  player_alias: string;
  player_avatar: string | null;
  joined_at: string;
  role: string;
}

interface Notification {
  id: string;
  type: 'challenge_received' | 'challenge_accepted' | 'challenge_declined' | 'team_member_joined' | 'team_member_left' | 'new_team_created';
  title: string;
  message: string;
  created_at: string;
  read: boolean;
  related_team?: string;
  related_user?: string;
  challenge_id?: string;
}

interface TripleThreatHeaderProps {
  currentPage?: 'home' | 'rules' | 'teams' | 'matches' | 'events';
  showTeamStatus?: boolean;
  onTeamLoaded?: (team: Team | null, members: TeamMember[]) => void;
}

export default function TripleThreatHeader({ 
  currentPage, 
  showTeamStatus = true,
  onTeamLoaded 
}: TripleThreatHeaderProps) {
  const { user, loading: authLoading } = useAuth();
  const [userTeam, setUserTeam] = useState<Team | null>(null);
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [teamLoading, setTeamLoading] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [showNotifications, setShowNotifications] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    if (!authLoading && user) {
      checkUserTeam();
      loadNotifications();
    } else if (!user) {
      setUserTeam(null);
      setTeamMembers([]);
      setNotifications([]);
      setUnreadCount(0);
    }
  }, [authLoading, user]);

  useEffect(() => {
    if (user && userTeam) {
      // Set up real-time subscription for notifications
      const interval = setInterval(loadNotifications, 30000); // Check every 30 seconds
      return () => clearInterval(interval);
    }
  }, [user, userTeam]);

  useEffect(() => {
    // Close notifications when clicking outside
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Element;
      if (showNotifications && !target.closest('.notifications-dropdown')) {
        setShowNotifications(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showNotifications]);

  const checkUserTeam = async () => {
    if (!user) return;

    setTeamLoading(true);
    try {
      console.log('Checking user team for user:', user.id);
      
      // Try RPC first, fallback to direct query
      try {
        const { data, error } = await supabase.rpc('get_user_tt_team', { user_id_input: user.id });
        
        if (error) throw error;

        if (data && data.length > 0) {
          const teamData = data[0];
          const team = {
            id: teamData.team_id,
            team_name: teamData.team_name,
            team_banner_url: teamData.team_banner_url,
            owner_id: teamData.owner_id,
            owner_alias: teamData.owner_alias,
            created_at: teamData.created_at,
            member_count: 0,
            max_players: teamData.max_players
          };
          setUserTeam(team);
          loadTeamMembers(teamData.team_id);
          if (onTeamLoaded) onTeamLoaded(team, []);
          return;
        }
      } catch (rpcError) {
        console.log('RPC failed, using direct query for user team:', rpcError);
        
        // Fallback to direct query
        const { data: membership, error } = await supabase
          .from('tt_team_members')
          .select(`
            team_id,
            tt_teams (
              id, team_name, team_banner_url, owner_id, created_at, max_players,
              profiles!tt_teams_owner_id_fkey (in_game_alias)
            )
          `)
          .eq('player_id', user.id)
          .eq('is_active', true)
          .single();

        if (error) {
          console.log('User not on any team:', error.message);
          setUserTeam(null);
          setTeamMembers([]);
          if (onTeamLoaded) onTeamLoaded(null, []);
          return;
        }

        if (membership && membership.tt_teams) {
          console.log('User is on team:', membership.tt_teams);
          const team = membership.tt_teams as any;
          const teamObj = {
            id: team.id,
            team_name: team.team_name,
            team_banner_url: team.team_banner_url,
            owner_id: team.owner_id,
            owner_alias: team.profiles?.in_game_alias || 'Unknown',
            created_at: team.created_at,
            member_count: 0,
            max_players: team.max_players
          };
          setUserTeam(teamObj);
          loadTeamMembers(team.id);
          if (onTeamLoaded) onTeamLoaded(teamObj, []);
        }
      }
    } catch (error) {
      console.log('Error checking user team:', error);
      setUserTeam(null);
      setTeamMembers([]);
      if (onTeamLoaded) onTeamLoaded(null, []);
    } finally {
      setTeamLoading(false);
    }
  };

  const loadTeamMembers = async (teamId: string) => {
    try {
      // Try RPC first, fallback to direct query
      try {
        const { data, error } = await supabase.rpc('get_tt_team_members', { team_id_input: teamId });
        if (error) throw error;
        setTeamMembers(data || []);
        if (onTeamLoaded && userTeam) onTeamLoaded(userTeam, data || []);
      } catch (rpcError) {
        console.log('RPC failed for team members, using direct query:', rpcError);
        
        // Fallback to direct query
        const { data, error } = await supabase
          .from('tt_team_members')
          .select(`
            id, 
            player_id, 
            joined_at, 
            role,
            profiles!tt_team_members_player_id_fkey (in_game_alias, avatar_url)
          `)
          .eq('team_id', teamId)
          .eq('is_active', true)
          .order('joined_at', { ascending: true });

        if (error) throw error;

        const formattedMembers = (data || []).map((member: any) => ({
          id: member.id,
          player_id: member.player_id,
          player_alias: member.profiles?.in_game_alias || 'Unknown',
          player_avatar: member.profiles?.avatar_url,
          joined_at: member.joined_at,
          role: member.role
        }));
        
        setTeamMembers(formattedMembers);
        if (onTeamLoaded && userTeam) onTeamLoaded(userTeam, formattedMembers);
      }
    } catch (error) {
      console.error('Error loading team members:', error);
    }
  };

  const loadNotifications = async () => {
    if (!user || !userTeam) return;

    try {
      // Get pending challenges for user's team
      const challenges = await loadChallengeNotifications();
      
      // Get team member events (simplified for now)
      const memberEvents = await loadMemberEvents();
      
      // Combine all notifications and show recent ones (even if read)
      const allNotifications = [...challenges, ...memberEvents]
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
        .slice(0, 10); // Keep last 10 notifications (recent events)
      
      setNotifications(allNotifications);
      setUnreadCount(allNotifications.filter(n => !n.read).length);
      
    } catch (error) {
      console.error('Error loading notifications:', error);
    }
  };

  const loadChallengeNotifications = async (): Promise<Notification[]> => {
    if (!user || !userTeam) return [];

    try {
      // Try RPC first, fallback to direct query
      try {
        const { data, error } = await supabase.rpc('get_tt_team_challenges', { team_id_input: userTeam.id });
        if (error) throw error;
        
        return (data || []).map((challenge: any) => ({
          id: `challenge_${challenge.id}`,
          type: challenge.is_incoming ? 'challenge_received' as const : 'challenge_accepted' as const,
          title: challenge.is_incoming ? '⚔️ Challenge Received!' : '✅ Challenge Status',
          message: challenge.is_incoming 
            ? `${challenge.challenger_team_name} wants to challenge your team`
            : `Your challenge to ${challenge.challenged_team_name} is ${challenge.status}`,
          created_at: challenge.created_at,
          read: challenge.status !== 'pending', // Mark non-pending as read
          related_team: challenge.is_incoming ? challenge.challenger_team_name : challenge.challenged_team_name,
          challenge_id: challenge.id
        }));
      } catch (rpcError) {
        console.log('RPC failed for challenges, using direct query:', rpcError);
        
        // Fallback to direct query
        const { data, error } = await supabase
          .from('tt_challenges')
          .select(`
            id, status, created_at, match_type,
            challenger_team:tt_teams!tt_challenges_challenger_team_id_fkey(team_name),
            challenged_team:tt_teams!tt_challenges_challenged_team_id_fkey(team_name)
          `)
          .or(`challenger_team_id.eq.${userTeam.id},challenged_team_id.eq.${userTeam.id}`)
          .in('status', ['pending', 'accepted', 'declined'])
          .order('created_at', { ascending: false })
          .limit(10);

        if (error) throw error;

        return (data || []).map((challenge: any) => {
          const isIncoming = challenge.challenged_team_id === userTeam.id || challenge.challenged_team?.id === userTeam.id;
          return {
            id: `challenge_${challenge.id}`,
            type: isIncoming ? 'challenge_received' as const : 'challenge_accepted' as const,
            title: isIncoming ? '⚔️ Challenge Received!' : '✅ Challenge Status',
            message: isIncoming 
              ? `${challenge.challenger_team?.team_name} wants to challenge your team`
              : `Your challenge to ${challenge.challenged_team?.team_name} is ${challenge.status}`,
            created_at: challenge.created_at,
            read: challenge.status !== 'pending', // Mark non-pending as read
            related_team: isIncoming ? challenge.challenger_team?.team_name : challenge.challenged_team?.team_name,
            challenge_id: challenge.id
          };
        });
      }
    } catch (error) {
      console.error('Error loading challenge notifications:', error);
      return [];
    }
  };

  const loadMemberEvents = async (): Promise<Notification[]> => {
    // Simplified - just return empty for now, can be expanded later
    // This would query team member join/leave events
    return [];
  };

  const markAsRead = async (notificationId: string) => {
    setNotifications(prev => 
      prev.map(n => n.id === notificationId ? { ...n, read: true } : n)
    );
    setUnreadCount(prev => Math.max(0, prev - 1));
  };

  const markAllAsRead = () => {
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
    setUnreadCount(0);
  };

  const handleChallengeResponse = async (challengeId: string, response: 'accept' | 'decline') => {
    if (!user) return;

    try {
      const { data, error } = await supabase.rpc('respond_to_tt_challenge', {
        challenge_id_input: challengeId,
        user_id_input: user.id,
        response_input: response
      });

      if (error) throw error;

      if (data && data.length > 0) {
        const result = data[0];
        if (result.success) {
          // Remove the notification and reload notifications
          setNotifications(prev => prev.filter(n => n.challenge_id !== challengeId));
          setUnreadCount(prev => Math.max(0, prev - 1));
          loadNotifications(); // Reload to get updated status
          
          // Show success message
          console.log('Challenge response successful:', result.message);
        } else {
          console.error('Challenge response failed:', result.error);
        }
      }
    } catch (error) {
      console.error('Error responding to challenge:', error);
    }
  };

  const getPageClasses = (page: string) => {
    return currentPage === page 
      ? "text-cyan-200 hover:text-cyan-100 transition-colors font-medium"
      : "text-gray-300 hover:text-white transition-colors";
  };

  return (
    <>
      {/* Fixed Header */}
      <header className="fixed top-0 left-0 right-0 z-50 bg-black/85 backdrop-blur-md border-b border-cyan-400/40">
        <div className="max-w-6xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <Link href="/triple-threat" className="flex items-center space-x-3 hover:opacity-80 transition-opacity">
              <div className="text-2xl font-black bg-gradient-to-r from-cyan-300 via-purple-300 to-pink-300 bg-clip-text text-transparent">
                TRIPLE THREAT
              </div>
            </Link>
            <nav className="flex items-center space-x-6">
              <Link href="/triple-threat" className={getPageClasses('home')}>
                Home
              </Link>
              <Link href="/triple-threat/rules" className={getPageClasses('rules')}>
                Rules
              </Link>
              <Link href="/triple-threat/teams" className={getPageClasses('teams')}>
                Teams
              </Link>
              <Link href="/triple-threat/matches" className={getPageClasses('matches')}>
                Matches
              </Link>
              <Link href="/triple-threat/events" className={getPageClasses('events')}>
                Events
              </Link>
              
              {/* Notification Bell */}
              {user && (
                <div className="relative">
                  <button
                    onClick={() => setShowNotifications(!showNotifications)}
                    className="relative p-2 text-gray-300 hover:text-white transition-colors"
                  >
                    <div className="text-xl">🔔</div>
                    {unreadCount > 0 && (
                      <div className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center font-bold">
                        {unreadCount > 9 ? '9+' : unreadCount}
                      </div>
                    )}
                  </button>
                  
                  {/* Notifications Dropdown */}
                  {showNotifications && (
                    <div className="notifications-dropdown absolute right-0 top-12 w-96 bg-gray-900/95 backdrop-blur-md border border-gray-700 rounded-xl shadow-2xl z-50 max-h-96 overflow-hidden">
                      <div className="p-4 border-b border-gray-700">
                        <div className="flex items-center justify-between">
                          <h3 className="font-bold text-white">Triple Threat Notifications</h3>
                          {unreadCount > 0 && (
                            <button
                              onClick={markAllAsRead}
                              className="text-xs text-cyan-400 hover:text-cyan-300"
                            >
                              Mark all read
                            </button>
                          )}
                        </div>
                      </div>
                      
                      <div className="max-h-80 overflow-y-auto">
                        {notifications.length === 0 ? (
                          <div className="p-6 text-center text-gray-400">
                            <div className="text-3xl mb-2">🔕</div>
                            <p>No notifications yet</p>
                            <p className="text-xs mt-1">Challenge teams or wait for team events</p>
                          </div>
                        ) : (
                          notifications.map((notification) => (
                            <div
                              key={notification.id}
                              className={`p-4 border-b border-gray-700/50 hover:bg-gray-800/50 transition-colors cursor-pointer ${
                                !notification.read ? 'bg-purple-900/20' : ''
                              }`}
                              onClick={() => markAsRead(notification.id)}
                            >
                              <div className="flex items-start space-x-3">
                                <div className="flex-1">
                                  <div className="flex items-center space-x-2 mb-1">
                                    <h4 className="font-medium text-white text-sm">{notification.title}</h4>
                                    {!notification.read && (
                                      <div className="w-2 h-2 bg-cyan-400 rounded-full"></div>
                                    )}
                                  </div>
                                  <p className="text-gray-300 text-sm">{notification.message}</p>
                                  <div className="flex items-center justify-between mt-2">
                                    <span className="text-xs text-gray-500">
                                      {new Date(notification.created_at).toLocaleDateString()} {new Date(notification.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                    </span>
                                    {notification.type === 'challenge_received' && notification.challenge_id && (
                                      <div className="flex space-x-2">
                                        <button 
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            handleChallengeResponse(notification.challenge_id!, 'accept');
                                          }}
                                          className="bg-green-600/80 hover:bg-green-600 text-white text-xs px-2 py-1 rounded transition-colors"
                                        >
                                          Accept
                                        </button>
                                        <button 
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            handleChallengeResponse(notification.challenge_id!, 'decline');
                                          }}
                                          className="bg-red-600/80 hover:bg-red-600 text-white text-xs px-2 py-1 rounded transition-colors"
                                        >
                                          Decline
                                        </button>
                                      </div>
                                    )}
                                  </div>
                                </div>
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                      
                      {notifications.length > 0 && (
                        <div className="p-3 border-t border-gray-700 text-center">
                          <button
                            onClick={() => setShowNotifications(false)}
                            className="text-xs text-gray-400 hover:text-white"
                          >
                            Close
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
              
              <Link href="/" className="bg-gradient-to-r from-cyan-500 via-purple-500 to-pink-500 hover:from-cyan-400 hover:via-purple-400 hover:to-pink-400 px-4 py-2 rounded-lg transition-all text-sm font-medium">
                ← Back to CTFPL
              </Link>
            </nav>
          </div>
        </div>
      </header>


    </>
  );
}

export type { Team, TeamMember };
