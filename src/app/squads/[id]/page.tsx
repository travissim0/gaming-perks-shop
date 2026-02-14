'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/lib/AuthContext';
import { supabase } from '@/lib/supabase';
import Navbar from '@/components/Navbar';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { toast } from 'react-hot-toast';
import { useLoadingTimeout } from '@/hooks/useLoadingTimeout';
import { queries, robustFetch } from '@/utils/dataFetching';
import { canAddPlayerToSquad, hasAdminOverride, getSquadMemberCountDisplay } from '@/utils/squadValidation';
import { checkIfUserInFreeAgentPool, getFreeAgents } from '@/utils/supabaseHelpers';

interface SquadMember {
  id: string;
  squad_id: string;
  player_id: string;
  in_game_alias: string;
  role: 'captain' | 'co_captain' | 'player';
  status: string;
  joined_at: string;
  transitional_player?: boolean;
}

interface Squad {
  id: string;
  name: string;
  tag: string;
  description: string;
  discord_link?: string;
  website_link?: string;
  captain_id: string;
  created_at: string;
  updated_at: string;
  banner_url?: string;
  is_active: boolean;
  is_legacy: boolean;
  tournament_eligible: boolean;
  max_members?: number;
  members: SquadMember[];
}

interface UserSquad {
  id: string;
  name: string;
  tag: string;
  is_legacy?: boolean; // Add legacy flag (optional since it may not be loaded)
}

interface PendingRequest {
  id: string;
  invited_player_id: string;
  invited_by: string;
  created_at: string;
  expires_at: string;
  requester_alias: string;
}

interface SentInvite {
  id: string;
  invited_player_id: string;
  invited_by: string;
  status: string;
  created_at: string;
  expires_at: string;
  invite_source?: string | null;
  invite_type?: string | null;
  viewed_at?: string | null;
  responded_at?: string | null;
  invited_player_alias: string;
  message?: string | null;
}

export default function SquadDetailPage() {
  const { user, loading } = useAuth();
  const params = useParams();
  const router = useRouter();
  const squadId = params.id as string;
  const [squad, setSquad] = useState<Squad | null>(null);
  const [userSquad, setUserSquad] = useState<UserSquad | null>(null);
  const [pendingRequests, setPendingRequests] = useState<PendingRequest[]>([]);
  const [sentInvites, setSentInvites] = useState<SentInvite[]>([]);
  const [pageLoading, setPageLoading] = useState(true);
  const [isRequesting, setIsRequesting] = useState(false);
  const [hasExistingRequest, setHasExistingRequest] = useState(false);
  const [processingRequest, setProcessingRequest] = useState<string | null>(null);
  
  // Add user profile state for role checking
  const [userProfile, setUserProfile] = useState<any>(null);
  
  // Banner management states
  const [showBannerForm, setShowBannerForm] = useState(false);
  const [bannerUrl, setBannerUrl] = useState('');
  const [bannerFile, setBannerFile] = useState<File | null>(null);
  
  // Mobile-friendly confirmation modal state
  const [showLeaveConfirmation, setShowLeaveConfirmation] = useState(false);

  // Roster lock status (CTFPL or any league's active season)
  const [rosterLockStatus, setRosterLockStatus] = useState<{
    isLocked: boolean;
    reason?: string;
    seasonNumber?: number;
    seasonName?: string;
    lockedLabel?: string;
  } | null>(null);

  // Derived roster lock status for easier usage
  const isRosterLocked = rosterLockStatus?.isLocked || false;

  // Free agent pool: current user is in pool (null = loading)
  const [isInFreeAgentPool, setIsInFreeAgentPool] = useState<boolean | null>(null);

  // Invite from free agents: modal and list
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [freeAgentsForInvite, setFreeAgentsForInvite] = useState<{ player_id: string; in_game_alias: string | null }[]>([]);
  const [loadingFreeAgents, setLoadingFreeAgents] = useState(false);
  const [invitingPlayerId, setInvitingPlayerId] = useState<string | null>(null);

  // Loading timeout to prevent indefinite loading
  useLoadingTimeout({
    isLoading: pageLoading,
    timeout: 15000,
    onTimeout: () => {
      console.error('⏰ Page loading timeout - forcing completion');
      setPageLoading(false);
      toast.error('Loading took too long. Some data may not be available.');
    }
  });

  useEffect(() => {
    if (squadId && !loading) {
      loadAllData();
      loadRosterLockStatus();
    }
  }, [squadId, loading]);

  // Load user profile for permission checks
  useEffect(() => {
    if (user && !loading) {
      loadUserProfile();
    }
  }, [user, loading]);

  // Load free-agent pool status for current user (for Apply to squad)
  useEffect(() => {
    if (!user || !squad) {
      setIsInFreeAgentPool(null);
      return;
    }
    let cancelled = false;
    checkIfUserInFreeAgentPool(user.id).then((inPool) => {
      if (!cancelled) setIsInFreeAgentPool(inPool);
    });
    return () => { cancelled = true; };
  }, [user?.id, squad?.id]);

  // Load pending requests when squad data becomes available and user is captain/co-captain or admin
  useEffect(() => {
    if (squad && user && !pageLoading) {
      const userMember = squad.members?.find(m => m.player_id === user.id);
      const isCapOrCo = userMember && ['captain', 'co_captain'].includes(userMember.role);
      const isAdmin = userProfile?.is_admin || userProfile?.ctf_role === 'ctf_admin';
      if (isCapOrCo || isAdmin) {
        loadPendingRequests();
        loadSentInvites();
      }
    }
  }, [squad, user, pageLoading, userProfile]);

  const loadAllData = async () => {
    try {
      setPageLoading(true);
      
      // Always load basic squad details (works for both authenticated and anonymous users)
      await loadSquadDetails();
      
      // Only load user-specific data if user is authenticated
      if (user) {
        await Promise.allSettled([
          loadUserSquad(),
          checkExistingRequest()
        ]);
      }
      
    } catch (error) {
      console.error('Error loading squad data:', error);
    } finally {
      setPageLoading(false);
    }
  };

  const loadSquadDetails = async () => {
    if (!squadId) return;

    const { data: squadData, success } = await queries.getSquadDetails(squadId);
    if (!success || !squadData) return;

    const { data: membersData } = await queries.getSquadMembers(squadId);
    
    console.log('🛡️ [Squad Detail] Raw members data:', membersData);
    
    const formattedSquad: Squad = {
      ...squadData,
      updated_at: squadData.updated_at || new Date().toISOString(),
      tournament_eligible: squadData.tournament_eligible || false,
      max_members: squadData.max_members || 15,
      is_legacy: squadData.is_legacy || false,
      members: membersData?.map((member: any) => ({
        id: member.id,
        squad_id: member.squad_id || squadId,
        player_id: member.player_id,
        in_game_alias: member.profiles?.in_game_alias || 'Anonymous User',
        role: member.role,
        status: member.status || 'active',
        joined_at: member.joined_at,
        transitional_player: member.profiles?.transitional_player || false
      })) || []
    };

    console.log('🛡️ [Squad Detail] Formatted squad:', {
      id: formattedSquad.id,
      name: formattedSquad.name,
      tag: formattedSquad.tag,
      is_legacy: formattedSquad.is_legacy,
      membersCount: formattedSquad.members.length,
      members: formattedSquad.members
    });

    setSquad(formattedSquad);
  };

  const loadUserSquad = async () => {
    if (!user) return;
    
    console.log('🏴 [Squad Detail] Loading user squad for:', user.id);
    
    const { data: squadData } = await queries.getUserSquad(user.id);
    
    if (squadData) {
      const userSquadInfo = {
        id: (squadData.squads as any).id,
        name: (squadData.squads as any).name,
        tag: (squadData.squads as any).tag,
        is_legacy: (squadData.squads as any).is_legacy || false
      };
      
      console.log('🏴 [Squad Detail] Setting user squad:', userSquadInfo);
      setUserSquad(userSquadInfo);
    } else {
      console.log('🏴 [Squad Detail] No user squad found, setting to null');
      setUserSquad(null);
    }
  };

  const checkExistingRequest = async () => {
    if (!user || !squadId) return;
    
    const { data, success } = await robustFetch(
      async () => {
        const result = await supabase
          .from('squad_invites')
          .select('*')
          .eq('invited_player_id', user.id)
          .eq('invited_by', user.id) // Only check for self-requests (join requests)
          .eq('squad_id', squadId)
          .eq('status', 'pending')
          .gt('expires_at', new Date().toISOString()) // Also check expiration
          .maybeSingle();
        
        if (result.error) throw new Error(result.error.message);
        return result.data;
      },
      { errorMessage: 'Failed to check existing request' }
    );

    if (success) {
      setHasExistingRequest(!!data);
    }
  };

  const loadPendingRequests = async () => {
    if (!user || !squad) return;

    const { data, success } = await robustFetch(
      async () => {
        const result = await supabase
          .from('squad_invites')
          .select(`
            id,
            invited_player_id,
            invited_by,
            created_at,
            expires_at,
            profiles!squad_invites_invited_player_id_fkey(in_game_alias)
          `)
          .eq('squad_id', squad.id)
          .eq('status', 'pending')
          .gt('expires_at', new Date().toISOString())
          .order('created_at', { ascending: false });

        if (result.error) throw new Error(result.error.message);
        return result.data;
      },
      { showErrorToast: false } // Don't show toast for this optional data
    );

    if (success && data) {
      // Filter to only show self-requests from OTHER players (not the current user)
      const selfRequests = data.filter((request: any) => 
        request.invited_by === request.invited_player_id && 
        request.invited_player_id !== user?.id // Exclude current user's own requests
      );
      
      const formattedRequests: PendingRequest[] = selfRequests.map((request: any) => ({
        id: request.id,
        invited_player_id: request.invited_player_id,
        invited_by: request.invited_by,
        created_at: request.created_at,
        expires_at: request.expires_at,
        requester_alias: (request.profiles as any)?.in_game_alias || 'Unknown'
      }));

      setPendingRequests(formattedRequests);
    }
  };

  const loadSentInvites = async () => {
    if (!squad?.id || !isUserCaptainOrCoCaptain()) return;

    const { success, data } = await robustFetch(
      async () => {
        // First try with new columns, fall back to basic query if they don't exist
        try {
          const { data, error } = await supabase
            .from('squad_invites')
            .select(`
              id,
              invited_player_id,
              invited_by,
              status,
              created_at,
              expires_at,
              invite_source,
              invite_type,
              viewed_at,
              responded_at,
              message,
              profiles!squad_invites_invited_player_id_fkey (
                in_game_alias
              )
            `)
            .eq('squad_id', squad.id)
            // Include all invites - we'll filter captain-sent vs join requests in the UI
            .in('status', ['pending', 'accepted', 'declined'])
            .order('created_at', { ascending: false })
            .limit(20); // Limit to recent 20 invites

          if (error) throw error;
          return data;
        } catch (enhancedError: any) {
          // If enhanced columns don't exist, fall back to basic query
          if (enhancedError.message?.includes('column') && enhancedError.message?.includes('does not exist')) {
            console.log('📝 Enhanced invite tracking columns not yet available, using basic query...');
            const { data, error } = await supabase
              .from('squad_invites')
              .select(`
                id,
                invited_player_id,
                invited_by,
                status,
                created_at,
                expires_at,
                responded_at,
                message,
                profiles!squad_invites_invited_player_id_fkey (
                  in_game_alias
                )
              `)
              .eq('squad_id', squad.id)
              .neq('invited_by', 'invited_player_id')
              .in('status', ['pending', 'accepted', 'declined'])
              .order('created_at', { ascending: false })
              .limit(20);

            if (error) throw error;
            return data;
          }
          throw enhancedError;
        }
      },
      { errorMessage: 'Failed to load sent invites' }
    );

    if (success && data) {
      const formattedInvites: SentInvite[] = data.map((invite: any) => ({
        id: invite.id,
        invited_player_id: invite.invited_player_id,
        invited_by: invite.invited_by,
        status: invite.status,
        created_at: invite.created_at,
        expires_at: invite.expires_at,
        invite_source: invite.invite_source || null,
        invite_type: invite.invite_type || null,
        viewed_at: invite.viewed_at || null,
        responded_at: invite.responded_at || null,
        invited_player_alias: (invite.profiles as any)?.in_game_alias || 'Unknown User',
        message: invite.message || null
      }));
      
      setSentInvites(formattedInvites);
    }
  };

  const requestToJoin = async () => {
    if (!user || !squad) return;

    setIsRequesting(true);
    
    try {
      // Check if roster is locked before allowing join request
      if (isRosterLocked) {
        toast.error('Squad applications are currently disabled due to roster lock');
        setIsRequesting(false);
        return;
      }

      if (isInFreeAgentPool !== true) {
        toast.error('You must register as a free agent before applying to squads.');
        setIsRequesting(false);
        return;
      }

      // First check if there's already a pending request
      const { data: existingRequest, error: checkError } = await supabase
        .from('squad_invites')
        .select('id, created_at')
        .eq('invited_player_id', user.id)
        .eq('invited_by', user.id)
        .eq('squad_id', squad.id)
        .eq('status', 'pending')
        .gt('expires_at', new Date().toISOString())
        .maybeSingle();

      if (checkError && checkError.code !== 'PGRST116') {
        throw new Error(checkError.message);
      }

      if (existingRequest) {
        console.log('📋 Found existing request:', existingRequest);
        toast.error('You already have a pending join request for this squad');
        setHasExistingRequest(true);
        setIsRequesting(false);
        return;
      }

      // Proceed with creating new request
      const { error: insertError } = await supabase
        .from('squad_invites')
        .insert({
          squad_id: squad.id,
          invited_player_id: user.id,
          invited_by: user.id,
          expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
          message: squad.is_legacy ? 'Request to join legacy squad' : undefined
        });

      if (insertError) {
        if (insertError.message.includes('duplicate') || insertError.message.includes('unique_pending')) {
          toast.error('You already have a pending join request for this squad');
          setHasExistingRequest(true);
        } else {
          throw new Error(insertError.message);
        }
      } else {
        const squadType = squad.is_legacy ? 'legacy squad' : 'squad';
        toast.success(`Join request sent to ${squadType} successfully!`);
        setHasExistingRequest(true);
      }

      // Refresh the existing request check to ensure UI stays in sync
      await checkExistingRequest();
      
    } catch (error: any) {
      console.error('Error requesting to join squad:', error);
      toast.error(error.message || 'Failed to send join request');
    } finally {
      setIsRequesting(false);
    }
  };

  const withdrawRequest = async () => {
    if (!user || !squadId || !hasExistingRequest) return;

    try {
      setIsRequesting(true);
      
      const { error } = await supabase
        .from('squad_invites')
        .delete()
        .eq('invited_player_id', user.id)
        .eq('invited_by', user.id) // Only self-requests
        .eq('squad_id', squadId)
        .eq('status', 'pending');

      if (error) throw error;

      toast.success('Request withdrawn successfully');
      setHasExistingRequest(false);
      
      // Refresh data
      await checkExistingRequest();
      
    } catch (error: any) {
      console.error('Error withdrawing request:', error);
      toast.error(error.message || 'Failed to withdraw request');
    } finally {
      setIsRequesting(false);
    }
  };

  const handleRequestAction = async (requestId: string, action: 'approve' | 'deny') => {
    if (action === 'approve' && isRosterLocked) {
      toast.error('Cannot approve join requests while rosters are locked.');
      return;
    }
    setProcessingRequest(requestId);

    const { success } = await robustFetch(
      async () => {
        if (action === 'approve') {
          // Get the request details first
          const { data: request, error: fetchError } = await supabase
            .from('squad_invites')
            .select('invited_player_id')
            .eq('id', requestId)
            .single();

          if (fetchError) throw new Error(fetchError.message);

          // Get current members and new player profile for validation
          const [membersResponse, playerResponse] = await Promise.all([
            supabase
              .from('squad_members')
              .select(`
                *,
                profiles!squad_members_player_id_fkey(*)
              `)
              .eq('squad_id', squad!.id)
              .eq('status', 'active'),
            supabase
              .from('profiles')
              .select('*')
              .eq('id', request.invited_player_id)
              .single()
          ]);

          if (membersResponse.error) throw new Error(membersResponse.error.message);
          if (playerResponse.error) throw new Error(playerResponse.error.message);

          const currentMembers = (membersResponse.data || []).map((member: any) => ({
            ...member,
            profile: member.profiles ? {
              ...member.profiles,
              transitional_player: member.profiles.transitional_player || false
            } : undefined
          }));
          const newPlayer = playerResponse.data;

          // Check if player can be added to squad
          const validation = canAddPlayerToSquad(
            squad!,
            currentMembers,
            newPlayer,
            hasAdminOverride(userProfile)
          );

          if (!validation.canAdd) {
            throw new Error(`Cannot approve request: ${validation.reason}`);
          }

          // Add member to squad
          const { error: memberError } = await supabase
            .from('squad_members')
            .insert({
              squad_id: squad!.id,
              player_id: request.invited_player_id,
              role: 'player'
            });

          if (memberError) throw new Error(memberError.message);
        }

        // Update invite status
        const { error: updateError } = await supabase
          .from('squad_invites')
          .update({ status: action === 'approve' ? 'accepted' : 'declined' })
          .eq('id', requestId);

        if (updateError) throw new Error(updateError.message);
      },
      { errorMessage: `Failed to ${action} request` }
    );

    if (success) {
      toast.success(`Request ${action === 'approve' ? 'approved' : 'denied'} successfully!`);
      
      // Refresh all relevant data
      await Promise.allSettled([
        loadSquadDetails(),
        loadPendingRequests(),
        loadSentInvites(),
        loadUserSquad(),
        checkExistingRequest()
      ]);
    }

    setProcessingRequest(null);
  };

  const openInviteModal = async () => {
    if (!squad?.id || !user || isRosterLocked) return;
    setShowInviteModal(true);
    setLoadingFreeAgents(true);
    setFreeAgentsForInvite([]);
    try {
      const data = await getFreeAgents();
      const memberIds = new Set(squad.members?.map((m) => m.player_id) ?? []);
      const pendingIds = new Set(sentInvites.filter((i) => i.status === 'pending').map((i) => i.invited_player_id));
      const list = (data || [])
        .filter((fa: any) => fa.is_active !== false && !memberIds.has(fa.player_id) && !pendingIds.has(fa.player_id))
        .map((fa: any) => ({
          player_id: fa.player_id,
          in_game_alias: fa.profiles?.in_game_alias ?? null
        }));
      setFreeAgentsForInvite(list);
    } catch (e) {
      console.error('Failed to load free agents:', e);
      toast.error('Failed to load free agents');
    } finally {
      setLoadingFreeAgents(false);
    }
  };

  const sendInviteToPlayer = async (playerId: string) => {
    if (!squad?.id || !user || isRosterLocked) return;
    setInvitingPlayerId(playerId);
    try {
      const { error } = await supabase.from('squad_invites').insert({
        squad_id: squad.id,
        invited_player_id: playerId,
        invited_by: user.id,
        status: 'pending',
        expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        invite_source: 'free_agent_list',
        invite_type: 'recruitment'
      });
      if (error) throw error;
      toast.success('Invite sent.');
      setFreeAgentsForInvite((prev) => prev.filter((p) => p.player_id !== playerId));
      await loadSentInvites();
    } catch (e: any) {
      toast.error(e?.message ?? 'Failed to send invite');
    } finally {
      setInvitingPlayerId(null);
    }
  };

  const isAdminOrCtfAdmin = () => !!userProfile?.is_admin || userProfile?.ctf_role === 'ctf_admin';

  const isUserCaptainOrCoCaptain = () => {
    if (!user || !squad?.members) return false;
    if (isAdminOrCtfAdmin()) return true;
    const userMember = squad.members.find(m => m.player_id === user.id);
    return userMember && ['captain', 'co_captain'].includes(userMember.role);
  };

  const isCaptain = () => {
    if (!user || !squad?.members) return false;
    if (isAdminOrCtfAdmin()) return true;
    const userMember = squad.members.find(m => m.player_id === user.id);
    return userMember && userMember.role === 'captain';
  };

  const isUserInSquad = () => {
    if (!user || !squad?.members) return false;
    return squad.members.some(m => m.player_id === user.id);
  };
  
  // Enhanced permission check for photo editing
  const canEditSquadPhotos = () => {
    if (!user || !squad) return false;
    return (
      isUserCaptainOrCoCaptain() || // Captain or co-captain
      userProfile?.is_admin || // Site admin
      userProfile?.ctf_role === 'ctf_admin' || // CTF admin
      userProfile?.is_media_manager // Media manager
    );
  };

  // Load user profile for permission checks
  const loadUserProfile = async () => {
    if (!user) return;
    
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, in_game_alias, is_admin, ctf_role, is_media_manager')
        .eq('id', user.id)
        .single();

      if (error) throw error;
      setUserProfile(data);
    } catch (error) {
      console.error('Error loading user profile:', error);
    }
  };

  const loadRosterLockStatus = async () => {
    try {
      const { checkRosterLockStatus } = await import('@/utils/rosterLock');
      const status = await checkRosterLockStatus();
      setRosterLockStatus({
        isLocked: status.isLocked,
        reason: status.reason,
        seasonNumber: status.seasonNumber,
        seasonName: status.seasonName ?? undefined,
        lockedLabel: status.lockedLabel
      });
    } catch (error: any) {
      console.error('Exception loading roster lock status:', error);
      setRosterLockStatus({ isLocked: false });
    }
  };

  const canRequestToJoin = () => {
    console.log('🔍 canRequestToJoin check:', {
      user: !!user,
      squad: !!squad,
      hasExistingRequest,
      userSquad: userSquad?.id,
      squadId: squad?.id,
      isAlreadyMember: squad?.members.some(member => member.player_id === user?.id),
      isActive: squad?.is_active,
      isLegacy: squad?.is_legacy
    });
    
    if (!user || !squad) {
      console.log('❌ Failed basic checks');
      return false;
    }
    
    // Check if user is already a member of this squad
    const isAlreadyMember = squad.members.some(member => member.player_id === user.id);
    if (isAlreadyMember) {
      console.log('❌ User is already a member of this squad');
      return false;
    }
    
    // BLOCK REQUESTS TO LEGACY SQUADS - They are invitation-only by captain
    if (squad.is_legacy === true) {
      console.log('❌ Cannot request to join legacy squad - invitation only');
      return false;
    }
    
    // Check if user is already in another active (non-legacy) squad
    if (userSquad && userSquad.id !== squad.id && !(userSquad.is_legacy === true)) {
      console.log('❌ User is in another active squad');
      return false;
    }
    
    // Can't request to join if user is the captain (shouldn't happen, but safety check)
    if (squad.captain_id === user.id) {
      console.log('❌ User is the captain');
      return false;
    }

    // Must be in free agent pool to apply (when we have loaded status)
    if (isInFreeAgentPool === false) {
      console.log('❌ User is not in free agent pool');
      return false;
    }
    
    // Allow requests to active squads only (not legacy), and in free agent pool
    console.log('✅ Can request to join active squad');
    return true;
  };

  const isCurrentMember = () => {
    // Check if user is actually in this squad's member list
    // This works for both active and legacy squads
    const isMember = user && squad && squad.members.some(member => member.player_id === user.id);
    
    console.log('🔍 isCurrentMember check:', {
      userId: user?.id,
      squadId: squad?.id,
      squadName: squad?.name,
      squadMembersCount: squad?.members?.length,
      squadMembers: squad?.members?.map(m => ({ id: m.player_id, alias: m.in_game_alias })),
      isMember
    });
    
    return isMember;
  };

  const canLeaveSquad = () => {
    if (!isCurrentMember() || !user || !squad) return false;
    
    // Find user in squad members
    const userMember = squad.members.find(m => m.player_id === user.id);
    if (!userMember) return false;
    
    // Captains can only leave if there's another captain or co-captain to take over
    if (userMember.role === 'captain') {
      const otherLeaders = squad.members.filter(m => 
        m.player_id !== user.id && ['captain', 'co_captain'].includes(m.role)
      );
      return otherLeaders.length > 0;
    }
    
    // Co-captains and players can always leave
    return true;
  };

  const initiateLeaveSquad = () => {
    if (!user || !squad || !canLeaveSquad()) return;
    setShowLeaveConfirmation(true);
  };

  const leaveSquad = async () => {
    if (!user || !squad) return;
    
    try {
      setIsRequesting(true);
      setShowLeaveConfirmation(false);
      
      // Use API route to ensure proper permissions and logging
      const response = await fetch('/api/squads/leave', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          squadId: squad.id,
          playerId: user.id,
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Failed to leave squad');
      }

      toast.success('Successfully left the squad');
      
      // Clear user squad state immediately
      setUserSquad(null);
      
      // Use Next.js router for more reliable navigation on mobile
      router.push('/squads');
      
    } catch (error: any) {
      console.error('Error leaving squad:', error);
      toast.error(error.message || 'Failed to leave squad');
    } finally {
      setIsRequesting(false);
    }
  };

  // Banner management functions
  const updateSquadBanner = async () => {
    if (!squad || !user || !canEditSquadPhotos()) return;

    try {
      let finalBannerUrl = bannerUrl.trim();

      // If there's a file to upload, upload it first
      if (bannerFile) {
        try {
          const fileExt = bannerFile.name.split('.').pop();
          const fileName = `squad-${squad.id}-${Date.now()}.${fileExt}`;
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
        .eq('id', squad.id);

      if (error) throw error;

      toast.success(finalBannerUrl ? 'Squad picture updated!' : 'Squad picture removed!');
      setShowBannerForm(false);
      setBannerUrl('');
      setBannerFile(null);
      
      // Refresh squad data
      loadSquadDetails();
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

  const getRoleIcon = (role: string) => {
    switch (role) {
      case 'captain': return '👑';
      case 'co_captain': return '⭐';
      default: return '🛡️';
    }
  };

  const getRoleColor = (role: string) => {
    switch (role) {
      case 'captain': return 'text-yellow-400';
      case 'co_captain': return 'text-blue-400';
      default: return 'text-gray-300';
    }
  };

  const getRoleDisplayName = (role: string) => {
    switch (role) {
      case 'captain': return 'Captain';
      case 'co_captain': return 'Co-Captain';
      default: return 'Player';
    }
  };

  const getMemberCounts = (members: SquadMember[]) => {
    const transitionalCount = members.filter(m => m.transitional_player).length;
    const regularCount = members.length - transitionalCount;
    const totalCount = members.length;
    
    return { regularCount, transitionalCount, totalCount };
  };

  const formatMemberCountDisplay = (members: SquadMember[]) => {
    const { regularCount, transitionalCount, totalCount } = getMemberCounts(members);
    
    if (transitionalCount === 0) {
      return `${totalCount}`;
    }
    
    return `${regularCount} + ${transitionalCount}`;
  };

  const renderMemberCountBadges = (members: SquadMember[], squad: Squad) => {
    const { regularCount, transitionalCount } = getMemberCounts(members);
    const maxMembers = squad.max_members || 15;
    const isOverLimit = regularCount > maxMembers;
    
    return (
      <div className="flex items-center gap-2">
        <span className={`px-2 py-1 rounded-md text-sm border ${
          isOverLimit 
            ? 'bg-red-600/20 text-red-300 border-red-500/30' 
            : 'bg-blue-600/20 text-blue-300 border-blue-500/30'
        }`}>
          {regularCount} Regular
        </span>
        {transitionalCount > 0 && (
          <span className="bg-orange-600/20 text-orange-300 px-2 py-1 rounded-md text-sm border border-orange-500/30">
            {transitionalCount} Transitional
          </span>
        )}
        {isOverLimit && (
          <span 
            className="bg-red-600/20 text-red-300 px-2 py-1 rounded-md text-sm border border-red-500/30 cursor-help flex items-center gap-1"
            title={`Squad exceeds limit: ${regularCount}/${maxMembers} regular members. Squad may be ineligible for tournaments.`}
          >
            ⚠️ Over Limit
          </span>
        )}
      </div>
    );
  };

  // Squad management functions
  const kickMember = async (memberId: string, memberName: string) => {
    if (!confirm(`Are you sure you want to kick ${memberName} from the squad?`)) return;

    try {
      const { error } = await supabase
        .from('squad_members')
        .delete()
        .eq('id', memberId);

      if (error) throw error;

      toast.success('Member kicked successfully');
      await Promise.allSettled([
        loadSquadDetails(),
        loadPendingRequests(),
        loadSentInvites()
      ]);
    } catch (error) {
      console.error('Error kicking member:', error);
      toast.error('Failed to kick member');
    }
  };

  const promoteMember = async (memberId: string, memberName: string, newRole: string) => {
    const roleText = newRole === 'co_captain' ? 'Co-Captain' : 'Player';
    if (!confirm(`Are you sure you want to ${newRole === 'co_captain' ? 'promote' : 'demote'} ${memberName} to ${roleText}?`)) return;

    try {
      const { error } = await supabase
        .from('squad_members')
        .update({ role: newRole })
        .eq('id', memberId);

      if (error) throw error;

      toast.success(`Member ${newRole === 'co_captain' ? 'promoted' : 'demoted'} successfully`);
      await loadSquadDetails();
    } catch (error) {
      console.error('Error updating member role:', error);
      toast.error('Failed to update member role');
    }
  };

  const disbandSquad = async () => {
    if (!confirm('Are you sure you want to disband this squad? This action cannot be undone and will remove all members.')) return;

    try {
      // First delete all squad members
      const { error: membersError } = await supabase
        .from('squad_members')
        .delete()
        .eq('squad_id', squad?.id);

      if (membersError) throw membersError;

      // Then delete the squad
      const { error: squadError } = await supabase
        .from('squads')
        .delete()
        .eq('id', squad?.id);

      if (squadError) throw squadError;

      toast.success('Squad disbanded successfully');
      // Navigate back to squads page
      window.location.href = '/squads';
    } catch (error) {
      console.error('Error disbanding squad:', error);
      toast.error('Error disbanding squad');
    }
  };

  const transferOwnership = async (newCaptainId: string, newCaptainName: string) => {
    if (!confirm(`Are you sure you want to transfer squad ownership to ${newCaptainName}? You will become a regular player.`)) return;

    try {
      const { data, error } = await supabase.rpc('transfer_squad_ownership', {
        squad_id_param: squad?.id,
        new_captain_id_param: newCaptainId
      });

      if (error) throw error;

      if (data) {
        toast.success('Squad ownership transferred successfully!');
        await Promise.allSettled([
          loadSquadDetails(),
          loadUserSquad()
        ]);
      } else {
        throw new Error('Transfer function returned false');
      }
    } catch (error) {
      console.error('Error transferring ownership:', error);
      toast.error('Error transferring ownership: ' + (error as Error).message);
    }
  };

  // Helper functions for squad management (admin/ctf_admin can manage any squad)
  const canManageSquad = () => {
    if (!squad || !user) return false;
    if (isAdminOrCtfAdmin()) return true;
    const userMember = squad.members.find(m => m.player_id === user.id);
    return userMember && ['captain', 'co_captain'].includes(userMember.role);
  };

  // Helper functions for sent invites
  const getInviteStatusColor = (status: string) => {
    switch (status) {
      case 'pending': return 'text-yellow-400 bg-yellow-600/20 border-yellow-500/30';
      case 'accepted': return 'text-green-400 bg-green-600/20 border-green-500/30';
      case 'declined': return 'text-red-400 bg-red-600/20 border-red-500/30';
      default: return 'text-gray-400 bg-gray-600/20 border-gray-500/30';
    }
  };

  const getInviteStatusIcon = (status: string) => {
    switch (status) {
      case 'pending': return '⏳';
      case 'accepted': return '✅';
      case 'declined': return '❌';
      default: return '❓';
    }
  };

  const formatInviteSource = (source?: string | null) => {
    if (!source) return 'Manual';
    switch (source) {
      case 'free_agent_list': return 'Free Agent List';
      case 'direct_username': return 'Direct Username';
      case 'manual_search': return 'Manual Search';
      case 'referral': return 'Referral';
      default: return 'Manual';
    }
  };

  const formatInviteType = (type?: string | null) => {
    if (!type) return 'Recruitment';
    switch (type) {
      case 'recruitment': return 'Recruitment';
      case 'replacement': return 'Replacement';
      case 'expansion': return 'Expansion';
      case 'legacy_transfer': return 'Legacy Transfer';
      default: return 'Recruitment';
    }
  };

  const getResponseTime = (createdAt: string, respondedAt?: string | null) => {
    if (!respondedAt) return null;
    const created = new Date(createdAt);
    const responded = new Date(respondedAt);
    const diffHours = Math.round((responded.getTime() - created.getTime()) / (1000 * 60 * 60));
    
    if (diffHours < 1) return '< 1 hour';
    if (diffHours < 24) return `${diffHours} hours`;
    const diffDays = Math.round(diffHours / 24);
    return `${diffDays} days`;
  };

  // Enhanced loading screen with timeout indicator
  if (loading || pageLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-slate-800 to-gray-900">
        <Navbar user={user} />
        <div className="container mx-auto py-8 px-4 flex items-center justify-center min-h-[60vh]">
          <div className="text-center">
            <div className="animate-spin rounded-full h-16 w-16 border-t-2 border-b-2 border-cyan-500 mx-auto mb-6"></div>
            <p className="text-cyan-400 font-mono text-lg">Loading squad details...</p>
            <p className="text-gray-400 text-sm mt-2">This should only take a few seconds</p>
          </div>
        </div>
      </div>
    );
  }

  if (!squad) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-slate-800 to-gray-900">
        <Navbar user={user} />
        <div className="container mx-auto py-8 px-4 flex items-center justify-center min-h-[60vh]">
          <div className="text-center">
            <div className="text-6xl mb-4">❌</div>
            <h1 className="text-2xl font-bold text-gray-300 mb-4">Squad Not Found</h1>
            <p className="text-gray-400 mb-6">The squad you're looking for doesn't exist or is no longer active.</p>
            <Link
              href="/squads"
              className="bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white px-6 py-3 rounded-lg font-medium transition-all duration-300"
            >
              Back to Squads
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-slate-800 to-gray-900">
      <Navbar user={user} />
      
      <main className="container mx-auto py-8 px-4">
        {/* Squad Header */}
        <div className="bg-gradient-to-r from-slate-800/50 to-slate-700/50 rounded-xl overflow-hidden mb-8 border border-cyan-500/20">
          <div className="p-8">
            <div className="flex flex-col lg:flex-row gap-8">
              {/* Squad Picture */}
              {squad.banner_url && (
                <div className="lg:w-80 lg:flex-shrink-0">
                  <div className="bg-gray-800/50 rounded-lg overflow-hidden border border-gray-600/30">
                    <img 
                      src={squad.banner_url} 
                      alt={`${squad.name} picture`}
                      className="w-full h-auto object-contain max-h-60"
                      onError={(e) => {
                        e.currentTarget.style.display = 'none';
                        e.currentTarget.parentElement!.style.display = 'none';
                      }}
                    />
                  </div>
                </div>
              )}
              
              {/* Squad Info */}
              <div className="flex-1">
                <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-6">
                  <div className="flex-1">
                    <div className="flex items-center gap-4 mb-4">
                      <h1 className="text-4xl font-bold text-cyan-400">
                        [{squad.tag}] {squad.name}
                      </h1>
                      {!squad.is_active && (
                        <span className="bg-red-600/20 text-red-400 px-3 py-1 rounded-full text-sm font-medium border border-red-600/30">
                          ⚠️ Inactive Squad
                        </span>
                      )}
                    </div>
                    
                    {squad.description && (
                      <p className="text-gray-300 text-lg mb-4">{squad.description}</p>
                    )}
                    
                    <div className="flex flex-wrap items-center gap-4 text-sm text-gray-400 mb-4">
                      <div className="flex items-center gap-2">
                        <span>👥</span>
                        <div className="flex items-center gap-1">
                          <span className="bg-blue-600/20 text-blue-300 px-1.5 py-0.5 rounded text-xs">
                            {getMemberCounts(squad.members).regularCount}
                          </span>
                          {getMemberCounts(squad.members).transitionalCount > 0 && (
                            <>
                              <span className="text-gray-500">+</span>
                              <span className="bg-orange-600/20 text-orange-300 px-1.5 py-0.5 rounded text-xs">
                                {getMemberCounts(squad.members).transitionalCount}T
                              </span>
                            </>
                          )}
                        </div>
                      </div>
                      <span>📅 Created {new Date(squad.created_at).toLocaleDateString()}</span>
                    </div>
                    
                    {/* Links */}
                    {(squad.discord_link || squad.website_link) && (
                      <div className="flex gap-4">
                        {squad.discord_link && (
                          <a
                            href={squad.discord_link}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-lg transition-colors"
                          >
                            💬 Discord
                          </a>
                        )}
                        {squad.website_link && (
                          <a
                            href={squad.website_link}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="bg-gray-600 hover:bg-gray-500 text-white px-4 py-2 rounded-lg transition-colors"
                          >
                            🌐 Website
                          </a>
                        )}
                      </div>
                    )}
                  </div>
                  
                  {/* Action Buttons */}
                  <div className="flex flex-col gap-3 lg:flex-shrink-0">
                    {/* Legacy Squad Notice - Show if squad is legacy and user can't join */}
                    {squad?.is_legacy && !isCurrentMember() && (
                      <div className="bg-amber-600/10 border border-amber-500/20 rounded-lg p-4">
                        <div className="flex items-center gap-2 mb-2">
                          <span className="text-amber-400">🏛️</span>
                          <span className="text-amber-300 font-medium text-sm">Legacy Squad</span>
                        </div>
                        <p className="text-amber-200 text-sm">
                          This is a historical legacy squad. You can only join by invitation from the captain.
                          Join requests are not allowed for legacy squads.
                        </p>
                      </div>
                    )}
                    
                    {/* Join Request / Apply - Show when not a member: pending, can apply, or must register as free agent */}
                    {(canRequestToJoin() || hasExistingRequest || (user && !isCurrentMember() && isInFreeAgentPool === false)) && !isCurrentMember() && (
                      <div className="flex flex-col gap-2">
                        {/* Not in free agent pool: show register message */}
                        {!hasExistingRequest && isInFreeAgentPool === false && (
                          <div className="p-4 bg-amber-900/20 border border-amber-600/30 rounded-lg">
                            <p className="text-amber-200 text-sm mb-2">
                              You must register as a free agent before you can apply to squads.
                            </p>
                            <Link
                              href="/league/register"
                              className="inline-flex items-center gap-2 px-4 py-2 bg-amber-600 hover:bg-amber-500 text-white rounded-lg font-medium text-sm transition-colors"
                            >
                              Register as Free Agent
                            </Link>
                          </div>
                        )}
                        {/* Request to Join button (only when in free agent pool or already have request) */}
                        {(canRequestToJoin() || hasExistingRequest) && (
                          <>
                            <button
                              onClick={hasExistingRequest || isRosterLocked ? undefined : requestToJoin}
                              disabled={isRequesting || hasExistingRequest || isRosterLocked || isInFreeAgentPool === null}
                              className={`px-6 py-3 rounded-lg font-medium transition-all duration-300 disabled:cursor-not-allowed ${
                                hasExistingRequest 
                                  ? 'bg-gradient-to-r from-yellow-600 to-amber-600 text-white cursor-default'
                                  : isRosterLocked
                                  ? 'bg-gradient-to-r from-red-600 to-red-700 text-white cursor-not-allowed opacity-50'
                                  : 'bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-500 hover:to-emerald-500 disabled:from-gray-600 disabled:to-gray-700 text-white'
                              }`}
                            >
                              {hasExistingRequest ? (
                                <span className="flex items-center gap-2">
                                  ⏳ Request Pending
                                </span>
                              ) : isRosterLocked ? (
                                <span className="flex items-center gap-2">
                                  🔒 Applications Disabled
                                </span>
                              ) : isInFreeAgentPool === null ? (
                                <span className="flex items-center gap-2">
                                  <div className="animate-spin rounded-full h-4 w-4 border-t-2 border-b-2 border-white"></div>
                                  Checking...
                                </span>
                              ) : isRequesting ? (
                                <span className="flex items-center gap-2">
                                  <div className="animate-spin rounded-full h-4 w-4 border-t-2 border-b-2 border-white"></div>
                                  Sending...
                                </span>
                              ) : (
                                '📤 Request to Join'
                              )}
                            </button>
                            
                            {/* Roster Lock Warning */}
                            {isRosterLocked && (
                              <div className="flex items-center gap-2 p-3 bg-red-900/20 border border-red-800/30 rounded-lg">
                                <span className="text-red-400 text-sm">
                                  🔒 {rosterLockStatus?.lockedLabel ? `Rosters are locked (${rosterLockStatus.lockedLabel}). ` : ''}Squad applications are currently disabled.
                                </span>
                              </div>
                            )}
                          </>
                        )}
                        
                        {/* Squad Capacity Info */}
                        {squad && squad.members && (
                          <div className="text-sm text-gray-400 text-center">
                            {getSquadMemberCountDisplay(squad, squad.members)}
                          </div>
                        )}
                        
                        {/* Withdraw Request Button */}
                        {hasExistingRequest && (
                          <button
                            onClick={withdrawRequest}
                            disabled={isRequesting}
                            className="px-6 py-2 bg-gradient-to-r from-red-600 to-red-700 hover:from-red-500 hover:to-red-600 disabled:from-gray-600 disabled:to-gray-700 text-white rounded-lg font-medium transition-all duration-300 disabled:cursor-not-allowed text-sm"
                          >
                            {isRequesting ? (
                              <span className="flex items-center gap-2">
                                <div className="animate-spin rounded-full h-3 w-3 border-t-2 border-b-2 border-white"></div>
                                Withdrawing...
                              </span>
                            ) : (
                              '🗑️ Withdraw Request'
                            )}
                          </button>
                        )}
                      </div>
                    )}
                    
                    {/* Leave Squad Button for Current Members */}
                    {canLeaveSquad() && (
                      <button
                        onClick={leaveSquad}
                        disabled={isRequesting}
                        className="bg-gradient-to-r from-red-600 to-red-700 hover:from-red-500 hover:to-red-600 disabled:from-gray-600 disabled:to-gray-700 text-white px-6 py-3 rounded-lg font-medium transition-all duration-300 disabled:cursor-not-allowed"
                      >
                        {isRequesting ? (
                          <span className="flex items-center gap-2">
                            <div className="animate-spin rounded-full h-4 w-4 border-t-2 border-b-2 border-white"></div>
                            Leaving...
                          </span>
                        ) : (
                          '🚪 Leave Squad'
                        )}
                      </button>
                    )}
                    
                    {/* Banner Management Button for Captains/Co-Captains/Admins */}
                    {canEditSquadPhotos() && (
                      <button
                        onClick={() => setShowBannerForm(true)}
                        className="bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-500 hover:to-blue-600 text-white px-6 py-3 rounded-lg font-medium transition-all duration-300"
                      >
                        🖼️ {squad.banner_url ? 'Update Picture' : 'Add Picture'}
                      </button>
                    )}
                    
                    {/* Disband Squad Button for Captains Only */}
                    {isCaptain() && (
                      <button
                        onClick={disbandSquad}
                        className="bg-gradient-to-r from-red-800 to-red-900 hover:from-red-700 hover:to-red-800 text-white px-6 py-3 rounded-lg font-medium transition-all duration-300"
                      >
                        💥 Disband Squad
                      </button>
                    )}
                    

                    
                    {userSquad && userSquad.id !== squad.id && (
                      <div className="bg-blue-600/20 text-blue-400 px-4 py-2 rounded-lg text-center border border-blue-600/30">
                        👥 Member of [{userSquad.tag}]
                      </div>
                    )}
                    
                    {/* Current member status for users who can't leave (captains without successors) */}
                    {isCurrentMember() && !canLeaveSquad() && (
                      <div className="bg-yellow-600/20 text-yellow-400 px-4 py-2 rounded-lg text-center border border-yellow-600/30">
                        👑 Captain - Promote another member to leave
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Squad Members - Centered */}
        <div className="flex justify-center">
          <div className="w-full max-w-4xl">
            <div className="bg-gradient-to-b from-slate-800/50 to-slate-700/50 rounded-xl p-6 border border-cyan-500/20">
              <div className="mb-6">
                <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-2">
                  <h2 className="text-2xl font-bold text-cyan-400 flex items-center gap-2">
                    👥 Squad Members
                  </h2>
                  {renderMemberCountBadges(squad.members, squad)}
                </div>
                
                {/* Legend */}
                <div className="bg-slate-700/30 border border-slate-600/30 rounded-lg p-4 mt-3">
                  <div className="text-sm font-medium text-gray-300 mb-3">Badge Legend:</div>
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <span className="bg-blue-600/20 text-blue-300 px-2 py-1 rounded-md text-sm border border-blue-500/30">Regular</span>
                      <span className="text-gray-300 text-sm">Normal squad members</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="bg-orange-600/20 text-orange-300 px-2 py-1 rounded-md text-sm border border-orange-500/30">Transitional</span>
                      <span className="text-gray-300 text-sm">Players from other zones (Skirmish/USL) or new players</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="bg-red-600/20 text-red-300 px-2 py-1 rounded-md text-sm border border-red-500/30 flex items-center gap-1">⚠️ Over Limit</span>
                      <span className="text-gray-300 text-sm">Squad exceeds maximum capacity</span>
                    </div>
                  </div>
                </div>
              </div>
              
              {/* Mobile-optimized compact member list */}
              <div className="space-y-2 md:space-y-3">
                {squad.members
                  .sort((a, b) => {
                    // 1. Captain first
                    if (a.role === 'captain' && b.role !== 'captain') return -1;
                    if (a.role !== 'captain' && b.role === 'captain') return 1;
                    
                    // 2. Co-captains second, in alphabetical order
                    if (a.role === 'co_captain' && b.role === 'player') return -1;
                    if (a.role === 'player' && b.role === 'co_captain') return 1;
                    
                    // 3. Both same role, sort alphabetically by name
                    return a.in_game_alias.localeCompare(b.in_game_alias);
                  })
                  .map((member) => (
                  <div
                    key={member.id}
                    className="bg-gradient-to-r from-slate-700/50 to-slate-600/50 rounded-lg p-3 md:p-4 border border-slate-600/30"
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 sm:gap-3">
                      <div className="flex items-center gap-2 md:gap-3 flex-1 min-w-0">
                        <span className="text-lg md:text-2xl flex-shrink-0">{getRoleIcon(member.role)}</span>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <p className="font-semibold text-white text-sm md:text-base truncate">{member.in_game_alias}</p>
                            {member.transitional_player ? (
                              <span 
                                className="text-orange-400 text-xs px-1.5 py-0.5 bg-orange-900/30 rounded border border-orange-500/30 cursor-help"
                                title="Transitional Player - From other zones (Skirmish/USL) or new players, exempt from squad size limits"
                              >
                                🔄 T
                              </span>
                            ) : (
                              <span 
                                className="text-blue-400 text-xs px-1.5 py-0.5 bg-blue-900/30 rounded border border-blue-500/30 cursor-help"
                                title="Regular Player - Counts toward squad size limit"
                              >
                                R
                              </span>
                            )}
                          </div>
                          <p className={`text-xs md:text-sm ${getRoleColor(member.role)}`}>
                            {getRoleDisplayName(member.role)}
                          </p>
                        </div>
                      </div>
                      
                      <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3">
                        <div className="text-sm text-gray-400 sm:text-right">
                          Joined {new Date(member.joined_at).toLocaleDateString()}
                        </div>
                        
                        {/* Squad Management Actions - More compact on mobile */}
                        {canManageSquad() && member.player_id !== user?.id && (
                          <div className="flex gap-1 flex-wrap">
                            {/* Promote/Demote buttons */}
                            {isCaptain() && member.role === 'player' && (
                              <button
                                onClick={() => promoteMember(member.id, member.in_game_alias, 'co_captain')}
                                className="bg-blue-600 hover:bg-blue-500 text-white px-2 py-1 rounded text-xs transition-colors"
                                title="Promote to Co-Captain"
                              >
                                ⬆️
                              </button>
                            )}
                            {isCaptain() && member.role === 'co_captain' && (
                              <button
                                onClick={() => promoteMember(member.id, member.in_game_alias, 'player')}
                                className="bg-orange-600 hover:bg-orange-500 text-white px-2 py-1 rounded text-xs transition-colors"
                                title="Demote to Player"
                              >
                                ⬇️
                              </button>
                            )}
                            
                            {/* Transfer ownership (captain only, to non-captains) */}
                            {isCaptain() && member.role !== 'captain' && (
                              <button
                                onClick={() => transferOwnership(member.player_id, member.in_game_alias)}
                                className="bg-yellow-600 hover:bg-yellow-500 text-white px-2 py-1 rounded text-xs transition-colors"
                                title="Transfer Ownership"
                              >
                                👑
                              </button>
                            )}
                            
                            {/* Kick button */}
                            {(isCaptain() || (canManageSquad() && member.role === 'player')) && (
                              <button
                                onClick={() => kickMember(member.id, member.in_game_alias)}
                                className="bg-red-600 hover:bg-red-500 text-white px-2 py-1 rounded text-xs transition-colors"
                                title="Kick Member"
                              >
                                ❌
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Invite from free agents (Captain/Co-Captain/Admin, only when rosters unlocked) */}
        {isUserCaptainOrCoCaptain() && !isRosterLocked && (
          <div className="flex justify-center mt-8">
            <div className="w-full max-w-4xl">
              <div className="bg-gradient-to-b from-slate-800/50 to-slate-700/50 rounded-xl p-6 border border-cyan-500/20">
                <h3 className="text-xl font-bold text-cyan-400 mb-2 flex items-center gap-2">
                  📤 Invite from free agent pool
                </h3>
                <p className="text-gray-400 text-sm mb-4">
                  Send an invite to a player who is registered as a free agent. They will see it in their invites.
                </p>
                <button
                  type="button"
                  onClick={openInviteModal}
                  className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg font-medium text-sm transition-colors"
                >
                  Invite player from free agent pool
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Pending Requests Section (Captain/Co-Captain Only) - Centered */}
        {isUserCaptainOrCoCaptain() && (
          <div className="flex justify-center mt-8">
            <div className="w-full max-w-4xl">
              <div className="bg-gradient-to-b from-slate-800/50 to-slate-700/50 rounded-xl p-6 border border-cyan-500/20">
                <h3 className="text-xl font-bold text-cyan-400 mb-4 flex items-center gap-2">
                  📥 Join Requests ({pendingRequests.length})
                </h3>
                
                {pendingRequests.length === 0 ? (
                  <p className="text-gray-400 text-center py-8">No pending requests</p>
                ) : (
                  <div className="space-y-3">
                    {pendingRequests.map((request) => (
                      <div
                        key={request.id}
                        className="bg-gradient-to-r from-slate-700/50 to-slate-600/50 rounded-lg p-4 border border-slate-600/30"
                      >
                        <div className="flex items-center justify-between mb-3">
                          <div>
                            <p className="font-semibold text-white">{request.requester_alias}</p>
                            <p className="text-sm text-gray-400">
                              {new Date(request.created_at).toLocaleDateString()}
                            </p>
                          </div>
                        </div>
                        
                        {isRosterLocked && (
                          <p className="text-amber-400 text-xs mb-2">Approval is disabled while rosters are locked.</p>
                        )}
                        <div className="flex gap-2">
                          <button
                            onClick={() => handleRequestAction(request.id, 'approve')}
                            disabled={processingRequest === request.id || isRosterLocked}
                            className="flex-1 bg-green-600 hover:bg-green-500 disabled:bg-gray-600 disabled:opacity-60 text-white px-3 py-2 rounded text-sm transition-colors disabled:cursor-not-allowed"
                          >
                            {processingRequest === request.id ? '⏳' : '✅'} Approve
                          </button>
                          <button
                            onClick={() => handleRequestAction(request.id, 'deny')}
                            disabled={processingRequest === request.id}
                            className="flex-1 bg-red-600 hover:bg-red-500 disabled:bg-gray-600 text-white px-3 py-2 rounded text-sm transition-colors disabled:cursor-not-allowed"
                          >
                            {processingRequest === request.id ? '⏳' : '❌'} Deny
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Sent Invites Section (Captain/Co-Captain Only) - Centered */}
        {isUserCaptainOrCoCaptain() && (
          <div className="flex justify-center mt-8">
            <div className="w-full max-w-4xl">
              <div className="bg-gradient-to-b from-slate-800/50 to-slate-700/50 rounded-xl p-6 border border-cyan-500/20">
                <h3 className="text-xl font-bold text-cyan-400 mb-4 flex items-center gap-2">
                  📤 Sent Invites ({sentInvites.length})
                </h3>
                
                {sentInvites.length === 0 ? (
                  <p className="text-gray-400 text-center py-8">No invites sent</p>
                ) : (
                  <div className="space-y-3">
                    {sentInvites.map((invite) => (
                      <div
                        key={invite.id}
                        className="bg-gradient-to-r from-slate-700/50 to-slate-600/50 rounded-lg p-4 border border-slate-600/30"
                      >
                        <div className="flex flex-col gap-3">
                          <div className="flex items-center justify-between">
                            <div>
                              <p className="font-semibold text-white">{invite.invited_player_alias}</p>
                              <p className="text-sm text-gray-400">
                                Sent {new Date(invite.created_at).toLocaleDateString()}
                              </p>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className={`px-2 py-1 rounded text-xs border ${getInviteStatusColor(invite.status)}`}>
                                {getInviteStatusIcon(invite.status)} {invite.status.charAt(0).toUpperCase() + invite.status.slice(1)}
                              </span>
                            </div>
                          </div>
                          
                          {/* Detailed information */}
                          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2 text-sm">
                            <div>
                              <span className="text-gray-400">Source:</span>
                              <span className="ml-1 text-gray-300">{formatInviteSource(invite.invite_source)}</span>
                            </div>
                            <div>
                              <span className="text-gray-400">Type:</span>
                              <span className="ml-1 text-gray-300">{formatInviteType(invite.invite_type)}</span>
                            </div>
                            {invite.viewed_at && (
                              <div>
                                <span className="text-gray-400">Viewed:</span>
                                <span className="ml-1 text-green-300">✓</span>
                              </div>
                            )}
                            {invite.responded_at && (
                              <div>
                                <span className="text-gray-400">Response Time:</span>
                                <span className="ml-1 text-gray-300">{getResponseTime(invite.created_at, invite.responded_at)}</span>
                              </div>
                            )}
                          </div>
                          
                          {/* Message if present */}
                          {invite.message && (
                            <div className="bg-slate-600/30 rounded p-2 border-l-2 border-cyan-500/50">
                              <span className="text-xs text-gray-400">Message:</span>
                              <p className="text-sm text-gray-300 mt-1">{invite.message}</p>
                            </div>
                          )}
                          
                          {/* Expiration warning for pending invites */}
                          {invite.status === 'pending' && invite.expires_at && (
                            <div className="text-xs text-yellow-400">
                              Expires: {new Date(invite.expires_at).toLocaleDateString()}
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                
                {/* Legend for invite analytics */}
                <div className="bg-slate-700/30 border border-slate-600/30 rounded-lg p-4 mt-6">
                  <div className="text-sm font-medium text-gray-300 mb-3">Invite Analytics Legend:</div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <div className="text-xs font-medium text-gray-400 mb-2">Status:</div>
                      <div className="space-y-1 text-xs">
                        <div className="flex items-center gap-2">
                          <span className="px-1.5 py-0.5 rounded bg-yellow-600/20 text-yellow-300 border border-yellow-500/30">⏳ Pending</span>
                          <span className="text-gray-400">Awaiting response</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="px-1.5 py-0.5 rounded bg-green-600/20 text-green-300 border border-green-500/30">✅ Accepted</span>
                          <span className="text-gray-400">Player joined squad</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="px-1.5 py-0.5 rounded bg-red-600/20 text-red-300 border border-red-500/30">❌ Declined</span>
                          <span className="text-gray-400">Player declined invite</span>
                        </div>
                      </div>
                    </div>
                    <div>
                      <div className="text-xs font-medium text-gray-400 mb-2">Tracking:</div>
                      <div className="space-y-1 text-xs text-gray-300">
                        <div>• <strong>Source:</strong> How invite was sent</div>
                        <div>• <strong>Type:</strong> Purpose of invitation</div>
                        <div>• <strong>Viewed:</strong> Player opened the invite</div>
                        <div>• <strong>Response Time:</strong> Time to respond</div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Back Button */}
        <div className="mt-8 text-center">
          <Link
            href="/squads"
            className="inline-flex items-center gap-2 bg-gradient-to-r from-gray-600 to-gray-700 hover:from-gray-500 hover:to-gray-600 text-white px-6 py-3 rounded-lg font-medium transition-all duration-300"
          >
            ← Back to All Squads
          </Link>
        </div>
      </main>

      {/* Invite from free agent pool modal */}
      {showInviteModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={() => setShowInviteModal(false)}>
          <div className="bg-gray-800 rounded-xl border border-cyan-500/20 w-full max-w-md max-h-[80vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="p-4 border-b border-gray-600 flex items-center justify-between">
              <h3 className="text-lg font-bold text-cyan-400">Invite from free agent pool</h3>
              <button type="button" onClick={() => setShowInviteModal(false)} className="text-gray-400 hover:text-white">✕</button>
            </div>
            <div className="p-4 overflow-y-auto flex-1">
              {loadingFreeAgents ? (
                <p className="text-gray-400 text-center py-4">Loading...</p>
              ) : freeAgentsForInvite.length === 0 ? (
                <p className="text-gray-400 text-center py-4">No eligible free agents (everyone is already in this squad or has a pending invite).</p>
              ) : (
                <ul className="space-y-2">
                  {freeAgentsForInvite.map((fa) => (
                    <li key={fa.player_id} className="flex items-center justify-between gap-3 py-2 border-b border-gray-700 last:border-0">
                      <span className="text-white font-medium truncate">{fa.in_game_alias || 'Unknown'}</span>
                      <button
                        type="button"
                        onClick={() => sendInviteToPlayer(fa.player_id)}
                        disabled={invitingPlayerId === fa.player_id}
                        className="flex-shrink-0 px-3 py-1.5 bg-cyan-600 hover:bg-cyan-500 disabled:bg-gray-600 text-white rounded text-sm transition-colors disabled:cursor-not-allowed"
                      >
                        {invitingPlayerId === fa.player_id ? 'Sending...' : 'Invite'}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Squad Banner Management Modal */}
      {showBannerForm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-gray-800 rounded-lg p-6 w-full max-w-md">
            <h3 className="text-xl font-bold mb-4">
              {squad.banner_url ? 'Update Squad Picture' : 'Add Squad Picture'}
            </h3>
            
            {/* Current Banner Preview */}
            {squad.banner_url && (
              <div className="mb-4">
                <label className="block text-sm font-medium mb-2">Current Picture</label>
                <div className="w-full max-w-xs mx-auto bg-gray-700 rounded-lg overflow-hidden">
                  <img 
                    src={squad.banner_url} 
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
                  {squad.banner_url ? 'Update Picture' : 'Add Picture'}
                </button>
                {squad.banner_url && (
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
                    setBannerFile(null);
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
  );
} 