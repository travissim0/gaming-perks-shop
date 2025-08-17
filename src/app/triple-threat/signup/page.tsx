'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useAuth } from '@/lib/AuthContext';
import { supabase } from '@/lib/supabase';
import { toast } from 'react-hot-toast';
import TripleThreatBackground from '@/components/TripleThreatBackground';

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
  const [hoveredTeamMembers, setHoveredTeamMembers] = useState<{ [teamId: string]: TeamMember[] }>({});

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

  const loadTeamMembersForHover = async (teamId: string) => {
    // Don't reload if we already have the data
    if (hoveredTeamMembers[teamId]) return;
    
    try {
      const { data, error } = await supabase.rpc('get_tt_team_members', { team_id_input: teamId });
      if (error) throw error;
      setHoveredTeamMembers(prev => ({
        ...prev,
        [teamId]: data || []
      }));
    } catch (error) {
      console.error('Error loading team members for hover:', error);
    }
  };

  const handleTeamClick = (teamId: string) => {
    // For now, show team info in a modal or expanded view
    // TODO: Create a dedicated Triple Threat team detail page
    console.log('Clicked team:', teamId);
    // Could expand to show more details or redirect to a team-specific page
    // For now, do nothing since we don't have individual TT team pages yet
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

    toast.loading('Leaving team...', { id: 'leave-team' });

    try {
      const { data, error } = await supabase.rpc('tt_leave_team', {
        user_id_input: user.id
      });

      if (error) throw error;

      if (data) {
        if (data.success) {
          toast.success(data.message || 'Successfully left team!', { id: 'leave-team' });
          setUserTeam(null);
          setTeamMembers([]);
          loadTeams();
        } else {
          toast.error(data.error || 'Failed to leave team', { id: 'leave-team' });
        }
      } else {
        toast.error('Unexpected response from server', { id: 'leave-team' });
      }
    } catch (error: any) {
      console.error('Error leaving team:', error);
      toast.error('Failed to leave team: ' + error.message, { id: 'leave-team' });
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
      <TripleThreatBackground opacity={0.15}>
        <div className="flex items-center justify-center pt-20">
          <div className="text-xl animate-pulse text-white">Loading...</div>
        </div>
      </TripleThreatBackground>
    );
  }

  if (!user) {
    return (
      <TripleThreatBackground opacity={0.18}>
        {/* Custom Triple Threat Header */}
        <header className="fixed top-0 left-0 right-0 z-50 bg-black/85 backdrop-blur-md border-b border-cyan-400/40">
          <div className="max-w-6xl mx-auto px-6 py-4">
            <div className="flex items-center justify-between">
              <Link href="/triple-threat" className="flex items-center space-x-3 hover:opacity-80 transition-opacity">
                <div className="text-2xl font-black bg-gradient-to-r from-cyan-300 via-purple-300 to-pink-300 bg-clip-text text-transparent">
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
                <Link href="/triple-threat/signup" className="text-cyan-200 hover:text-cyan-100 transition-colors font-medium">
                  Teams
                </Link>
                <Link href="/triple-threat/matches" className="text-gray-300 hover:text-white transition-colors">
                  Matches
                </Link>
                <Link href="/" className="bg-gradient-to-r from-cyan-500 via-purple-500 to-pink-500 hover:from-cyan-400 hover:via-purple-400 hover:to-pink-400 px-4 py-2 rounded-lg transition-all text-sm font-medium">
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
            <Link href="/auth/login" className="bg-gradient-to-r from-cyan-500 to-purple-500 hover:from-cyan-400 hover:to-purple-400 px-6 py-3 rounded-lg transition-colors">
              Sign In
            </Link>
          </div>
        </div>
      </TripleThreatBackground>
    );
  }

  return (
    <TripleThreatBackground opacity={0.18}>
      {/* Custom Triple Threat Header */}
      <header className="fixed top-0 left-0 right-0 z-50 bg-black/85 backdrop-blur-md border-b border-cyan-400/40">
        <div className="max-w-6xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <Link href="/triple-threat" className="flex items-center space-x-3 hover:opacity-80 transition-opacity">
              <div className="text-2xl font-black bg-gradient-to-r from-cyan-300 via-purple-300 to-pink-300 bg-clip-text text-transparent">
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
              <Link href="/triple-threat/signup" className="text-cyan-200 hover:text-cyan-100 transition-colors font-medium">
                Teams
              </Link>
              <Link href="/triple-threat/matches" className="text-gray-300 hover:text-white transition-colors">
                Matches
              </Link>
              
              {/* User Avatar with Hover */}
              {user && (
                <div className="relative group">
                  {user.user_metadata?.avatar_url ? (
                    <img
                      src={user.user_metadata.avatar_url}
                      alt={user.user_metadata?.in_game_alias || user.email || 'User'}
                      className="w-9 h-9 rounded-full border-2 border-gray-600 hover:border-cyan-400 transition-colors cursor-pointer"
                    />
                  ) : (
                    <div className="w-9 h-9 rounded-full bg-gradient-to-br from-cyan-500/20 to-purple-500/20 border-2 border-gray-600 hover:border-cyan-400 flex items-center justify-center text-sm font-bold transition-colors cursor-pointer">
                      {(user.user_metadata?.in_game_alias || user.email || 'U')[0].toUpperCase()}
                    </div>
                  )}
                  
                  {/* Hover Tooltip */}
                  <div className="absolute top-full right-0 mt-2 bg-gray-900/95 backdrop-blur-sm border border-gray-600/50 rounded-lg p-3 shadow-xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 min-w-[200px] z-50">
                    <div className="text-sm">
                      <div className="text-white font-medium mb-1">
                        {user.user_metadata?.in_game_alias || 'No Alias Set'}
                      </div>
                      <div className="text-gray-400 text-xs">
                        {user.email}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              <Link href="/" className="bg-gradient-to-r from-cyan-500 via-purple-500 to-pink-500 hover:from-cyan-400 hover:via-purple-400 hover:to-pink-400 px-4 py-2 rounded-lg transition-all text-sm font-medium">
                ← Back to CTFPL
              </Link>
            </nav>
          </div>
        </div>
      </header>
      
      {/* Header */}
      <div className="relative pt-20 pb-12 z-10">
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-purple-500/8 to-transparent"></div>
        <div className="max-w-4xl mx-auto px-6 text-center">
          <h1 className="text-6xl font-black mb-6 bg-gradient-to-r from-cyan-300 via-purple-300 to-pink-300 bg-clip-text text-transparent drop-shadow-2xl">
            TEAM SIGNUP
          </h1>
          <div className="bg-gradient-to-r from-cyan-400/15 via-purple-500/15 to-pink-400/15 backdrop-blur-sm border border-purple-400/40 rounded-2xl p-6 shadow-2xl shadow-purple-500/20">
            <p className="text-xl text-white/90">
              Create or join a team to compete in Triple Threat tournaments
            </p>
          </div>
        </div>
      </div>



      <div className="max-w-6xl mx-auto px-6 pb-20 relative z-10">
        
        {/* User's Current Team - Compact Horizontal Layout */}
        {userTeam && (
          <div className="bg-green-800/20 border border-green-500/30 rounded-xl p-4 mb-6">
            <div className="flex items-center justify-between flex-wrap gap-4">
              {/* Team Info - Left Section */}
              <div className="flex items-center space-x-4 min-w-0 flex-1">
                {/* Team Banner - Small */}
                {userTeam.team_banner_url && (
                  <img 
                    src={userTeam.team_banner_url} 
                    alt={`${userTeam.team_name} banner`}
                    className="w-12 h-12 object-cover rounded-lg border border-cyan-400/30 flex-shrink-0"
                  />
                )}
                
                {/* Team Details */}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center space-x-2 mb-1">
                    <span className="text-green-400 text-lg">✅</span>
                    <h2 className="text-lg font-bold text-green-400 truncate">{userTeam.team_name}</h2>
                  </div>
                  <div className="flex items-center space-x-4 text-xs text-white/90">
                    <span>👑 {userTeam.owner_alias}</span>
                    <span>👥 {teamMembers.length}/{userTeam.max_players}</span>
                    <span className="hidden sm:inline">📅 {new Date(userTeam.created_at).toLocaleDateString()}</span>
                  </div>
                </div>
              </div>

              {/* Team Members - Horizontal List */}
              <div className="flex items-center space-x-2 flex-shrink-0">
                <span className="text-xs text-white/70 hidden sm:inline">Members:</span>
                <div className="flex items-center -space-x-1">
                  {teamMembers.slice(0, 6).map((member, index) => (
                    <div 
                      key={member.id}
                      className="relative group"
                      style={{ zIndex: 10 - index }}
                    >
                      {member.player_avatar ? (
                        <img 
                          src={member.player_avatar} 
                          alt={member.player_alias}
                          className="w-8 h-8 rounded-full border-2 border-gray-700 hover:border-cyan-400 transition-colors"
                        />
                      ) : (
                        <div className="w-8 h-8 rounded-full border-2 border-gray-700 bg-gradient-to-br from-cyan-500/20 to-purple-500/20 flex items-center justify-center text-xs">
                          {member.player_alias.charAt(0).toUpperCase()}
                        </div>
                      )}
                      {/* Tooltip */}
                      <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-2 py-1 bg-gray-900 text-white text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-50">
                        {member.player_alias}
                        {member.role === 'owner' && <span className="text-yellow-400 ml-1">👑</span>}
                      </div>
                    </div>
                  ))}
                  {teamMembers.length > 6 && (
                    <div className="w-8 h-8 rounded-full border-2 border-gray-600 bg-gray-800 flex items-center justify-center text-xs text-white/90">
                      +{teamMembers.length - 6}
                    </div>
                  )}
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center space-x-2 flex-shrink-0">
                <button 
                  onClick={() => console.log('View team details:', userTeam.id)}
                  className="bg-cyan-600/40 hover:bg-cyan-600/60 border border-cyan-400/60 px-3 py-1.5 rounded-lg text-sm transition-colors text-white font-medium backdrop-blur-sm"
                  title="Team details (coming soon)"
                >
                  Team Info
                </button>
                {userTeam.owner_id !== user.id && (
                  <button
                    onClick={handleLeaveTeam}
                    className="bg-red-600/40 hover:bg-red-600/60 border border-red-400/60 px-3 py-1.5 rounded-lg text-sm transition-colors text-white font-medium backdrop-blur-sm"
                  >
                    Leave
                  </button>
                )}
              </div>
            </div>
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
                <p className="text-white/80 text-sm">
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
                <p className="text-white/80 text-sm">
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
                  className="w-full px-3 py-2 bg-gray-800/80 border border-gray-500 rounded-lg focus:ring-2 focus:ring-purple-400 focus:border-purple-400 text-white backdrop-blur-sm"
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
                  className="w-full px-3 py-2 bg-gray-800/80 border border-gray-500 rounded-lg focus:ring-2 focus:ring-purple-400 focus:border-purple-400 text-white backdrop-blur-sm"
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
                  className="w-full px-3 py-2 bg-gray-800/80 border border-gray-500 rounded-lg focus:ring-2 focus:ring-purple-400 focus:border-purple-400 text-white backdrop-blur-sm"
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
                  className="w-full px-3 py-2 bg-gray-800/80 border border-gray-500 rounded-lg focus:ring-2 focus:ring-purple-400 focus:border-purple-400 text-white backdrop-blur-sm"
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
                <div 
                  key={team.id} 
                  className="group relative aspect-square rounded-2xl overflow-hidden cursor-pointer bg-gradient-to-br from-gray-800 to-gray-900 border border-gray-600/30 hover:border-cyan-400/50 transition-all duration-300 hover:scale-105 hover:shadow-2xl hover:shadow-cyan-500/20"
                  onClick={() => handleTeamClick(team.id)}
                  onMouseEnter={() => loadTeamMembersForHover(team.id)}
                >
                  
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

                      {/* Member List on Hover */}
                      {hoveredTeamMembers[team.id] && hoveredTeamMembers[team.id].length > 0 && (
                        <div className="mb-3 max-h-20 overflow-y-auto">
                          <div className="text-xs text-gray-300 mb-1">Members:</div>
                          <div className="space-y-1">
                            {hoveredTeamMembers[team.id].slice(0, 4).map((member) => (
                              <div key={member.id} className="flex items-center space-x-2 text-xs">
                                {member.player_avatar && (
                                  <img 
                                    src={member.player_avatar} 
                                    alt={member.player_alias}
                                    className="w-4 h-4 rounded-full"
                                  />
                                )}
                                <span className="text-gray-300 truncate flex-1">
                                  {member.player_alias}
                                  {member.role === 'owner' && <span className="text-yellow-400 ml-1">👑</span>}
                                </span>
                              </div>
                            ))}
                            {hoveredTeamMembers[team.id].length > 4 && (
                              <div className="text-xs text-gray-400">
                                +{hoveredTeamMembers[team.id].length - 4} more...
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                      
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
    </TripleThreatBackground>
  );
}
