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
  type: 'challenge_received' | 'challenge_accepted' | 'challenge_declined' | 'team_member_joined' | 'team_member_left' | 'team_created';
  title: string;
  message: string;
  created_at: string;
  read: boolean;
  related_team?: string;
  related_user?: {
    id: string;
    alias: string;
    avatar_url: string | null;
  };
  challenge_id?: string;
}

interface TripleThreatHeaderProps {
  currentPage?: 'home' | 'rules' | 'teams' | 'matches' | 'events' | 'stats';
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
      // Set up more frequent polling for notifications (every 5 seconds)
      const interval = setInterval(loadNotifications, 5000);
      
      // Set up real-time subscription for tt_challenges table
      const challengeSubscription = supabase
        .channel('challenge-updates')
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'tt_challenges',
            filter: `challenged_team_id=eq.${userTeam.id}`
          },
          (payload) => {
            console.log('Real-time challenge update:', payload);
            // Reload notifications when challenges are created/updated
            loadNotifications();
          }
        )
        .subscribe();

      return () => {
        clearInterval(interval);
        challengeSubscription.unsubscribe();
      };
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
    if (!user || !userTeam) {
      console.log('Cannot load notifications - missing user or team:', { user: !!user, userTeam: !!userTeam });
      return;
    }

    try {
      console.log('Loading notifications for team:', userTeam.team_name, userTeam.id);
      
      // Get pending challenges for user's team
      const challenges = await loadChallengeNotifications();
      console.log('Found challenges:', challenges.length, challenges);
      
      // Get team member events (simplified for now)
      const memberEvents = await loadMemberEvents();
      
      // Combine all notifications and show recent ones (even if read)
      const allNotifications = [...challenges, ...memberEvents]
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
        .slice(0, 10); // Keep last 10 notifications (recent events)
      
      console.log('Total notifications:', allNotifications.length);
      console.log('Unread notifications:', allNotifications.filter(n => !n.read).length);
      
      setNotifications(allNotifications);
      setUnreadCount(allNotifications.filter(n => !n.read).length);
      
    } catch (error) {
      console.error('Error loading notifications:', error);
    }
  };

  const loadChallengeNotifications = async (): Promise<Notification[]> => {
    if (!user || !userTeam) return [];

    try {
      // Try enhanced RPC with read status first
      try {
        const { data, error } = await supabase.rpc('get_tt_team_challenges_with_reads', { 
          team_id_input: userTeam.id,
          user_id_input: user.id
        });
        if (error) throw error;
        
        return (data || []).map((challenge: any) => {
          const isIncoming = challenge.is_incoming;
          
          return {
            id: `challenge_${challenge.id}`,
            type: isIncoming ? 'challenge_received' as const : 'challenge_accepted' as const,
            title: isIncoming ? '⚔️ Challenge Received!' : '✅ Challenge Status',
            message: isIncoming 
              ? `${challenge.challenger_team_name} wants to challenge your team`
              : `Your challenge to ${challenge.challenged_team_name} is ${challenge.status}`,
            created_at: challenge.created_at,
            read: challenge.is_read, // Use database read status
            related_team: isIncoming ? challenge.challenger_team_name : challenge.challenged_team_name,
            challenge_id: challenge.id
          };
        });
      } catch (enhancedRpcError) {
        console.log('Enhanced RPC failed, trying basic RPC:', enhancedRpcError);
        
        // Fallback to basic RPC
        try {
          const { data, error } = await supabase.rpc('get_tt_team_challenges', { team_id_input: userTeam.id });
          if (error) throw error;
          
          return (data || []).map((challenge: any) => {
            const isIncoming = challenge.is_incoming;
            
            return {
              id: `challenge_${challenge.id}`,
              type: isIncoming ? 'challenge_received' as const : 'challenge_accepted' as const,
              title: isIncoming ? '⚔️ Challenge Received!' : '✅ Challenge Status',
              message: isIncoming 
                ? `${challenge.challenger_team_name} wants to challenge your team`
                : `Your challenge to ${challenge.challenged_team_name} is ${challenge.status}`,
              created_at: challenge.created_at,
              read: challenge.is_read, // Use database read status
              related_team: isIncoming ? challenge.challenger_team_name : challenge.challenged_team_name,
              challenge_id: challenge.id
            };
          });
        } catch (basicRpcError) {
          console.log('Basic RPC failed, using direct query:', basicRpcError);
          
          // Final fallback to direct query
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
            const isIncoming = challenge.challenged_team_id === userTeam.id;
            const isPending = challenge.status === 'pending';
            
            return {
              id: `challenge_${challenge.id}`,
              type: isIncoming ? 'challenge_received' as const : 'challenge_accepted' as const,
              title: isIncoming ? '⚔️ Challenge Received!' : '✅ Challenge Status',
              message: isIncoming 
                ? `${challenge.challenger_team?.team_name} wants to challenge your team`
                : `Your challenge to ${challenge.challenged_team?.team_name} is ${challenge.status}`,
              created_at: challenge.created_at,
              read: !isPending, // Fallback: only pending challenges are unread
              related_team: isIncoming ? challenge.challenger_team?.team_name : challenge.challenged_team?.team_name,
              challenge_id: challenge.id
            };
          });
        }
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
    try {
      // Update local state immediately for better UX
      setNotifications(prev => 
        prev.map(n => n.id === notificationId ? { ...n, read: true } : n)
      );
      setUnreadCount(prev => Math.max(0, prev - 1));

      // Mark as read in database for challenge notifications
      if (notificationId.startsWith('challenge_') && user) {
        const challengeId = notificationId.replace('challenge_', '');
        
        try {
          const { error } = await supabase.rpc('mark_tt_challenge_read', {
            challenge_id_input: challengeId,
            user_id_input: user.id
          });
          
          if (error) {
            console.error('Failed to mark challenge as read in database:', error);
          } else {
            console.log('Successfully marked challenge as read in database:', challengeId);
          }
        } catch (dbError) {
          console.error('Database error marking challenge as read:', dbError);
        }
      }

      console.log('Marked notification as read:', notificationId);
    } catch (error) {
      console.error('Error marking notification as read:', error);
    }
  };

  const markAllAsRead = async () => {
    try {
      // Update local state immediately
      setNotifications(prev => prev.map(n => ({ ...n, read: true })));
      setUnreadCount(0);
      
      // Mark all challenge notifications as read in database
      if (user) {
        const challengeNotifications = notifications.filter(n => n.id.startsWith('challenge_'));
        
        for (const notification of challengeNotifications) {
          const challengeId = notification.id.replace('challenge_', '');
          
          try {
            await supabase.rpc('mark_tt_challenge_read', {
              challenge_id_input: challengeId,
              user_id_input: user.id
            });
          } catch (dbError) {
            console.error('Error marking challenge as read:', challengeId, dbError);
          }
        }
        
        console.log('Marked all challenge notifications as read in database');
      }
      
      console.log('Marked all notifications as read');
    } catch (error) {
      console.error('Error marking all notifications as read:', error);
    }
  };

  const handleChallengeResponse = async (challengeId: string, response: 'accept' | 'decline') => {
    if (!user) {
      console.error('No user found for challenge response');
      return;
    }

    console.log('Attempting to respond to challenge:', { challengeId, response, userId: user.id });

    try {
      const { data, error } = await supabase.rpc('respond_to_tt_challenge', {
        challenge_id_input: challengeId,
        user_id_input: user.id,
        response_input: response
      });

      console.log('RPC response:', { data, error });

      if (error) {
        console.error('RPC error details:', {
          message: error?.message || 'Unknown error',
          details: error?.details || null,
          hint: error?.hint || null,
          code: error?.code || null
        });
        throw error;
      }

      if (data) {
        console.log('Response data:', data);
        if (data.success) {
          // Remove the notification and reload notifications
          setNotifications(prev => prev.filter(n => n.challenge_id !== challengeId));
          setUnreadCount(prev => Math.max(0, prev - 1));
          loadNotifications(); // Reload to get updated status
          
          // Show success message
          console.log('Challenge response successful:', data.message);
        } else {
          console.error('Challenge response failed:', data.error);
        }
      } else {
        console.error('No data returned from RPC call');
      }
    } catch (error: any) {
      console.error('Error responding to challenge:', {
        message: error?.message || 'Unknown error',
        details: error?.details || null,
        hint: error?.hint || null,
        code: error?.code || null,
        error: error || null
      });
    }
  };

  const getPageClasses = (page: string) => {
    return currentPage === page 
      ? "px-4 py-2 rounded-lg bg-gradient-to-r from-cyan-500/20 to-purple-500/20 border border-cyan-400/30 text-cyan-200 hover:text-cyan-100 transition-all duration-300 font-medium shadow-lg backdrop-blur-sm"
      : "px-4 py-2 rounded-lg text-gray-300 hover:text-white hover:bg-white/10 transition-all duration-300 border border-transparent hover:border-white/20 backdrop-blur-sm";
  };

  return (
    <>
      {/* Fixed Header */}
      <header className="fixed top-0 left-0 right-0 z-50 bg-black/85 backdrop-blur-md border-b border-cyan-400/40">
        <div className="max-w-6xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <Link href="/triple-threat" className="flex items-center space-x-3 hover:opacity-80 transition-opacity">
              <img 
                src="/images/triple-threat/tripleThreatImage.png" 
                alt="Triple Threat" 
                className="h-12 w-auto object-contain filter drop-shadow-lg"
                style={{ 
                  imageRendering: 'auto',
                  mixBlendMode: 'multiply',
                  backgroundColor: 'transparent',
                  filter: 'drop-shadow(0 4px 6px rgb(0 0 0 / 0.1)) contrast(1.1) brightness(1.1)'
                }}
              />
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
              <Link href="/triple-threat/stats" className={getPageClasses('stats')}>
                Stats
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
                                <div className="flex-shrink-0">
                                  {notification.related_user && (
                                    <img 
                                      src={notification.related_user.avatar_url || '/default-avatar.png'} 
                                      alt={notification.related_user.alias || 'User'}
                                      className="w-8 h-8 rounded-full border border-gray-600"
                                      onError={(e) => {
                                        e.currentTarget.src = '/default-avatar.png';
                                      }}
                                    />
                                  )}
                                  {!notification.related_user && (
                                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-cyan-500/20 to-purple-500/20 flex items-center justify-center text-lg border border-gray-600">
                                      {notification.type === 'challenge_received' && '⚔️'}
                                      {notification.type === 'challenge_accepted' && '✅'}
                                      {notification.type === 'challenge_declined' && '❌'}
                                      {notification.type === 'team_member_joined' && '👥'}
                                      {notification.type === 'team_member_left' && '👋'}
                                      {notification.type === 'team_created' && '🆕'}
                                    </div>
                                  )}
                                </div>
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
                                    {notification.type === 'challenge_received' && !notification.read && notification.challenge_id && (
                                      <div className="flex space-x-2">
                                        <button 
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            console.log('Accepting challenge:', notification.challenge_id);
                                            handleChallengeResponse(notification.challenge_id!, 'accept');
                                          }}
                                          className="bg-green-600/80 hover:bg-green-600 text-white text-xs px-2 py-1 rounded transition-colors"
                                        >
                                          Accept
                                        </button>
                                        <button 
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            console.log('Declining challenge:', notification.challenge_id);
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
              
              {/* User Avatar with Hover */}
              {user && (
                <div className="relative group">
                  {user.user_metadata?.avatar_url ? (
                    <img
                      src={user.user_metadata.avatar_url}
                      alt={user.user_metadata?.in_game_alias || user.email || 'User'}
                      className="w-9 h-9 rounded-full border-2 border-gray-600 hover:border-cyan-400 transition-colors cursor-pointer"
                    />
                  ) : (
                    <div className="w-9 h-9 rounded-full bg-gradient-to-br from-cyan-500/20 to-purple-500/20 border-2 border-gray-600 hover:border-cyan-400 flex items-center justify-center text-sm font-bold transition-colors cursor-pointer">
                      {(user.user_metadata?.in_game_alias || user.email || 'U')[0].toUpperCase()}
                    </div>
                  )}
                  
                  {/* Hover Tooltip */}
                  <div className="absolute top-full right-0 mt-2 bg-gray-900/95 backdrop-blur-sm border border-gray-600/50 rounded-lg p-3 shadow-xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 min-w-[200px] z-50">
                    <div className="text-sm">
                      <div className="text-white font-medium mb-1">
                        {user.user_metadata?.in_game_alias || 'No Alias Set'}
                      </div>
                      <div className="text-gray-400 text-xs">
                        {user.email}
                      </div>
                      {userTeam && (
                        <div className="text-cyan-400 text-xs mt-2 pt-2 border-t border-gray-600/50">
                          Team: {userTeam.team_name}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              <Link href="/" className="bg-gradient-to-r from-cyan-500 via-purple-500 to-pink-500 hover:from-cyan-400 hover:via-purple-400 hover:to-pink-400 px-4 py-2 rounded-lg transition-all duration-300 text-sm font-medium shadow-lg hover:shadow-xl transform hover:scale-105 backdrop-blur-sm border border-white/20">
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
