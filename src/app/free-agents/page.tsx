'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/lib/AuthContext';
import { supabase } from '@/lib/supabase';
import Navbar from '@/components/Navbar';
import { toast } from 'react-hot-toast';

interface FreeAgent {
  id: string;
  player_id: string;
  player_alias: string;
  preferred_roles: string[];
  availability: string;
  skill_level: string;
  notes?: string;
  created_at: string;
  contact_info?: string;
}

interface UserProfile {
  id: string;
  in_game_alias: string;
  is_league_banned: boolean;
}

const SKILL_LEVEL_COLORS = {
  beginner: 'bg-green-500/20 text-green-400 border-green-500/30',
  intermediate: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  advanced: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
  expert: 'bg-red-500/20 text-red-400 border-red-500/30'
};

const ROLE_COLORS = {
  'Offense': 'bg-red-500/20 text-red-300 border-red-500/30',
  'Defense': 'bg-blue-500/20 text-blue-300 border-blue-500/30',
  'Support': 'bg-green-500/20 text-green-300 border-green-500/30',
  'Captain': 'bg-purple-500/20 text-purple-300 border-purple-500/30',
  'Flex': 'bg-yellow-500/20 text-yellow-300 border-yellow-500/30'
};

export default function FreeAgentsPage() {
  const { user } = useAuth();
  const [freeAgents, setFreeAgents] = useState<FreeAgent[]>([]);
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [isInFreeAgentPool, setIsInFreeAgentPool] = useState(false);
  const [showJoinForm, setShowJoinForm] = useState(false);
  const [skillFilter, setSkillFilter] = useState<string>('all');
  const [roleFilter, setRoleFilter] = useState<string>('all');

  useEffect(() => {
    loadFreeAgents();
    if (user) {
      loadUserProfile();
      checkIfInFreeAgentPool();
    }
  }, [user]);

  const loadFreeAgents = async () => {
    try {
      // This query works for both authenticated and anonymous users
      const { data, error } = await supabase
        .from('free_agents')
        .select(`
          id,
          player_id,
          preferred_roles,
          availability,
          skill_level,
          notes,
          created_at,
          contact_info,
          profiles!free_agents_player_id_fkey(in_game_alias)
        `)
        .eq('is_active', true)
        .order('created_at', { ascending: false });

      if (error) throw error;

      const formattedAgents: FreeAgent[] = (data || []).map((agent: any) => ({
        id: agent.id,
        player_id: agent.player_id,
        player_alias: agent.profiles?.in_game_alias || 'Unknown Player',
        preferred_roles: agent.preferred_roles || [],
        availability: agent.availability || '',
        skill_level: agent.skill_level || 'intermediate',
        notes: agent.notes,
        created_at: agent.created_at,
        contact_info: agent.contact_info
      }));

      setFreeAgents(formattedAgents);
    } catch (error) {
      console.error('Error loading free agents:', error);
      toast.error('Failed to load free agents');
    } finally {
      setLoading(false);
    }
  };

  const loadUserProfile = async () => {
    if (!user) return;
    
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, in_game_alias, is_league_banned')
        .eq('id', user.id)
        .single();

      if (error) throw error;
      setProfile(data);
    } catch (error) {
      console.error('Error loading user profile:', error);
    }
  };

  const checkIfInFreeAgentPool = async () => {
    if (!user) return;

    try {
      const { data, error } = await supabase
        .from('free_agents')
        .select('id')
        .eq('player_id', user.id)
        .eq('is_active', true)
        .single();

      setIsInFreeAgentPool(!!data);
    } catch (error) {
      // Not found is expected if user is not in pool
      setIsInFreeAgentPool(false);
    }
  };

  const joinFreeAgentPool = async (formData: {
    preferred_roles: string[];
    availability: string;
    skill_level: string;
    notes?: string;
    contact_info?: string;
  }) => {
    if (!user || !profile) {
      toast.error('You must be logged in to join the free agent pool');
      return;
    }

    if (profile.is_league_banned) {
      toast.error('You are banned from the CTF league and cannot join the free agent pool');
      return;
    }

    try {
      const { error } = await supabase
        .from('free_agents')
        .insert({
          player_id: user.id,
          preferred_roles: formData.preferred_roles,
          availability: formData.availability,
          skill_level: formData.skill_level,
          notes: formData.notes,
          contact_info: formData.contact_info,
          is_active: true
        });

      if (error) throw error;

      toast.success('Successfully joined the free agent pool!');
      setIsInFreeAgentPool(true);
      setShowJoinForm(false);
      loadFreeAgents(); // Refresh the list
    } catch (error: any) {
      console.error('Error joining free agent pool:', error);
      toast.error(error.message || 'Failed to join free agent pool');
    }
  };

  const leaveFreeAgentPool = async () => {
    if (!user) return;

    try {
      const { error } = await supabase
        .from('free_agents')
        .update({ is_active: false })
        .eq('player_id', user.id)
        .eq('is_active', true);

      if (error) throw error;

      toast.success('Left the free agent pool');
      setIsInFreeAgentPool(false);
      loadFreeAgents(); // Refresh the list
    } catch (error) {
      console.error('Error leaving free agent pool:', error);
      toast.error('Failed to leave free agent pool');
    }
  };

  const filteredAgents = freeAgents.filter(agent => {
    if (skillFilter !== 'all' && agent.skill_level !== skillFilter) return false;
    if (roleFilter !== 'all' && !agent.preferred_roles.includes(roleFilter)) return false;
    return true;
  });

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-slate-800 to-gray-900">
      <Navbar user={user} />
      
      <main className="container mx-auto px-4 py-8">
        <div className="max-w-6xl mx-auto">
          {/* Header */}
          <div className="text-center mb-8">
            <h1 className="text-4xl font-bold text-purple-400 mb-4 tracking-wider">
              🎯 CTF Free Agent Pool
            </h1>
            <p className="text-xl text-gray-300 mb-6">
              Players looking for squads • Squads looking for players
            </p>
            
            {/* User Actions */}
            {user && profile && !profile.is_league_banned && (
              <div className="flex justify-center gap-4 mb-6">
                {!isInFreeAgentPool ? (
                  <button
                    onClick={() => setShowJoinForm(true)}
                    className="bg-green-600 hover:bg-green-700 text-white px-6 py-3 rounded-lg font-medium transition-colors"
                  >
                    Join Free Agent Pool
                  </button>
                ) : (
                  <button
                    onClick={leaveFreeAgentPool}
                    className="bg-red-600 hover:bg-red-700 text-white px-6 py-3 rounded-lg font-medium transition-colors"
                  >
                    Leave Free Agent Pool
                  </button>
                )}
              </div>
            )}

            {profile?.is_league_banned && (
              <div className="bg-red-500/20 border border-red-500/30 rounded-lg p-4 mb-6 max-w-md mx-auto">
                <p className="text-red-400 font-medium">
                  You are banned from the CTF league and cannot join the free agent pool.
                </p>
              </div>
            )}

            {!user && (
              <div className="bg-blue-500/20 border border-blue-500/30 rounded-lg p-4 mb-6 max-w-md mx-auto">
                <p className="text-blue-400 font-medium">
                  <a href="/auth/login" className="underline hover:text-blue-300">
                    Log in
                  </a> to join the free agent pool
                </p>
              </div>
            )}
          </div>

          {/* Filters */}
          <div className="flex flex-wrap gap-4 mb-6 justify-center">
            <select
              value={skillFilter}
              onChange={(e) => setSkillFilter(e.target.value)}
              className="bg-gray-800 border border-gray-600 rounded-lg px-4 py-2 text-white"
            >
              <option value="all">All Skill Levels</option>
              <option value="beginner">Beginner</option>
              <option value="intermediate">Intermediate</option>
              <option value="advanced">Advanced</option>
              <option value="expert">Expert</option>
            </select>

            <select
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value)}
              className="bg-gray-800 border border-gray-600 rounded-lg px-4 py-2 text-white"
            >
              <option value="all">All Roles</option>
              <option value="Offense">Offense</option>
              <option value="Defense">Defense</option>
              <option value="Support">Support</option>
              <option value="Captain">Captain</option>
              <option value="Flex">Flex</option>
            </select>
          </div>

          {/* Free Agents Grid */}
          {loading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <div key={i} className="bg-gray-800 rounded-lg p-6 animate-pulse">
                  <div className="h-6 bg-gray-700 rounded mb-4"></div>
                  <div className="h-4 bg-gray-700 rounded mb-2"></div>
                  <div className="h-4 bg-gray-700 rounded mb-4 w-3/4"></div>
                  <div className="flex gap-2 mb-4">
                    <div className="h-6 bg-gray-700 rounded w-16"></div>
                    <div className="h-6 bg-gray-700 rounded w-20"></div>
                  </div>
                </div>
              ))}
            </div>
          ) : filteredAgents.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-gray-400 text-xl">No free agents found matching your filters</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredAgents.map((agent) => (
                <div key={agent.id} className="bg-gray-800 border border-gray-700 rounded-lg p-6 hover:border-purple-500/50 transition-colors">
                  <h3 className="text-xl font-bold text-purple-400 mb-3">
                    {agent.player_alias}
                  </h3>
                  
                  <div className="space-y-3">
                    <div>
                      <span className="text-gray-400 text-sm">Skill Level:</span>
                      <span className={`ml-2 px-2 py-1 rounded text-xs border ${SKILL_LEVEL_COLORS[agent.skill_level as keyof typeof SKILL_LEVEL_COLORS]}`}>
                        {agent.skill_level.charAt(0).toUpperCase() + agent.skill_level.slice(1)}
                      </span>
                    </div>

                    <div>
                      <span className="text-gray-400 text-sm">Preferred Roles:</span>
                      <div className="flex flex-wrap gap-1 mt-1">
                        {agent.preferred_roles.map((role, index) => (
                          <span
                            key={index}
                            className={`px-2 py-1 rounded text-xs border ${ROLE_COLORS[role as keyof typeof ROLE_COLORS] || 'bg-gray-500/20 text-gray-300 border-gray-500/30'}`}
                          >
                            {role}
                          </span>
                        ))}
                      </div>
                    </div>

                    <div>
                      <span className="text-gray-400 text-sm">Availability:</span>
                      <p className="text-gray-300 text-sm mt-1">{agent.availability}</p>
                    </div>

                    {agent.notes && (
                      <div>
                        <span className="text-gray-400 text-sm">Notes:</span>
                        <p className="text-gray-300 text-sm mt-1">{agent.notes}</p>
                      </div>
                    )}

                    {agent.contact_info && (
                      <div>
                        <span className="text-gray-400 text-sm">Contact:</span>
                        <p className="text-gray-300 text-sm mt-1 break-all">{agent.contact_info}</p>
                      </div>
                    )}

                    <div className="text-xs text-gray-500 pt-2 border-t border-gray-700">
                      Joined: {new Date(agent.created_at).toLocaleDateString()}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>

      {/* Join Form Modal */}
      {showJoinForm && (
        <FreeAgentJoinForm
          onSubmit={joinFreeAgentPool}
          onCancel={() => setShowJoinForm(false)}
        />
      )}
    </div>
  );
}

function FreeAgentJoinForm({ 
  onSubmit, 
  onCancel 
}: { 
  onSubmit: (data: any) => void, 
  onCancel: () => void 
}) {
  const [formData, setFormData] = useState({
    preferred_roles: [] as string[],
    availability: '',
    skill_level: 'intermediate',
    notes: '',
    contact_info: ''
  });

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
    if (formData.preferred_roles.length === 0) {
      toast.error('Please select at least one preferred role');
      return;
    }
    if (!formData.availability.trim()) {
      toast.error('Please provide your availability');
      return;
    }
    onSubmit(formData);
  };

  const availableRoles = ['Offense', 'Defense', 'Support', 'Captain', 'Flex'];

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <div className="bg-gray-800 rounded-lg p-6 w-full max-w-md">
        <h3 className="text-xl font-bold text-purple-400 mb-4">Join Free Agent Pool</h3>
        
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Preferred Roles (select at least one):
            </label>
            <div className="grid grid-cols-2 gap-2">
              {availableRoles.map(role => (
                <button
                  key={role}
                  type="button"
                  onClick={() => handleRoleToggle(role)}
                  className={`p-2 rounded text-sm border transition-colors ${
                    formData.preferred_roles.includes(role)
                      ? 'bg-purple-600 border-purple-500 text-white'
                      : 'bg-gray-700 border-gray-600 text-gray-300 hover:border-purple-500'
                  }`}
                >
                  {role}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Skill Level:
            </label>
            <select
              value={formData.skill_level}
              onChange={(e) => setFormData(prev => ({ ...prev, skill_level: e.target.value }))}
              className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white"
            >
              <option value="beginner">Beginner</option>
              <option value="intermediate">Intermediate</option>
              <option value="advanced">Advanced</option>
              <option value="expert">Expert</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Availability (required):
            </label>
            <textarea
              value={formData.availability}
              onChange={(e) => setFormData(prev => ({ ...prev, availability: e.target.value }))}
              placeholder="e.g., Weekends and weekday evenings EST, Tuesday/Thursday 7-10 PM"
              className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white resize-none"
              rows={3}
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Contact Info (optional):
            </label>
            <input
              type="text"
              value={formData.contact_info}
              onChange={(e) => setFormData(prev => ({ ...prev, contact_info: e.target.value }))}
              placeholder="Discord username, etc."
              className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Additional Notes (optional):
            </label>
            <textarea
              value={formData.notes}
              onChange={(e) => setFormData(prev => ({ ...prev, notes: e.target.value }))}
              placeholder="Previous experience, goals, etc."
              className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white resize-none"
              rows={3}
            />
          </div>

          <div className="flex gap-3">
            <button
              type="submit"
              className="flex-1 bg-green-600 hover:bg-green-700 text-white py-2 rounded-lg font-medium transition-colors"
            >
              Join Pool
            </button>
            <button
              type="button"
              onClick={onCancel}
              className="flex-1 bg-gray-600 hover:bg-gray-700 text-white py-2 rounded-lg font-medium transition-colors"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
} 