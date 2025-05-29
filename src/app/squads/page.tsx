'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/lib/AuthContext';
import { supabase } from '@/lib/supabase';
import { User } from '@supabase/supabase-js';
import Navbar from '@/components/Navbar';
import Link from 'next/link';

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
}

interface SquadInvite {
  id: string;
  invited_player_id: string;
  invited_alias: string;
  invited_by_alias: string;
  created_at: string;
  expires_at: string;
  status: 'pending' | 'accepted' | 'declined' | 'expired';
}

export default function SquadsPage() {
  const { user, loading } = useAuth();
  const [userSquad, setUserSquad] = useState<Squad | null>(null);
  const [allSquads, setAllSquads] = useState<Squad[]>([]);
  const [freeAgents, setFreeAgents] = useState<FreeAgent[]>([]);
  const [pendingInvites, setPendingInvites] = useState<SquadInvite[]>([]);
  const [dataLoading, setDataLoading] = useState(true);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [showInviteForm, setShowInviteForm] = useState(false);
  const [selectedInvitee, setSelectedInvitee] = useState('');
  const [pendingInvitesError, setPendingInvitesError] = useState(false);

  // Form states
  const [squadName, setSquadName] = useState('');
  const [squadTag, setSquadTag] = useState('');
  const [squadDescription, setSquadDescription] = useState('');
  const [discordLink, setDiscordLink] = useState('');
  const [websiteLink, setWebsiteLink] = useState('');

  useEffect(() => {
    if (user) {
      loadInitialData();
    }
  }, [user]);

  const loadInitialData = async () => {
    setDataLoading(true);
    
    try {
      // First fetch user squad to know if we need to fetch pending invites
      await fetchUserSquad();
      
      // Then fetch other data in parallel with error handling
      const promises = [
        fetchAllSquads().catch(error => {
          console.error('Error fetching all squads:', error);
          setAllSquads([]);
        }),
        fetchFreeAgents().catch(error => {
          console.error('Error fetching free agents:', error);
          setFreeAgents([]);
        })
      ];
      
      await Promise.allSettled(promises);
    } catch (error) {
      console.error('Error loading initial data:', error);
      // Ensure we still set loading to false even if there's an error
    } finally {
      setDataLoading(false);
    }
  };

  const fetchFreeAgents = async () => {
    try {
      const { data, error } = await supabase.rpc('get_free_agents');
      if (error) throw error;
      setFreeAgents(data || []);
    } catch (error) {
      console.error('Error fetching free agents:', error);
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
        const invitedByIds = data.map(invite => invite.invited_by_id);
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
          invited_by_alias: profilesMap.get(invite.invited_by_id) || 'Unknown',
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

  const fetchUserSquad = async () => {
    try {
      // Get user's squad membership
      const { data: squadData, error } = await supabase
        .from('squad_members')
        .select(`
          id,
          role,
          joined_at,
          squads!inner(
            id,
            name,
            tag,
            description,
            captain_id,
            created_at,
            max_members,
            logo_url,
            discord_link,
            website_link
          )
        `)
        .eq('player_id', user?.id)
        .eq('status', 'active')
        .maybeSingle();

      if (error) {
        console.error('Error fetching user squad:', error);
        setUserSquad(null);
        setPendingInvites([]);
        return;
      }

      if (!squadData) {
        setUserSquad(null);
        setPendingInvites([]);
        return;
      }

      // Get all squad members
      const { data: members, error: membersError } = await supabase
        .from('squad_members')
        .select(`
          id,
          player_id,
          role,
          joined_at,
          profiles!squad_members_player_id_fkey(in_game_alias)
        `)
        .eq('squad_id', (squadData.squads as any).id)
        .eq('status', 'active')
        .order('joined_at', { ascending: true });

      if (membersError) {
        console.error('Error fetching squad members:', membersError);
        setUserSquad(null);
        setPendingInvites([]);
        return;
      }

      // Get captain alias
      const { data: captainData } = await supabase
        .from('profiles')
        .select('in_game_alias')
        .eq('id', (squadData.squads as any).captain_id)
        .single();

      const formattedSquad: Squad = {
        ...(squadData.squads as any),
        captain_alias: captainData?.in_game_alias || 'Unknown',
        members: members?.map((member: any) => ({
          id: member.id,
          player_id: member.player_id,
          in_game_alias: member.profiles?.in_game_alias || 'Unknown',
          role: member.role,
          joined_at: member.joined_at
        })) || [],
        member_count: members?.length || 0
      };

      setUserSquad(formattedSquad);
      
      // Now fetch pending invites for this squad (only if we have a valid squad ID)
      if (formattedSquad.id) {
        await fetchPendingInvitesForSquad(formattedSquad.id);
      } else {
        console.warn('Squad created without valid ID, skipping pending invites fetch');
        setPendingInvites([]);
      }
    } catch (error) {
      console.error('Error fetching user squad:', error);
      // Ensure state is clean on any error
      setUserSquad(null);
      setPendingInvites([]);
    }
  };

  const fetchAllSquads = async () => {
    try {
      const response = await fetch('/api/squads');
      if (response.ok) {
        const data = await response.json();
        setAllSquads(data.squads);
      }
    } catch (error) {
      console.error('Error fetching all squads:', error);
    }
  };

  const fetchPendingInvites = async () => {
    // Don't fetch if user doesn't have a squad
    if (!userSquad?.id) {
      setPendingInvites([]);
      return;
    }

    await fetchPendingInvitesForSquad(userSquad.id);
  };

  const createSquad = async (e: React.FormEvent) => {
    e.preventDefault();
    
    try {
      const response = await fetch('/api/squads', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: squadName,
          tag: squadTag,
          description: squadDescription,
          captainId: user?.id,
          discordLink: discordLink || null,
          websiteLink: websiteLink || null,
        }),
      });

      if (response.ok) {
        setShowCreateForm(false);
        setSquadName('');
        setSquadTag('');
        setSquadDescription('');
        setDiscordLink('');
        setWebsiteLink('');
        fetchUserSquad();
        fetchAllSquads();
        fetchFreeAgents();
      } else {
        const error = await response.json();
        alert(`Error creating squad: ${error.error}`);
      }
    } catch (error) {
      console.error('Error creating squad:', error);
      alert('Error creating squad');
    }
  };

  const invitePlayer = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!selectedInvitee || !userSquad) return;

    try {
      const { error } = await supabase
        .from('squad_invites')
        .insert({
          squad_id: userSquad.id,
          invited_player_id: selectedInvitee,
          invited_by_id: user?.id,
          expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString() // 7 days
        });

      if (error) throw error;

      setShowInviteForm(false);
      setSelectedInvitee('');
      fetchPendingInvites();
      fetchFreeAgents();
    } catch (error) {
      console.error('Error sending invitation:', error);
      alert('Error sending invitation');
    }
  };

  const kickMember = async (memberId: string) => {
    if (!confirm('Are you sure you want to kick this member?')) return;

    try {
      const { error } = await supabase
        .from('squad_members')
        .delete()
        .eq('id', memberId);

      if (error) throw error;

      fetchUserSquad();
      fetchFreeAgents();
    } catch (error) {
      console.error('Error kicking member:', error);
      alert('Error kicking member');
    }
  };

  const promoteMember = async (memberId: string, newRole: 'co_captain' | 'player') => {
    try {
      const { error } = await supabase
        .from('squad_members')
        .update({ role: newRole })
        .eq('id', memberId);

      if (error) throw error;

      fetchUserSquad();
    } catch (error) {
      console.error('Error updating member role:', error);
      alert('Error updating member role');
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
      fetchAllSquads();
      fetchFreeAgents();
    } catch (error) {
      console.error('Error leaving squad:', error);
      alert('Error leaving squad');
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
      fetchAllSquads();
      fetchFreeAgents();
    } catch (error) {
      console.error('Error disbanding squad:', error);
      alert('Error disbanding squad');
    }
  };

  const transferOwnership = async (newCaptainId: string) => {
    if (!confirm('Are you sure you want to transfer squad ownership? You will become a regular player.')) return;

    try {
      // Update the squad's captain
      const { error: squadError } = await supabase
        .from('squads')
        .update({ captain_id: newCaptainId })
        .eq('id', userSquad?.id);

      if (squadError) throw squadError;

      // Update the current captain's role to player
      const { error: oldCaptainError } = await supabase
        .from('squad_members')
        .update({ role: 'player' })
        .eq('squad_id', userSquad?.id)
        .eq('player_id', user?.id);

      if (oldCaptainError) throw oldCaptainError;

      // Update the new captain's role
      const { error: newCaptainError } = await supabase
        .from('squad_members')
        .update({ role: 'captain' })
        .eq('squad_id', userSquad?.id)
        .eq('player_id', newCaptainId);

      if (newCaptainError) throw newCaptainError;

      fetchUserSquad();
    } catch (error) {
      console.error('Error transferring ownership:', error);
      alert('Error transferring ownership');
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

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center">
        <div className="text-xl">Loading...</div>
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
    <div className="min-h-screen bg-gray-900 text-white">
      <Navbar user={user} />
      <div className="max-w-7xl mx-auto p-6">
        <h1 className="text-3xl font-bold mb-8">Squad Management</h1>

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
              <div className="flex gap-2">
                {canManageSquad && (
                  <button
                    onClick={() => setShowInviteForm(true)}
                    className="bg-green-600 hover:bg-green-700 px-4 py-2 rounded text-sm"
                  >
                    Invite Player
                  </button>
                )}
                {isCaptain ? (
                  <div className="flex gap-2">
                    <button
                      onClick={disbandSquad}
                      className="bg-red-600 hover:bg-red-700 px-4 py-2 rounded text-sm"
                    >
                      Disband Squad
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={leaveSquad}
                    className="bg-red-600 hover:bg-red-700 px-4 py-2 rounded text-sm"
                  >
                    Leave Squad
                  </button>
                )}
              </div>
            </div>

            {/* Squad Members */}
            <div className="mb-6">
              <h3 className="text-xl font-semibold mb-4">Members</h3>
              <div className="grid gap-3">
                {userSquad.members.map((member) => (
                  <div key={member.id} className="bg-gray-700 rounded p-4 flex justify-between items-center">
                    <div className="flex items-center gap-3">
                      <span className="text-lg">{getRoleIcon(member.role)}</span>
                      <div>
                        <span className={`font-semibold ${getRoleColor(member.role)}`}>
                          {member.in_game_alias}
                        </span>
                        <div className="text-sm text-gray-400">
                          {member.role.replace('_', ' ').toUpperCase()} • Joined {new Date(member.joined_at).toLocaleDateString()}
                        </div>
                      </div>
                    </div>
                    {isCaptain && member.player_id !== user?.id && (
                      <div className="flex gap-2">
                        {member.role === 'player' && (
                          <button
                            onClick={() => promoteMember(member.id, 'co_captain')}
                            className="bg-blue-600 hover:bg-blue-700 px-3 py-1 rounded text-sm"
                          >
                            Promote
                          </button>
                        )}
                        {member.role === 'co_captain' && (
                          <button
                            onClick={() => promoteMember(member.id, 'player')}
                            className="bg-yellow-600 hover:bg-yellow-700 px-3 py-1 rounded text-sm"
                          >
                            Demote
                          </button>
                        )}
                        <button
                          onClick={() => transferOwnership(member.player_id)}
                          className="bg-purple-600 hover:bg-purple-700 px-3 py-1 rounded text-sm"
                        >
                          Make Captain
                        </button>
                        <button
                          onClick={() => kickMember(member.id)}
                          className="bg-red-600 hover:bg-red-700 px-3 py-1 rounded text-sm"
                        >
                          Kick
                        </button>
                      </div>
                    )}
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
          </div>
        ) : (
          <div className="bg-gray-800 rounded-lg p-6 mb-8 text-center">
            <h2 className="text-xl font-semibold mb-4">You're not in a squad</h2>
            <p className="text-gray-300 mb-4">Create your own squad or wait for an invitation</p>
            <button
              onClick={() => setShowCreateForm(true)}
              className="bg-blue-600 hover:bg-blue-700 px-6 py-2 rounded"
            >
              Create Squad
            </button>
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
                  <div className="bg-gray-700 rounded p-4 hover:bg-gray-600 transition-colors cursor-pointer">
                    <div className="flex justify-between items-start">
                      <div>
                        <h3 className="text-lg font-semibold mb-2 text-cyan-400 hover:text-cyan-300">
                          [{squad.tag}] {squad.name}
                        </h3>
                        <p className="text-gray-300 mb-2">{squad.description}</p>
                        <div className="flex gap-4 text-sm text-gray-400">
                          <span>Members: {squad.member_count}</span>
                          <span>Captain: {squad.captain_alias}</span>
                        </div>
                      </div>
                      <div className="text-sm text-gray-400">
                        Created {new Date(squad.created_at).toLocaleDateString()}
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
              <form onSubmit={createSquad}>
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
      </div>
    </div>
  );
} 