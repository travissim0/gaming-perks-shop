'use client';

import { useState, useEffect, useRef } from 'react';
import { useAuth } from '@/lib/AuthContext';
import { supabase } from '@/lib/supabase';
import { User } from '@supabase/supabase-js';
import Navbar from '@/components/Navbar';
import Link from 'next/link';
import { toast } from 'react-hot-toast';
import { useLoadingTimeout } from '@/hooks/useLoadingTimeout';
import { queries, robustFetch } from '@/utils/dataFetching';

interface Squad {
  id: string;
  name: string;
  tag: string;
  description: string;
  discord_link?: string;
  website_link?: string;
  captain_id: string;
  captain_alias: string;
  created_at: string;
  member_count: number;
  members: SquadMember[];
  banner_url?: string;
}

interface SquadMember {
  id: string;
  player_id: string;
  in_game_alias: string;
  role: 'captain' | 'co_captain' | 'player';
  joined_at: string;
}

interface FreeAgent {
  id: string;
  in_game_alias: string;
  email: string;
  created_at: string;
}

interface SquadInvite {
  id: string;
  squad_id?: string;
  squad_name?: string;
  squad_tag?: string;
  invited_player_id: string;
  invited_alias: string;
  invited_by_alias: string;
  created_at: string;
  expires_at: string;
  status: 'pending' | 'accepted' | 'declined' | 'expired';
  message?: string;
  inviter_alias?: string;
}

export default function SquadsPage() {
  const { user, loading } = useAuth();
  const [userSquad, setUserSquad] = useState<Squad | null>(null);
  const [allSquads, setAllSquads] = useState<Squad[]>([]);
  const [freeAgents, setFreeAgents] = useState<FreeAgent[]>([]);
  const [pendingInvites, setPendingInvites] = useState<SquadInvite[]>([]);
  const [receivedInvitations, setReceivedInvitations] = useState<SquadInvite[]>([]);
  const [sentJoinRequests, setSentJoinRequests] = useState<SquadInvite[]>([]);
  const [joinRequests, setJoinRequests] = useState<SquadInvite[]>([]);
  const [dataLoading, setDataLoading] = useState(true);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [showInviteForm, setShowInviteForm] = useState(false);
  const [showBannerForm, setShowBannerForm] = useState(false);
  const [showEditForm, setShowEditForm] = useState(false);
  const [selectedInvitee, setSelectedInvitee] = useState('');
  const [pendingInvitesError, setPendingInvitesError] = useState(false);

  // Form states
  const [squadName, setSquadName] = useState('');
  const [squadTag, setSquadTag] = useState('');
  const [squadDescription, setSquadDescription] = useState('');
  const [discordLink, setDiscordLink] = useState('');
  const [websiteLink, setWebsiteLink] = useState('');
  const [bannerUrl, setBannerUrl] = useState('');
  const [bannerFile, setBannerFile] = useState<File | null>(null);
  
  // Edit form states
  const [editSquadName, setEditSquadName] = useState('');
  const [editSquadTag, setEditSquadTag] = useState('');
  const [editSquadDescription, setEditSquadDescription] = useState('');
  const [editDiscordLink, setEditDiscordLink] = useState('');
  const [editWebsiteLink, setEditWebsiteLink] = useState('');

  // Add cleanup tracking
  const isMountedRef = useRef(true);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Loading timeout to prevent indefinite loading
  useLoadingTimeout({
    isLoading: dataLoading,
    timeout: 20000, // Longer timeout for this complex page
    onTimeout: () => {
      console.error('⏰ Squads page loading timeout - forcing completion');
      if (isMountedRef.current) {
        setDataLoading(false);
        toast.error('Loading took too long. Some data may not be available.');
      }
    }
  });

  useEffect(() => {
    isMountedRef.current = true;
    abortControllerRef.current = new AbortController();

    if (user && !loading) {
      loadInitialData();
    }

    // Cleanup function
    return () => {
      isMountedRef.current = false;
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      // Clear any pending timeouts/intervals
      const timeouts = (window as any).__squadPageTimeouts || [];
      timeouts.forEach((id: number) => clearTimeout(id));
      (window as any).__squadPageTimeouts = [];
    };
  }, [user, loading]);

  // Add error boundary for auth-related errors
  useEffect(() => {
    const handleAuthError = (error: any) => {
      if (error?.message?.includes('unsubscribe') && !error?.message?.includes('timeout')) {
        console.warn('Auth subscription error detected:', error);
        // Only log the error, don't auto-refresh to avoid loops
      }
    };

    window.addEventListener('error', handleAuthError);
    window.addEventListener('unhandledrejection', (e) => handleAuthError(e.reason));

    return () => {
      window.removeEventListener('error', handleAuthError);
      window.removeEventListener('unhandledrejection', (e) => handleAuthError(e.reason));
    };
  }, []);

  const loadInitialData = async () => {
    if (!isMountedRef.current) return;
    
    try {
      setDataLoading(true);
      
      // Load critical data first
      await Promise.allSettled([
        loadUserSquad(),
        loadAllSquads(),
        loadFreeAgents()
      ]);

      // Check if still mounted before continuing
      if (!isMountedRef.current) return;

      // Load user-specific data after basic data loads
      if (user) {
        await Promise.allSettled([
          loadReceivedInvitations(),
          loadSentJoinRequests(),
          loadJoinRequestsForSquad()
        ]);
      }

    } catch (error) {
      console.error('Error loading initial data:', error);
      if (isMountedRef.current) {
        toast.error('Failed to load squads data');
      }
    } finally {
      if (isMountedRef.current) {
        setDataLoading(false);
      }
    }
  };

  const loadUserSquad = async () => {
    if (!user || !isMountedRef.current) return;

    try {
      // First, get the user's squad membership - try both possible column names
      let membershipData = null;
      let membershipError = null;
      
      // Try with player_id first (newer schema)
      const { data: membershipData1, error: membershipError1 } = await supabase
        .from('squad_members')
        .select(`
          id,
          squad_id,
          role,
          joined_at,
          squads!inner(
            id,
            name,
            tag,
            description,
            discord_link,
            website_link,
            captain_id,
            created_at,
            banner_url
          )
        `)
        .eq('player_id', user.id)
        .eq('status', 'active')
        .maybeSingle();

      if (!membershipError1) {
        membershipData = membershipData1;
        membershipError = membershipError1;
      } else {
        // Try with user_id (older schema)
        const { data: membershipData2, error: membershipError2 } = await supabase
          .from('squad_members')
          .select(`
            id,
            squad_id,
            role,
            joined_at,
            squads!inner(
              id,
              name,
              tag,
              description,
              discord_link,
              website_link,
              captain_id,
              created_at,
              banner_url
            )
          `)
          .eq('user_id', user.id)
          .eq('status', 'active')
          .maybeSingle();
        
        membershipData = membershipData2;
        membershipError = membershipError2;
      }

      if (membershipError && membershipError.code !== 'PGRST116') {
        console.error('Error loading user squad membership:', membershipError);
        return;
      }

      if (!membershipData || !isMountedRef.current) {
        setUserSquad(null);
        return;
      }

      const squadData = membershipData.squads as any;
      
      // Get squad members first, then fetch their profiles separately for better reliability
      // Try both possible column names for compatibility
      let membersData = null;
      let membersError = null;
      let userIdColumn = 'player_id'; // Track which column is being used
      
      // Try with player_id first (newer schema)
      const { data: membersData1, error: membersError1 } = await supabase
        .from('squad_members')
        .select('id, player_id, role, joined_at')
        .eq('squad_id', squadData.id)
        .eq('status', 'active')
        .order('joined_at', { ascending: true });

      if (!membersError1) {
        membersData = membersData1;
        membersError = membersError1;
        userIdColumn = 'player_id';
      } else {
        // Try with user_id (older schema)
        const { data: membersData2, error: membersError2 } = await supabase
          .from('squad_members')
          .select('id, user_id, role, joined_at')
          .eq('squad_id', squadData.id)
          .eq('status', 'active')
          .order('joined_at', { ascending: true });
        
        membersData = membersData2;
        membersError = membersError2;
        userIdColumn = 'user_id';
      }

      if (membersError) {
        console.error('Error loading squad members:', membersError);
        // Continue with squad data even if members fail to load
      }

      let allMembersData: any[] = [];
      
      if (membersData && membersData.length > 0) {
        // Get profile data for all members using the correct column
        const memberIds = membersData.map((m: any) => m[userIdColumn]);
        const { data: profilesData, error: profilesError } = await supabase
          .from('profiles')
          .select('id, in_game_alias')
          .in('id', memberIds);

        if (profilesError) {
          console.error('Error loading member profiles:', profilesError);
        }

        // Combine member data with profile data
        allMembersData = membersData.map((member: any) => {
          const profile = profilesData?.find(p => p.id === member[userIdColumn]);
          return {
            ...member,
            player_id: member[userIdColumn], // Normalize to player_id for consistency
            profiles: profile ? { in_game_alias: profile.in_game_alias } : null
          };
        });
      }

      if (!isMountedRef.current) return;

      const formattedSquad: Squad = {
        id: squadData.id,
        name: squadData.name,
        tag: squadData.tag,
        description: squadData.description,
        discord_link: squadData.discord_link,
        website_link: squadData.website_link,
        captain_id: squadData.captain_id,
        created_at: squadData.created_at,
        banner_url: squadData.banner_url,
        captain_alias: 'Loading...',
        member_count: allMembersData?.length || 0,
        members: allMembersData?.map((member: any) => ({
          id: member.id,
          player_id: member.player_id,
          in_game_alias: member.profiles?.in_game_alias || 'Unknown',
          role: member.role,
          joined_at: member.joined_at
        })) || []
      };

      // Set captain alias from members
      const captain = formattedSquad.members.find(m => m.role === 'captain');
      formattedSquad.captain_alias = captain?.in_game_alias || 'Unknown';

      setUserSquad(formattedSquad);
    } catch (error) {
      console.error('Error loading user squad:', error);
      setUserSquad(null);
    }
  };

  const loadAllSquads = async () => {
    if (!isMountedRef.current) return;
    
    try {
      const { data: squadsData, error } = await supabase
        .from('squads')
        .select(`
          id,
          name,
          tag,
          description,
          discord_link,
          website_link,
          captain_id,
          created_at,
          banner_url,
          profiles!squads_captain_id_fkey(in_game_alias),
          squad_members!inner(id)
        `)
        .eq('is_active', true)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error loading squads:', error);
        return;
      }

      if (!isMountedRef.current) return;

      const formattedSquads: Squad[] = squadsData.map((squad: any) => ({
        id: squad.id,
        name: squad.name,
        tag: squad.tag,
        description: squad.description,
        discord_link: squad.discord_link,
        website_link: squad.website_link,
        captain_id: squad.captain_id,
        captain_alias: squad.profiles?.in_game_alias || 'Unknown',
        created_at: squad.created_at,
        banner_url: squad.banner_url,
        member_count: squad.squad_members?.length || 0,
        members: [] // Not needed for list view
      }));

      setAllSquads(formattedSquads);
    } catch (error) {
      console.error('Error loading all squads:', error);
    }
  };

  const loadFreeAgents = async () => {
    if (!isMountedRef.current) return;
    
    const { data, success } = await robustFetch(
      async () => {
        // Use optimized function
        const result = await supabase.rpc('get_free_agents_optimized');
        if (result.error) throw new Error(result.error.message);
        return result.data;
      },
      { showErrorToast: false } // Don't show error for optional data
    );

    if (!isMountedRef.current) return;

    if (success && data) {
      const formattedAgents: FreeAgent[] = data.map((agent: any) => ({
        id: agent.player_id,
        in_game_alias: agent.in_game_alias,
        email: agent.email,
        created_at: agent.created_at
      }));
      
      setFreeAgents(formattedAgents);
    }
  };

  const loadReceivedInvitations = async () => {
    if (!user || !isMountedRef.current) return;

    const { data, success } = await robustFetch(
      async () => {
        // Use optimized function
        const result = await supabase.rpc('get_squad_invitations_optimized', {
          user_id_param: user.id
        });
        if (result.error) throw new Error(result.error.message);
        return result.data;
      },
      { showErrorToast: false }
    );

    if (!isMountedRef.current) return;

    if (success && data) {
      const formattedInvitations = data.map((invite: any) => ({
        id: invite.invite_id,
        squad_id: invite.squad_id,
        squad_name: invite.squad_name,
        squad_tag: invite.squad_tag,
        invited_player_id: user.id,
        invited_alias: '',
        invited_by_alias: invite.inviter_alias,
        created_at: invite.created_at,
        expires_at: invite.expires_at,
        status: invite.status,
        message: invite.message
      }));

      setReceivedInvitations(formattedInvitations);
    }
  };

  const loadSentJoinRequests = async () => {
    if (!user || !isMountedRef.current) return;

    console.log('fetchSentJoinRequests: Starting fetch for user:', user.id);

    try {
      // Get join requests sent by the current user (where invited_by = invited_player_id = user.id)
      const { data: requestData, error } = await supabase
        .from('squad_invites')
        .select(`
          id,
          squad_id,
          invited_player_id,
          invited_by,
          message,
          created_at,
          expires_at,
          status,
          squads!inner(
            id,
            name,
            tag
          )
        `)
        .eq('invited_by', user.id)
        .eq('invited_player_id', user.id)
        .eq('status', 'pending')
        .order('created_at', { ascending: false });

      if (!isMountedRef.current) return;

      console.log('fetchSentJoinRequests: Query result:', { requestData, error });

      if (error) {
        console.error('Error fetching sent join requests:', error);
        setSentJoinRequests([]);
        return;
      }

      if (!requestData || requestData.length === 0) {
        console.log('fetchSentJoinRequests: No pending join requests found');
        setSentJoinRequests([]);
        return;
      }

      console.log('fetchSentJoinRequests: Found', requestData.length, 'requests');

      const formattedRequests = requestData.map((request: any) => ({
        id: request.id,
        squad_id: request.squad_id,
        squad_name: request.squads.name,
        squad_tag: request.squads.tag,
        invited_player_id: request.invited_player_id,
        invited_alias: '', // This is the current user
        invited_by_alias: '', // This is also the current user
        created_at: request.created_at,
        expires_at: request.expires_at,
        status: request.status,
        message: request.message
      }));

      console.log('fetchSentJoinRequests: Formatted requests:', formattedRequests);
      if (isMountedRef.current) {
        setSentJoinRequests(formattedRequests);
      }
    } catch (error) {
      console.error('Error fetching sent join requests:', error);
      if (isMountedRef.current) {
        setSentJoinRequests([]);
      }
    }
  };

  const loadJoinRequestsForSquad = async () => {
    if (!user || !userSquad || !isMountedRef.current) return;

    const userMember = userSquad.members.find(m => m.player_id === user.id);
    if (!userMember || (userMember.role !== 'captain' && userMember.role !== 'co_captain')) {
      return;
    }

    const { data, success } = await robustFetch(
      async () => {
        const result = await supabase
          .from('squad_invites')
          .select(`
            *,
            profiles!squad_invites_invited_player_id_fkey(in_game_alias)
          `)
          .eq('squad_id', userSquad.id)
          .eq('status', 'pending')
          .gt('expires_at', new Date().toISOString());

        if (result.error) throw new Error(result.error.message);
        return result.data;
      },
      { showErrorToast: false }
    );

    if (!isMountedRef.current) return;

    if (success && data) {
      // Filter to only self-requests (where invited_by = invited_player_id)
      const selfRequests = data.filter((request: any) => 
        request.invited_by === request.invited_player_id
      );
      
      const formattedRequests = selfRequests.map((request: any) => ({
        ...request,
        requester_alias: request.profiles?.in_game_alias,
        invited_alias: request.profiles?.in_game_alias // Add this for consistency
      }));

      setJoinRequests(formattedRequests);
    }
  };

  const fetchPendingInvitesForSquad = async (squadId: string) => {
    // Add null/undefined check for squadId
    if (!squadId) {
      console.warn('fetchPendingInvitesForSquad called with invalid squadId:', squadId);
      setPendingInvites([]);
      return;
    }

    // Skip if we've had previous errors
    if (pendingInvitesError) {
      console.log('Skipping pending invites fetch due to previous errors');
      setPendingInvites([]);
      return;
    }

    try {
      console.log('Fetching pending invites for squad:', squadId);
      
      // First check if the table exists and is accessible
      const { count, error: countError } = await supabase
        .from('squad_invites')
        .select('*', { count: 'exact', head: true });

      if (countError) {
        console.error('squad_invites table not accessible:', countError);
        console.log('squad_invites table may not exist or user lacks permissions');
        setPendingInvitesError(true);
        setPendingInvites([]);
        return;
      }

      console.log('squad_invites table accessible, total records:', count);
      
      // Now try the actual query
      const { data, error } = await supabase
        .from('squad_invites')
        .select('*')
        .eq('squad_id', squadId)
        .eq('status', 'pending')
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Supabase error fetching pending invites:', {
          error,
          errorCode: error.code,
          errorMessage: error.message,
          errorDetails: error.details,
          errorHint: error.hint,
          squadId
        });
        setPendingInvitesError(true);
        throw error;
      }

      console.log('Successfully fetched pending invites:', data?.length || 0);

      // If basic query works, fetch profile data separately
      if (data && data.length > 0) {
        const invitedPlayerIds = data.map(invite => invite.invited_player_id);
        const invitedByIds = data.map(invite => invite.invited_by);
        const allPlayerIds = [...new Set([...invitedPlayerIds, ...invitedByIds])];

        const { data: profilesData, error: profilesError } = await supabase
          .from('profiles')
          .select('id, in_game_alias')
          .in('id', allPlayerIds);

        if (profilesError) {
          console.warn('Error fetching profiles for invites:', profilesError);
        }

        const profilesMap = new Map(
          profilesData?.map(profile => [profile.id, profile.in_game_alias]) || []
        );

        const formattedInvites = data.map((invite: any) => ({
          id: invite.id,
          invited_player_id: invite.invited_player_id,
          invited_alias: profilesMap.get(invite.invited_player_id) || 'Unknown',
          invited_by_alias: profilesMap.get(invite.invited_by) || 'Unknown',
          created_at: invite.created_at,
          expires_at: invite.expires_at,
          status: invite.status
        }));

        setPendingInvites(formattedInvites);
      } else {
        setPendingInvites([]);
      }
    } catch (error) {
      console.error('Error fetching pending invites:', {
        error,
        errorType: typeof error,
        errorConstructor: error?.constructor?.name,
        squadId,
        errorMessage: error instanceof Error ? error.message : 'Unknown error',
        errorStack: error instanceof Error ? error.stack : undefined,
        errorStringified: JSON.stringify(error, null, 2)
      });
      // Set flag to prevent future attempts and set empty array
      setPendingInvitesError(true);
      setPendingInvites([]);
    }
  };

  const acceptInvitation = async (invitationId: string, squadId: string) => {
    if (!user) return;

    try {
      // Update invitation status to accepted
      const { error: updateError } = await supabase
        .from('squad_invites')
        .update({ 
          status: 'accepted',
          responded_at: new Date().toISOString()
        })
        .eq('id', invitationId);

      if (updateError) throw updateError;

      // Add user to squad_members
      const { error: memberError } = await supabase
        .from('squad_members')
        .insert({
          squad_id: squadId,
          player_id: user.id,
          role: 'player',
          status: 'active'
        });

      if (memberError) throw memberError;

      // Refresh data
      await Promise.all([
        loadUserSquad(),
        loadReceivedInvitations(),
        loadFreeAgents()
      ]);

      toast.success('Successfully joined the squad!');
    } catch (error) {
      console.error('Error accepting invitation:', error);
      toast.error('Error accepting invitation');
    }
  };

  const declineInvitation = async (invitationId: string) => {
    try {
      const { error } = await supabase
        .from('squad_invites')
        .update({ 
          status: 'declined',
          responded_at: new Date().toISOString()
        })
        .eq('id', invitationId);

      if (error) throw error;

      // Refresh received invitations
      await loadReceivedInvitations();
      
      toast.success('Invitation declined');
    } catch (error) {
      console.error('Error declining invitation:', error);
      toast.error('Error declining invitation');
    }
  };

  const withdrawJoinRequest = async (requestId: string) => {
    try {
      const { error } = await supabase
        .from('squad_invites')
        .update({ 
          status: 'declined',
          responded_at: new Date().toISOString()
        })
        .eq('id', requestId);

      if (error) throw error;

      // Refresh sent join requests
      await loadSentJoinRequests();
      
      toast.success('Join request withdrawn');
    } catch (error) {
      console.error('Error withdrawing join request:', error);
      toast.error('Error withdrawing join request');
    }
  };

  const approveJoinRequest = async (requestId: string, playerId: string) => {
    if (!userSquad) return;

    try {
      // Update request status to accepted
      const { error: updateError } = await supabase
        .from('squad_invites')
        .update({ 
          status: 'accepted',
          responded_at: new Date().toISOString()
        })
        .eq('id', requestId);

      if (updateError) throw updateError;

      // Add player to squad_members
      const { error: memberError } = await supabase
        .from('squad_members')
        .insert({
          squad_id: userSquad.id,
          player_id: playerId,
          role: 'player',
          status: 'active'
        });

      if (memberError) throw memberError;

      // Refresh data
      await Promise.all([
        loadUserSquad(),
        loadFreeAgents(),
        loadJoinRequestsForSquad()
      ]);

      toast.success('Join request approved!');
    } catch (error) {
      console.error('Error approving join request:', error);
      toast.error('Error approving join request');
    }
  };

  const denyJoinRequest = async (requestId: string) => {
    try {
      const { error } = await supabase
        .from('squad_invites')
        .update({ 
          status: 'declined',
          responded_at: new Date().toISOString()
        })
        .eq('id', requestId);

      if (error) throw error;

      // Refresh join requests and related data
      await Promise.all([
        loadJoinRequestsForSquad(),
        loadFreeAgents()
      ]);
      
      toast.success('Join request denied');
    } catch (error) {
      console.error('Error denying join request:', error);
      toast.error('Error denying join request');
    }
  };

  const invitePlayer = async () => {
    if (!selectedInvitee || !userSquad) return;

    try {
      const { error } = await supabase
        .from('squad_invites')
        .insert([
          {
            squad_id: userSquad.id,
            invited_player_id: selectedInvitee,
            invited_by: user?.id,
            expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString() // 7 days
          }
        ]);

      if (error) throw error;

      toast.success('Invitation sent successfully');
      setShowInviteForm(false);
      setSelectedInvitee('');
      loadAllSquads();
      loadFreeAgents();
    } catch (error) {
      console.error('Error sending invitation:', error);
      toast.error('Failed to send invitation');
    }
  };

  const kickMember = async (memberId: string) => {
    if (!confirm('Are you sure you want to kick this member?')) return;

    try {
      const { error } = await supabase
        .from('squad_members')
        .update({ status: 'inactive' })
        .eq('id', memberId);

      if (error) throw error;

      toast.success('Member kicked successfully');
      loadAllSquads();
      loadFreeAgents();
    } catch (error) {
      console.error('Error kicking member:', error);
      toast.error('Failed to kick member');
    }
  };

  const promoteMember = async (memberId: string, newRole: string) => {
    try {
      const { error } = await supabase
        .from('squad_members')
        .update({ role: newRole })
        .eq('id', memberId);

      if (error) throw error;

      toast.success(`Member ${newRole === 'co_captain' ? 'promoted' : 'demoted'} successfully`);
      loadUserSquad();
    } catch (error) {
      console.error('Error updating member role:', error);
      toast.error('Failed to update member role');
    }
  };

  const leaveSquad = async () => {
    if (!confirm('Are you sure you want to leave your squad?')) return;

    try {
      const { error } = await supabase
        .from('squad_members')
        .delete()
        .eq('player_id', user?.id);

      if (error) throw error;

      setUserSquad(null);
      loadAllSquads();
      loadFreeAgents();
    } catch (error) {
      console.error('Error leaving squad:', error);
      toast.error('Error leaving squad');
    }
  };

  const disbandSquad = async () => {
    if (!confirm('Are you sure you want to disband this squad? This action cannot be undone and will remove all members.')) return;

    try {
      // First delete all squad members
      const { error: membersError } = await supabase
        .from('squad_members')
        .delete()
        .eq('squad_id', userSquad?.id);

      if (membersError) throw membersError;

      // Then delete the squad
      const { error: squadError } = await supabase
        .from('squads')
        .delete()
        .eq('id', userSquad?.id);

      if (squadError) throw squadError;

      setUserSquad(null);
      loadAllSquads();
      loadFreeAgents();
    } catch (error) {
      console.error('Error disbanding squad:', error);
      toast.error('Error disbanding squad');
    }
  };

  const transferOwnership = async (newCaptainId: string) => {
    if (!confirm('Are you sure you want to transfer squad ownership? You will become a regular player.')) return;

    try {
      // Use the database function for safe captain transfers
      const { data, error } = await supabase.rpc('transfer_squad_ownership', {
        squad_id_param: userSquad?.id,
        new_captain_id_param: newCaptainId
      });

      if (error) throw error;

      if (data) {
        toast.success('Squad ownership transferred successfully!');
        loadUserSquad();
      } else {
        throw new Error('Transfer function returned false');
      }
    } catch (error) {
      console.error('Error transferring ownership:', error);
      toast.error('Error transferring ownership: ' + (error as Error).message);
    }
  };

  const getRoleIcon = (role: string) => {
    switch (role) {
      case 'captain': return '👑';
      case 'co_captain': return '⭐';
      default: return '🎮';
    }
  };

  const getRoleColor = (role: string) => {
    switch (role) {
      case 'captain': return 'text-yellow-400';
      case 'co_captain': return 'text-blue-400';
      default: return 'text-gray-300';
    }
  };

  const canManageSquad = userSquad && userSquad.members.some(
    member => member.player_id === user?.id && ['captain', 'co_captain'].includes(member.role)
  );

  const isCaptain = userSquad && userSquad.members.some(
    member => member.player_id === user?.id && member.role === 'captain'
  );

  const handleCreateSquad = async () => {
    if (!squadName.trim() || !squadTag.trim() || !user) {
      toast.error('Please fill in all required fields');
      return;
    }

    try {
      const response = await fetch('/api/squads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: squadName.trim(),
          tag: squadTag.trim(),
          description: squadDescription.trim(),
          captainId: user.id,
          discordLink: discordLink.trim() || null,
          websiteLink: websiteLink.trim() || null
        })
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Failed to create squad');
      }

      toast.success('Squad created successfully!');
      setShowCreateForm(false);
      setSquadName('');
      setSquadTag('');
      setSquadDescription('');
      setDiscordLink('');
      setWebsiteLink('');
      
      loadUserSquad();
    } catch (error: any) {
      console.error('Error creating squad:', error);
      toast.error(error.message || 'Failed to create squad');
    }
  };

  const updateSquadBanner = async () => {
    if (!userSquad || !isCaptain) return;

    try {
      let finalBannerUrl = bannerUrl.trim();

      // If there's a file to upload, upload it first
      if (bannerFile) {
        try {
          const fileExt = bannerFile.name.split('.').pop();
          const fileName = `squad-${userSquad.id}-${Date.now()}.${fileExt}`;
          const filePath = `squad-banners/${fileName}`;
          
          const { error: uploadError, data } = await supabase.storage
            .from('avatars') // Using existing avatars bucket
            .upload(filePath, bannerFile, {
              upsert: true
            });
            
          if (uploadError) {
            if (uploadError.message?.includes('Bucket not found')) {
              toast.error('Image storage not set up yet. Please use a URL instead.');
              return;
            } else {
              throw uploadError;
            }
          }
          
          const { data: { publicUrl } } = supabase.storage
            .from('avatars')
            .getPublicUrl(filePath);
            
          finalBannerUrl = publicUrl;
        } catch (uploadError: any) {
          console.error('Error uploading banner:', uploadError);
          toast.error('Failed to upload image. Please try a URL instead.');
          return;
        }
      } else if (bannerUrl.trim() && !isValidImageUrl(bannerUrl.trim())) {
        toast.error('Please enter a valid image URL (jpg, png, gif, webp)');
        return;
      }

      const { error } = await supabase
        .from('squads')
        .update({ 
          banner_url: finalBannerUrl || null 
        })
        .eq('id', userSquad.id);

      if (error) throw error;

      toast.success(finalBannerUrl ? 'Squad picture updated!' : 'Squad picture removed!');
      setShowBannerForm(false);
      setBannerUrl('');
      setBannerFile(null);
      
      // Refresh squad data
      loadUserSquad();
      loadAllSquads();
    } catch (error) {
      console.error('Error updating squad banner:', error);
      toast.error('Failed to update squad picture');
    }
  };

  const handleBannerFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      
      // Validate file type and size
      const validTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
      const maxSize = 5 * 1024 * 1024; // 5MB
      
      if (!validTypes.includes(file.type)) {
        toast.error('Invalid file type. Please upload a JPEG, PNG, GIF, or WebP image.');
        return;
      }
      
      if (file.size > maxSize) {
        toast.error('File is too large. Maximum size is 5MB.');
        return;
      }
      
      setBannerFile(file);
      setBannerUrl(''); // Clear URL if file is selected
      
      // Create a preview URL
      const reader = new FileReader();
      reader.onload = (e) => {
        setBannerUrl(e.target?.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const isValidImageUrl = (url: string) => {
    try {
      const urlObj = new URL(url);
      const validExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp'];
      const pathname = urlObj.pathname.toLowerCase();
      return validExtensions.some(ext => pathname.endsWith(ext)) || 
             url.includes('imgur.com') || 
             url.includes('discord.com') ||
             url.includes('cdn.') ||
             url.includes('i.redd.it');
    } catch {
      return false;
    }
  };

  const openEditForm = () => {
    if (!userSquad) return;
    
    // Pre-populate form with current values
    setEditSquadName(userSquad.name);
    setEditSquadTag(userSquad.tag);
    setEditSquadDescription(userSquad.description || '');
    setEditDiscordLink(userSquad.discord_link || '');
    setEditWebsiteLink(userSquad.website_link || '');
    setShowEditForm(true);
  };

  const updateSquadDetails = async () => {
    if (!userSquad || !isCaptain) return;

    try {
      const { error } = await supabase
        .from('squads')
        .update({
          name: editSquadName.trim(),
          tag: editSquadTag.trim(),
          description: editSquadDescription.trim() || null,
          discord_link: editDiscordLink.trim() || null,
          website_link: editWebsiteLink.trim() || null,
          updated_at: new Date().toISOString()
        })
        .eq('id', userSquad.id);

      if (error) throw error;

      toast.success('Squad details updated successfully!');
      setShowEditForm(false);
      
      // Refresh squad data
      loadUserSquad();
      loadAllSquads();
    } catch (error) {
      console.error('Error updating squad details:', error);
      toast.error('Failed to update squad details');
    }
  };

  // Enhanced loading screen
  if (loading || dataLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-slate-800 to-gray-900">
        <Navbar user={user} />
        <div className="container mx-auto py-8 px-4 flex items-center justify-center min-h-[60vh]">
          <div className="text-center">
            <div className="animate-spin rounded-full h-16 w-16 border-t-2 border-b-2 border-cyan-500 mx-auto mb-6"></div>
            <p className="text-cyan-400 font-mono text-lg">Loading squads...</p>
            <p className="text-gray-400 text-sm mt-2">This might take a moment</p>
          </div>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-4">Please log in to view squads</h1>
          <a href="/auth/login" className="bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded">
            Login
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-slate-800 to-gray-900">
      <Navbar user={user} />
      
      <main className="container mx-auto py-8 px-4">
        <div className="text-center mb-8">
          <h1 className="text-5xl font-bold text-cyan-400 mb-4 tracking-wider">🛡️ Squad Management</h1>
          <p className="text-gray-400 text-lg">Form teams, compete together, dominate the battlefield</p>
        </div>

        {/* Prominent Join Requests Notification for Captains/Co-Captains */}
        {!dataLoading && userSquad && canManageSquad && joinRequests.length > 0 && (
          <div className="bg-gradient-to-r from-yellow-600/20 to-orange-600/20 border border-yellow-500/50 rounded-xl p-6 mb-8">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="bg-yellow-500 text-black p-2 rounded-full">
                  <span className="text-xl">🛡️</span>
                </div>
                <div>
                  <h3 className="text-xl font-bold text-yellow-400">
                    {joinRequests.length} Pending Join Request{joinRequests.length !== 1 ? 's' : ''}
                  </h3>
                  <p className="text-yellow-300/80 text-sm">
                    Players want to join your squad [{userSquad.tag}] {userSquad.name}
                  </p>
                </div>
              </div>
              <span className="bg-yellow-500 text-black font-bold px-3 py-1 rounded-full text-sm">
                {joinRequests.length}
              </span>
            </div>
            
            <div className="space-y-3">
              {joinRequests.map((request) => (
                <div key={request.id} className="bg-gray-800/50 rounded-lg p-4 border border-gray-600/30">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="font-bold text-white text-lg">{request.invited_alias}</span>
                        <span className="bg-green-600/20 text-green-400 px-2 py-1 rounded text-xs font-medium">
                          WANTS TO JOIN
                        </span>
                      </div>
                      <div className="text-sm text-gray-400 mb-2">
                        Requested {new Date(request.created_at).toLocaleDateString()} • 
                        Expires {new Date(request.expires_at).toLocaleDateString()}
                      </div>
                      {request.message && (
                        <div className="text-sm text-gray-300 bg-gray-700/50 p-3 rounded mb-3 border-l-4 border-yellow-500">
                          <span className="font-medium text-yellow-400">Message:</span> "{request.message}"
                        </div>
                      )}
                    </div>
                    <div className="flex gap-2 sm:flex-shrink-0">
                      <button
                        onClick={() => approveJoinRequest(request.id, request.invited_player_id)}
                        className="flex-1 sm:flex-none bg-green-600 hover:bg-green-500 text-white px-4 py-2 rounded-lg font-medium transition-all duration-200 flex items-center justify-center gap-2"
                      >
                        <span>✅</span>
                        Approve
                      </button>
                      <button
                        onClick={() => denyJoinRequest(request.id)}
                        className="flex-1 sm:flex-none bg-red-600 hover:bg-red-500 text-white px-4 py-2 rounded-lg font-medium transition-all duration-200 flex items-center justify-center gap-2"
                      >
                        <span>❌</span>
                        Deny
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* User's Squad Section */}
        {dataLoading ? (
          <div className="bg-gray-800 rounded-lg p-6 mb-8">
            <div className="animate-pulse">
              <div className="h-6 bg-gray-700 rounded w-1/3 mb-4"></div>
              <div className="h-4 bg-gray-700 rounded w-2/3 mb-2"></div>
              <div className="h-4 bg-gray-700 rounded w-1/2"></div>
            </div>
          </div>
        ) : userSquad ? (
          <div className="bg-gray-800 rounded-lg p-6 mb-8">
            <div className="flex justify-between items-start mb-6">
              <div>
                <h2 className="text-2xl font-bold mb-2">
                  [{userSquad.tag}] {userSquad.name}
                </h2>
                <p className="text-gray-300 mb-4">{userSquad.description}</p>
                <div className="flex gap-4 text-sm text-gray-400">
                  <span>Members: {userSquad.member_count}</span>
                  <span>Captain: {userSquad.captain_alias}</span>
                  <span>Created: {new Date(userSquad.created_at).toLocaleDateString()}</span>
                </div>
                {userSquad.discord_link && (
                  <a href={userSquad.discord_link} target="_blank" rel="noopener noreferrer" 
                     className="text-blue-400 hover:text-blue-300 mr-4">
                    Discord
                  </a>
                )}
                {userSquad.website_link && (
                  <a href={userSquad.website_link} target="_blank" rel="noopener noreferrer" 
                     className="text-blue-400 hover:text-blue-300">
                    Website
                  </a>
                )}
              </div>
              {/* Squad Management Actions - Mobile Optimized */}
              <div className="flex flex-col sm:flex-row gap-3">
                {/* Primary Actions Group */}
                {canManageSquad && (
                  <div className="flex flex-col sm:flex-row gap-2">
                    <button
                      onClick={() => setShowInviteForm(true)}
                      className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2.5 rounded-lg text-sm font-medium flex items-center justify-center gap-2 transition-all duration-200 shadow-md hover:shadow-lg"
                    >
                      <span>👥</span>
                      Invite Player
                    </button>
                    
                    {isCaptain && (
                      <div className="flex flex-col sm:flex-row gap-2">
                        <button
                          onClick={() => setShowBannerForm(true)}
                          className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2.5 rounded-lg text-sm font-medium flex items-center justify-center gap-2 transition-all duration-200 shadow-md hover:shadow-lg"
                        >
                          <span>🖼️</span>
                          {userSquad?.banner_url ? 'Update Picture' : 'Add Picture'}
                        </button>
                        <button
                          onClick={openEditForm}
                          className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2.5 rounded-lg text-sm font-medium flex items-center justify-center gap-2 transition-all duration-200 shadow-md hover:shadow-lg"
                        >
                          <span>✏️</span>
                          Edit Details
                        </button>
                      </div>
                    )}
                  </div>
                )}
                
                {/* Danger Zone Actions */}
                <div className="flex flex-col sm:flex-row gap-2 sm:ml-auto">
                  {isCaptain ? (
                    <button
                      onClick={disbandSquad}
                      className="bg-red-600 hover:bg-red-700 text-white px-4 py-2.5 rounded-lg text-sm font-medium flex items-center justify-center gap-2 transition-all duration-200 shadow-md hover:shadow-lg border border-red-500"
                    >
                      <span>💥</span>
                      Disband Squad
                    </button>
                  ) : (
                    <button
                      onClick={leaveSquad}
                      className="bg-orange-600 hover:bg-orange-700 text-white px-4 py-2.5 rounded-lg text-sm font-medium flex items-center justify-center gap-2 transition-all duration-200 shadow-md hover:shadow-lg border border-orange-500"
                    >
                      <span>🚪</span>
                      Leave Squad
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* Squad Members */}
            <div className="mb-6">
              <h3 className="text-xl font-semibold mb-4 text-cyan-400 flex items-center gap-2">
                <span>👥</span>
                Members ({userSquad.member_count})
              </h3>
              <div className="grid gap-3">
                {userSquad.members.map((member) => (
                  <div key={member.id} className="bg-gradient-to-r from-gray-700/80 to-gray-600/60 rounded-lg p-4 border border-gray-600/30">
                    <div className="flex flex-col lg:flex-row lg:justify-between lg:items-start gap-3">
                      <div className="flex items-center gap-3">
                        <span className="text-2xl">{getRoleIcon(member.role)}</span>
                        <div>
                          <span className={`font-semibold text-lg ${getRoleColor(member.role)}`}>
                            {member.in_game_alias}
                          </span>
                          <div className="text-sm text-gray-400">
                            {member.role.replace('_', ' ').toUpperCase()} • Joined {new Date(member.joined_at).toLocaleDateString()}
                          </div>
                        </div>
                      </div>
                      {isCaptain && member.player_id !== user?.id && (
                        <div className="flex flex-col sm:flex-row gap-1 sm:gap-2 w-full lg:w-auto">
                          {member.role === 'player' && (
                            <button
                              onClick={() => promoteMember(member.id, 'co_captain')}
                              className="bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-2 rounded-lg text-xs font-medium flex items-center justify-center gap-1 transition-all duration-200 shadow-sm"
                            >
                              <span>⬆️</span>
                              Promote
                            </button>
                          )}
                          {member.role === 'co_captain' && (
                            <button
                              onClick={() => promoteMember(member.id, 'player')}
                              className="bg-amber-600 hover:bg-amber-700 text-white px-3 py-2 rounded-lg text-xs font-medium flex items-center justify-center gap-1 transition-all duration-200 shadow-sm"
                            >
                              <span>⬇️</span>
                              Demote
                            </button>
                          )}
                          <button
                            onClick={() => transferOwnership(member.player_id)}
                            className="bg-purple-600 hover:bg-purple-700 text-white px-3 py-2 rounded-lg text-xs font-medium flex items-center justify-center gap-1 transition-all duration-200 shadow-sm"
                          >
                            <span>👑</span>
                            Make Captain
                          </button>
                          <button
                            onClick={() => kickMember(member.id)}
                            className="bg-red-600 hover:bg-red-700 text-white px-3 py-2 rounded-lg text-xs font-medium flex items-center justify-center gap-1 transition-all duration-200 border border-red-500 shadow-sm"
                          >
                            <span>🚫</span>
                            Kick
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Pending Invites */}
            {canManageSquad && pendingInvites.length > 0 && (
              <div>
                <h3 className="text-xl font-semibold mb-4">Pending Invitations</h3>
                <div className="grid gap-3">
                  {pendingInvites.map((invite) => (
                    <div key={invite.id} className="bg-gray-700 rounded p-4 flex justify-between items-center">
                      <div>
                        <span className="font-semibold">{invite.invited_alias}</span>
                        <div className="text-sm text-gray-400">
                          Invited by {invite.invited_by_alias} • Expires {new Date(invite.expires_at).toLocaleDateString()}
                        </div>
                      </div>
                      <span className="text-yellow-400 text-sm">Pending</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Join Requests to Squad */}
            {canManageSquad && joinRequests.length > 0 && (
              <div>
                <h3 className="text-xl font-semibold mb-4">Join Requests</h3>
                <div className="grid gap-3">
                  {joinRequests.map((request) => (
                    <div key={request.id} className="bg-gray-700 rounded p-4">
                      <div className="flex justify-between items-start">
                        <div className="flex-1">
                          <span className="font-semibold text-green-400">{request.invited_alias}</span>
                          <div className="text-sm text-gray-400 mb-2">
                            Requested to join {new Date(request.created_at).toLocaleDateString()} • Expires {new Date(request.expires_at).toLocaleDateString()}
                          </div>
                          {request.message && (
                            <div className="text-sm text-gray-300 bg-gray-600 p-2 rounded mb-3">
                              "{request.message}"
                            </div>
                          )}
                        </div>
                        <div className="flex gap-2 ml-4">
                          <button
                            onClick={() => approveJoinRequest(request.id, request.invited_player_id)}
                            className="bg-green-600 hover:bg-green-700 px-4 py-2 rounded text-sm"
                          >
                            Approve
                          </button>
                          <button
                            onClick={() => denyJoinRequest(request.id)}
                            className="bg-red-600 hover:bg-red-700 px-4 py-2 rounded text-sm"
                          >
                            Deny
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Sent Join Requests - Show for ALL users */}
            {sentJoinRequests.length > 0 && (
              <div className="bg-gray-800 rounded-lg p-6">
                <h2 className="text-xl font-semibold mb-4">Your Pending Join Requests</h2>
                <div className="grid gap-3">
                  {sentJoinRequests.map((request) => (
                    <div key={request.id} className="bg-gray-700 rounded p-4">
                      <div className="flex justify-between items-start">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-2">
                            <span className="font-semibold text-orange-400">
                              [{request.squad_tag}] {request.squad_name}
                            </span>
                            <span className="bg-yellow-600 text-yellow-100 px-2 py-1 rounded text-xs">
                              REQUEST PENDING
                            </span>
                          </div>
                          <div className="text-sm text-gray-400 mb-2">
                            Requested {new Date(request.created_at).toLocaleDateString()} • Expires {new Date(request.expires_at).toLocaleDateString()}
                          </div>
                          <div className="text-sm text-gray-500">
                            Waiting for squad captain to approve your request
                          </div>
                          {request.message && (
                            <div className="text-sm text-gray-300 bg-gray-600 p-2 rounded mb-3 mt-2">
                              Your message: "{request.message}"
                            </div>
                          )}
                        </div>
                        <div className="flex gap-2 ml-4">
                          <button
                            onClick={() => withdrawJoinRequest(request.id)}
                            className="bg-red-600 hover:bg-red-700 px-4 py-2 rounded text-sm"
                          >
                            Withdraw Request
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-6 mb-8">
            {/* Received Invitations */}
            {receivedInvitations.length > 0 && (
              <div className="bg-gray-800 rounded-lg p-6">
                <h2 className="text-xl font-semibold mb-4">Squad Invitations</h2>
                <div className="grid gap-3">
                  {receivedInvitations.map((invitation) => (
                    <div key={invitation.id} className="bg-gray-700 rounded p-4">
                      <div className="flex justify-between items-start">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-2">
                            <span className="font-semibold text-cyan-400">
                              [{invitation.squad_tag}] {invitation.squad_name}
                            </span>
                          </div>
                          <div className="text-sm text-gray-400 mb-2">
                            Invited by {invitation.inviter_alias} • Expires {new Date(invitation.expires_at).toLocaleDateString()}
                          </div>
                          {invitation.message && (
                            <div className="text-sm text-gray-300 bg-gray-600 p-2 rounded mb-3">
                              "{invitation.message}"
                            </div>
                          )}
                        </div>
                        <div className="flex gap-2 ml-4">
                          <button
                            onClick={() => acceptInvitation(invitation.id, invitation.squad_id!)}
                            className="bg-green-600 hover:bg-green-700 px-4 py-2 rounded text-sm"
                          >
                            Accept
                          </button>
                          <button
                            onClick={() => declineInvitation(invitation.id)}
                            className="bg-red-600 hover:bg-red-700 px-4 py-2 rounded text-sm"
                          >
                            Decline
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Create Squad Section */}
            <div className="bg-gray-800 rounded-lg p-6 text-center">
              <h2 className="text-xl font-semibold mb-4">You're not in a squad</h2>
              <p className="text-gray-300 mb-4">Create your own squad or wait for an invitation</p>
              <button
                onClick={() => setShowCreateForm(true)}
                className="bg-blue-600 hover:bg-blue-700 px-6 py-2 rounded"
              >
                Create Squad
              </button>
            </div>
          </div>
        )}

        {/* All Squads Section */}
        <div className="bg-gray-800 rounded-lg p-6">
          <h2 className="text-2xl font-bold mb-6">All Squads</h2>
          {dataLoading ? (
            <div className="grid gap-4">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="bg-gray-700 rounded p-4 animate-pulse">
                  <div className="h-5 bg-gray-600 rounded w-1/3 mb-2"></div>
                  <div className="h-4 bg-gray-600 rounded w-2/3 mb-2"></div>
                  <div className="h-3 bg-gray-600 rounded w-1/2"></div>
                </div>
              ))}
            </div>
          ) : (
            <div className="grid gap-4">
              {allSquads.map((squad) => (
                <Link key={squad.id} href={`/squads/${squad.id}`}>
                  <div className="bg-gray-700 rounded-lg overflow-hidden hover:bg-gray-600 transition-colors cursor-pointer">
                    <div className="p-4">
                      <div className="flex gap-4">
                        {/* Squad Picture */}
                        {squad.banner_url && (
                          <div className="w-24 h-24 flex-shrink-0">
                            <div className="bg-gray-800/50 rounded-lg overflow-hidden border border-gray-600/30 h-full">
                              <img 
                                src={squad.banner_url} 
                                alt={`${squad.name} picture`}
                                className="w-full h-full object-cover"
                                onError={(e) => {
                                  e.currentTarget.parentElement!.style.display = 'none';
                                }}
                              />
                            </div>
                          </div>
                        )}
                        
                        {/* Squad Info */}
                        <div className="flex-1 min-w-0">
                          <h3 className="text-lg font-semibold mb-2 text-cyan-400 hover:text-cyan-300 truncate">
                            [{squad.tag}] {squad.name}
                          </h3>
                          
                          <p className="text-gray-300 mb-3 text-sm line-clamp-2">{squad.description}</p>
                          
                          <div className="flex justify-between items-center">
                            <div className="flex gap-4 text-sm text-gray-400">
                              <span className="flex items-center gap-1">
                                👥 {squad.member_count} members
                              </span>
                              <span className="flex items-center gap-1">
                                👑 {squad.captain_alias}
                              </span>
                            </div>
                            <div className="text-xs text-gray-500">
                              {new Date(squad.created_at).toLocaleDateString()}
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </Link>
              ))}
              {!dataLoading && allSquads.length === 0 && (
                <div className="text-center py-8 text-gray-400">
                  No squads found. Be the first to create one!
                </div>
              )}
            </div>
          )}
        </div>

        {/* Create Squad Modal */}
        {showCreateForm && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-gray-800 rounded-lg p-6 w-full max-w-md">
              <h3 className="text-xl font-bold mb-4">Create New Squad</h3>
              <form onSubmit={(e) => { e.preventDefault(); handleCreateSquad(); }}>
                <div className="mb-4">
                  <label className="block text-sm font-medium mb-2">Squad Name</label>
                  <input
                    type="text"
                    value={squadName}
                    onChange={(e) => setSquadName(e.target.value)}
                    className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2"
                    required
                  />
                </div>
                <div className="mb-4">
                  <label className="block text-sm font-medium mb-2">Squad Tag (3-5 chars)</label>
                  <input
                    type="text"
                    value={squadTag}
                    onChange={(e) => setSquadTag(e.target.value.toUpperCase())}
                    className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2"
                    maxLength={5}
                    required
                  />
                </div>
                <div className="mb-4">
                  <label className="block text-sm font-medium mb-2">Description</label>
                  <textarea
                    value={squadDescription}
                    onChange={(e) => setSquadDescription(e.target.value)}
                    className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2"
                    rows={3}
                    required
                  />
                </div>
                <div className="mb-4">
                  <label className="block text-sm font-medium mb-2">Discord Link (optional)</label>
                  <input
                    type="url"
                    value={discordLink}
                    onChange={(e) => setDiscordLink(e.target.value)}
                    className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2"
                  />
                </div>
                <div className="mb-6">
                  <label className="block text-sm font-medium mb-2">Website Link (optional)</label>
                  <input
                    type="url"
                    value={websiteLink}
                    onChange={(e) => setWebsiteLink(e.target.value)}
                    className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2"
                  />
                </div>
                <div className="flex gap-3">
                  <button
                    type="submit"
                    className="flex-1 bg-blue-600 hover:bg-blue-700 py-2 rounded"
                  >
                    Create Squad
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowCreateForm(false)}
                    className="flex-1 bg-gray-600 hover:bg-gray-700 py-2 rounded"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Invite Player Modal */}
        {showInviteForm && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-gray-800 rounded-lg p-6 w-full max-w-md">
              <h3 className="text-xl font-bold mb-4">Invite Player</h3>
              <form onSubmit={invitePlayer}>
                <div className="mb-6">
                  <label className="block text-sm font-medium mb-2">Select Free Agent</label>
                  <select
                    value={selectedInvitee}
                    onChange={(e) => setSelectedInvitee(e.target.value)}
                    className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2"
                    required
                  >
                    <option value="">Choose a player...</option>
                    {freeAgents.map((agent) => (
                      <option key={agent.id} value={agent.id}>
                        {agent.in_game_alias}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex gap-3">
                  <button
                    type="submit"
                    className="flex-1 bg-green-600 hover:bg-green-700 py-2 rounded"
                  >
                    Send Invitation
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowInviteForm(false)}
                    className="flex-1 bg-gray-600 hover:bg-gray-700 py-2 rounded"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Squad Banner Management Modal */}
        {showBannerForm && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-gray-800 rounded-lg p-6 w-full max-w-md">
              <h3 className="text-xl font-bold mb-4">
                {userSquad?.banner_url ? 'Update Squad Picture' : 'Add Squad Picture'}
              </h3>
              
              {/* Current Banner Preview */}
              {userSquad?.banner_url && (
                <div className="mb-4">
                  <label className="block text-sm font-medium mb-2">Current Picture</label>
                  <div className="w-full max-w-xs mx-auto bg-gray-700 rounded-lg overflow-hidden">
                    <img 
                      src={userSquad.banner_url} 
                      alt="Current picture"
                      className="w-full h-auto object-contain max-h-40"
                      onError={(e) => {
                        e.currentTarget.src = '';
                        e.currentTarget.style.display = 'none';
                      }}
                    />
                  </div>
                </div>
              )}

              <form onSubmit={(e) => { e.preventDefault(); updateSquadBanner(); }}>
                {/* File Upload Option */}
                <div className="mb-6">
                  <label className="block text-sm font-medium mb-2">Upload Image File</label>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleBannerFileChange}
                    className="hidden"
                    id="banner-upload"
                  />
                  <label
                    htmlFor="banner-upload"
                    className="inline-block bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-500 hover:to-blue-600 px-4 py-2 rounded cursor-pointer text-white font-medium transition-all duration-300 text-center w-full"
                  >
                    Choose Image File
                  </label>
                  {bannerFile && (
                    <p className="mt-2 text-sm text-green-400">
                      📁 {bannerFile.name}
                    </p>
                  )}
                  <p className="text-xs text-gray-400 mt-1">
                    Max 5MB. Supports: JPG, PNG, GIF, WebP
                  </p>
                </div>

                {/* OR Divider */}
                <div className="mb-6">
                  <div className="relative">
                    <div className="absolute inset-0 flex items-center">
                      <div className="w-full border-t border-gray-600" />
                    </div>
                    <div className="relative flex justify-center text-sm">
                      <span className="px-4 bg-gray-800 text-gray-400">OR</span>
                    </div>
                  </div>
                </div>

                <div className="mb-4">
                  <label className="block text-sm font-medium mb-2">Squad Picture URL</label>
                  <input
                    type="url"
                    value={bannerFile ? '' : bannerUrl}
                    onChange={(e) => {
                      setBannerUrl(e.target.value);
                      setBannerFile(null); // Clear file if URL is entered
                    }}
                    className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2"
                    placeholder="https://example.com/image.jpg"
                    disabled={!!bannerFile}
                  />
                  <p className="text-xs text-gray-400 mt-1">
                    Square or portrait images work best (1:1 to 3:4 ratio).
                  </p>
                </div>

                {/* Live Preview */}
                {(bannerUrl && (bannerFile || isValidImageUrl(bannerUrl))) && (
                  <div className="mb-4">
                    <label className="block text-sm font-medium mb-2">Preview</label>
                    <div className="w-full max-w-xs mx-auto bg-gray-700 rounded-lg overflow-hidden">
                      <img 
                        src={bannerUrl} 
                        alt="Picture preview"
                        className="w-full h-auto object-contain max-h-40"
                        onError={(e) => {
                          e.currentTarget.src = '';
                          e.currentTarget.style.display = 'none';
                        }}
                      />
                    </div>
                  </div>
                )}

                <div className="bg-blue-900/20 border border-blue-500/30 rounded-lg p-3 mb-4">
                  <h4 className="text-blue-400 font-medium text-sm mb-2">📋 Image Guidelines:</h4>
                  <ul className="text-xs text-gray-300 space-y-1">
                    <li>• <strong>Size:</strong> Square (1:1) or portrait (3:4) ratios work best</li>
                    <li>• <strong>Content:</strong> Squad logos, team photos, or artwork</li>
                    <li>• <strong>Hosting:</strong> Imgur, Discord, or direct image links</li>
                    <li>• <strong>Quality:</strong> Clear images at least 200x200px</li>
                  </ul>
                </div>

                <div className="flex gap-3">
                  <button
                    type="submit"
                    className="flex-1 bg-blue-600 hover:bg-blue-700 py-2 rounded"
                  >
                    {userSquad?.banner_url ? 'Update Picture' : 'Add Picture'}
                  </button>
                  {userSquad?.banner_url && (
                    <button
                      type="button"
                      onClick={() => {
                        setBannerUrl('');
                        updateSquadBanner();
                      }}
                      className="bg-red-600 hover:bg-red-700 px-4 py-2 rounded text-sm"
                    >
                      Remove
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      setShowBannerForm(false);
                      setBannerUrl('');
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

        {/* Edit Squad Details Modal */}
        {showEditForm && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-gray-800 rounded-lg p-6 w-full max-w-md max-h-[90vh] overflow-y-auto">
              <h3 className="text-xl font-bold mb-4">Edit Squad Details</h3>
              <form onSubmit={(e) => { e.preventDefault(); updateSquadDetails(); }}>
                <div className="mb-4">
                  <label className="block text-sm font-medium mb-2">Squad Name</label>
                  <input
                    type="text"
                    value={editSquadName}
                    onChange={(e) => setEditSquadName(e.target.value)}
                    className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2"
                    required
                  />
                </div>
                
                <div className="mb-4">
                  <label className="block text-sm font-medium mb-2">Squad Tag (3-5 chars)</label>
                  <input
                    type="text"
                    value={editSquadTag}
                    onChange={(e) => setEditSquadTag(e.target.value.toUpperCase())}
                    className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2"
                    maxLength={5}
                    required
                  />
                </div>
                
                <div className="mb-4">
                  <label className="block text-sm font-medium mb-2">Description</label>
                  <textarea
                    value={editSquadDescription}
                    onChange={(e) => setEditSquadDescription(e.target.value)}
                    className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2"
                    rows={4}
                    placeholder="Describe your squad..."
                  />
                </div>
                
                <div className="mb-4">
                  <label className="block text-sm font-medium mb-2">Discord Link (optional)</label>
                  <input
                    type="url"
                    value={editDiscordLink}
                    onChange={(e) => setEditDiscordLink(e.target.value)}
                    className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2"
                    placeholder="https://discord.gg/..."
                  />
                </div>
                
                <div className="mb-6">
                  <label className="block text-sm font-medium mb-2">Website Link (optional)</label>
                  <input
                    type="url"
                    value={editWebsiteLink}
                    onChange={(e) => setEditWebsiteLink(e.target.value)}
                    className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2"
                    placeholder="https://..."
                  />
                </div>
                
                <div className="flex gap-3">
                  <button
                    type="submit"
                    className="flex-1 bg-purple-600 hover:bg-purple-700 py-2 rounded"
                  >
                    Update Squad
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowEditForm(false)}
                    className="flex-1 bg-gray-600 hover:bg-gray-700 py-2 rounded"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </main>
    </div>
  );
} 