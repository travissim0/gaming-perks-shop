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

interface SquadMember {
  id: string;
  player_id: string;
  in_game_alias: string;
  role: 'captain' | 'co_captain' | 'player';
  joined_at: string;
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
  banner_url?: string;
  is_active: boolean;
  is_legacy?: boolean; // Add legacy flag (optional for backward compatibility)
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

export default function SquadDetailPage() {
  const { user, loading } = useAuth();
  const params = useParams();
  const router = useRouter();
  const squadId = params.id as string;
  const [squad, setSquad] = useState<Squad | null>(null);
  const [userSquad, setUserSquad] = useState<UserSquad | null>(null);
  const [pendingRequests, setPendingRequests] = useState<PendingRequest[]>([]);
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
    }
  }, [squadId, loading]);

  // Load user profile for permission checks
  useEffect(() => {
    if (user && !loading) {
      loadUserProfile();
    }
  }, [user, loading]);

  // Load pending requests when squad data becomes available and user is captain/co-captain
  useEffect(() => {
    if (squad && user && !pageLoading) {
      const userMember = squad.members?.find(m => m.player_id === user.id);
      if (userMember && ['captain', 'co_captain'].includes(userMember.role)) {
        loadPendingRequests();
      }
    }
  }, [squad, user, pageLoading]);

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
      members: membersData?.map((member: any) => ({
        id: member.id,
        player_id: member.player_id,
        in_game_alias: member.profiles?.in_game_alias || 'Unknown',
        role: member.role,
        joined_at: member.joined_at
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
      // Filter to only show self-requests (where invited_by = invited_player_id)
      const selfRequests = data.filter((request: any) => 
        request.invited_by === request.invited_player_id
      );
      
      const formattedRequests: PendingRequest[] = selfRequests.map((request: any) => ({
        id: request.id,
        invited_player_id: request.invited_player_id,
        invited_by: request.invited_by,
        created_at: request.created_at,
        expires_at: request.expires_at,
        requester_alias: request.profiles?.in_game_alias || 'Unknown'
      }));

      setPendingRequests(formattedRequests);
    }
  };

  const requestToJoin = async () => {
    if (!user || !squad) return;

    setIsRequesting(true);
    
    try {
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
        loadUserSquad(),
        checkExistingRequest()
      ]);
    }

    setProcessingRequest(null);
  };

  const isUserCaptainOrCoCaptain = () => {
    if (!user || !squad?.members) return false;
    const userMember = squad.members.find(m => m.player_id === user.id);
    return userMember && ['captain', 'co_captain'].includes(userMember.role);
  };

  const isCaptain = () => {
    if (!user || !squad?.members) return false;
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
    
    // Allow requests to active squads only (not legacy)
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
        loadPendingRequests()
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

  // Helper functions for squad management
  const canManageSquad = () => {
    if (!squad || !user) return false;
    const userMember = squad.members.find(m => m.player_id === user.id);
    return userMember && ['captain', 'co_captain'].includes(userMember.role);
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
                    
                    <div className="flex flex-wrap gap-4 text-sm text-gray-400 mb-4">
                      <span>👥 {squad.members.length} members</span>
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
                    
                    {/* Join Request Button - Show different states based on request status */}
                    {(canRequestToJoin() || hasExistingRequest) && !isCurrentMember() && (
                      <div className="flex flex-col gap-2">
                        <button
                          onClick={hasExistingRequest ? undefined : requestToJoin}
                          disabled={isRequesting || hasExistingRequest}
                          className={`px-6 py-3 rounded-lg font-medium transition-all duration-300 disabled:cursor-not-allowed ${
                            hasExistingRequest 
                              ? 'bg-gradient-to-r from-yellow-600 to-amber-600 text-white cursor-default'
                              : 'bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-500 hover:to-emerald-500 disabled:from-gray-600 disabled:to-gray-700 text-white'
                          }`}
                        >
                          {hasExistingRequest ? (
                            <span className="flex items-center gap-2">
                              ⏳ Request Pending
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

        <div className="grid lg:grid-cols-3 gap-8">
          {/* Squad Members */}
          <div className="lg:col-span-2">
            <div className="bg-gradient-to-b from-slate-800/50 to-slate-700/50 rounded-xl p-6 border border-cyan-500/20">
              <h2 className="text-2xl font-bold text-cyan-400 mb-6 flex items-center gap-2">
                👥 Squad Members ({squad.members.length})
              </h2>
              
              {/* Mobile-optimized compact member list */}
              <div className="space-y-2 md:space-y-3">
                {squad.members.map((member) => (
                  <div
                    key={member.id}
                    className="bg-gradient-to-r from-slate-700/50 to-slate-600/50 rounded-lg p-3 md:p-4 border border-slate-600/30"
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 sm:gap-3">
                      <div className="flex items-center gap-2 md:gap-3 flex-1 min-w-0">
                        <span className="text-lg md:text-2xl flex-shrink-0">{getRoleIcon(member.role)}</span>
                        <div className="min-w-0 flex-1">
                          <p className="font-semibold text-white text-sm md:text-base truncate">{member.in_game_alias}</p>
                          <p className={`text-xs md:text-sm ${getRoleColor(member.role)}`}>
                            {getRoleDisplayName(member.role)}
                          </p>
                        </div>
                      </div>
                      
                      <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3">
                        <div className="text-xs text-gray-400 sm:text-right">
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

          {/* Pending Requests Section (Captain/Co-Captain Only) */}
          {isUserCaptainOrCoCaptain() && (
            <div>
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
                        
                        <div className="flex gap-2">
                          <button
                            onClick={() => handleRequestAction(request.id, 'approve')}
                            disabled={processingRequest === request.id}
                            className="flex-1 bg-green-600 hover:bg-green-500 disabled:bg-gray-600 text-white px-3 py-2 rounded text-sm transition-colors disabled:cursor-not-allowed"
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
          )}
        </div>

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