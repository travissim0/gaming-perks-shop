'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useAuth } from '@/lib/AuthContext';
import { supabase } from '@/lib/supabase';
import { toast } from 'react-hot-toast';

interface Team {
  id: string;
  team_name: string;
  team_banner_url: string | null;
  owner_id: string;
  owner_alias: string;
  created_at: string;
  member_count: number;
  max_players: number;
}

interface TeamMember {
  id: string;
  player_id: string;
  player_alias: string;
  player_avatar: string | null;
  joined_at: string;
  role: string;
}

export default function TripleThreatSignupPage() {
  const { user, loading: authLoading } = useAuth();
  const [teams, setTeams] = useState<Team[]>([]);
  const [userTeam, setUserTeam] = useState<Team | null>(null);
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [showJoinForm, setShowJoinForm] = useState(false);
  const [selectedTeam, setSelectedTeam] = useState<Team | null>(null);
  const [uploading, setUploading] = useState(false);

  // Form states
  const [createForm, setCreateForm] = useState({
    teamName: '',
    teamPassword: '',
    confirmPassword: '',
    bannerFile: null as File | null
  });
  const [joinForm, setJoinForm] = useState({
    teamId: '',
    password: ''
  });

  useEffect(() => {
    if (!authLoading && user) {
      loadTeams();
      checkUserTeam();
    }
  }, [authLoading, user]);

  const loadTeams = async () => {
    try {
      console.log('Loading teams...');
      
      // Try RPC function first
      const { data: rpcData, error: rpcError } = await supabase.rpc('get_tt_teams_with_counts');
      
      if (!rpcError && rpcData) {
        console.log('RPC success, loaded teams:', rpcData);
        setTeams(rpcData);
        return;
      }
      
      console.log('RPC failed, trying direct query. Error:', rpcError?.message);
      
      // Fallback to direct query
      const { data: teamsData, error: directError } = await supabase
        .from('tt_teams')
        .select(`
          id, 
          team_name, 
          team_banner_url, 
          owner_id, 
          created_at, 
          max_players,
          profiles!tt_teams_owner_id_fkey(in_game_alias)
        `)
        .eq('is_active', true)
        .order('created_at', { ascending: false });

      if (directError) {
        console.error('Direct query failed:', directError);
        throw directError;
      }

      console.log('Direct query success, loaded teams:', teamsData);

      // Format the data to match expected structure
      const formattedTeams = (teamsData || []).map((team: any) => ({
        id: team.id,
        team_name: team.team_name,
        team_banner_url: team.team_banner_url,
        owner_id: team.owner_id,
        owner_alias: team.profiles?.in_game_alias || 'Unknown',
        created_at: team.created_at,
        member_count: 1, // We'll get actual count later
        max_players: team.max_players
      }));

      setTeams(formattedTeams);

    } catch (catchError) {
      console.error('Error loading teams:', catchError);
      // Only show toast for unexpected errors
      const errorMessage = (catchError as any)?.message || '';
      if (!errorMessage.includes('relation') && 
          !errorMessage.includes('does not exist') && 
          !errorMessage.includes('permission denied')) {
        toast.error('Failed to load teams');
      }
    } finally {
      setLoading(false);
    }
  };

  const checkUserTeam = async () => {
    if (!user) return;

    try {
      console.log('Checking user team for user:', user.id);
      
      // Check if user is already on a team
      const { data: membership, error } = await supabase
        .from('tt_team_members')
        .select(`
          team_id,
          tt_teams (
            id, team_name, team_banner_url, owner_id, created_at, max_players,
            profiles!tt_teams_owner_id_fkey (in_game_alias)
          )
        `)
        .eq('player_id', user.id)
        .eq('is_active', true)
        .single();

      if (error) {
        console.log('User not on any team:', error.message);
        return;
      }

      if (membership && membership.tt_teams) {
        console.log('User is on team:', membership.tt_teams);
        const team = membership.tt_teams as any;
        setUserTeam({
          id: team.id,
          team_name: team.team_name,
          team_banner_url: team.team_banner_url,
          owner_id: team.owner_id,
          owner_alias: team.profiles?.in_game_alias || 'Unknown',
          created_at: team.created_at,
          member_count: 0,
          max_players: team.max_players
        });
        loadTeamMembers(team.id);
      }
    } catch (error) {
      console.log('Error checking user team:', error);
    }
  };

  const loadTeamMembers = async (teamId: string) => {
    try {
      const { data, error } = await supabase.rpc('get_tt_team_members', { team_id_input: teamId });
      if (error) throw error;
      setTeamMembers(data || []);
    } catch (error) {
      console.error('Error loading team members:', error);
    }
  };

  const handleCreateTeam = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    if (createForm.teamPassword !== createForm.confirmPassword) {
      toast.error('Passwords do not match');
      return;
    }

    if (createForm.teamPassword.length < 6) {
      toast.error('Password must be at least 6 characters');
      return;
    }

    setLoading(true);

    try {
      let bannerUrl = null;

      // Upload banner if provided
      if (createForm.bannerFile) {
        const fileExt = createForm.bannerFile.name.split('.').pop();
        const fileName = `team_${Date.now()}.${fileExt}`;
        const filePath = `triple-threat-banners/${fileName}`;

        const { error: uploadError } = await supabase.storage
          .from('avatars')
          .upload(filePath, createForm.bannerFile);

        if (uploadError) throw uploadError;

        const { data: urlData } = supabase.storage
          .from('avatars')
          .getPublicUrl(filePath);

        bannerUrl = urlData.publicUrl;
      }

      // Create team with encrypted password
      const { data: team, error: teamError } = await supabase
        .from('tt_teams')
        .insert({
          team_name: createForm.teamName,
          team_password_hash: createForm.teamPassword, // Will be encrypted by database trigger
          team_banner_url: bannerUrl,
          owner_id: user.id
        })
        .select()
        .single();

      if (teamError) throw teamError;

      // Add owner as team member
      const { error: memberError } = await supabase
        .from('tt_team_members')
        .insert({
          team_id: team.id,
          player_id: user.id,
          role: 'owner'
        });

      if (memberError) throw memberError;

      toast.success('Team created successfully!');
      setShowCreateForm(false);
      setCreateForm({ teamName: '', teamPassword: '', confirmPassword: '', bannerFile: null });
      loadTeams();
      checkUserTeam();

    } catch (error: any) {
      console.error('Error creating team:', error);
      if (error.code === '23505') {
        toast.error('Team name already exists');
      } else {
        toast.error('Failed to create team: ' + error.message);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleJoinTeam = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !selectedTeam) return;

    setLoading(true);

    try {
      // Verify password
      const { data: verified, error: verifyError } = await supabase
        .rpc('tt_verify_team_password', {
          team_name_input: selectedTeam.team_name,
          password_input: joinForm.password
        });

      if (verifyError) throw verifyError;
      if (!verified) {
        toast.error('Invalid password');
        setLoading(false);
        return;
      }

      // Check if team has space
      const { data: canJoin, error: spaceError } = await supabase
        .rpc('tt_can_join_team', {
          team_id_input: selectedTeam.id,
          user_id_input: user.id
        });

      if (spaceError) throw spaceError;
      if (!canJoin) {
        toast.error('Team is full or you are already a member');
        setLoading(false);
        return;
      }

      // Join team
      const { error: joinError } = await supabase
        .from('tt_team_members')
        .insert({
          team_id: selectedTeam.id,
          player_id: user.id,
          role: 'player'
        });

      if (joinError) throw joinError;

      toast.success(`Successfully joined ${selectedTeam.team_name}!`);
      setShowJoinForm(false);
      setJoinForm({ teamId: '', password: '' });
      setSelectedTeam(null);
      loadTeams();
      checkUserTeam();

    } catch (error: any) {
      console.error('Error joining team:', error);
      toast.error('Failed to join team: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleLeaveTeam = async () => {
    if (!user || !userTeam) return;

    if (userTeam.owner_id === user.id) {
      toast.error('Team owners cannot leave. Transfer ownership or disband the team.');
      return;
    }

    const confirmed = confirm('Are you sure you want to leave this team?');
    if (!confirmed) return;

    try {
      const { error } = await supabase
        .from('tt_team_members')
        .update({ is_active: false })
        .eq('team_id', userTeam.id)
        .eq('player_id', user.id);

      if (error) throw error;

      toast.success('Successfully left the team');
      setUserTeam(null);
      setTeamMembers([]);
      loadTeams();

    } catch (error: any) {
      console.error('Error leaving team:', error);
      toast.error('Failed to leave team: ' + error.message);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    const validTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
    if (!validTypes.includes(file.type)) {
      toast.error('Please upload a valid image file (JPEG, PNG, GIF, WebP)');
      return;
    }

    // Validate file size (5MB max)
    if (file.size > 5 * 1024 * 1024) {
      toast.error('File size must be less than 5MB');
      return;
    }

    setCreateForm({ ...createForm, bannerFile: file });
  };

  if (authLoading) {
    return (
      <div className="min-h-screen bg-black text-white">
        <div className="flex items-center justify-center pt-20">
          <div className="text-xl animate-pulse">Loading...</div>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-black text-white">
        {/* Custom Triple Threat Header */}
        <header className="fixed top-0 left-0 right-0 z-50 bg-black/80 backdrop-blur-md border-b border-cyan-500/30">
          <div className="max-w-6xl mx-auto px-6 py-4">
            <div className="flex items-center justify-between">
              <Link href="/triple-threat" className="flex items-center space-x-3 hover:opacity-80 transition-opacity">
                <div className="text-2xl font-black bg-gradient-to-r from-cyan-400 to-purple-400 bg-clip-text text-transparent">
                  TRIPLE THREAT
                </div>
              </Link>
              <nav className="flex items-center space-x-6">
                <Link href="/triple-threat" className="text-gray-300 hover:text-white transition-colors">
                  Home
                </Link>
                <Link href="/triple-threat/rules" className="text-gray-300 hover:text-white transition-colors">
                  Rules
                </Link>
                <Link href="/triple-threat/signup" className="text-cyan-300 hover:text-cyan-100 transition-colors font-medium">
                  Teams
                </Link>
                <Link href="/triple-threat/matches" className="text-gray-300 hover:text-white transition-colors">
                  Matches
                </Link>
                <Link href="/" className="bg-gradient-to-r from-cyan-600 to-purple-600 hover:from-cyan-500 hover:to-purple-500 px-4 py-2 rounded-lg transition-all text-sm font-medium">
                  ← Back to CTFPL
                </Link>
              </nav>
            </div>
          </div>
        </header>
        <div className="max-w-4xl mx-auto px-6 pt-20">
          <div className="text-center py-20">
            <h1 className="text-4xl font-bold mb-4">Please Sign In</h1>
            <p className="text-gray-400 mb-8">You need to be logged in to create or join a Triple Threat team.</p>
            <Link href="/auth/login" className="bg-blue-600 hover:bg-blue-700 px-6 py-3 rounded-lg transition-colors">
              Sign In
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black text-white relative overflow-hidden">
      
      {/* Custom Triple Threat Header */}
      <header className="fixed top-0 left-0 right-0 z-50 bg-black/80 backdrop-blur-md border-b border-cyan-500/30">
        <div className="max-w-6xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <Link href="/triple-threat" className="flex items-center space-x-3 hover:opacity-80 transition-opacity">
              <div className="text-2xl font-black bg-gradient-to-r from-cyan-400 to-purple-400 bg-clip-text text-transparent">
                TRIPLE THREAT
              </div>
            </Link>
            <nav className="flex items-center space-x-6">
              <Link href="/triple-threat" className="text-gray-300 hover:text-white transition-colors">
                Home
              </Link>
              <Link href="/triple-threat/rules" className="text-gray-300 hover:text-white transition-colors">
                Rules
              </Link>
              <Link href="/triple-threat/signup" className="text-cyan-300 hover:text-cyan-100 transition-colors font-medium">
                Teams
              </Link>
              <Link href="/triple-threat/matches" className="text-gray-300 hover:text-white transition-colors">
                Matches
              </Link>
              <Link href="/" className="bg-gradient-to-r from-cyan-600 to-purple-600 hover:from-cyan-500 hover:to-purple-500 px-4 py-2 rounded-lg transition-all text-sm font-medium">
                ← Back to CTFPL
              </Link>
            </nav>
          </div>
        </div>
      </header>
      
      {/* Animated Background */}
      <div className="fixed inset-0 opacity-20">
        <div className="absolute inset-0 bg-gradient-to-br from-cyan-900/20 via-purple-900/20 to-pink-900/20"></div>
        <div className="absolute top-0 left-0 w-full h-full">
          {[...Array(40)].map((_, i) => (
            <div
              key={i}
              className="absolute bg-purple-400/10 rounded-full animate-pulse"
              style={{
                left: `${Math.random() * 100}%`,
                top: `${Math.random() * 100}%`,
                width: `${Math.random() * 3 + 1}px`,
                height: `${Math.random() * 3 + 1}px`,
                animationDelay: `${Math.random() * 3}s`,
                animationDuration: `${Math.random() * 4 + 3}s`
              }}
            />
          ))}
        </div>
      </div>

      {/* Header */}
      <div className="relative pt-20 pb-12 z-10">
        <div className="max-w-4xl mx-auto px-6 text-center">
          <h1 className="text-6xl font-black mb-6 bg-gradient-to-r from-purple-400 via-cyan-400 to-pink-400 bg-clip-text text-transparent drop-shadow-2xl">
            TEAM SIGNUP
          </h1>
          <div className="bg-gradient-to-r from-purple-500/10 to-cyan-500/10 backdrop-blur-sm border border-purple-500/30 rounded-2xl p-6">
            <p className="text-xl text-purple-100">
              Create or join a team to compete in Triple Threat tournaments
            </p>
          </div>
        </div>
      </div>



      <div className="max-w-6xl mx-auto px-6 pb-20 relative z-10">
        
        {/* User's Current Team */}
        {userTeam && (
          <div className="bg-green-800/20 border border-green-500/30 rounded-xl p-6 mb-8">
            <h2 className="text-2xl font-bold text-green-400 mb-4 flex items-center">
              <span className="mr-3">✅</span>
              Your Team: {userTeam.team_name}
            </h2>
            
            {userTeam.team_banner_url && (
              <div className="mb-4">
                <img 
                  src={userTeam.team_banner_url} 
                  alt={`${userTeam.team_name} banner`}
                  className="w-full max-w-md max-h-40 object-contain rounded-lg border border-cyan-400/30"
                />
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <p className="text-gray-300 mb-2">
                  <strong>Owner:</strong> {userTeam.owner_alias}
                </p>
                <p className="text-gray-300 mb-2">
                  <strong>Created:</strong> {new Date(userTeam.created_at).toLocaleDateString()}
                </p>
                <p className="text-gray-300">
                  <strong>Members:</strong> {teamMembers.length} / {userTeam.max_players}
                </p>
              </div>

              <div>
                <h3 className="text-lg font-semibold text-white mb-2">Team Members</h3>
                <div className="space-y-2">
                  {teamMembers.map((member) => (
                    <div key={member.id} className="flex items-center space-x-3">
                      {member.player_avatar && (
                        <img 
                          src={member.player_avatar} 
                          alt={member.player_alias}
                          className="w-8 h-8 rounded-full"
                        />
                      )}
                      <span className="text-gray-300">
                        {member.player_alias}
                        {member.role === 'owner' && (
                          <span className="text-yellow-400 ml-2 text-sm">(Owner)</span>
                        )}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {userTeam.owner_id !== user.id && (
              <div className="mt-6">
                <button
                  onClick={handleLeaveTeam}
                  className="bg-red-600 hover:bg-red-700 px-4 py-2 rounded-lg transition-colors"
                >
                  Leave Team
                </button>
              </div>
            )}
          </div>
        )}

        {/* Team Actions (only show if user is not on a team) */}
        {!userTeam && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-12">
            <button
              onClick={() => setShowCreateForm(true)}
              className="bg-gradient-to-br from-purple-600/20 to-blue-600/20 border border-purple-500/30 rounded-xl p-8 hover:scale-105 transition-all duration-300 hover:border-purple-400/50"
            >
              <div className="text-center">
                <div className="text-4xl mb-4">🆕</div>
                <h3 className="text-xl font-bold text-purple-400 mb-2">Create New Team</h3>
                <p className="text-gray-300 text-sm">
                  Start your own pod with a unique name and password protection
                </p>
              </div>
            </button>

            <button
              onClick={() => setShowJoinForm(true)}
              className="bg-gradient-to-br from-blue-600/20 to-cyan-600/20 border border-blue-500/30 rounded-xl p-8 hover:scale-105 transition-all duration-300 hover:border-blue-400/50"
            >
              <div className="text-center">
                <div className="text-4xl mb-4">🤝</div>
                <h3 className="text-xl font-bold text-blue-400 mb-2">Join Existing Team</h3>
                <p className="text-gray-300 text-sm">
                  Join a team that has space and you know the password
                </p>
              </div>
            </button>
          </div>
        )}

        {/* Create Team Form */}
        {showCreateForm && (
          <div className="bg-gray-800/50 border border-gray-700/50 rounded-xl p-8 mb-8">
            <h2 className="text-2xl font-bold text-purple-400 mb-6">Create New Team</h2>
            <form onSubmit={handleCreateTeam} className="space-y-6">
              <div>
                <label className="block text-sm font-medium mb-2">Team Name</label>
                <input
                  type="text"
                  value={createForm.teamName}
                  onChange={(e) => setCreateForm({ ...createForm, teamName: e.target.value })}
                  className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                  placeholder="Enter team name (3-50 characters)"
                  minLength={3}
                  maxLength={50}
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">Team Password</label>
                <input
                  type="password"
                  value={createForm.teamPassword}
                  onChange={(e) => setCreateForm({ ...createForm, teamPassword: e.target.value })}
                  className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                  placeholder="Enter team password (minimum 6 characters)"
                  minLength={6}
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">Confirm Password</label>
                <input
                  type="password"
                  value={createForm.confirmPassword}
                  onChange={(e) => setCreateForm({ ...createForm, confirmPassword: e.target.value })}
                  className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                  placeholder="Confirm team password"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">Team Banner (Optional)</label>
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleFileChange}
                  className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                />
                {createForm.bannerFile && (
                  <p className="mt-2 text-sm text-green-400">
                    📁 {createForm.bannerFile.name}
                  </p>
                )}
                <p className="text-xs text-gray-400 mt-1">
                  Max 5MB. Supports: JPG, PNG, GIF, WebP
                </p>
              </div>

              <div className="flex gap-4">
                <button
                  type="submit"
                  disabled={loading || uploading}
                  className="bg-purple-600 hover:bg-purple-700 disabled:bg-gray-600 px-6 py-2 rounded-lg transition-colors"
                >
                  {loading ? 'Creating...' : 'Create Team'}
                </button>
                <button
                  type="button"
                  onClick={() => setShowCreateForm(false)}
                  className="bg-gray-600 hover:bg-gray-700 px-6 py-2 rounded-lg transition-colors"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Join Team Form */}
        {showJoinForm && (
          <div className="bg-gray-800/50 border border-gray-700/50 rounded-xl p-8 mb-8">
            <h2 className="text-2xl font-bold text-blue-400 mb-6">Join Existing Team</h2>
            <form onSubmit={handleJoinTeam} className="space-y-6">
              <div>
                <label className="block text-sm font-medium mb-2">Select Team</label>
                <select
                  value={selectedTeam?.id || ''}
                  onChange={(e) => {
                    const team = teams.find(t => t.id === e.target.value);
                    setSelectedTeam(team || null);
                  }}
                  className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  required
                >
                  <option value="">Choose a team...</option>
                  {teams.filter(team => team.member_count < team.max_players).map((team) => (
                    <option key={team.id} value={team.id}>
                      {team.team_name} ({team.member_count}/{team.max_players} members)
                    </option>
                  ))}
                </select>
              </div>

              {selectedTeam && (
                <div>
                  <label className="block text-sm font-medium mb-2">Team Password</label>
                  <input
                    type="password"
                    value={joinForm.password}
                    onChange={(e) => setJoinForm({ ...joinForm, password: e.target.value })}
                    className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="Enter team password"
                    required
                  />
                </div>
              )}

              <div className="flex gap-4">
                <button
                  type="submit"
                  disabled={loading || !selectedTeam}
                  className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 px-6 py-2 rounded-lg transition-colors"
                >
                  {loading ? 'Joining...' : 'Join Team'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowJoinForm(false);
                    setSelectedTeam(null);
                    setJoinForm({ teamId: '', password: '' });
                  }}
                  className="bg-gray-600 hover:bg-gray-700 px-6 py-2 rounded-lg transition-colors"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Available Teams */}
        <div className="bg-gray-800/50 border border-gray-700/50 rounded-xl p-8">
          <h2 className="text-2xl font-bold text-white mb-6">Available Teams</h2>
          
          {loading ? (
            <div className="text-center py-8">
              <div className="animate-pulse text-cyan-400">Loading teams...</div>
            </div>
          ) : teams.length === 0 ? (
            <div className="text-center py-12">
              <div className="text-6xl mb-4">🚀</div>
              <h3 className="text-xl font-bold text-gray-400 mb-2">No Teams Yet</h3>
              <p className="text-gray-500">Be the first to create a Triple Threat team!</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {teams.map((team) => (
                <div key={team.id} className="group relative aspect-square rounded-2xl overflow-hidden cursor-pointer bg-gradient-to-br from-gray-800 to-gray-900 border border-gray-600/30 hover:border-cyan-400/50 transition-all duration-300 hover:scale-105 hover:shadow-2xl hover:shadow-cyan-500/20">
                  
                  {/* Background Image */}
                  <div className="absolute inset-0">
                    {team.team_banner_url ? (
                      <img 
                        src={team.team_banner_url} 
                        alt={`${team.team_name} banner`}
                        className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
                      />
                    ) : (
                      <div className="w-full h-full bg-gradient-to-br from-cyan-500/20 via-purple-500/20 to-pink-500/20 flex items-center justify-center">
                        <div className="text-6xl opacity-30">🛡️</div>
                      </div>
                    )}
                  </div>
                  
                  {/* Overlay */}
                  <div className="absolute inset-0 bg-black/20 group-hover:bg-black/70 transition-colors duration-300" />
                  
                  {/* Team Status Badge */}
                  <div className="absolute top-3 right-3">
                    {team.member_count >= team.max_players ? (
                      <div className="bg-red-500/80 backdrop-blur-sm px-2 py-1 rounded-full text-xs font-medium text-white">
                        FULL
                      </div>
                    ) : (
                      <div className="bg-green-500/80 backdrop-blur-sm px-2 py-1 rounded-full text-xs font-medium text-white">
                        OPEN
                      </div>
                    )}
                  </div>
                  
                  {/* Team Info - Hidden by default, shown on hover */}
                  <div className="absolute inset-0 p-4 flex flex-col justify-end">
                    <div className="translate-y-6 opacity-0 group-hover:opacity-100 group-hover:translate-y-0 transition-all duration-300">
                      
                      {/* Team Name */}
                      <h3 className="text-white text-xl font-bold mb-2 drop-shadow-lg">
                        {team.team_name}
                      </h3>
                      
                      {/* Owner */}
                      <div className="flex items-center text-cyan-300 text-sm mb-2">
                        <span className="mr-1">👑</span>
                        <span className="font-medium">{team.owner_alias}</span>
                      </div>
                      
                      {/* Members */}
                      <div className="flex items-center justify-between text-gray-200 text-sm mb-3">
                        <div className="flex items-center">
                          <span className="mr-1">👥</span>
                          <span>{team.member_count} / {team.max_players} members</span>
                        </div>
                        <div className="text-xs text-gray-400">
                          {new Date(team.created_at).toLocaleDateString()}
                        </div>
                      </div>
                      
                      {/* Join Button */}
                      {team.member_count < team.max_players && (
                        <button 
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedTeam(team);
                            setShowJoinForm(true);
                          }}
                          className="w-full bg-gradient-to-r from-cyan-600 to-purple-600 hover:from-cyan-500 hover:to-purple-500 text-white font-medium py-2 px-4 rounded-lg transition-all duration-200 text-sm"
                        >
                          Join Team
                        </button>
                      )}
                    </div>
                  </div>
                  
                  {/* Always visible team name at bottom for reference */}
                  <div className="absolute bottom-3 left-3 right-3 group-hover:opacity-0 transition-opacity duration-300">
                    <h4 className="text-white font-semibold text-sm drop-shadow-lg truncate">
                      {team.team_name}
                    </h4>
                    <p className="text-gray-300 text-xs">
                      {team.member_count}/{team.max_players} members
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
