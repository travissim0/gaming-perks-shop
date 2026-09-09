'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/lib/AuthContext';
import { supabase } from '@/lib/supabase';
import Navbar from '@/components/Navbar';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { toast } from 'react-hot-toast';
import { useLoadingTimeout } from '@/hooks/useLoadingTimeout';
import { queries, robustFetch, cacheUtils } from '@/utils/dataFetching';
import { canAddPlayerToSquad, hasAdminOverride, getSquadMemberCountDisplay } from '@/utils/squadValidation';
import { checkIfUserInFreeAgentPool, getFreeAgents } from '@/utils/supabaseHelpers';
import { getLeagues, pickFeatured, getLatestSeason, getStandings, type LeagueInfo, type LeagueSeason, type StandingRow } from '@/lib/leagues';
import { CLASS_COLORS } from '@/lib/constants';

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
  league_slug?: string | null;
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
  
  // Member stats
  const [memberStats, setMemberStats] = useState<Record<string, { kills: number; kd: number | null; captures: number; elo: number | null; eloTier: string | null }>>({});

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

  // League context: which league this squad plays in decides the page layout.
  // Squad leagues (CTFPL) recruit; draft/OvD squads get their roster from the draft.
  const [leagueInfo, setLeagueInfo] = useState<LeagueInfo | null>(null);
  const [seasonInfo, setSeasonInfo] = useState<LeagueSeason | null>(null);
  const [standing, setStanding] = useState<StandingRow | null>(null);
  const [draftPicks, setDraftPicks] = useState<Record<string, { round: number; overall: number }>>({});
  const [memberClasses, setMemberClasses] = useState<Record<string, string[]>>({});
  const [showInviteHistory, setShowInviteHistory] = useState(false);
  const isDraftLeague = !!leagueInfo && !!leagueInfo.format && leagueInfo.format !== 'squad';

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

  // Load member stats when squad data becomes available
  useEffect(() => {
    if (!squad?.members?.length) return;
    let cancelled = false;
    (async () => {
      try {
        const [statsRes, eloRes] = await Promise.all([
          fetch('/api/player-stats/leaderboard?gameMode=Combined&limit=1000&minGames=0').then(r => r.ok ? r.json() : { data: [] }),
          fetch('/api/player-stats/elo-leaderboard?gameMode=Combined&limit=1000&minGames=0').then(r => r.ok ? r.json() : { data: [] }),
        ]);
        if (cancelled) return;
        const statsByName: Record<string, any> = {};
        ((statsRes.data || []) as any[]).forEach((p: any) => {
          const key = (p.player_name || '').trim().toLowerCase();
          if (key) statsByName[key] = p;
        });
        const eloByName: Record<string, any> = {};
        ((eloRes.data || []) as any[]).forEach((p: any) => {
          const key = (p.player_name || '').trim().toLowerCase();
          if (key) eloByName[key] = p;
        });
        const result: Record<string, { kills: number; kd: number | null; captures: number; elo: number | null; eloTier: string | null }> = {};
        squad.members.forEach(m => {
          const alias = (m.in_game_alias || '').trim().toLowerCase();
          const s = statsByName[alias];
          const e = eloByName[alias];
          result[m.player_id] = {
            kills: s?.total_kills ?? 0,
            kd: s?.kill_death_ratio != null ? Number(s.kill_death_ratio) : null,
            captures: s?.total_captures ?? 0,
            elo: e?.weighted_elo != null ? Number(e.weighted_elo) : null,
            eloTier: e?.elo_tier?.name ?? null,
          };
        });
        if (!cancelled) setMemberStats(result);
      } catch (e) {
        // Non-critical, stats just won't show
      }
    })();
    return () => { cancelled = true; };
  }, [squad?.members]);

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

    // Squad details/members are cached for 5 minutes; this page is where
    // rosters change (kick, promote, transfer, leave), so always read fresh.
    cacheUtils.clear(squadId);

    const { data: squadData, success } = await queries.getSquadDetails(squadId);
    if (!success || !squadData) return;

    const { data: membersData } = await queries.getSquadMembers(squadId);
    
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

    setSquad(formattedSquad);
    loadLeagueContext(formattedSquad);
  };

  const loadLeagueContext = async (s: Squad) => {
    try {
      // Tagged squads use their league; untagged ones default to the league that
      // is running now (one league at a time), so a squad created during a CTFDL
      // season reads as a CTFDL squad. Staff can override the tag in admin.
      const leagues = await getLeagues();
      const league = (s.league_slug ? leagues.find((l) => l.slug === s.league_slug) : pickFeatured(leagues)) || null;
      setLeagueInfo(league);
      if (!league) { setSeasonInfo(null); setStanding(null); setDraftPicks({}); setMemberClasses({}); return; }

      const season = await getLatestSeason(league);
      setSeasonInfo(season);
      const memberIds = s.members.map((m) => m.player_id);

      if (season) {
        const rows = await getStandings(league, season, 200);
        setStanding(rows.find((r) => r.squad_id === s.id) || null);

        // Classes each member registered with this season (draft/OvD leagues).
        if (memberIds.length > 0 && league.format && league.format !== 'squad') {
          const { data } = await supabase
            .from('free_agents')
            .select('player_id, preferred_roles')
            .in('player_id', memberIds)
            .eq('league_slug', league.slug)
            .eq('season_number', season.season_number);
          const map: Record<string, string[]> = {};
          (data || []).forEach((r: any) => { map[r.player_id] = r.preferred_roles || []; });
          setMemberClasses(map);
        }
      }

      // Where each member was taken in the CTFDL draft.
      if (league.slug === 'ctfdl') {
        const { data: teams } = await supabase.from('ctfdl_draft_teams').select('id').eq('squad_id', s.id);
        const teamIds = (teams || []).map((t: any) => t.id);
        if (teamIds.length > 0) {
          const { data: picks } = await supabase
            .from('ctfdl_draft_picks')
            .select('player_id, round, overall')
            .in('team_id', teamIds)
            .order('overall', { ascending: false });
          const map: Record<string, { round: number; overall: number }> = {};
          (picks || []).forEach((p: any) => { if (p.player_id && !map[p.player_id]) map[p.player_id] = { round: p.round, overall: p.overall }; });
          setDraftPicks(map);
        }
      }
    } catch (e) {
      console.error('Error loading league context for squad:', e);
    }
  };

  const loadUserSquad = async () => {
    if (!user) return;
    
    const { data: squadData } = await queries.getUserSquad(user.id);
    
    if (squadData) {
      const userSquadInfo = {
        id: (squadData.squads as any).id,
        name: (squadData.squads as any).name,
        tag: (squadData.squads as any).tag,
        is_legacy: (squadData.squads as any).is_legacy || false
      };
      
      setUserSquad(userSquadInfo);
    } else {
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
            // Enhanced invite tracking columns not yet available, using basic query
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
    if (!user || !squad) return false;
    const isAlreadyMember = squad.members.some(member => member.player_id === user.id);
    if (isAlreadyMember) return false;
    if (squad.is_legacy === true) return false;
    if (userSquad && userSquad.id !== squad.id && !(userSquad.is_legacy === true)) return false;
    if (squad.captain_id === user.id) return false;
    if (isInFreeAgentPool === false) return false;
    return true;
  };

  const isCurrentMember = () => {
    return user && squad && squad.members.some(member => member.player_id === user.id);
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
      <div className="ctf-theme min-h-screen bg-gradient-to-br from-gray-900 via-slate-800 to-gray-900">
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
      <div className="ctf-theme min-h-screen bg-gradient-to-br from-gray-900 via-slate-800 to-gray-900">
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
    <div className="ctf-theme min-h-screen">
      <Navbar user={user} />
      
      <main className="mx-auto max-w-6xl px-4 py-6">
        {/* ---- Header strip -------------------------------------------------- */}
        <div className="mb-4 rounded-xl bg-[#131A2B] p-4 md:p-5">
          <div className="flex flex-wrap items-center gap-4">
            {squad.banner_url ? (
              <img
                src={squad.banner_url}
                alt={`${squad.name} picture`}
                className="h-16 w-16 flex-none rounded-lg object-cover bg-[#0B0F1A]"
                onError={(e) => { e.currentTarget.style.display = 'none'; }}
              />
            ) : (
              <div className="flex h-16 w-16 flex-none items-center justify-center rounded-lg bg-[#1B2438] font-display text-lg text-[#22D3EE]">
                {squad.tag?.slice(0, 4) || squad.name.slice(0, 2)}
              </div>
            )}
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="font-display text-2xl leading-none text-[#E6EDF7] md:text-3xl">[{squad.tag}] {squad.name}</h1>
                {leagueInfo && (
                  <span className="rounded bg-[#22D3EE]/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[#22D3EE]">
                    {leagueInfo.name}{seasonInfo ? ` · Season ${seasonInfo.season_number}` : ''}
                  </span>
                )}
                {squad.is_legacy ? (
                  <span className="rounded bg-[#F59E0B]/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[#F59E0B]">Legacy</span>
                ) : !squad.is_active ? (
                  <span className="rounded bg-[#F87171]/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[#F87171]">Inactive</span>
                ) : (
                  <span className="rounded bg-[#34D399]/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[#34D399]">Active</span>
                )}
              </div>
              <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-sm text-[#8B98B0]">
                <span>Captain <span className="text-[#E6EDF7]">{squad.members.find((m) => m.role === 'captain')?.in_game_alias || '—'}</span></span>
                <span>{getMemberCounts(squad.members).regularCount} player{getMemberCounts(squad.members).regularCount === 1 ? '' : 's'}{getMemberCounts(squad.members).transitionalCount > 0 ? ` +${getMemberCounts(squad.members).transitionalCount} transitional` : ''}</span>
                {standing && <span><span className="text-[#E6EDF7]">{standing.wins}–{standing.losses}</span> this season</span>}
                <span>Created {new Date(squad.created_at).toLocaleDateString()}</span>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {canEditSquadPhotos() && (
                <button onClick={() => setShowBannerForm(true)} className="rounded-md bg-white/5 px-3 py-1.5 text-sm text-[#E6EDF7] hover:bg-white/10">
                  {squad.banner_url ? 'Update picture' : 'Add picture'}
                </button>
              )}
              {canLeaveSquad() && (
                <button onClick={initiateLeaveSquad} disabled={isRequesting} className="rounded-md bg-white/5 px-3 py-1.5 text-sm text-[#F87171] hover:bg-white/10 disabled:opacity-50">
                  {isRequesting ? 'Leaving…' : 'Leave squad'}
                </button>
              )}
              {isCaptain() && (
                <button onClick={disbandSquad} className="rounded-md px-3 py-1.5 text-sm text-[#8B98B0] hover:bg-[#F87171]/10 hover:text-[#F87171]">
                  Disband
                </button>
              )}
            </div>
          </div>
          {isCurrentMember() && !canLeaveSquad() && (
            <p className="mt-2 text-xs text-[#F59E0B]">You're the captain. Transfer ownership to another member before leaving.</p>
          )}
          {userSquad && userSquad.id !== squad.id && (
            <p className="mt-2 text-xs text-[#8B98B0]">You're a member of [{userSquad.tag}] {userSquad.name}.</p>
          )}
        </div>

        {/* ---- Join / apply (squad leagues only) ------------------------------ */}
        {!isDraftLeague && user && !isCurrentMember() && (canRequestToJoin() || hasExistingRequest || isInFreeAgentPool === false) && (
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-[#131A2B] px-4 py-3">
            <div className="text-sm text-[#8B98B0]">
              {squad.is_legacy
                ? 'Legacy squad: joining is by captain invitation only.'
                : hasExistingRequest
                ? 'Your join request is pending with the captain.'
                : isInFreeAgentPool === false
                ? 'Register as a free agent before applying to squads.'
                : isRosterLocked
                ? `Rosters are locked${rosterLockStatus?.lockedLabel ? ` (${rosterLockStatus.lockedLabel})` : ''}. Applications are disabled.`
                : `${getSquadMemberCountDisplay(squad, squad.members)}. Ask the captain to join.`}
            </div>
            <div className="flex gap-2">
              {isInFreeAgentPool === false && !hasExistingRequest && (
                <Link href="/league/register" className="rounded-md bg-[#22D3EE] px-3 py-1.5 text-sm font-semibold text-[#0B0F1A] hover:bg-[#67E8F9]">Register</Link>
              )}
              {(canRequestToJoin() || hasExistingRequest) && !hasExistingRequest && (
                <button
                  onClick={requestToJoin}
                  disabled={isRequesting || isRosterLocked || isInFreeAgentPool === null}
                  className="rounded-md bg-[#22D3EE] px-3 py-1.5 text-sm font-semibold text-[#0B0F1A] hover:bg-[#67E8F9] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {isInFreeAgentPool === null ? 'Checking…' : isRequesting ? 'Sending…' : 'Request to join'}
                </button>
              )}
              {hasExistingRequest && (
                <button onClick={withdrawRequest} disabled={isRequesting} className="rounded-md bg-white/5 px-3 py-1.5 text-sm text-[#F87171] hover:bg-white/10 disabled:opacity-50">
                  {isRequesting ? 'Withdrawing…' : 'Withdraw request'}
                </button>
              )}
            </div>
          </div>
        )}
        {isDraftLeague && user && !isCurrentMember() && (
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-[#131A2B] px-4 py-3 text-sm text-[#8B98B0]">
            <span>{leagueInfo?.name} rosters are set by the draft. Register for the season to be draftable.</span>
            <div className="flex gap-2">
              <Link href="/league/register" className="rounded-md bg-white/5 px-3 py-1.5 text-[#E6EDF7] hover:bg-white/10">Register</Link>
              {leagueInfo?.slug === 'ctfdl' && <Link href="/league/ctfdl/draft" className="rounded-md bg-white/5 px-3 py-1.5 text-[#E6EDF7] hover:bg-white/10">Draft lobby</Link>}
            </div>
          </div>
        )}

        <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,0.9fr)]">
          {/* ---- Roster ------------------------------------------------------ */}
          <div className="rounded-xl bg-[#131A2B] p-4">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <h2 className="font-display text-lg text-[#E6EDF7]">Roster</h2>
              {renderMemberCountBadges(squad.members, squad)}
              <span className="ml-auto text-xs text-[#8B98B0]">
                {isDraftLeague ? (
                  <>
                    Set by the {leagueInfo?.name} draft
                    {leagueInfo?.slug === 'ctfdl' && <> · <Link href="/league/ctfdl/draft/recap" className="text-[#22D3EE] hover:underline">Recap</Link></>}
                  </>
                ) : (
                  <>R regular · T transitional (exempt from limit)</>
                )}
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-[11px] uppercase tracking-wide text-[#8B98B0]">
                    <th className="py-1.5 pr-2 font-medium">Player</th>
                    <th className="py-1.5 pr-2 font-medium">Role</th>
                    {Object.keys(memberClasses).length > 0 && <th className="py-1.5 pr-2 font-medium">Classes</th>}
                    <th className="py-1.5 pr-2 text-right font-medium">Season</th>
                    {Object.keys(draftPicks).length > 0 && <th className="py-1.5 pr-2 text-right font-medium">Picked</th>}
                    <th className="py-1.5 pr-2 text-right font-medium">Joined</th>
                    {canManageSquad() && <th className="py-1.5 text-right font-medium">Manage</th>}
                  </tr>
                </thead>
                <tbody>
                  {[...squad.members]
                    .sort((a, b) => {
                      if (a.role === 'captain' && b.role !== 'captain') return -1;
                      if (a.role !== 'captain' && b.role === 'captain') return 1;
                      if (a.role === 'co_captain' && b.role === 'player') return -1;
                      if (a.role === 'player' && b.role === 'co_captain') return 1;
                      return a.in_game_alias.localeCompare(b.in_game_alias);
                    })
                    .map((member) => {
                      const st = memberStats[member.player_id];
                      const pick = draftPicks[member.player_id];
                      const classes = memberClasses[member.player_id] || [];
                      return (
                        <tr key={member.id} className="border-t border-white/[0.06] align-middle">
                          <td className="py-2 pr-2">
                            <div className="flex items-center gap-1.5">
                              <Link href={`/stats/player/${encodeURIComponent(member.in_game_alias)}`} className="font-medium text-[#E6EDF7] hover:text-[#22D3EE]">
                                {member.in_game_alias}
                              </Link>
                              {member.player_id === user?.id && <span className="rounded bg-[#22D3EE]/15 px-1 text-[9px] font-semibold uppercase text-[#22D3EE]">You</span>}
                              {member.transitional_player && (
                                <span className="rounded bg-[#F59E0B]/15 px-1 text-[9px] font-semibold uppercase text-[#F59E0B]" title="Transitional player — exempt from squad size limits">T</span>
                              )}
                            </div>
                          </td>
                          <td className="py-2 pr-2">
                            {member.role === 'captain' ? (
                              <span className="rounded bg-[#F59E0B]/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[#F59E0B]">Captain</span>
                            ) : member.role === 'co_captain' ? (
                              <span className="rounded bg-[#22D3EE]/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[#22D3EE]">Co-captain</span>
                            ) : (
                              <span className="text-xs text-[#8B98B0]">Player</span>
                            )}
                          </td>
                          {Object.keys(memberClasses).length > 0 && (
                            <td className="py-2 pr-2">
                              <div className="flex flex-wrap gap-1">
                                {classes.slice(0, 4).map((c) => (
                                  <span key={c} className={`rounded border px-1.5 py-0.5 text-[10px] font-medium leading-none ${CLASS_COLORS[c] || 'border-white/10 text-[#8B98B0]'}`}>{c}</span>
                                ))}
                                {classes.length === 0 && <span className="text-xs text-[#8B98B0]/60">—</span>}
                              </div>
                            </td>
                          )}
                          <td className="py-2 pr-2 text-right text-xs tabular-nums text-[#8B98B0] whitespace-nowrap">
                            {st ? (
                              <span title={`${st.kills.toLocaleString()} kills · ${st.kd != null ? st.kd.toFixed(2) : '—'} K/D · ${st.captures} caps${st.eloTier ? ` · ${st.eloTier}` : ''}`}>
                                {st.kills.toLocaleString()}K · {st.kd != null ? st.kd.toFixed(2) : '—'} · {st.captures} caps
                                {st.elo != null && <span className="ml-1.5 rounded bg-[#22D3EE]/10 px-1 text-[#22D3EE]">{Math.round(st.elo)}</span>}
                              </span>
                            ) : '—'}
                          </td>
                          {Object.keys(draftPicks).length > 0 && (
                            <td className="py-2 pr-2 text-right text-xs tabular-nums text-[#8B98B0] whitespace-nowrap">
                              {pick ? `R${pick.round} · #${pick.overall}` : member.role === 'captain' ? 'Captain' : '—'}
                            </td>
                          )}
                          <td className="py-2 pr-2 text-right text-xs text-[#8B98B0] whitespace-nowrap">{new Date(member.joined_at).toLocaleDateString()}</td>
                          {canManageSquad() && (
                            <td className="py-2 text-right whitespace-nowrap">
                              {member.player_id !== user?.id && (
                                <div className="flex justify-end gap-1">
                                  {isCaptain() && member.role === 'player' && (
                                    <button onClick={() => promoteMember(member.id, member.in_game_alias, 'co_captain')} className="rounded bg-white/5 px-1.5 py-0.5 text-[11px] text-[#E6EDF7] hover:bg-white/10" title="Promote to co-captain">Promote</button>
                                  )}
                                  {isCaptain() && member.role === 'co_captain' && (
                                    <button onClick={() => promoteMember(member.id, member.in_game_alias, 'player')} className="rounded bg-white/5 px-1.5 py-0.5 text-[11px] text-[#E6EDF7] hover:bg-white/10" title="Demote to player">Demote</button>
                                  )}
                                  {isCaptain() && member.role !== 'captain' && (
                                    <button onClick={() => transferOwnership(member.player_id, member.in_game_alias)} className="rounded bg-white/5 px-1.5 py-0.5 text-[11px] text-[#F59E0B] hover:bg-white/10" title="Transfer captaincy">Make captain</button>
                                  )}
                                  {member.role !== 'captain' && (isCaptain() || (canManageSquad() && member.role === 'player')) && (
                                    <button onClick={() => kickMember(member.id, member.in_game_alias)} className="rounded bg-white/5 px-1.5 py-0.5 text-[11px] text-[#F87171] hover:bg-white/10" title="Remove from squad">Kick</button>
                                  )}
                                </div>
                              )}
                            </td>
                          )}
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>
          </div>

          {/* ---- Side column ------------------------------------------------- */}
          <div className="space-y-4">
            <div className="rounded-xl bg-[#131A2B] p-4">
              <h2 className="mb-2 font-display text-lg text-[#E6EDF7]">About</h2>
              {squad.description ? <p className="text-sm text-[#E6EDF7]/85">{squad.description}</p> : <p className="text-sm text-[#8B98B0]">No description yet.</p>}
              {(squad.discord_link || squad.website_link) && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {squad.discord_link && <a href={squad.discord_link} target="_blank" rel="noopener noreferrer" className="rounded-md bg-white/5 px-3 py-1.5 text-sm text-[#E6EDF7] hover:bg-white/10">Discord</a>}
                  {squad.website_link && <a href={squad.website_link} target="_blank" rel="noopener noreferrer" className="rounded-md bg-white/5 px-3 py-1.5 text-sm text-[#E6EDF7] hover:bg-white/10">Website</a>}
                </div>
              )}
            </div>

            {leagueInfo && (
              <div className="rounded-xl bg-[#131A2B] p-4">
                <div className="mb-2 flex items-baseline justify-between">
                  <h2 className="font-display text-lg text-[#E6EDF7]">Standing</h2>
                  <Link href={`/league/standings?league=${leagueInfo.slug}`} className="text-xs text-[#22D3EE] hover:underline">{leagueInfo.name}{seasonInfo ? ` S${seasonInfo.season_number}` : ''}</Link>
                </div>
                {standing ? (
                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div className="rounded-lg bg-[#0B0F1A] px-2 py-2"><div className="font-display text-xl text-[#E6EDF7]">{standing.rank}{['st','nd','rd'][((standing.rank + 90) % 100 - 10) % 10 - 1] || 'th'}</div><div className="text-[10px] uppercase tracking-wide text-[#8B98B0]">Rank</div></div>
                    <div className="rounded-lg bg-[#0B0F1A] px-2 py-2"><div className="font-display text-xl text-[#E6EDF7]">{standing.wins}–{standing.losses}</div><div className="text-[10px] uppercase tracking-wide text-[#8B98B0]">Record</div></div>
                    <div className="rounded-lg bg-[#0B0F1A] px-2 py-2"><div className="font-display text-xl text-[#E6EDF7]">{standing.points}</div><div className="text-[10px] uppercase tracking-wide text-[#8B98B0]">Points</div></div>
                  </div>
                ) : (
                  <p className="text-sm text-[#8B98B0]">No results this season yet.</p>
                )}
              </div>
            )}

            {/* ---- Recruiting (squad leagues, captain/co-captain) ------------- */}
            {!isDraftLeague && isUserCaptainOrCoCaptain() && (
              <div className="rounded-xl bg-[#131A2B] p-4">
                <div className="mb-2 flex items-center justify-between">
                  <h2 className="font-display text-lg text-[#E6EDF7]">Recruiting</h2>
                  {!isRosterLocked ? (
                    <button type="button" onClick={openInviteModal} className="rounded-md bg-[#22D3EE] px-3 py-1.5 text-xs font-semibold text-[#0B0F1A] hover:bg-[#67E8F9]">Invite from pool</button>
                  ) : (
                    <span className="text-xs text-[#F59E0B]">Rosters locked</span>
                  )}
                </div>

                <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-[#8B98B0]">Join requests · {pendingRequests.length}</div>
                {pendingRequests.length === 0 ? (
                  <p className="mb-3 text-sm text-[#8B98B0]">None pending.</p>
                ) : (
                  <ul className="mb-3 space-y-1.5">
                    {pendingRequests.map((request) => (
                      <li key={request.id} className="flex items-center justify-between gap-2 rounded-md bg-[#0B0F1A] px-2.5 py-1.5 text-sm">
                        <span className="text-[#E6EDF7]">{request.requester_alias} <span className="text-xs text-[#8B98B0]">{new Date(request.created_at).toLocaleDateString()}</span></span>
                        <span className="flex gap-1">
                          <button onClick={() => handleRequestAction(request.id, 'approve')} disabled={processingRequest === request.id || isRosterLocked} className="rounded bg-[#34D399]/15 px-2 py-0.5 text-xs text-[#34D399] hover:bg-[#34D399]/25 disabled:opacity-50">Approve</button>
                          <button onClick={() => handleRequestAction(request.id, 'deny')} disabled={processingRequest === request.id} className="rounded bg-white/5 px-2 py-0.5 text-xs text-[#F87171] hover:bg-white/10 disabled:opacity-50">Deny</button>
                        </span>
                      </li>
                    ))}
                  </ul>
                )}

                <button type="button" onClick={() => setShowInviteHistory((v) => !v)} className="flex w-full items-center justify-between text-[11px] font-semibold uppercase tracking-wide text-[#8B98B0] hover:text-[#E6EDF7]">
                  <span>Sent invites · {sentInvites.length}</span>
                  <span>{showInviteHistory ? 'Hide' : 'Show'}</span>
                </button>
                {showInviteHistory && (
                  sentInvites.length === 0 ? (
                    <p className="mt-1 text-sm text-[#8B98B0]">No invites sent.</p>
                  ) : (
                    <ul className="mt-1 max-h-64 space-y-1 overflow-y-auto">
                      {sentInvites.map((invite) => (
                        <li key={invite.id} className="rounded-md bg-[#0B0F1A] px-2.5 py-1.5 text-xs">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-[#E6EDF7]">{invite.invited_player_alias}</span>
                            <span className={invite.status === 'accepted' ? 'text-[#34D399]' : invite.status === 'declined' ? 'text-[#F87171]' : 'text-[#F59E0B]'}>
                              {invite.status.charAt(0).toUpperCase() + invite.status.slice(1)}
                            </span>
                          </div>
                          <div className="text-[#8B98B0]">
                            {new Date(invite.created_at).toLocaleDateString()} · {formatInviteSource(invite.invite_source)}
                            {invite.responded_at ? ` · replied in ${getResponseTime(invite.created_at, invite.responded_at)}` : invite.status === 'pending' && invite.expires_at ? ` · expires ${new Date(invite.expires_at).toLocaleDateString()}` : ''}
                          </div>
                          {invite.message && <div className="mt-0.5 text-[#8B98B0]/80">“{invite.message}”</div>}
                        </li>
                      ))}
                    </ul>
                  )
                )}
              </div>
            )}
          </div>
        </div>

        <div className="mt-6 text-center">
          <Link href="/squads" className="text-sm text-[#8B98B0] hover:text-[#E6EDF7]">← All squads</Link>
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

      {/* Leave Squad Confirmation Modal */}
      {showLeaveConfirmation && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={() => setShowLeaveConfirmation(false)}>
          <div className="bg-gray-800 rounded-xl border border-red-500/30 w-full max-w-sm p-6" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-xl font-bold text-white mb-3">Leave Squad?</h3>
            <p className="text-gray-300 mb-6">
              Are you sure you want to leave <span className="text-cyan-400 font-semibold">[{squad.tag}] {squad.name}</span>? You will need to request to rejoin.
            </p>
            <div className="flex gap-3">
              <button
                onClick={leaveSquad}
                disabled={isRequesting}
                className="flex-1 bg-red-600 hover:bg-red-500 disabled:bg-gray-600 text-white py-2 rounded-lg font-medium transition-colors disabled:cursor-not-allowed"
              >
                {isRequesting ? 'Leaving...' : 'Yes, Leave'}
              </button>
              <button
                onClick={() => setShowLeaveConfirmation(false)}
                className="flex-1 bg-gray-600 hover:bg-gray-500 text-white py-2 rounded-lg font-medium transition-colors"
              >
                Cancel
              </button>
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
                <h4 className="text-blue-400 font-medium text-sm mb-2">Image guidelines:</h4>
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