'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useAuth } from '@/lib/AuthContext';
import { supabase } from '@/lib/supabase';
import { toast } from 'react-hot-toast';
import TripleThreatBackground from '@/components/TripleThreatBackground';
import TripleThreatHeader, { Team as HeaderTeam, TeamMember as HeaderTeamMember } from '@/components/TripleThreatHeader';

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

export default function TripleThreatTeamsPage() {
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
      
      // Try RPC first, fallback to direct query
      let teamsData = null;
      
      try {
        const { data: rpcData, error: rpcError } = await supabase.rpc('get_tt_teams_with_counts');
        if (rpcError) throw rpcError;
        teamsData = rpcData;
        console.log('Teams loaded via RPC:', teamsData);
      } catch (rpcError) {
        console.log('RPC failed, using direct query:', rpcError);
        
        // Fallback to direct query with member counts
        const { data: directData, error: directError } = await supabase
          .from('tt_teams')
          .select(`
            id, 
            team_name, 
            team_banner_url, 
            owner_id, 
            created_at, 
            max_players,
            is_active,
            profiles!tt_teams_owner_id_fkey (in_game_alias),
            tt_team_members!inner (count)
          `)
          .eq('is_active', true)
          .eq('tt_team_members.is_active', true)
          .order('created_at', { ascending: false });
          
        if (directError) throw directError;
        
        // Get member counts separately for each team
        const teamsWithCounts = await Promise.all(
          (directData || []).map(async (team: any) => {
            const { count, error: countError } = await supabase
              .from('tt_team_members')
              .select('*', { count: 'exact', head: true })
              .eq('team_id', team.id)
              .eq('is_active', true);
              
            return {
              id: team.id,
              team_name: team.team_name,
              team_banner_url: team.team_banner_url,
              owner_id: team.owner_id,
              owner_alias: team.profiles?.in_game_alias || 'Unknown',
              created_at: team.created_at,
              member_count: count || 0,
              max_players: team.max_players
            };
          })
        );
        
        teamsData = teamsWithCounts;
        console.log('Teams loaded via direct query:', teamsData);
      }
      
      setTeams(teamsData || []);
      
    } catch (error) {
      console.error('Error loading teams:', error);
      setTeams([]);
    } finally {
      setLoading(false);
    }
  };

  const checkUserTeam = async () => {
    if (!user) return;

    try {
      console.log('Checking user team for user:', user.id);
      
      // Try RPC first, fallback to direct query
      try {
        const { data, error } = await supabase.rpc('get_user_tt_team', { user_id_input: user.id });
        
        if (error) throw error;

        if (data && data.length > 0) {
          const teamData = data[0];
          setUserTeam({
            id: teamData.team_id,
            team_name: teamData.team_name,
            team_banner_url: teamData.team_banner_url,
            owner_id: teamData.owner_id,
            owner_alias: teamData.owner_alias,
            created_at: teamData.created_at,
            member_count: 0,
            max_players: teamData.max_players
          });
          loadTeamMembers(teamData.team_id);
        }
      } catch (rpcError) {
        console.log('RPC failed, using direct query for user team:', rpcError);
        
        // Fallback to direct query
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
      }
    } catch (error) {
      console.log('Error checking user team:', error);
    }
  };

  const loadTeamMembers = async (teamId: string) => {
    try {
      // Try RPC first, fallback to direct query
      try {
        const { data, error } = await supabase.rpc('get_tt_team_members', { team_id_input: teamId });
        if (error) throw error;
        setTeamMembers(data || []);
      } catch (rpcError) {
        console.log('RPC failed for team members, using direct query:', rpcError);
        
        // Fallback to direct query
        const { data, error } = await supabase
          .from('tt_team_members')
          .select(`
            id, 
            player_id, 
            joined_at, 
            role,
            profiles!tt_team_members_player_id_fkey (in_game_alias, avatar_url)
          `)
          .eq('team_id', teamId)
          .eq('is_active', true)
          .order('joined_at', { ascending: true });

        if (error) throw error;

        const formattedMembers = (data || []).map((member: any) => ({
          id: member.id,
          player_id: member.player_id,
          player_alias: member.profiles?.in_game_alias || 'Unknown',
          player_avatar: member.profiles?.avatar_url,
          joined_at: member.joined_at,
          role: member.role
        }));
        
        setTeamMembers(formattedMembers);
      }
    } catch (error) {
      console.error('Error loading team members:', error);
    }
  };

  const loadTeamMembersForHover = async (teamId: string) => {
    if (hoveredTeamMembers[teamId]) return;
    
    try {
      // Try RPC first, fallback to direct query
      try {
        const { data, error } = await supabase.rpc('get_tt_team_members', { team_id_input: teamId });
        if (error) throw error;
        setHoveredTeamMembers(prev => ({
          ...prev,
          [teamId]: data || []
        }));
      } catch (rpcError) {
        console.log('RPC failed for hover team members, using direct query:', rpcError);
        
        // Fallback to direct query
        const { data, error } = await supabase
          .from('tt_team_members')
          .select(`
            id, 
            player_id, 
            joined_at, 
            role,
            profiles!tt_team_members_player_id_fkey (in_game_alias, avatar_url)
          `)
          .eq('team_id', teamId)
          .eq('is_active', true)
          .order('joined_at', { ascending: true });

        if (error) throw error;

        const formattedMembers = (data || []).map((member: any) => ({
          id: member.id,
          player_id: member.player_id,
          player_alias: member.profiles?.in_game_alias || 'Unknown',
          player_avatar: member.profiles?.avatar_url,
          joined_at: member.joined_at,
          role: member.role
        }));
        
        setHoveredTeamMembers(prev => ({
          ...prev,
          [teamId]: formattedMembers
        }));
      }
    } catch (error) {
      console.error('Error loading team members for hover:', error);
    }
  };

  const handleCreateChallenge = async (opponentTeamId: string) => {
    if (!user || !userTeam) {
      toast.error('You must be on a team to create challenges');
      return;
    }

    console.log('Creating challenge:', { userTeam: userTeam.id, opponent: opponentTeamId, user: user.id });
    toast.loading('Sending challenge...', { id: 'challenge' });

    try {
      // Try RPC first, fallback to direct insert
      try {
        const { data, error } = await supabase.rpc('create_tt_challenge', {
          challenger_team_id_input: userTeam.id,
          challenged_team_id_input: opponentTeamId,
          created_by_input: user.id,
          message_input: null,
          match_type_input: 'friendly'
        });

        console.log('RPC response:', { data, error });

        if (error) throw error;
        
        if (data) {
          if (data.success) {
            toast.success(data.message || 'Challenge sent successfully!', { id: 'challenge' });
          } else {
            toast.error(data.error || 'Failed to create challenge', { id: 'challenge' });
          }
        } else {
          toast.error('Unexpected response from server', { id: 'challenge' });
        }
      } catch (rpcError) {
        console.log('RPC failed for challenge creation, using direct insert:', rpcError);
        
        // Fallback to direct insert
        // First check if a challenge already exists between these teams
        const { data: existingChallenge, error: checkError } = await supabase
          .from('tt_challenges')
          .select('id, status')
          .or(`and(challenger_team_id.eq.${userTeam.id},challenged_team_id.eq.${opponentTeamId}),and(challenger_team_id.eq.${opponentTeamId},challenged_team_id.eq.${userTeam.id})`)
          .eq('status', 'pending')
          .limit(1);

        if (checkError) throw checkError;

        if (existingChallenge && existingChallenge.length > 0) {
          toast.error('A pending challenge already exists between these teams!', { id: 'challenge' });
          return;
        }

        const { error } = await supabase
          .from('tt_challenges')
          .insert({
            challenger_team_id: userTeam.id,
            challenged_team_id: opponentTeamId,
            created_by: user.id,
            match_type: 'friendly',
            status: 'pending',
            created_at: new Date().toISOString(),
            expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString() // 7 days from now
          });

        if (error) {
          console.error('Direct insert error:', error);
          toast.error('Failed to create challenge', { id: 'challenge' });
          throw error;
        }
        
        toast.success('Challenge sent successfully! The other team can accept or decline it.', { id: 'challenge' });
      }
    } catch (error) {
      console.error('Error creating challenge:', error);
      toast.error('Failed to create challenge request', { id: 'challenge' });
    }
  };

  const handleJoinTeam = async (teamId: string, password: string) => {
    if (!user) {
      toast.error('You must be logged in to join a team');
      return;
    }

    setUploading(true);
    toast.loading('Joining team...', { id: 'join-team' });

    try {
      const { data, error } = await supabase.rpc('join_tt_team', {
        team_id_input: teamId,
        user_id_input: user.id,
        password_input: password
      });

      if (error) throw error;

      if (data) {
        if (data.success) {
          toast.success(data.message || 'Successfully joined team!', { id: 'join-team' });
          setShowJoinForm(false);
          setJoinForm({ teamId: '', password: '' });
          // Reload everything to update counts and team status
          await Promise.all([
            checkUserTeam(),
            loadTeams()
          ]);
        } else {
          toast.error(data.error || 'Failed to join team', { id: 'join-team' });
        }
      } else {
        toast.error('Unexpected response from server', { id: 'join-team' });
      }
    } catch (error: any) {
      console.error('Error joining team:', error);
      toast.error('Failed to join team: ' + error.message, { id: 'join-team' });
    } finally {
      setUploading(false);
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

    setUploading(true);
    toast.loading('Creating team...', { id: 'create-team' });

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

      toast.success('Team created successfully!', { id: 'create-team' });
      setShowCreateForm(false);
      setCreateForm({ teamName: '', teamPassword: '', confirmPassword: '', bannerFile: null });
      // Reload everything to ensure new team appears and user status updates
      await Promise.all([
        loadTeams(),
        checkUserTeam()
      ]);

    } catch (error: any) {
      console.error('Error creating team:', error);
      if (error.code === '23505') {
        toast.error('Team name already exists', { id: 'create-team' });
      } else {
        toast.error('Failed to create team: ' + error.message, { id: 'create-team' });
      }
    } finally {
      setUploading(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 5 * 1024 * 1024) {
        toast.error('File size must be less than 5MB');
        return;
      }
      setCreateForm({ ...createForm, bannerFile: file });
    }
  };

  const handleLeaveTeam = async () => {
    if (!user || !userTeam) return;

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
          // Reload teams to update member counts
          await loadTeams();
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

  const handleDisbandTeam = async (teamId: string, teamName: string) => {
    const confirmed = confirm(`Are you sure you want to disband "${teamName}"? This action cannot be undone and will remove all members from the team.`);
    if (!confirmed) return;

    toast.loading('Disbanding team...', { id: 'disband-team' });

    try {
      const { data, error } = await supabase.rpc('tt_disband_team', {
        user_id_input: user.id
      });

      if (error) throw error;

      if (data) {
        if (data.success) {
          toast.success(data.message || 'Team disbanded successfully!', { id: 'disband-team' });
          setUserTeam(null);
          setTeamMembers([]);
          // Reload teams to update the list and remove disbanded team
          await loadTeams();
        } else {
          toast.error(data.error || 'Failed to disband team', { id: 'disband-team' });
        }
      } else {
        toast.error('Unexpected response from server', { id: 'disband-team' });
      }
    } catch (error: any) {
      console.error('Error disbanding team:', error);
      toast.error('Failed to disband team: ' + error.message, { id: 'disband-team' });
    }
  };

  const handleLeaveTeamFromHover = async (teamId: string, teamName: string) => {
    const confirmed = confirm(`Are you sure you want to leave "${teamName}"?`);
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
          // Reload teams to update member counts
          await loadTeams();
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
        <TripleThreatHeader 
          currentPage="teams" 
          showTeamStatus={false}
        />
        <div className="max-w-4xl mx-auto px-6 pt-20">
          <div className="text-center py-20">
            <h1 className="text-4xl font-bold mb-4">Please Sign In</h1>
            <p className="text-gray-400 mb-8">You need to be logged in to view and join Triple Threat teams.</p>
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
      <TripleThreatHeader 
        currentPage="teams" 
        showTeamStatus={true}
        onTeamLoaded={(team, members) => {
          if (team) {
            setUserTeam({
              id: team.id,
              team_name: team.team_name,
              team_banner_url: team.team_banner_url,
              owner_id: team.owner_id,
              owner_alias: team.owner_alias,
              created_at: team.created_at,
              member_count: team.member_count,
              max_players: team.max_players
            });
          } else {
            setUserTeam(null);
          }
          setTeamMembers(members.map(m => ({
            id: m.id,
            player_id: m.player_id,
            player_alias: m.player_alias,
            player_avatar: m.player_avatar,
            joined_at: m.joined_at,
            role: m.role
          })));
        }}
      />
      
      {/* Header */}
      <div className="relative pt-20 pb-12 z-10">
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-purple-500/8 to-transparent"></div>
        <div className="max-w-4xl mx-auto px-6 text-center">
          <h1 className="text-6xl font-black mb-6 bg-gradient-to-r from-cyan-300 via-purple-300 to-pink-300 bg-clip-text text-transparent drop-shadow-2xl">
            TEAMS
          </h1>
          <div className="bg-gradient-to-r from-cyan-400/15 via-purple-500/15 to-pink-400/15 backdrop-blur-sm border border-purple-400/40 rounded-2xl p-6 shadow-2xl shadow-purple-500/20">
            <p className="text-xl text-white/90">
              Join or create a team to compete in Triple Threat tournaments
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
                {userTeam.team_banner_url && (
                  <img 
                    src={userTeam.team_banner_url} 
                    alt={`${userTeam.team_name} banner`}
                    className="w-12 h-12 object-cover rounded-lg border border-cyan-400/30 flex-shrink-0"
                  />
                )}
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
                <Link 
                  href="/triple-threat/matches"
                  className="bg-purple-600/40 hover:bg-purple-600/60 border border-purple-400/60 px-3 py-1.5 rounded-lg text-sm transition-colors text-white font-medium backdrop-blur-sm"
                >
                  ⚔️ Matches
                </Link>
                {userTeam.owner_id === user.id ? (
                  <button
                    onClick={() => handleDisbandTeam(userTeam.id, userTeam.team_name)}
                    className="bg-red-600/40 hover:bg-red-600/60 border border-red-400/60 px-3 py-1.5 rounded-lg text-sm transition-colors text-white font-medium backdrop-blur-sm"
                  >
                    🗑️ Disband
                  </button>
                ) : (
                  <button
                    onClick={handleLeaveTeam}
                    className="bg-red-600/40 hover:bg-red-600/60 border border-red-400/60 px-3 py-1.5 rounded-lg text-sm transition-colors text-white font-medium backdrop-blur-sm"
                  >
                    🚪 Leave
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
                  Start your own squad with a unique name and password protection
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

        {/* Teams Grid */}
        <div className="mb-8">
          <h2 className="text-3xl font-bold text-white mb-6">All Teams</h2>
          {loading ? (
            <div className="text-center py-12">
              <div className="text-xl animate-pulse text-white">Loading teams...</div>
            </div>
          ) : teams.length === 0 ? (
            <div className="text-center py-12">
              <h3 className="text-xl font-bold text-gray-400 mb-2">No Teams Yet</h3>
              <p className="text-gray-500">Be the first to create a Triple Threat team!</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {teams.map((team) => (
                <div 
                  key={team.id} 
                  className="group relative aspect-square rounded-2xl overflow-hidden cursor-pointer bg-gradient-to-br from-gray-800 to-gray-900 border border-gray-600/30 hover:border-cyan-400/50 transition-all duration-300 hover:scale-105 hover:shadow-2xl hover:shadow-cyan-500/20"
                  onMouseEnter={() => loadTeamMembersForHover(team.id)}
                  onClick={() => console.log('Card clicked. Team id:', team.id)}
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
                  <div className="absolute inset-0 p-4 flex flex-col justify-end relative z-20">
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
                      
                      {/* Action Buttons */}
                      <div className="flex gap-2">
                        {/* Join Button (only if user is not on a team and team is not full) */}
                        {!userTeam && team.member_count < team.max_players && (
                          <button 
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedTeam(team);
                              setShowJoinForm(true);
                            }}
                            className="flex-1 bg-gradient-to-r from-cyan-600/80 to-purple-600/80 hover:from-cyan-500/80 hover:to-purple-500/80 text-white font-medium py-2 px-4 rounded-lg transition-all duration-200 text-sm backdrop-blur-sm"
                          >
                            Join Team
                          </button>
                        )}
                        
                        {/* Challenge Button (only if user is on a different team) */}
                        {userTeam && userTeam.id !== team.id && (
                          <button 
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              console.log('Challenge button clicked for team:', team.id);
                              handleCreateChallenge(team.id);
                            }}
                            className="flex-1 bg-gradient-to-r from-purple-600/80 to-pink-600/80 hover:from-purple-500/80 hover:to-pink-500/80 text-white font-medium py-2 px-4 rounded-lg transition-all duration-200 text-sm backdrop-blur-sm relative z-30"
                          >
                            ⚔️ Challenge
                          </button>
                        )}

                        {/* Leave/Disband Button (only if user is on this team) */}
                        {userTeam && userTeam.id === team.id && (
                          <>
                            {userTeam.owner_id === user.id ? (
                              <button 
                                onClick={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  handleDisbandTeam(team.id, team.team_name);
                                }}
                                className="flex-1 bg-gradient-to-r from-red-600/80 to-red-700/80 hover:from-red-500/80 hover:to-red-600/80 text-white font-medium py-2 px-4 rounded-lg transition-all duration-200 text-sm backdrop-blur-sm relative z-30"
                              >
                                🗑️ Disband Team
                              </button>
                            ) : (
                              <button 
                                onClick={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  handleLeaveTeamFromHover(team.id, team.team_name);
                                }}
                                className="flex-1 bg-gradient-to-r from-orange-600/80 to-red-600/80 hover:from-orange-500/80 hover:to-red-500/80 text-white font-medium py-2 px-4 rounded-lg transition-all duration-200 text-sm backdrop-blur-sm relative z-30"
                              >
                                🚪 Leave Team
                              </button>
                            )}
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                  
                  {/* Always visible team name at bottom for reference */}
                  <div className="absolute bottom-3 left-3 right-3 group-hover:opacity-0 transition-opacity duration-300 pointer-events-none z-10">
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

      {/* Join Team Modal */}
      {showJoinForm && (
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
        <div className="bg-gradient-to-br from-gray-900 to-gray-800 border border-gray-600/50 rounded-2xl p-6 w-full max-w-md">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-xl font-bold text-white">
              {selectedTeam ? `Join ${selectedTeam.team_name}` : 'Join Team'}
            </h3>
            <button
              onClick={() => {
                setShowJoinForm(false);
                setSelectedTeam(null);
                setJoinForm({ teamId: '', password: '' });
              }}
              className="text-gray-400 hover:text-white transition-colors"
            >
              ✕
            </button>
          </div>

          <form onSubmit={(e) => {
            e.preventDefault();
            if (selectedTeam) {
              handleJoinTeam(selectedTeam.id, joinForm.password);
            }
          }}>
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Team Password
              </label>
              <input
                type="password"
                value={joinForm.password}
                onChange={(e) => setJoinForm({ ...joinForm, password: e.target.value })}
                className="w-full px-3 py-2 bg-gray-800/50 border border-gray-600/50 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:border-cyan-400 transition-colors"
                placeholder="Enter team password"
                required
              />
            </div>

            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => {
                  setShowJoinForm(false);
                  setSelectedTeam(null);
                  setJoinForm({ teamId: '', password: '' });
                }}
                className="flex-1 py-2 px-4 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={uploading || !joinForm.password.trim()}
                className="flex-1 py-2 px-4 bg-gradient-to-r from-cyan-600 to-purple-600 hover:from-cyan-500 hover:to-purple-500 text-white rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {uploading ? 'Joining...' : 'Join Team'}
              </button>
            </div>
          </form>
        </div>
      </div>
      )}

      {/* Create Team Modal */}
      {showCreateForm && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-gradient-to-br from-gray-900 to-gray-800 border border-gray-600/50 rounded-2xl p-6 w-full max-w-md">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-xl font-bold text-white">Create New Team</h3>
              <button
                onClick={() => {
                  setShowCreateForm(false);
                  setCreateForm({ teamName: '', teamPassword: '', confirmPassword: '', bannerFile: null });
                }}
                className="text-gray-400 hover:text-white transition-colors"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateTeam} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Team Name
                </label>
                <input
                  type="text"
                  value={createForm.teamName}
                  onChange={(e) => setCreateForm({ ...createForm, teamName: e.target.value })}
                  className="w-full px-3 py-2 bg-gray-800/50 border border-gray-600/50 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:border-cyan-400 transition-colors"
                  placeholder="Enter team name (3-50 characters)"
                  minLength={3}
                  maxLength={50}
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Team Password
                </label>
                <input
                  type="password"
                  value={createForm.teamPassword}
                  onChange={(e) => setCreateForm({ ...createForm, teamPassword: e.target.value })}
                  className="w-full px-3 py-2 bg-gray-800/50 border border-gray-600/50 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:border-cyan-400 transition-colors"
                  placeholder="Enter team password (minimum 6 characters)"
                  minLength={6}
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Confirm Password
                </label>
                <input
                  type="password"
                  value={createForm.confirmPassword}
                  onChange={(e) => setCreateForm({ ...createForm, confirmPassword: e.target.value })}
                  className="w-full px-3 py-2 bg-gray-800/50 border border-gray-600/50 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:border-cyan-400 transition-colors"
                  placeholder="Confirm team password"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Team Banner (Optional)
                </label>
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleFileChange}
                  className="w-full px-3 py-2 bg-gray-800/50 border border-gray-600/50 rounded-lg text-white file:mr-4 file:py-1 file:px-2 file:rounded file:border-0 file:text-sm file:bg-gray-700 file:text-gray-300 hover:file:bg-gray-600"
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

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowCreateForm(false);
                    setCreateForm({ teamName: '', teamPassword: '', confirmPassword: '', bannerFile: null });
                  }}
                  className="flex-1 py-2 px-4 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={uploading || !createForm.teamName.trim() || !createForm.teamPassword.trim()}
                  className="flex-1 py-2 px-4 bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-500 hover:to-blue-500 text-white rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {uploading ? 'Creating...' : 'Create Team'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </TripleThreatBackground>
  );
}