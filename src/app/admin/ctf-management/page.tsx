'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/lib/AuthContext';
import { supabase } from '@/lib/supabase';
import Navbar from '@/components/Navbar';
import { toast } from 'react-hot-toast';
import { useRouter } from 'next/navigation';

interface Squad {
  id: string;
  name: string;
  tag: string;
  description?: string;
  captain_alias: string;
  captain_id: string;
  member_count: number;
  is_active: boolean;
  tournament_eligible: boolean;
  created_at: string;
  last_match_date?: string;
  banner_url?: string;
}

interface FreeAgent {
  id: string;
  player_id: string;
  player_alias: string;
  preferred_roles: string[];
  availability: string;
  skill_level: string;
  notes?: string;
  is_active: boolean;
  created_at: string;
  contact_info?: string;
}

interface UserProfile {
  id: string;
  in_game_alias: string;
  email: string;
  ctf_role: string;
  is_admin: boolean;
  is_league_banned?: boolean;
  league_ban_reason?: string;
  league_ban_date?: string;
}

interface BannedPlayer {
  id: string;
  in_game_alias: string;
  email: string;
  is_league_banned: boolean;
  league_ban_reason?: string;
  league_ban_date?: string;
}

export default function CTFManagementPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [hasAccess, setHasAccess] = useState(false);
  const [accessChecked, setAccessChecked] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [activeTab, setActiveTab] = useState<'squads' | 'free-agents' | 'tournaments' | 'bans'>('squads');
  
  // Squad management state
  const [squads, setSquads] = useState<Squad[]>([]);
  const [squadsLoading, setSquadsLoading] = useState(true);
  const [squadFilter, setSquadFilter] = useState<'all' | 'active' | 'inactive' | 'tournament-eligible' | 'tournament-ineligible'>('all');
  
  // Free agent state
  const [freeAgents, setFreeAgents] = useState<FreeAgent[]>([]);
  const [freeAgentsLoading, setFreeAgentsLoading] = useState(true);
  const [showAddFreeAgent, setShowAddFreeAgent] = useState(false);
  const [editingFreeAgent, setEditingFreeAgent] = useState<FreeAgent | null>(null);
  const [showClearFreeAgentsConfirm, setShowClearFreeAgentsConfirm] = useState(false);
  const [clearingPool, setClearingPool] = useState(false);
  
  // League ban state
  const [bannedPlayers, setBannedPlayers] = useState<BannedPlayer[]>([]);
  const [bannedPlayersLoading, setBannedPlayersLoading] = useState(true);
  const [showBanPlayer, setShowBanPlayer] = useState(false);

  // Check access permissions with better error handling
  useEffect(() => {
    let isMounted = true;
    
    const checkAccess = async () => {
      console.log('🔍 CTF Management access check - loading:', loading, 'user:', !!user);
      
      if (loading) {
        console.log('⏳ Still loading auth, waiting...');
        return;
      }
      
      if (!user) {
        console.log('❌ No user found, redirecting to login');
        // Small delay to prevent race conditions
        setTimeout(() => {
          if (isMounted) {
            router.push('/auth/login');
          }
        }, 100);
        return;
      }

      try {
        console.log('👤 Checking access for user:', user.email);
        
        const { data, error } = await supabase
          .from('profiles')
          .select('id, in_game_alias, email, ctf_role, is_admin')
          .eq('id', user.id)
          .single();

        if (error) {
          console.error('❌ Profile fetch error:', error);
          throw error;
        }

        if (!isMounted) return;

        setProfile(data);
        console.log('📋 Profile loaded:', data.in_game_alias, 'Role:', data.ctf_role, 'Admin:', data.is_admin);

        // Allow access for CTF admins and site admins
        const access = data.is_admin || data.ctf_role === 'ctf_admin';
        
        if (!access) {
          console.log('🚫 Access denied for user:', data.in_game_alias);
          setAccessChecked(true);
          setTimeout(() => {
            if (isMounted) {
              router.push('/dashboard');
              toast.error('Access denied: CTF Admin privileges required');
            }
          }, 100);
          return;
        }

        console.log('✅ Access granted for user:', data.in_game_alias);
        setHasAccess(true);
        setAccessChecked(true);
      } catch (error) {
        console.error('❌ Error checking access:', error);
        if (isMounted) {
          setAccessChecked(true);
          setTimeout(() => {
            if (isMounted) {
              router.push('/dashboard');
              toast.error('Error checking permissions');
            }
          }, 100);
        }
      }
    };

    checkAccess();
    
    return () => {
      isMounted = false;
    };
  }, [user, loading, router]);

  // Handle mounting and URL tab parameter
  useEffect(() => {
    setMounted(true);
    // Only run on client side to prevent hydration mismatch
    if (typeof window !== 'undefined') {
      const urlParams = new URLSearchParams(window.location.search);
      const tabParam = urlParams.get('tab');
      if (tabParam && ['squads', 'free-agents', 'tournaments', 'bans'].includes(tabParam)) {
        setActiveTab(tabParam as any);
      }
      

    }
  }, []);

  // Load data when access is granted
  useEffect(() => {
    if (hasAccess) {
      loadSquads();
      loadFreeAgents();
      loadBannedPlayers();
    }
  }, [hasAccess]);

  const loadSquads = async () => {
    try {
      setSquadsLoading(true);
      const { data, error } = await supabase
        .from('squads')
        .select(`
          id,
          name,
          tag,
          description,
          is_active,
          tournament_eligible,
          created_at,
          captain_id,
          banner_url,
          profiles!squads_captain_id_fkey(in_game_alias),
          squad_members!inner(id)
        `)
        .order('created_at', { ascending: false });

      if (error) throw error;

      const formattedSquads: Squad[] = (data || []).map((squad: any) => ({
        id: squad.id,
        name: squad.name,
        tag: squad.tag,
        description: squad.description,
        captain_alias: squad.profiles?.in_game_alias || 'Unknown',
        captain_id: squad.captain_id,
        member_count: squad.squad_members?.length || 0,
        is_active: squad.is_active,
        tournament_eligible: squad.tournament_eligible || false,
        created_at: squad.created_at,
        banner_url: squad.banner_url
      }));

      setSquads(formattedSquads);
    } catch (error) {
      console.error('Error loading squads:', error);
      toast.error('Failed to load squads');
    } finally {
      setSquadsLoading(false);
    }
  };

  const loadFreeAgents = async () => {
    try {
      setFreeAgentsLoading(true);
      
      // Check if free_agents table exists
      const { data, error } = await supabase
        .from('free_agents')
        .select(`
          id,
          player_id,
          preferred_roles,
          availability,
          skill_level,
          notes,
          is_active,
          created_at,
          contact_info,
          profiles!free_agents_player_id_fkey(in_game_alias)
        `)
        .eq('is_active', true)
        .order('created_at', { ascending: false });

      if (error) {
        if (error.message?.includes('relation') || error.message?.includes('does not exist')) {
          // Table doesn't exist, will need to create it
          setFreeAgents([]);
          return;
        }
        throw error;
      }

      const formattedAgents: FreeAgent[] = (data || []).map((agent: any) => ({
        id: agent.id,
        player_id: agent.player_id,
        player_alias: agent.profiles?.in_game_alias || 'Unknown',
        preferred_roles: Array.isArray(agent.preferred_roles) ? agent.preferred_roles : [],
        availability: agent.availability || '',
        skill_level: agent.skill_level || 'intermediate',
        notes: agent.notes,
        is_active: agent.is_active,
        created_at: agent.created_at,
        contact_info: agent.contact_info
      }));

      setFreeAgents(formattedAgents);
    } catch (error) {
      console.error('Error loading free agents:', error);
      setFreeAgents([]);
    } finally {
      setFreeAgentsLoading(false);
    }
  };

  const loadBannedPlayers = async () => {
    try {
      setBannedPlayersLoading(true);
      const { data, error } = await supabase
        .from('profiles')
        .select('id, in_game_alias, email, is_league_banned, league_ban_reason, league_ban_date')
        .eq('is_league_banned', true)
        .order('league_ban_date', { ascending: false });

      if (error) throw error;

      setBannedPlayers(data || []);
    } catch (error) {
      console.error('Error loading banned players:', error);
      toast.error('Failed to load banned players');
    } finally {
      setBannedPlayersLoading(false);
    }
  };

  const banPlayer = async (playerId: string, reason: string) => {
    try {
      const { error } = await supabase
        .from('profiles')
        .update({
          is_league_banned: true,
          league_ban_reason: reason,
          league_ban_date: new Date().toISOString()
        })
        .eq('id', playerId);

      if (error) throw error;

      // Also remove from free agent pool if they're in it
      await supabase
        .from('free_agents')
        .update({ is_active: false })
        .eq('player_id', playerId)
        .eq('is_active', true);

      toast.success('Player banned from CTF league');
      loadBannedPlayers();
      loadFreeAgents(); // Refresh in case they were in free agent pool
      setShowBanPlayer(false);
    } catch (error) {
      console.error('Error banning player:', error);
      toast.error('Failed to ban player');
    }
  };

  const unbanPlayer = async (playerId: string) => {
    try {
      const { error } = await supabase
        .from('profiles')
        .update({
          is_league_banned: false,
          league_ban_reason: null,
          league_ban_date: null
        })
        .eq('id', playerId);

      if (error) throw error;

      toast.success('Player unbanned from CTF league');
      loadBannedPlayers();
    } catch (error) {
      console.error('Error unbanning player:', error);
      toast.error('Failed to unban player');
    }
  };

  const toggleSquadStatus = async (squadId: string, field: 'is_active' | 'tournament_eligible', currentValue: boolean) => {
    try {
      const { error } = await supabase
        .from('squads')
        .update({ [field]: !currentValue })
        .eq('id', squadId);

      if (error) throw error;

      setSquads(prev => prev.map(squad => 
        squad.id === squadId 
          ? { ...squad, [field]: !currentValue }
          : squad
      ));

      const fieldName = field === 'is_active' ? 'squad status' : 'tournament eligibility';
      toast.success(`Updated ${fieldName} successfully`);
    } catch (error) {
      console.error(`Error updating ${field}:`, error);
      toast.error(`Failed to update ${field}`);
    }
  };

  const addToFreeAgentPool = async (formData: Partial<FreeAgent>) => {
    try {
      const { error } = await supabase
        .from('free_agents')
        .insert({
          player_id: formData.player_id,
          preferred_roles: formData.preferred_roles || [],
          availability: formData.availability || '',
          skill_level: formData.skill_level || 'intermediate',
          notes: formData.notes,
          contact_info: formData.contact_info,
          is_active: true
        });

      if (error) throw error;

      toast.success('Added to free agent pool successfully');
      setShowAddFreeAgent(false);
      loadFreeAgents();
    } catch (error) {
      console.error('Error adding free agent:', error);
      toast.error('Failed to add to free agent pool');
    }
  };

  const updateFreeAgent = async (agentId: string, formData: Partial<FreeAgent>) => {
    try {
      const { error } = await supabase
        .from('free_agents')
        .update({
          preferred_roles: formData.preferred_roles || [],
          availability: formData.availability || '',
          skill_level: formData.skill_level || 'intermediate',
          notes: formData.notes,
          contact_info: formData.contact_info
        })
        .eq('id', agentId);

      if (error) throw error;

      toast.success('Updated free agent successfully');
      setEditingFreeAgent(null);
      loadFreeAgents();
    } catch (error) {
      console.error('Error updating free agent:', error);
      toast.error('Failed to update free agent');
    }
  };

  const removeFromFreeAgentPool = async (agentId: string) => {
    try {
      // Delete the row so we don't hit (player_id, is_active) unique constraint
      // if the player already has an inactive row. Same behavior for the UI.
      const { error } = await supabase
        .from('free_agents')
        .delete()
        .eq('id', agentId);

      if (error) throw error;

      toast.success('Removed from free agent pool');
      loadFreeAgents();
    } catch (error) {
      console.error('Error removing free agent:', error);
      toast.error('Failed to remove from pool');
    }
  };

  const clearEntireFreeAgentPool = async () => {
    try {
      setClearingPool(true);
      // Delete active rows instead of updating to is_active=false to avoid violating
      // unique constraint (player_id, is_active) when a player already has an inactive row.
      const { error } = await supabase
        .from('free_agents')
        .delete()
        .eq('is_active', true);

      if (error) {
        console.error('Error clearing free agent pool:', error.message, error.code, error.details);
        throw error;
      }

      toast.success('Free agent pool cleared. Players can re-join when the next season opens.');
      setShowClearFreeAgentsConfirm(false);
      loadFreeAgents();
    } catch (error: unknown) {
      const msg = error && typeof error === 'object' && 'message' in error ? String((error as { message: unknown }).message) : 'Failed to clear pool';
      console.error('Error clearing free agent pool:', msg, error);
      toast.error(msg || 'Failed to clear pool.');
    } finally {
      setClearingPool(false);
    }
  };

  const filteredSquads = squads.filter(squad => {
    switch (squadFilter) {
      case 'active':
        return squad.is_active;
      case 'inactive':
        return !squad.is_active;
      case 'tournament-eligible':
        return squad.tournament_eligible;
      case 'tournament-ineligible':
        return !squad.tournament_eligible;
      default:
        return true;
    }
  });

  if (loading || !accessChecked || !mounted) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-purple-500 mx-auto mb-4"></div>
          <p className="text-purple-400 font-mono">
            {loading ? 'Loading authentication...' : !mounted ? 'Initializing...' : 'Verifying CTF admin access...'}
          </p>
          <p className="text-gray-400 text-sm mt-2">
            {!mounted ? 'Setting up page...' : !accessChecked ? 'Please wait...' : 'Almost ready...'}
          </p>
        </div>
      </div>
    );
  }

  if (!hasAccess) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-red-400 mb-4">Access Denied</h1>
          <p className="text-gray-300">CTF Admin privileges required</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      <Navbar user={user} />
      
      <div className="container mx-auto py-8 px-4">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-purple-400 mb-2">🎮 CTF Management</h1>
          <p className="text-gray-400">
            Manage squads, tournament eligibility, and free agent pool
          </p>
          <div className="text-sm text-gray-500 mt-2">
            Logged in as: <span className="text-purple-400">{profile?.in_game_alias}</span> 
            ({profile?.ctf_role || 'admin'})
          </div>
        </div>

        {/* Quick Actions */}
        <div className="mb-6">
          <h2 className="text-xl font-bold text-purple-400 mb-4">⚡ Quick Actions</h2>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <button
              onClick={() => setActiveTab('squads')}
              className="bg-purple-600 hover:bg-purple-700 text-white p-4 rounded-lg text-center transition-colors group"
            >
              <div className="text-2xl mb-2">🛡️</div>
              <div className="font-bold">Squad Management</div>
              <div className="text-sm opacity-75">Manage squads & tournaments</div>
            </button>
            
            <button
              onClick={() => setActiveTab('free-agents')}
              className="bg-blue-600 hover:bg-blue-700 text-white p-4 rounded-lg text-center transition-colors group"
            >
              <div className="text-2xl mb-2">🎯</div>
              <div className="font-bold">Admin Free Agents</div>
              <div className="text-sm opacity-75">Manage available players</div>
            </button>
            
            <button
              onClick={() => {
                if (typeof window !== 'undefined') {
                  window.open('/free-agents', '_blank');
                }
              }}
              className="bg-green-600 hover:bg-green-700 text-white p-4 rounded-lg text-center transition-colors group"
            >
              <div className="text-2xl mb-2">👀</div>
              <div className="font-bold">View Public Pool</div>
              <div className="text-sm opacity-75">See what players see</div>
            </button>
            
            <button
              onClick={() => setActiveTab('bans')}
              className="bg-red-600 hover:bg-red-700 text-white p-4 rounded-lg text-center transition-colors group"
            >
              <div className="text-2xl mb-2">🚫</div>
              <div className="font-bold">League Bans</div>
              <div className="text-sm opacity-75">Manage banned players</div>
            </button>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="mb-6">
          <div className="flex space-x-1 bg-gray-800 p-1 rounded-lg w-fit">
            {[
              { key: 'squads', label: '🛡️ Squad Management', count: squads.length },
              { key: 'free-agents', label: '🎯 Free Agent Pool', count: freeAgents.length },
              { key: 'tournaments', label: '🏆 Tournament Controls', count: filteredSquads.filter(s => s.tournament_eligible).length },
              { key: 'bans', label: '🚫 League Bans', count: bannedPlayers.length }
            ].map(({ key, label, count }) => (
              <button
                key={key}
                onClick={() => setActiveTab(key as any)}
                className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                  activeTab === key
                    ? 'bg-purple-600 text-white'
                    : 'text-gray-300 hover:text-white hover:bg-gray-700'
                }`}
              >
                {label} ({count})
              </button>
            ))}
          </div>
        </div>

        {/* Squad Management Tab */}
        {activeTab === 'squads' && (
          <div className="space-y-6">
            {/* Squad Filters */}
            <div className="flex flex-wrap gap-4 items-center">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">Filter Squads</label>
                <select
                  value={squadFilter}
                  onChange={(e) => setSquadFilter(e.target.value as any)}
                  className="bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-white focus:border-purple-500"
                >
                  <option value="all">All Squads ({squads.length})</option>
                  <option value="active">Active ({squads.filter(s => s.is_active).length})</option>
                  <option value="inactive">Inactive ({squads.filter(s => !s.is_active).length})</option>
                  <option value="tournament-eligible">Tournament Eligible ({squads.filter(s => s.tournament_eligible).length})</option>
                  <option value="tournament-ineligible">Tournament Ineligible ({squads.filter(s => !s.tournament_eligible).length})</option>
                </select>
              </div>
            </div>

            {/* Squads Table */}
            <div className="bg-gray-800 rounded-lg overflow-hidden">
              {squadsLoading ? (
                <div className="p-8 text-center">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-400 mx-auto"></div>
                  <p className="mt-4 text-gray-400">Loading squads...</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-gray-700">
                      <tr>
                        <th className="text-left py-3 px-4 font-medium text-gray-300">Squad</th>
                        <th className="text-left py-3 px-4 font-medium text-gray-300">Captain</th>
                        <th className="text-left py-3 px-4 font-medium text-gray-300">Members</th>
                        <th className="text-left py-3 px-4 font-medium text-gray-300">Status</th>
                        <th className="text-left py-3 px-4 font-medium text-gray-300">Tournament</th>
                        <th className="text-left py-3 px-4 font-medium text-gray-300">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredSquads.map((squad) => (
                        <tr key={squad.id} className="border-b border-gray-700 hover:bg-gray-700/30">
                          <td className="py-3 px-4">
                            <div>
                              <div className="font-medium text-white">[{squad.tag}] {squad.name}</div>
                              <div className="text-sm text-gray-400">{squad.description}</div>
                            </div>
                          </td>
                          <td className="py-3 px-4 text-cyan-400">{squad.captain_alias}</td>
                          <td className="py-3 px-4">{squad.member_count}</td>
                          <td className="py-3 px-4">
                            <button
                              onClick={() => toggleSquadStatus(squad.id, 'is_active', squad.is_active)}
                              className={`px-3 py-1 rounded-full text-xs font-medium ${
                                squad.is_active
                                  ? 'bg-green-600 text-white hover:bg-green-700'
                                  : 'bg-red-600 text-white hover:bg-red-700'
                              }`}
                            >
                              {squad.is_active ? 'Active' : 'Inactive'}
                            </button>
                          </td>
                          <td className="py-3 px-4">
                            <button
                              onClick={() => toggleSquadStatus(squad.id, 'tournament_eligible', squad.tournament_eligible)}
                              className={`px-3 py-1 rounded-full text-xs font-medium ${
                                squad.tournament_eligible
                                  ? 'bg-purple-600 text-white hover:bg-purple-700'
                                  : 'bg-gray-600 text-white hover:bg-gray-700'
                              }`}
                            >
                              {squad.tournament_eligible ? 'Eligible' : 'Not Eligible'}
                            </button>
                          </td>
                          <td className="py-3 px-4">
                            <div className="flex space-x-2">
                              <button className="text-blue-400 hover:text-blue-300 text-sm">
                                View Details
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {filteredSquads.length === 0 && !squadsLoading && (
                <div className="p-8 text-center text-gray-400">
                  No squads match the current filter
                </div>
              )}
            </div>
          </div>
        )}

        {/* Free Agents Tab */}
        {activeTab === 'free-agents' && (
          <div className="space-y-6">
            <div className="flex flex-wrap justify-between items-center gap-3">
              <h2 className="text-xl font-bold text-purple-400">Free Agent Pool</h2>
              <div className="flex gap-2">
                <button
                  onClick={() => setShowClearFreeAgentsConfirm(true)}
                  disabled={freeAgents.length === 0 || clearingPool}
                  className="bg-gray-600 hover:bg-gray-500 disabled:opacity-50 disabled:cursor-not-allowed text-white px-4 py-2 rounded-lg text-sm font-medium"
                  title="Remove everyone from the pool (e.g. after season end). Players can re-join for the next season."
                >
                  {clearingPool ? 'Clearing…' : 'Clear entire pool'}
                </button>
                <button
                  onClick={() => setShowAddFreeAgent(true)}
                  className="bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-lg text-sm font-medium"
                >
                  Add Free Agent
                </button>
              </div>
            </div>

            {/* Clear pool confirmation modal */}
            {showClearFreeAgentsConfirm && (
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
                <div className="bg-gray-800 rounded-xl border border-gray-600 p-6 max-w-md w-full">
                  <h3 className="text-lg font-bold text-white mb-2">Clear entire free agent pool?</h3>
                  <p className="text-gray-300 text-sm mb-4">
                    This will remove all {freeAgents.length} player{freeAgents.length === 1 ? '' : 's'} from the pool. Use this when a season ends so the pool is fresh for the next season. Players can join again from the Free Agents page.
                  </p>
                  <div className="flex gap-3 justify-end">
                    <button
                      onClick={() => setShowClearFreeAgentsConfirm(false)}
                      disabled={clearingPool}
                      className="px-4 py-2 rounded-lg bg-gray-600 hover:bg-gray-500 text-white disabled:opacity-50"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={clearEntireFreeAgentPool}
                      disabled={clearingPool}
                      className="px-4 py-2 rounded-lg bg-red-600 hover:bg-red-500 text-white disabled:opacity-50"
                    >
                      {clearingPool ? 'Clearing…' : 'Clear pool'}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Free Agents List */}
            <div className="bg-gray-800 rounded-lg overflow-hidden">
              {freeAgentsLoading ? (
                <div className="p-8 text-center">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-400 mx-auto"></div>
                  <p className="mt-4 text-gray-400">Loading free agents...</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-gray-700">
                      <tr>
                        <th className="text-left py-3 px-4 font-medium text-gray-300">Player</th>
                        <th className="text-left py-3 px-4 font-medium text-gray-300">Preferred Roles</th>
                        <th className="text-left py-3 px-4 font-medium text-gray-300">Skill Level</th>
                        <th className="text-left py-3 px-4 font-medium text-gray-300">Availability</th>
                        <th className="text-left py-3 px-4 font-medium text-gray-300">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {freeAgents.map((agent) => (
                        <tr key={agent.id} className="border-b border-gray-700 hover:bg-gray-700/30">
                          <td className="py-3 px-4">
                            <div className="font-medium text-white">{agent.player_alias}</div>
                            {agent.contact_info && (
                              <div className="text-sm text-gray-400">{agent.contact_info}</div>
                            )}
                          </td>
                          <td className="py-3 px-4">
                            <div className="flex flex-wrap gap-1">
                              {agent.preferred_roles.map((role, index) => (
                                <span key={index} className="bg-blue-600 text-white px-2 py-1 rounded text-xs">
                                  {role}
                                </span>
                              ))}
                            </div>
                          </td>
                          <td className="py-3 px-4">
                            <span className={`px-2 py-1 rounded text-xs font-medium ${
                              agent.skill_level === 'beginner' ? 'bg-green-600 text-white' :
                              agent.skill_level === 'intermediate' ? 'bg-yellow-600 text-white' :
                              'bg-red-600 text-white'
                            }`}>
                              {agent.skill_level}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-gray-300">{agent.availability}</td>
                          <td className="py-3 px-4">
                            <div className="flex space-x-2">
                              <button 
                                onClick={() => setEditingFreeAgent(agent)}
                                className="text-blue-400 hover:text-blue-300 text-sm"
                              >
                                Edit
                              </button>
                              <button 
                                onClick={() => removeFromFreeAgentPool(agent.id)}
                                className="text-red-400 hover:text-red-300 text-sm"
                              >
                                Remove
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {freeAgents.length === 0 && !freeAgentsLoading && (
                <div className="p-8 text-center text-gray-400">
                  No free agents in the pool. Use the "Add Free Agent" button to get started.
                </div>
              )}
            </div>
          </div>
        )}

        {/* Tournament Controls Tab */}
        {activeTab === 'tournaments' && (
          <div className="space-y-6">
            <h2 className="text-xl font-bold text-purple-400">Tournament Management</h2>
            
            <div className="grid md:grid-cols-2 gap-6">
              {/* Tournament Eligible Squads */}
              <div className="bg-gray-800 rounded-lg p-6">
                <h3 className="text-lg font-semibold text-green-400 mb-4">Tournament Eligible Squads</h3>
                <div className="space-y-2">
                  {squads.filter(s => s.tournament_eligible).map((squad) => (
                    <div key={squad.id} className="flex items-center justify-between bg-gray-700 p-3 rounded">
                      <div>
                        <span className="font-medium text-white">[{squad.tag}] {squad.name}</span>
                        <div className="text-sm text-gray-400">{squad.member_count} members</div>
                      </div>
                      <button
                        onClick={() => toggleSquadStatus(squad.id, 'tournament_eligible', squad.tournament_eligible)}
                        className="text-red-400 hover:text-red-300 text-sm"
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                </div>
                {squads.filter(s => s.tournament_eligible).length === 0 && (
                  <p className="text-gray-400 text-center py-4">No tournament eligible squads</p>
                )}
              </div>

              {/* Available Squads to Add */}
              <div className="bg-gray-800 rounded-lg p-6">
                <h3 className="text-lg font-semibold text-yellow-400 mb-4">Available Squads</h3>
                <div className="space-y-2">
                  {squads.filter(s => s.is_active && !s.tournament_eligible).map((squad) => (
                    <div key={squad.id} className="flex items-center justify-between bg-gray-700 p-3 rounded">
                      <div>
                        <span className="font-medium text-white">[{squad.tag}] {squad.name}</span>
                        <div className="text-sm text-gray-400">{squad.member_count} members</div>
                      </div>
                      <button
                        onClick={() => toggleSquadStatus(squad.id, 'tournament_eligible', squad.tournament_eligible)}
                        className="text-green-400 hover:text-green-300 text-sm"
                      >
                        Add
                      </button>
                    </div>
                  ))}
                </div>
                {squads.filter(s => s.is_active && !s.tournament_eligible).length === 0 && (
                  <p className="text-gray-400 text-center py-4">All active squads are tournament eligible</p>
                )}
              </div>
            </div>
          </div>
        )}

        {/* League Bans Tab */}
        {activeTab === 'bans' && (
          <div className="space-y-6">
            <div className="flex justify-between items-center">
              <h2 className="text-xl font-bold text-red-400">League Ban Management</h2>
              <button
                onClick={() => setShowBanPlayer(true)}
                className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg font-medium transition-colors"
              >
                Ban Player
              </button>
            </div>

            {bannedPlayersLoading ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="bg-gray-800 rounded-lg p-6 animate-pulse">
                    <div className="h-6 bg-gray-700 rounded mb-4"></div>
                    <div className="h-4 bg-gray-700 rounded mb-2"></div>
                    <div className="h-4 bg-gray-700 rounded mb-4 w-3/4"></div>
                  </div>
                ))}
              </div>
            ) : bannedPlayers.length === 0 ? (
              <div className="text-center py-12">
                <p className="text-gray-400 text-xl">No banned players</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {bannedPlayers.map((player) => (
                  <div key={player.id} className="bg-gray-800 border border-red-500/30 rounded-lg p-6">
                    <h3 className="text-lg font-bold text-red-400 mb-3">{player.in_game_alias}</h3>
                    
                    <div className="space-y-2 text-sm">
                      
                      <div>
                        <span className="text-gray-400">Banned:</span>
                        <span className="ml-2 text-gray-300">
                          {player.league_ban_date ? new Date(player.league_ban_date).toLocaleDateString() : 'Unknown'}
                        </span>
                      </div>
                      
                      {player.league_ban_reason && (
                        <div>
                          <span className="text-gray-400">Reason:</span>
                          <p className="text-gray-300 mt-1 text-xs bg-gray-700 p-2 rounded">
                            {player.league_ban_reason}
                          </p>
                        </div>
                      )}
                    </div>

                    <button
                      onClick={() => unbanPlayer(player.id)}
                      className="mt-4 w-full bg-green-600 hover:bg-green-700 text-white py-2 rounded font-medium transition-colors"
                    >
                      Unban Player
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Ban Player Modal */}
      {showBanPlayer && (
        <BanPlayerModal
          onBan={banPlayer}
          onCancel={() => setShowBanPlayer(false)}
        />
      )}

      {/* Add Free Agent Modal */}
      {showAddFreeAgent && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-gray-800 rounded-lg p-6 w-full max-w-md mx-4">
            <h3 className="text-lg font-bold text-purple-400 mb-4">Add Free Agent</h3>
            <FreeAgentForm 
              onSubmit={addToFreeAgentPool}
              onCancel={() => setShowAddFreeAgent(false)}
            />
          </div>
        </div>
      )}

      {/* Edit Free Agent Modal */}
      {editingFreeAgent && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-gray-800 rounded-lg p-6 w-full max-w-md mx-4">
            <h3 className="text-lg font-bold text-purple-400 mb-4">Edit Free Agent</h3>
            <FreeAgentForm 
              initialData={editingFreeAgent}
              onSubmit={(data) => {
                updateFreeAgent(editingFreeAgent.id, data);
              }}
              onCancel={() => setEditingFreeAgent(null)}
            />
          </div>
        </div>
      )}
    </div>
  );
}

// Free Agent Form Component
function FreeAgentForm({ 
  initialData, 
  onSubmit, 
  onCancel 
}: { 
  initialData?: FreeAgent, 
  onSubmit: (data: Partial<FreeAgent>) => void, 
  onCancel: () => void 
}) {
  const [formData, setFormData] = useState({
    player_id: initialData?.player_id || '',
    preferred_roles: initialData?.preferred_roles || [],
    availability: initialData?.availability || '',
    skill_level: initialData?.skill_level || 'intermediate',
    notes: initialData?.notes || '',
    contact_info: initialData?.contact_info || ''
  });

  const [availablePlayers, setAvailablePlayers] = useState<any[]>([]);

  useEffect(() => {
    // Fetch players not currently in squads
    const fetchPlayers = async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, in_game_alias')
        .eq('registration_status', 'completed')
        .not('in_game_alias', 'is', null);

      if (!error && data) {
        setAvailablePlayers(data);
      }
    };

    fetchPlayers();
  }, []);

  const roleOptions = ['Offense', 'Defense', 'Support', 'Flag Carrier', 'Sniper', 'Heavy Weapons'];

  const handleRoleToggle = (role: string) => {
    setFormData(prev => ({
      ...prev,
      preferred_roles: prev.preferred_roles.includes(role)
        ? prev.preferred_roles.filter(r => r !== role)
        : [...prev.preferred_roles, role]
    }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.player_id) {
      toast.error('Please select a player');
      return;
    }
    onSubmit(formData);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-gray-300 mb-2">Player</label>
        <select
          value={formData.player_id}
          onChange={(e) => setFormData(prev => ({ ...prev, player_id: e.target.value }))}
          className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white"
          required
        >
          <option value="">Select Player</option>
          {availablePlayers.map(player => (
            <option key={player.id} value={player.id}>{player.in_game_alias}</option>
          ))}
        </select>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-300 mb-2">Preferred Roles</label>
        <div className="grid grid-cols-2 gap-2">
          {roleOptions.map(role => (
            <label key={role} className="flex items-center">
              <input
                type="checkbox"
                checked={formData.preferred_roles.includes(role)}
                onChange={() => handleRoleToggle(role)}
                className="mr-2"
              />
              <span className="text-white text-sm">{role}</span>
            </label>
          ))}
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-300 mb-2">Skill Level</label>
        <select
          value={formData.skill_level}
          onChange={(e) => setFormData(prev => ({ ...prev, skill_level: e.target.value }))}
          className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white"
        >
          <option value="beginner">Beginner</option>
          <option value="intermediate">Intermediate</option>
          <option value="advanced">Advanced</option>
          <option value="expert">Expert</option>
        </select>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-300 mb-2">Availability</label>
        <input
          type="text"
          value={formData.availability}
          onChange={(e) => setFormData(prev => ({ ...prev, availability: e.target.value }))}
          placeholder="e.g., Weekends, Evenings EST"
          className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-300 mb-2">Contact Info</label>
        <input
          type="text"
          value={formData.contact_info}
          onChange={(e) => setFormData(prev => ({ ...prev, contact_info: e.target.value }))}
          placeholder="Discord, Email, etc."
          className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-300 mb-2">Notes</label>
        <textarea
          value={formData.notes}
          onChange={(e) => setFormData(prev => ({ ...prev, notes: e.target.value }))}
          placeholder="Additional information..."
          className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white h-20"
        />
      </div>

      <div className="flex space-x-4 pt-4">
        <button
          type="submit"
          className="flex-1 bg-purple-600 hover:bg-purple-700 text-white py-2 px-4 rounded font-medium"
        >
          {initialData ? 'Update' : 'Add'} Free Agent
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="flex-1 bg-gray-600 hover:bg-gray-700 text-white py-2 px-4 rounded font-medium"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

// Ban Player Modal Component
function BanPlayerModal({ 
  onBan, 
  onCancel 
}: { 
  onBan: (playerId: string, reason: string) => void, 
  onCancel: () => void 
}) {
  const [selectedPlayer, setSelectedPlayer] = useState('');
  const [banReason, setBanReason] = useState('');
  const [availablePlayers, setAvailablePlayers] = useState<any[]>([]);

  useEffect(() => {
    const fetchPlayers = async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, in_game_alias, email')
        .eq('registration_status', 'completed')
        .eq('is_league_banned', false)
        .not('in_game_alias', 'is', null)
        .order('in_game_alias');

      if (!error && data) {
        setAvailablePlayers(data);
      }
    };

    fetchPlayers();
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPlayer) {
      toast.error('Please select a player to ban');
      return;
    }
    if (!banReason.trim()) {
      toast.error('Please provide a reason for the ban');
      return;
    }
    onBan(selectedPlayer, banReason.trim());
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-gray-800 rounded-lg p-6 w-full max-w-md mx-4">
        <h3 className="text-lg font-bold text-red-400 mb-4">Ban Player from CTF League</h3>
        
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Select Player to Ban
            </label>
            <select
              value={selectedPlayer}
              onChange={(e) => setSelectedPlayer(e.target.value)}
              className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white"
              required
            >
              <option value="">Choose a player...</option>
              {availablePlayers.map(player => (
                <option key={player.id} value={player.id}>
                  {player.in_game_alias}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Ban Reason (required)
            </label>
            <textarea
              value={banReason}
              onChange={(e) => setBanReason(e.target.value)}
              placeholder="Explain why this player is being banned from the CTF league..."
              className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white resize-none"
              rows={4}
              required
            />
          </div>

          <div className="bg-red-500/20 border border-red-500/30 rounded p-3">
            <p className="text-red-400 text-sm">
              <strong>Warning:</strong> Banning a player will:
            </p>
            <ul className="text-red-300 text-xs mt-2 space-y-1">
              <li>• Remove them from the free agent pool</li>
              <li>• Prevent them from joining the free agent pool</li>
              <li>• Block them from tournament participation</li>
            </ul>
          </div>

          <div className="flex gap-3">
            <button
              type="submit"
              className="flex-1 bg-red-600 hover:bg-red-700 text-white py-2 rounded font-medium transition-colors"
            >
              Ban Player
            </button>
            <button
              type="button"
              onClick={onCancel}
              className="flex-1 bg-gray-600 hover:bg-gray-700 text-white py-2 rounded font-medium transition-colors"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
} 