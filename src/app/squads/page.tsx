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
  is_active?: boolean;
  is_legacy?: boolean;
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
  skill_level?: string;
  preferred_roles?: string[];
  availability?: string;
  notes?: string;
  contact_info?: string;
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
  is_join_request?: boolean;
  is_invitation?: boolean;
  request_type?: 'join_request' | 'invitation';
}

export default function SquadsPage() {
  const { user, loading } = useAuth();
  const [userSquad, setUserSquad] = useState<Squad | null>(null);
  const [allSquads, setAllSquads] = useState<Squad[]>([]);
  const [freeAgents, setFreeAgents] = useState<FreeAgent[]>([]);
  const [allPlayers, setAllPlayers] = useState<any[]>([]);
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
  
  // Squad filtering states
  const [showInactiveSquads, setShowInactiveSquads] = useState(false);
  const [showLegacySquads, setShowLegacySquads] = useState(false);

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

  // Add user profile state and role checks near the top with other state
  const [userProfile, setUserProfile] = useState<any>(null);

  // Role checking functions
  const isCaptain = userSquad?.captain_id === user?.id;
  const canManageSquad = userSquad && (
    userSquad.captain_id === user?.id || 
    userSquad.members.some(m => m.player_id === user?.id && m.role === 'co_captain')
  );
  
  // Add permission checks for photo editing
  const canEditSquadPhotos = userSquad && (
    userSquad.captain_id === user?.id || // Captain
    userSquad.members.some(m => m.player_id === user?.id && m.role === 'co_captain') || // Co-captain
    userProfile?.is_admin || // Site admin
    userProfile?.ctf_role === 'ctf_admin' || // CTF admin
    userProfile?.is_media_manager // Media manager
  );

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

    if (!loading) {
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

  // Load user profile for permission checks
  useEffect(() => {
    if (user && !loading) {
      loadUserProfile();
    }
  }, [user, loading]);

  // Reload join requests when userSquad changes
  useEffect(() => {
    if (user && userSquad && !loading) {
      console.log('🔄 userSquad changed, reloading join requests for squad:', userSquad.name);
      loadJoinRequestsForSquad();
    }
  }, [user, userSquad, loading]);

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
    
    console.log('🚀 loadInitialData: Starting data load for user:', user ? 'authenticated' : 'anonymous');
    
    try {
      setDataLoading(true);
      console.log('🚀 loadInitialData: Set loading to true');
      
      // Load public data that everyone can see
      console.log('🚀 loadInitialData: Loading public data (squads + free agents + all players)...');
      const results = await Promise.allSettled([
        loadAllSquads(),
        user ? loadFreeAgents() : Promise.resolve(), // Only load free agents for authenticated users
        user ? loadAllPlayers() : Promise.resolve() // Only load all players for authenticated users
      ]);

      console.log('🚀 loadInitialData: Public data results:', results.map(r => r.status));

      // Check if still mounted before continuing
      if (!isMountedRef.current) {
        console.log('🚀 loadInitialData: Component unmounted after public data');
        return;
      }

      // Load user-specific data only for authenticated users
      if (user) {
        console.log('🚀 loadInitialData: Loading user-specific data...');
        
        // First load user squad (required for join requests)
        await loadUserSquad();
        
        // Then load other user data in parallel
        const userResults = await Promise.allSettled([
          loadReceivedInvitations(),
          loadSentJoinRequests(),
          loadJoinRequestsForSquad() // This now runs after loadUserSquad completes
        ]);
        console.log('🚀 loadInitialData: User data results:', userResults.map(r => r.status));
      } else {
        console.log('🚀 loadInitialData: Skipping user-specific data (anonymous user)');
      }

    } catch (error) {
      console.error('❌ loadInitialData: Error loading initial data:', error);
      if (isMountedRef.current) {
        toast.error('Failed to load squads data');
      }
    } finally {
      if (isMountedRef.current) {
        console.log('🚀 loadInitialData: Setting loading to false');
        setDataLoading(false);
        console.log('✅ loadInitialData: Completed');
      } else {
        console.log('🚀 loadInitialData: Component unmounted, skipping final state update');
      }
    }
  };

  const loadUserSquad = async () => {
    if (!user || !isMountedRef.current) return;

    try {
      console.log('🏴 Loading user squad for:', user.id);
      
      // Get ALL user's squad memberships - try both possible column names
      let allMembershipsData = null;
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
            banner_url,
            is_legacy,
            is_active
          )
        `)
        .eq('player_id', user.id)
        .eq('status', 'active')
        .order('joined_at', { ascending: false }); // Most recent first

      if (!membershipError1) {
        allMembershipsData = membershipData1;
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
              banner_url,
              is_legacy,
              is_active
            )
          `)
          .eq('user_id', user.id)
          .eq('status', 'active')
          .order('joined_at', { ascending: false }); // Most recent first
        
        allMembershipsData = membershipData2;
        membershipError = membershipError2;
      }

      if (membershipError && membershipError.code !== 'PGRST116') {
        console.error('Error loading user squad membership:', membershipError);
        // Don't return here - continue with null squad to prevent hanging
        setUserSquad(null);
        return;
      }

      // Only set to null if we're sure there's no squad membership
      if (!allMembershipsData || allMembershipsData.length === 0 || !isMountedRef.current) {
        console.log('🏴 No squad membership found, setting userSquad to null');
        setUserSquad(null);
        return;
      }

      console.log('🏴 Found squad memberships:', allMembershipsData.map(m => ({
        squadName: (m.squads as any).name,
        isLegacy: (m.squads as any).is_legacy,
        isActive: (m.squads as any).is_active,
        role: m.role
      })));

      // Prioritize squad selection:
      // 1. Active (non-legacy) squads first
      // 2. Then legacy squads
      // 3. Then inactive squads
      const membershipData = allMembershipsData.find(m => 
        (m.squads as any).is_legacy === false && (m.squads as any).is_active !== false
      ) || allMembershipsData.find(m => 
        (m.squads as any).is_legacy === true
      ) || allMembershipsData[0]; // Fallback to first one

      const squadData = membershipData.squads as any;
      console.log('🏴 Selected squad for display:', {
        squadName: squadData.name,
        isLegacy: squadData.is_legacy,
        isActive: squadData.is_active,
        role: membershipData.role
      });
      
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
        is_legacy: squadData.is_legacy || false,
        is_active: squadData.is_active !== false,
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

      console.log('🏴 Setting formatted squad:', {
        name: formattedSquad.name,
        isLegacy: formattedSquad.is_legacy,
        isActive: formattedSquad.is_active,
        memberCount: formattedSquad.member_count
      });
      
      setUserSquad(formattedSquad);
    } catch (error) {
      console.error('Error loading user squad:', error);
      // Only set to null on actual error, not on loading
      if (isMountedRef.current) {
        setUserSquad(null);
      }
    }
  };

  const loadAllSquads = async () => {
    if (!isMountedRef.current) return;
    
    console.log('🔍 loadAllSquads: Starting to load squads...');
    
    try {
      const startTime = Date.now();
      console.log('🔍 loadAllSquads: Making Supabase query...');
      
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
          is_active,
          is_legacy,
          profiles!squads_captain_id_fkey(in_game_alias)
        `)
        .order('created_at', { ascending: false });

      const queryTime = Date.now() - startTime;
      console.log(`🔍 loadAllSquads: Query completed in ${queryTime}ms`);

      if (error) {
        console.error('❌ loadAllSquads: Error loading squads:', error);
        return;
      }

      console.log(`🔍 loadAllSquads: Found ${squadsData?.length || 0} squads`);

      if (!isMountedRef.current) {
        console.log('🔍 loadAllSquads: Component unmounted, skipping processing');
        return;
      }

      // Get active member counts for all squads in a separate query to ensure consistency
      const squadIds = squadsData.map(squad => squad.id);
      const { data: memberCounts } = await supabase
        .from('squad_members')
        .select('squad_id')
        .in('squad_id', squadIds)
        .eq('status', 'active');

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
        member_count: memberCounts?.filter(m => m.squad_id === squad.id).length || 0,
        members: [], // Not needed for list view
        is_active: squad.is_active
      }));

      console.log('🔍 loadAllSquads: Setting formatted squads state');
      setAllSquads(formattedSquads);
      console.log('✅ loadAllSquads: Completed successfully');
    } catch (error) {
      console.error('❌ loadAllSquads: Exception caught:', error);
    }
  };

  const loadFreeAgents = async () => {
    if (!isMountedRef.current) return;
    
    try {
      // Use the safe utility function with retry logic
      const { getFreeAgents } = await import('@/utils/supabaseHelpers');
      const data = await getFreeAgents();

      if (!isMountedRef.current) return;

      const formattedAgents: FreeAgent[] = data
        .filter((agent: any) => agent.profiles && agent.profiles.in_game_alias) // Ensure profile exists with alias
        .map((agent: any) => ({
          id: agent.profiles.id,
          in_game_alias: agent.profiles.in_game_alias,
          email: agent.profiles.email,
          created_at: agent.profiles.created_at,
          skill_level: agent.skill_level,
          preferred_roles: agent.preferred_roles,
          availability: agent.availability,
          notes: agent.notes,
          contact_info: agent.contact_info
        }));
      
      console.log('loadFreeAgents: Found', formattedAgents.length, 'free agents');
      setFreeAgents(formattedAgents);
    } catch (error: any) {
      console.error('Error loading free agents:', error);
      
      // Show user-friendly error messages
      if (error.name === 'SupabaseConnectionError') {
        console.error('🔌 Connection issue detected - will retry automatically');
      } else {
        console.error('📊 Query issue:', error.message);
      }
      
      if (isMountedRef.current) {
        setFreeAgents([]);
      }
    }
  };

  const loadAllPlayers = async () => {
    if (!user || !isMountedRef.current) return;

    try {
      // Import the helper functions
      const supabaseHelpers = await import('@/utils/supabaseHelpers');
      const getAllPlayers = supabaseHelpers.getAllPlayers;
      
      if (!getAllPlayers) {
        console.error('getAllPlayers function not found in supabaseHelpers');
        setAllPlayers([]);
        return;
      }

      const data = await getAllPlayers();

      if (!isMountedRef.current) return;

      console.log('loadAllPlayers: Found', data.length, 'players');
      setAllPlayers(data);
    } catch (error: any) {
      console.error('Error loading all players:', error);
      
      if (isMountedRef.current) {
        setAllPlayers([]);
      }
    }
  };

  const loadReceivedInvitations = async () => {
    if (!user || !isMountedRef.current) return;

    try {
      console.log('📬 Loading received invitations for user:', user.id);
      
      // Use direct query instead of RPC function to avoid type mismatch
      const { data, error } = await supabase
        .from('squad_invites')
        .select(`
          id,
          squad_id,
          message,
          created_at,
          expires_at,
          status,
          squads!inner(
            id,
            name,
            tag,
            is_active,
            is_legacy
          ),
          profiles!squad_invites_invited_by_fkey(
            in_game_alias
          )
        `)
        .eq('invited_player_id', user.id)
        .eq('status', 'pending')
        .gt('expires_at', new Date().toISOString())
        .order('created_at', { ascending: false });

      if (!isMountedRef.current) return;

      if (error) {
        console.error('Error loading received invitations:', error);
        setReceivedInvitations([]);
        return;
      }

      console.log('📬 Raw invitation data:', data);

      if (data) {
        const formattedInvitations = data
          .filter((invite: any) => {
            // Show invites from all squads (active, inactive, and legacy)
            // The key change: legacy squads should always show invites regardless of is_active
            const isFromLegacySquad = invite.squads?.is_legacy === true;
            const isFromActiveSquad = invite.squads?.is_active !== false;
            
            console.log('📬 Filtering invitation:', {
              squadName: invite.squads?.name,
              isLegacy: isFromLegacySquad,
              isActive: isFromActiveSquad,
              shouldShow: isFromLegacySquad || isFromActiveSquad
            });
            
            return isFromLegacySquad || isFromActiveSquad;
          })
          .map((invite: any) => ({
            id: invite.id,
            squad_id: invite.squad_id,
            squad_name: invite.squads?.name || 'Unknown Squad',
            squad_tag: invite.squads?.tag || 'UNK',
            invited_player_id: user.id,
            invited_alias: '',
            invited_by_alias: invite.profiles?.in_game_alias || 'Unknown',
            inviter_alias: invite.profiles?.in_game_alias || 'Unknown', // Add this for consistency
            created_at: invite.created_at,
            expires_at: invite.expires_at,
            status: invite.status,
            message: invite.message
          }));

        console.log('📬 Formatted invitations:', formattedInvitations);
        setReceivedInvitations(formattedInvitations);
      }
    } catch (error) {
      console.error('Error loading received invitations:', error);
      if (isMountedRef.current) {
        setReceivedInvitations([]);
      }
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
    if (!user || !userSquad || !isMountedRef.current) {
      console.log('🚫 loadJoinRequestsForSquad: Early return -', {
        hasUser: !!user,
        hasUserSquad: !!userSquad,
        isMounted: isMountedRef.current,
        userSquadName: userSquad?.name
      });
      return;
    }

    const userMember = userSquad.members.find(m => m.player_id === user.id);
    if (!userMember || (userMember.role !== 'captain' && userMember.role !== 'co_captain')) {
      console.log('🚫 loadJoinRequestsForSquad: User is not captain/co-captain -', {
        userMember,
        userRole: userMember?.role,
        squadName: userSquad.name
      });
      return;
    }

    console.log('🔍 loadJoinRequestsForSquad: Starting query for squad:', {
      squadId: userSquad.id,
      squadName: userSquad.name,
      isLegacy: userSquad.is_legacy,
      userRole: userMember.role
    });

    try {
      const { data, error } = await supabase
        .from('squad_invites')
        .select(`
          *,
          profiles!squad_invites_invited_player_id_fkey(in_game_alias),
          inviter:profiles!squad_invites_invited_by_fkey(in_game_alias)
        `)
        .eq('squad_id', userSquad.id)
        .eq('status', 'pending')
        .gt('expires_at', new Date().toISOString());

      if (!isMountedRef.current) return;

      if (error) {
        console.error('❌ loadJoinRequestsForSquad: Database error:', error);
        setJoinRequests([]);
        return;
      }

      console.log('📊 loadJoinRequestsForSquad: Raw database results:', {
        totalRecords: data?.length || 0,
        squadId: userSquad.id,
        rawData: data
      });

      if (data) {
        // Filter out the current user's own join requests to prevent them from approving their own requests
        const filteredData = data.filter((request: any) => {
          const isJoinRequest = request.invited_by === request.invited_player_id;
          const isInvitation = request.invited_by !== request.invited_player_id;
          
          // For join requests: exclude requests where the current user is the one requesting to join
          // For invitations: include all invitations sent by captains to other players
          if (isJoinRequest) {
            return request.invited_player_id !== user.id;
          } else {
            return true; // Keep all invitations
          }
        });

        const formattedRequests = filteredData.map((request: any) => {
          const isJoinRequest = request.invited_by === request.invited_player_id;
          const isInvitation = request.invited_by !== request.invited_player_id;
          
          return {
            ...request,
            requester_alias: request.profiles?.in_game_alias,
            invited_alias: request.profiles?.in_game_alias,
            inviter_alias: request.inviter?.in_game_alias,
            is_join_request: isJoinRequest,
            is_invitation: isInvitation,
            request_type: isJoinRequest ? 'join_request' : 'invitation'
          };
        });

        console.log('📋 loadJoinRequestsForSquad: Processed results:', {
          total: formattedRequests.length,
          joinRequests: formattedRequests.filter((r: any) => r.is_join_request).length,
          invitations: formattedRequests.filter((r: any) => r.is_invitation).length,
          squadIsLegacy: userSquad.is_legacy,
          currentUserId: user.id,
          filteredOut: data.length - filteredData.length,
          details: formattedRequests.map(r => ({
            type: r.request_type,
            invitedPlayer: r.invited_alias,
            inviter: r.inviter_alias,
            isLegacySquad: userSquad.is_legacy
          }))
        });

        setJoinRequests(formattedRequests);
      } else {
        console.log('📋 loadJoinRequestsForSquad: No data returned, setting empty array');
        setJoinRequests([]);
      }
    } catch (error) {
      console.error('❌ loadJoinRequestsForSquad: Exception caught:', error);
      if (isMountedRef.current) {
        setJoinRequests([]);
      }
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
      // Get the squad info to check if it's legacy
      const { data: squadInfo, error: squadError } = await supabase
        .from('squads')
        .select('is_legacy, name')
        .eq('id', squadId)
        .single();

      if (squadError) throw squadError;

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

      const squadType = squadInfo.is_legacy ? 'legacy squad' : 'squad';
      toast.success(`Successfully joined the ${squadType} ${squadInfo.name}!`);
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
      // First check if there's already a pending invitation for this player to this squad
      const { data: existingInvite, error: checkError } = await supabase
        .from('squad_invites')
        .select('id, status, expires_at')
        .eq('squad_id', userSquad.id)
        .eq('invited_player_id', selectedInvitee)
        .eq('status', 'pending')
        .gt('expires_at', new Date().toISOString())
        .maybeSingle();

      if (checkError) {
        console.error('Error checking existing invitations:', checkError);
        // Continue anyway, let the database constraint handle duplicates
      }

      if (existingInvite) {
        const invitedPlayer = allPlayers.find(p => p.id === selectedInvitee);
        const playerName = invitedPlayer?.in_game_alias || 'Player';
        
        if (userSquad.is_legacy) {
          toast.error(
            `🏛️ ${playerName} already has a pending invitation to this legacy squad. Please wait for them to respond.`,
            { duration: 5000 }
          );
        } else {
          toast.error(
            `${playerName} already has a pending invitation to this squad. Please wait for them to respond.`,
            { duration: 5000 }
          );
        }
        return;
      }

      // Create the invitation
      const { error } = await supabase
        .from('squad_invites')
        .insert([
          {
            squad_id: userSquad.id,
            invited_player_id: selectedInvitee,
            invited_by: user?.id,
            expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(), // 7 days
            message: userSquad.is_legacy 
              ? `Invitation to join legacy squad [${userSquad.tag}] ${userSquad.name}. You can join while keeping your current active squad membership.`
              : `Invitation to join [${userSquad.tag}] ${userSquad.name}`
          }
        ]);

      if (error) throw error;

      // Get the invited player's name for better feedback
      const invitedPlayer = allPlayers.find(p => p.id === selectedInvitee);
      const playerName = invitedPlayer?.in_game_alias || 'Player';

      // Provide specific feedback based on squad type
      if (userSquad.is_legacy) {
        toast.success(
          `🏛️ Legacy squad invitation sent to ${playerName}! They can join while keeping their current active squad membership.`,
          { duration: 6000 }
        );
      } else {
        toast.success(`Invitation sent to ${playerName} successfully!`);
      }

      setShowInviteForm(false);
      setSelectedInvitee('');
      
      // Refresh the pending invites to show the new invitation
      if (userSquad.id) {
        fetchPendingInvitesForSquad(userSquad.id);
      }
      
      loadAllSquads();
      loadFreeAgents();
      loadAllPlayers();
    } catch (error: any) {
      console.error('Error sending invitation:', error);
      
      // Handle specific database constraint errors
      if (error.code === '23505' && error.message.includes('squad_invites')) {
        const invitedPlayer = allPlayers.find(p => p.id === selectedInvitee);
        const playerName = invitedPlayer?.in_game_alias || 'Player';
        
        if (userSquad?.is_legacy) {
          toast.error(
            `🏛️ ${playerName} already has a pending invitation to this legacy squad.`,
            { duration: 5000 }
          );
        } else {
          toast.error(
            `${playerName} already has a pending invitation to this squad.`,
            { duration: 5000 }
          );
        }
      } else {
        toast.error(`Failed to send invitation: ${error.message || 'Unknown error'}`);
      }
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
    if (!userSquad || !canEditSquadPhotos) return;

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

  // Add function to load user profile
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

  // Allow anonymous users to view squads, but redirect on loading for auth check

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

        {/* User's Squad Section - Only show for authenticated users */}
        {user && (dataLoading || loading ? (
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
                    
                    {canEditSquadPhotos && (
                      <button
                        onClick={() => setShowBannerForm(true)}
                        className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2.5 rounded-lg text-sm font-medium flex items-center justify-center gap-2 transition-all duration-200 shadow-md hover:shadow-lg"
                      >
                        <span>🖼️</span>
                        {userSquad?.banner_url ? 'Update Picture' : 'Add Picture'}
                      </button>
                    )}
                    
                    {isCaptain && (
                      <div className="flex flex-col sm:flex-row gap-2">
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
              <div className="flex gap-6">
                {/* Large Squad Banner */}
                {userSquad.banner_url && (
                  <div className="w-48 h-48 flex-shrink-0">
                    <div className="bg-gray-800/50 rounded-lg overflow-hidden border border-gray-600/30 h-full">
                      <img 
                        src={userSquad.banner_url} 
                        alt={`${userSquad.name} banner`}
                        className="w-full h-full object-cover"
                        onError={(e) => {
                          e.currentTarget.parentElement!.style.display = 'none';
                        }}
                      />
                    </div>
                  </div>
                )}
                {/* Members List */}
                <div className="flex-1 grid gap-3">
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
            </div>

            {/* Pending Invites */}
            {canManageSquad && pendingInvites.length > 0 && (
              <div>
                <h3 className="text-xl font-semibold mb-4 flex items-center gap-2">
                  📤 Pending Invitations
                  {userSquad?.is_legacy && (
                    <span className="bg-amber-600/20 text-amber-300 px-2 py-1 rounded text-xs font-medium border border-amber-500/30">
                      🏛️ LEGACY SQUAD
                    </span>
                  )}
                </h3>
                {userSquad?.is_legacy && (
                  <div className="bg-amber-600/10 border border-amber-500/20 rounded-lg p-3 mb-4">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-amber-400">💡</span>
                      <span className="text-amber-300 font-medium text-sm">Legacy Squad Invitations</span>
                    </div>
                    <p className="text-amber-200 text-xs">
                      Players can join your legacy squad while keeping their current active squad membership. 
                      This preserves historical squad connections without affecting competitive play.
                    </p>
                  </div>
                )}
                <div className="grid gap-3">
                  {pendingInvites.map((invite) => (
                    <div key={invite.id} className="bg-gray-700 rounded-lg p-4 border border-gray-600">
                      <div className="flex justify-between items-start">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-2">
                            <span className="font-semibold text-cyan-400">{invite.invited_alias}</span>
                            {userSquad?.is_legacy && (
                              <span className="bg-amber-600/20 text-amber-300 px-2 py-1 rounded text-xs font-medium border border-amber-500/30">
                                🏛️ LEGACY INVITE
                              </span>
                            )}
                          </div>
                          <div className="text-sm text-gray-400 mb-2">
                            Invited by {invite.invited_by_alias} • Expires {new Date(invite.expires_at).toLocaleDateString()}
                          </div>
                          {userSquad?.is_legacy && (
                            <div className="text-xs text-amber-300 bg-amber-600/10 p-2 rounded border border-amber-500/20">
                              💡 This player can accept and join your legacy squad while keeping their current active squad membership.
                            </div>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="bg-yellow-500/20 text-yellow-300 px-3 py-1 rounded-full text-xs font-medium border border-yellow-500/30 animate-pulse">
                            ⏳ Pending Response
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Join Requests to Squad */}
            {canManageSquad && joinRequests.length > 0 && (
              <div>
                <h3 className="text-xl font-semibold mb-4 flex items-center gap-2">
                  📤 Pending Invitations & Join Requests
                  <span className="bg-blue-600/20 text-blue-300 px-2 py-1 rounded text-xs font-medium border border-blue-500/30">
                    {joinRequests.length}
                  </span>
                </h3>
                <div className="grid gap-3">
                  {joinRequests.map((request) => {
                    const isJoinRequest = request.request_type === 'join_request';
                    const isInvitation = request.request_type === 'invitation';
                    
                    return (
                      <div key={request.id} className="bg-gray-700 rounded p-4">
                        <div className="flex justify-between items-start">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-2">
                              <span className="font-semibold text-green-400">{request.invited_alias}</span>
                              {isJoinRequest && (
                                <span className="bg-green-600/20 text-green-300 px-2 py-1 rounded text-xs font-medium border border-green-500/30">
                                  📥 JOIN REQUEST
                                </span>
                              )}
                              {isInvitation && (
                                <span className="bg-blue-600/20 text-blue-300 px-2 py-1 rounded text-xs font-medium border border-blue-500/30">
                                  📤 INVITATION SENT
                                </span>
                              )}
                              {userSquad?.is_legacy && (
                                <span className="bg-amber-600/20 text-amber-300 px-2 py-1 rounded text-xs font-medium border border-amber-500/30">
                                  🏛️ LEGACY
                                </span>
                              )}
                            </div>
                            <div className="text-sm text-gray-400 mb-2">
                              {isJoinRequest ? (
                                <>Requested to join {new Date(request.created_at).toLocaleDateString()}</>
                              ) : (
                                <>Invited by {request.inviter_alias} on {new Date(request.created_at).toLocaleDateString()}</>
                              )}
                              {' • Expires '}{new Date(request.expires_at).toLocaleDateString()}
                            </div>
                            {userSquad?.is_legacy && isInvitation && (
                              <div className="text-sm text-amber-300 bg-amber-600/10 p-2 rounded mb-2 border border-amber-500/20">
                                💡 Legacy squad invitation - {request.invited_alias} can join while keeping their current active squad membership.
                              </div>
                            )}
                            {request.message && (
                              <div className="text-sm text-gray-300 bg-gray-600 p-2 rounded mb-3">
                                "{request.message}"
                              </div>
                            )}
                          </div>
                          <div className="flex gap-2 ml-4">
                            {isJoinRequest && (
                              <>
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
                              </>
                            )}
                            {isInvitation && (
                              <button
                                onClick={() => denyJoinRequest(request.id)}
                                className="bg-gray-600 hover:bg-gray-700 px-4 py-2 rounded text-sm"
                                title="Cancel this invitation"
                              >
                                Cancel Invite
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
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
                  {receivedInvitations.map((invitation) => {
                    // Check if this invitation is from a legacy squad
                    const isLegacyInvite = allSquads.find(s => s.id === invitation.squad_id)?.is_legacy;
                    
                    return (
                      <div key={invitation.id} className="bg-gray-700 rounded p-4">
                        <div className="flex justify-between items-start">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-2">
                              <span className="font-semibold text-cyan-400">
                                [{invitation.squad_tag}] {invitation.squad_name}
                              </span>
                              {isLegacyInvite && (
                                <span className="bg-amber-600/20 text-amber-300 px-2 py-1 rounded text-xs font-medium border border-amber-500/30">
                                  🏛️ LEGACY
                                </span>
                              )}
                            </div>
                            <div className="text-sm text-gray-400 mb-2">
                              Invited by {invitation.inviter_alias} • Expires {new Date(invitation.expires_at).toLocaleDateString()}
                            </div>
                            {isLegacyInvite && (
                              <div className="text-sm text-amber-300 bg-amber-600/10 p-2 rounded mb-2 border border-amber-500/20">
                                💡 This is a legacy squad invitation. You can join this historical squad while keeping your current active squad membership.
                              </div>
                            )}
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
                    );
                  })}
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
        ))}

        {/* Anonymous user notice */}
        {!user && (
          <div className="bg-gray-800 rounded-lg p-6 text-center mb-8">
            <h2 className="text-xl font-semibold mb-4">Join the Squad System</h2>
            <p className="text-gray-300 mb-4">Sign in to create or join squads, and manage your team</p>
            <a href="/auth/login" className="bg-blue-600 hover:bg-blue-700 px-6 py-2 rounded inline-block">
              Sign In
            </a>
          </div>
        )}

        {/* All Squads Section */}
        <div className="bg-gray-800 rounded-lg p-6">
          <h2 className="text-2xl font-bold mb-6">All Squads</h2>
          
          {/* Active Squads */}
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
            <>
              <div className="grid gap-4">
                {allSquads.filter(squad => squad.is_active !== false).map((squad) => (
                <Link key={squad.id} href={`/squads/${squad.id}`}>
                  <div className="bg-gray-700 rounded-lg overflow-hidden hover:bg-gray-600 transition-colors cursor-pointer">
                    <div className="p-4">
                      <div className="flex flex-col sm:flex-row gap-4">
                        {/* Squad Picture - Mobile optimized */}
                        {squad.banner_url && (
                          <div className="w-full sm:w-24 md:w-32 h-24 sm:h-24 md:h-32 flex-shrink-0">
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
                        
                        {/* Squad Info - Ensure no overflow */}
                        <div className="flex-1 min-w-0 overflow-hidden">
                          <h3 className="text-lg font-semibold mb-2 text-cyan-400 hover:text-cyan-300 truncate">
                            [{squad.tag}] {squad.name}
                          </h3>
                          
                          <p className="text-gray-300 mb-3 text-sm line-clamp-2 break-words">{squad.description}</p>
                          
                          <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-2">
                            <div className="flex flex-col sm:flex-row gap-2 sm:gap-4 text-sm text-gray-400">
                              <span className="flex items-center gap-1 truncate">
                                👥 {squad.member_count} members
                              </span>
                              <span className="flex items-center gap-1 truncate">
                                👑 <span className="truncate">{squad.captain_alias}</span>
                              </span>
                            </div>
                            <div className="text-xs text-gray-500 flex-shrink-0">
                              {new Date(squad.created_at).toLocaleDateString()}
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </Link>
              ))}
              {!dataLoading && allSquads.filter(squad => squad.is_active !== false).length === 0 && (
                <div className="text-center py-8 text-gray-400">
                  No active squads found. Be the first to create one!
                </div>
              )}
              </div>

              {/* Inactive and Legacy Squad Buttons */}
              {!dataLoading && (allSquads.some(squad => squad.is_active === false && !squad.is_legacy) || allSquads.some(squad => squad.is_legacy === true)) && (
                <div className="mt-6 flex gap-4 justify-center">
                  {allSquads.some(squad => squad.is_active === false && !squad.is_legacy) && (
                    <button
                      onClick={() => setShowInactiveSquads(!showInactiveSquads)}
                      className="bg-gray-700 hover:bg-gray-600 text-white px-6 py-3 rounded-lg font-medium transition-all duration-300 border border-gray-600"
                    >
                      {showInactiveSquads ? 'Hide' : 'Show'} Inactive Squads ({allSquads.filter(s => s.is_active === false && !s.is_legacy).length})
                    </button>
                  )}
                  {allSquads.some(squad => squad.is_legacy === true) && (
                    <button
                      onClick={() => setShowLegacySquads(!showLegacySquads)}
                      className="bg-gray-700 hover:bg-gray-600 text-white px-6 py-3 rounded-lg font-medium transition-all duration-300 border border-gray-600"
                    >
                      {showLegacySquads ? 'Hide' : 'Show'} Legacy Squads ({allSquads.filter(s => s.is_legacy === true).length})
                    </button>
                  )}
                </div>
              )}

              {/* Inactive Squads Section */}
              {showInactiveSquads && !dataLoading && (
                <div className="mt-6">
                  <h3 className="text-xl font-bold mb-4 text-orange-400">Inactive Squads</h3>
                  <div className="grid gap-4">
                    {allSquads.filter(squad => squad.is_active === false && !squad.is_legacy).map((squad) => (
                      <Link key={squad.id} href={`/squads/${squad.id}`}>
                        <div className="bg-gray-700/50 rounded-lg overflow-hidden hover:bg-gray-600/50 transition-colors cursor-pointer border border-orange-500/30">
                          <div className="p-4">
                            <div className="flex flex-col sm:flex-row gap-4">
                              {squad.banner_url && (
                                <div className="w-full sm:w-24 md:w-32 h-24 sm:h-24 md:h-32 flex-shrink-0">
                                  <div className="bg-gray-800/50 rounded-lg overflow-hidden border border-gray-600/30 h-full">
                                    <img 
                                      src={squad.banner_url} 
                                      alt={`${squad.name} picture`}
                                      className="w-full h-full object-cover opacity-70"
                                      onError={(e) => {
                                        e.currentTarget.parentElement!.style.display = 'none';
                                      }}
                                    />
                                  </div>
                                </div>
                              )}
                              <div className="flex-1 min-w-0 overflow-hidden">
                                <h3 className="text-lg font-semibold mb-2 text-orange-400 hover:text-orange-300 truncate">
                                  [{squad.tag}] {squad.name} <span className="text-sm text-gray-500">(Inactive)</span>
                                </h3>
                                <p className="text-gray-400 mb-3 text-sm line-clamp-2 break-words">{squad.description}</p>
                                <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-2">
                                  <div className="flex flex-col sm:flex-row gap-2 sm:gap-4 text-sm text-gray-500">
                                    <span className="flex items-center gap-1 truncate">
                                      👥 {squad.member_count} members
                                    </span>
                                    <span className="flex items-center gap-1 truncate">
                                      👑 <span className="truncate">{squad.captain_alias}</span>
                                    </span>
                                  </div>
                                  <div className="text-xs text-gray-500 flex-shrink-0">
                                    {new Date(squad.created_at).toLocaleDateString()}
                                  </div>
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      </Link>
                    ))}
                  </div>
                </div>
              )}

              {/* Legacy Squads Section */}
              {showLegacySquads && !dataLoading && (
                <div className="mt-6">
                  <h3 className="text-xl font-bold mb-4 text-purple-400">Legacy Squads</h3>
                  <div className="grid gap-4">
                    {allSquads.filter(squad => squad.is_legacy === true).map((squad) => (
                      <Link key={squad.id} href={`/squads/${squad.id}`}>
                        <div className="bg-gray-700/30 rounded-lg overflow-hidden hover:bg-gray-600/30 transition-colors cursor-pointer border border-purple-500/30">
                          <div className="p-4">
                            <div className="flex flex-col sm:flex-row gap-4">
                              {squad.banner_url && (
                                <div className="w-full sm:w-24 md:w-32 h-24 sm:h-24 md:h-32 flex-shrink-0">
                                  <div className="bg-gray-800/50 rounded-lg overflow-hidden border border-gray-600/30 h-full">
                                    <img 
                                      src={squad.banner_url} 
                                      alt={`${squad.name} picture`}
                                      className="w-full h-full object-cover opacity-50"
                                      onError={(e) => {
                                        e.currentTarget.parentElement!.style.display = 'none';
                                      }}
                                    />
                                  </div>
                                </div>
                              )}
                              <div className="flex-1 min-w-0 overflow-hidden">
                                <h3 className="text-lg font-semibold mb-2 text-purple-400 hover:text-purple-300 truncate">
                                  [{squad.tag}] {squad.name} <span className="text-sm text-gray-500">(Legacy)</span>
                                </h3>
                                <p className="text-gray-500 mb-3 text-sm line-clamp-2 break-words">{squad.description}</p>
                                <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-2">
                                  <div className="flex flex-col sm:flex-row gap-2 sm:gap-4 text-sm text-gray-600">
                                    <span className="flex items-center gap-1 truncate">
                                      👥 {squad.member_count} members
                                    </span>
                                    <span className="flex items-center gap-1 truncate">
                                      👑 <span className="truncate">{squad.captain_alias}</span>
                                    </span>
                                  </div>
                                  <div className="text-xs text-gray-600 flex-shrink-0">
                                    {new Date(squad.created_at).toLocaleDateString()}
                                  </div>
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      </Link>
                    ))}
                  </div>
                </div>
              )}
            </>
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
              <div className="flex items-center gap-2 mb-4">
                <h3 className="text-xl font-bold">📤 Invite Player</h3>
                {userSquad?.is_legacy && (
                  <span className="bg-amber-600/20 text-amber-300 px-2 py-1 rounded text-xs font-medium border border-amber-500/30">
                    🏛️ LEGACY
                  </span>
                )}
              </div>
              
              {userSquad?.is_legacy && (
                <div className="bg-amber-600/10 border border-amber-500/20 rounded-lg p-3 mb-4">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-amber-400">💡</span>
                    <span className="text-amber-300 font-medium text-sm">Legacy Squad Invitation</span>
                  </div>
                  <p className="text-amber-200 text-xs">
                    Players can join your legacy squad while keeping their current active squad membership. 
                    This is perfect for preserving historical connections!
                  </p>
                </div>
              )}
              
              <form onSubmit={invitePlayer}>
                <div className="mb-6">
                  <label className="block text-sm font-medium mb-2">Select Player</label>
                  <select
                    value={selectedInvitee}
                    onChange={(e) => setSelectedInvitee(e.target.value)}
                    className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2"
                    required
                  >
                    <option value="">Choose a player...</option>
                    {allPlayers
                      .filter(player => {
                        // Exclude current squad members
                        if (userSquad?.members.some(member => member.player_id === player.id)) {
                          return false;
                        }
                        
                        // If this is a legacy squad, can invite anyone (including players in active squads)
                        if (userSquad?.is_legacy === true) {
                          return true;
                        }
                        
                        // For active squads, check if player is in any active (non-legacy) squad
                        // This would require additional data, so for now we'll allow all non-members
                        // TODO: In a future enhancement, we could load player squad status
                        return true;
                      })
                      .map((player) => (
                        <option key={player.id} value={player.id}>
                          {player.in_game_alias}
                        </option>
                      ))
                    }
                  </select>
                  {userSquad?.is_legacy && (
                    <p className="text-xs text-amber-300 mt-2">
                      ✨ You can invite players even if they're already in other active squads
                    </p>
                  )}
                </div>
                <div className="flex gap-3">
                  <button
                    type="submit"
                    className={`flex-1 py-2 rounded font-medium transition-all duration-300 ${
                      userSquad?.is_legacy 
                        ? 'bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 text-white'
                        : 'bg-green-600 hover:bg-green-700 text-white'
                    }`}
                  >
                    {userSquad?.is_legacy ? '🏛️ Send Legacy Invite' : 'Send Invitation'}
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