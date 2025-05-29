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

    setSquad(formattedSquad);
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
          .eq('invited_by', 'invited_player_id') // Self-requests only
          .gt('expires_at', new Date().toISOString())
          .order('created_at', { ascending: false });

        if (result.error) throw new Error(result.error.message);
        return result.data;
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

      setPendingRequests(formattedRequests);
    }
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
    if (!squad || !user) return false;
    const userMember = squad.members.find(m => m.player_id === user.id);
    return userMember && (userMember.role === 'captain' || userMember.role === 'co_captain');
  };

  const canRequestToJoin = () => {
    return user && !userSquad && !hasExistingRequest && squad && squad.captain_id !== user.id;
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
        <div className="bg-gradient-to-r from-slate-800/50 to-slate-700/50 rounded-xl p-8 mb-8 border border-cyan-500/20">
          <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-6">
            <div>
              <div className="flex items-center gap-4 mb-4">
                <h1 className="text-4xl font-bold text-cyan-400">
                  [{squad.tag}] {squad.name}
                </h1>
              </div>
              
              {squad.description && (
                <p className="text-gray-300 text-lg mb-4">{squad.description}</p>
              )}
              
              <div className="flex flex-wrap gap-4 text-sm text-gray-400">
                <span>👥 {squad.members.length} members</span>
                <span>📅 Created {new Date(squad.created_at).toLocaleDateString()}</span>
              </div>
              
              {/* Links */}
              {(squad.discord_link || squad.website_link) && (
                <div className="flex gap-4 mt-4">
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
            <div className="flex flex-col gap-3">
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
    </div>
  );
} 