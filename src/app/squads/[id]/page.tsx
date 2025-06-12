'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/lib/AuthContext';
import { supabase } from '@/lib/supabase';
import Navbar from '@/components/Navbar';
import Link from 'next/link';
import { useParams } from 'next/navigation';
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
  members: SquadMember[];
}

interface UserSquad {
  id: string;
  name: string;
  tag: string;
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
  const squadId = params.id as string;
  const [squad, setSquad] = useState<Squad | null>(null);
  const [userSquad, setUserSquad] = useState<UserSquad | null>(null);
  const [pendingRequests, setPendingRequests] = useState<PendingRequest[]>([]);
  const [pageLoading, setPageLoading] = useState(true);
  const [isRequesting, setIsRequesting] = useState(false);
  const [hasExistingRequest, setHasExistingRequest] = useState(false);
  const [processingRequest, setProcessingRequest] = useState<string | null>(null);
  
  // Banner management states
  const [showBannerForm, setShowBannerForm] = useState(false);
  const [bannerUrl, setBannerUrl] = useState('');
  const [bannerFile, setBannerFile] = useState<File | null>(null);

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
    if (squadId && user && !loading) {
      loadAllData();
    }
  }, [squadId, user, loading]);

  // Listen for squad membership changes from navbar approvals
  useEffect(() => {
    const handleSquadMembershipChange = (event: any) => {
      console.log('Squad membership changed, refreshing data:', event.detail);
      // Refresh all squad data when membership changes
      loadSquadDetails();
    };

    window.addEventListener('squadMembershipChanged', handleSquadMembershipChange);
    return () => {
      window.removeEventListener('squadMembershipChanged', handleSquadMembershipChange);
    };
  }, []);

  const loadAllData = async () => {
    try {
      setPageLoading(true);
      
      // Load all data concurrently with robust error handling
      const results = await Promise.allSettled([
        loadSquadDetails(),
        loadUserSquad(),
        checkExistingRequest()
      ]);

      // Check if any critical operations failed
      const failures = results.filter(result => result.status === 'rejected');
      if (failures.length > 0) {
        console.warn('Some operations failed:', failures);
      }

      // Load pending requests if user is captain/co-captain (after squad loads)
      if (squad && isUserCaptainOrCoCaptain()) {
        await loadPendingRequests();
      }

    } catch (error) {
      console.error('Error in loadAllData:', error);
      toast.error('Failed to load page data');
    } finally {
      setPageLoading(false);
    }
  };

  const loadSquadDetails = async () => {
    if (!squadId) return;

    const { data: squadData, success } = await queries.getSquadDetails(squadId);
    if (!success || !squadData) return;

    const { data: membersData } = await queries.getSquadMembers(squadId);
    
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

    // Debug logging for banner URL
    console.log('Squad data:', squadData);
    console.log('Banner URL:', squadData.banner_url);

    setSquad(formattedSquad);
    
    // Load pending requests after squad data is available
    if (user) {
      console.log('loadSquadDetails: Squad loaded, now loading pending requests');
      loadPendingRequestsForSquad(formattedSquad);
    }
  };

  const loadUserSquad = async () => {
    if (!user) return;
    
    const { data: squadData } = await queries.getUserSquad(user.id);
    
    if (squadData) {
      setUserSquad({
        id: (squadData.squads as any).id,
        name: (squadData.squads as any).name,
        tag: (squadData.squads as any).tag
      });
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
          .eq('squad_id', squadId)
          .eq('status', 'pending')
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

  const loadPendingRequestsForSquad = async (squadData: Squad) => {
    if (!user) {
      console.log('loadPendingRequestsForSquad: Missing user');
      return;
    }

    console.log('loadPendingRequestsForSquad: Starting for squad', squadData.id);

    const { data, success } = await robustFetch(
      async () => {
        // First get all pending invites for this squad
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
          .eq('squad_id', squadData.id)
          .eq('status', 'pending')
          .gt('expires_at', new Date().toISOString())
          .order('created_at', { ascending: false });

        console.log('loadPendingRequestsForSquad: Raw query result', { 
          data: result.data?.length || 0, 
          error: result.error 
        });

        if (result.error) throw new Error(result.error.message);
        
        // Filter for self-requests (join requests) where invited_by = invited_player_id
        const joinRequests = result.data?.filter(invite => 
          invite.invited_by === invite.invited_player_id
        ) || [];
        
        console.log('loadPendingRequestsForSquad: Filtered join requests', { 
          total: result.data?.length || 0,
          joinRequests: joinRequests.length,
          requests: joinRequests
        });
        
        return joinRequests;
      },
      { showErrorToast: false } // Don't show toast for this optional data
    );

    if (success && data) {
      const formattedRequests: PendingRequest[] = data.map((request: any) => ({
        id: request.id,
        invited_player_id: request.invited_player_id,
        invited_by: request.invited_by,
        created_at: request.created_at,
        expires_at: request.expires_at,
        requester_alias: request.profiles?.in_game_alias || 'Unknown'
      }));

      console.log('loadPendingRequestsForSquad: Setting formatted requests', formattedRequests);
      setPendingRequests(formattedRequests);
    } else {
      console.log('loadPendingRequestsForSquad: Failed or no data', { success, hasData: !!data });
      setPendingRequests([]);
    }
  };

  const loadPendingRequests = async () => {
    if (!squad) {
      console.log('loadPendingRequests: No squad data available');
      return;
    }
    return loadPendingRequestsForSquad(squad);
  };

  const requestToJoin = async () => {
    if (!user || !squad) return;

    setIsRequesting(true);
    
    const { success } = await robustFetch(
      async () => {
        const result = await supabase
          .from('squad_invites')
          .insert({
            squad_id: squad.id,
            invited_player_id: user.id,
            invited_by: user.id,
            expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
          });

        if (result.error) throw new Error(result.error.message);
        return result.data;
      },
      { errorMessage: 'Failed to send join request' }
    );

    if (success) {
      toast.success('Join request sent successfully!');
      setHasExistingRequest(true);
    }
    
    setIsRequesting(false);
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
      
      // Refresh data
      await Promise.allSettled([
        loadSquadDetails(),
        loadPendingRequests()
      ]);
    }

    setProcessingRequest(null);
  };

  const isUserCaptainOrCoCaptain = () => {
    if (!squad || !user) {
      console.log('isUserCaptainOrCoCaptain: Missing data', { squad: !!squad, user: !!user });
      return false;
    }
    const userMember = squad.members.find(m => m.player_id === user.id);
    const hasPermission = userMember && (userMember.role === 'captain' || userMember.role === 'co_captain');
    console.log('isUserCaptainOrCoCaptain: Permission check', { 
      userId: user.id, 
      userMember: userMember?.role, 
      hasPermission 
    });
    return hasPermission;
  };

  const canRequestToJoin = () => {
    return user && !userSquad && !hasExistingRequest && squad && squad.captain_id !== user.id;
  };

  // Banner management functions
  const updateSquadBanner = async () => {
    if (!squad || !user || !isUserCaptainOrCoCaptain()) return;

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
                    {canRequestToJoin() && (
                      <button
                        onClick={requestToJoin}
                        disabled={isRequesting}
                        className="bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-500 hover:to-emerald-500 disabled:from-gray-600 disabled:to-gray-700 text-white px-6 py-3 rounded-lg font-medium transition-all duration-300 disabled:cursor-not-allowed"
                      >
                        {isRequesting ? (
                          <span className="flex items-center gap-2">
                            <div className="animate-spin rounded-full h-4 w-4 border-t-2 border-b-2 border-white"></div>
                            Sending...
                          </span>
                        ) : (
                          '📤 Request to Join'
                        )}
                      </button>
                    )}
                    
                    {/* Banner Management Button for Captains/Co-Captains */}
                    {isUserCaptainOrCoCaptain() && (
                      <button
                        onClick={() => setShowBannerForm(true)}
                        className="bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-500 hover:to-blue-600 text-white px-6 py-3 rounded-lg font-medium transition-all duration-300"
                      >
                        🖼️ {squad.banner_url ? 'Update Picture' : 'Add Picture'}
                      </button>
                    )}
                    
                    {hasExistingRequest && (
                      <div className="bg-yellow-600/20 text-yellow-400 px-4 py-2 rounded-lg text-center border border-yellow-600/30">
                        ⏳ Request Pending
                      </div>
                    )}
                    
                    {userSquad && userSquad.id !== squad.id && (
                      <div className="bg-blue-600/20 text-blue-400 px-4 py-2 rounded-lg text-center border border-blue-600/30">
                        👥 Member of [{userSquad.tag}]
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
              
              <div className="space-y-3">
                {squad.members.map((member) => (
                  <div
                    key={member.id}
                    className="bg-gradient-to-r from-slate-700/50 to-slate-600/50 rounded-lg p-4 border border-slate-600/30"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <span className="text-2xl">{getRoleIcon(member.role)}</span>
                        <div>
                          <p className="font-semibold text-white">{member.in_game_alias}</p>
                          <p className={`text-sm ${getRoleColor(member.role)}`}>
                            {getRoleDisplayName(member.role)}
                          </p>
                        </div>
                      </div>
                      <div className="text-right text-sm text-gray-400">
                        Joined {new Date(member.joined_at).toLocaleDateString()}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Pending Requests Section (Captain/Co-Captain Only) */}
          {(() => {
            const canManage = isUserCaptainOrCoCaptain();
            console.log('Rendering join requests section', { canManage, pendingRequestsCount: pendingRequests.length });
            return canManage;
          })() && (
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