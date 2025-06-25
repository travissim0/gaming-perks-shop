'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/lib/AuthContext';
import { supabase } from '@/lib/supabase';
import Navbar from '@/components/Navbar';
import { toast } from 'react-hot-toast';
import { getFreeAgents, getAllPlayers, checkIfUserInFreeAgentPool } from '@/utils/supabaseHelpers';

interface FreeAgent {
  id: string;
  player_id: string;
  player_alias: string;
  preferred_roles: string[];
  secondary_roles?: string[];
  availability: string;
  availability_days?: string[];
  availability_times?: Record<string, { start: string; end: string }>;
  skill_level: string;
  class_ratings?: Record<string, number>;
  classes_to_try?: string[];
  notes?: string;
  created_at: string;
  contact_info?: string;
  timezone?: string;
}

interface UserProfile {
  id: string;
  in_game_alias: string;
  is_league_banned: boolean;
  hide_from_free_agents?: boolean; // Make optional to handle cases where column doesn't exist yet
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

const CLASS_COLORS = {
  'O INF': 'bg-red-500/20 text-red-300 border-red-500/30',
  'D INF': 'bg-red-500/20 text-red-300 border-red-500/30',
  'O HVY': 'bg-blue-500/20 text-blue-300 border-blue-500/30',
  'D HVY': 'bg-blue-500/20 text-blue-300 border-blue-500/30',
  'Medic': 'bg-yellow-500/20 text-yellow-300 border-yellow-500/30',
  'SL': 'bg-green-500/20 text-green-300 border-green-500/30',
  'Foot JT': 'bg-gray-400/20 text-gray-300 border-gray-400/30',
  'Pack JT': 'bg-gray-400/20 text-gray-300 border-gray-400/30',
  'Engineer': 'bg-amber-600/20 text-amber-300 border-amber-600/30',
  'Infil': 'bg-purple-500/20 text-purple-300 border-purple-500/30'
};

export default function FreeAgentsPage() {
  const { user, loading: authLoading } = useAuth();
  const [freeAgents, setFreeAgents] = useState<FreeAgent[]>([]);
  const [allPlayers, setAllPlayers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [directUser, setDirectUser] = useState<any>(null); // Direct user check bypass
  
  // Handle client-side mounting - only run once
  useEffect(() => {
    console.log('🔄 Mounting effect triggered');
    setMounted(true);
    console.log('✅ Component mounted');
  }, []); // Empty dependency array - only run once

  // Separate effect for auth checking
  useEffect(() => {
    let isMounted = true;
    let authInterval: NodeJS.Timeout;

    // Direct auth check as fallback
    const checkDirectAuth = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.user && isMounted) {
          console.log('🚀 DIRECT AUTH: Found session', session.user.id);
          setHasDirectSession(true);
          if (!user && authLoading) {
            console.log('🚀 DIRECT AUTH: Bypassing AuthContext loading');
            setDirectUser(session.user);
          }
        } else if (!session?.user && isMounted) {
          console.log('🚀 DIRECT AUTH: No session found');
          setHasDirectSession(false);
        }
      } catch (error) {
        console.log('⚠️ DIRECT AUTH: Check failed:', error);
      }
    };
    
    // Always check for direct session immediately
    checkDirectAuth();
    
    // Also check periodically if auth is stuck or loading
    if (authLoading || !user) {
      authInterval = setInterval(checkDirectAuth, 1000); // Check every second
    }

    return () => {
      isMounted = false;
      if (authInterval) clearInterval(authInterval);
    };
  }, [authLoading, user]);
  
  // Simple debug logging
  const effectiveUser = user || directUser;
  console.log('🚀 FREE AGENTS PAGE RENDER:', {
    mounted,
    authLoading,
    hasUser: !!user,
    hasDirectUser: !!directUser,
    effectiveUser: !!effectiveUser,
    userId: effectiveUser?.id,
    hasProfile: !!profile,
    profileHidden: profile?.hide_from_free_agents
  });
  
  const [isInFreeAgentPool, setIsInFreeAgentPool] = useState(false);
  const [showJoinForm, setShowJoinForm] = useState(false);
  const [playerTypeFilter, setPlayerTypeFilter] = useState<string>('combined');
  const [classFilter, setClassFilter] = useState<string>('all');
  const [viewMode, setViewMode] = useState<'cards' | 'table'>('cards');
  const [sortField, setSortField] = useState<keyof FreeAgent>('created_at');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
  const [searchTerm, setSearchTerm] = useState('');
  const [isTogglingVisibility, setIsTogglingVisibility] = useState(false);
  const [hasDirectSession, setHasDirectSession] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  // Profile loading effect
  useEffect(() => {
    console.log('🔄 Auth effect triggered:', { 
      hasUser: !!user, 
      hasDirectUser: !!directUser,
      effectiveUser: !!effectiveUser,
      userId: effectiveUser?.id, 
      authLoading,
      mounted,
      hasDirectSession
    });
    
    if (effectiveUser) {
      console.log('👤 Loading profile for user:', effectiveUser.id);
      loadUserProfile();
      checkIfInFreeAgentPool();
    } else if (hasDirectSession && mounted) {
      // If we have a direct session but no effectiveUser, try to load profile anyway
      console.log('👤 Loading profile with direct session');
      const loadProfileWithDirectSession = async () => {
        try {
          const { data: { session } } = await supabase.auth.getSession();
          if (session?.user) {
            console.log('👤 Loading profile for direct session user:', session.user.id);
            await loadUserProfileDirect(session.user.id);
            await checkIfInFreeAgentPoolDirect(session.user.id);
          }
        } catch (error) {
          console.error('❌ Error loading profile with direct session:', error);
        }
      };
      loadProfileWithDirectSession();
    } else if (!effectiveUser && !authLoading && !hasDirectSession && mounted) {
      console.log('❌ No user, clearing profile');
      setProfile(null);
    } else {
      console.log('⏳ Waiting for auth:', { authLoading, hasUser: !!user, hasDirectUser: !!directUser, hasDirectSession, mounted });
    }
  }, [user, directUser, authLoading, hasDirectSession, mounted]);

  const loadData = async () => {
    console.log('📊 FREE AGENTS: Starting data load...');
    setLoading(true);
    try {
      await Promise.all([
        loadFreeAgents(),
        loadAllPlayers()
      ]);
      console.log('✅ FREE AGENTS: Data load completed');
    } catch (error) {
      console.error('❌ FREE AGENTS: Error loading data:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadFreeAgents = async () => {
    try {
      console.log('🔍 FREE AGENTS: Loading free agents...');
      // Use the safe utility function with retry logic
      const data = await getFreeAgents();

      const formattedAgents: FreeAgent[] = (data || []).map((agent: any) => ({
        id: agent.id,
        player_id: agent.player_id,
        player_alias: agent.profiles?.in_game_alias || 'Unknown Player',
        preferred_roles: agent.preferred_roles || [],
        secondary_roles: agent.secondary_roles || [],
        availability: agent.availability || '',
        availability_days: agent.availability_days || [],
        availability_times: agent.availability_times || {},
        skill_level: agent.skill_level || 'intermediate',
        class_ratings: agent.class_ratings || {},
        classes_to_try: agent.classes_to_try || [],
        notes: agent.notes,
        created_at: agent.created_at,
        contact_info: agent.contact_info,
        timezone: agent.timezone || 'America/New_York'
      }));

      setFreeAgents(formattedAgents);
      console.log(`✅ FREE AGENTS: Loaded ${formattedAgents.length} free agents`);
    } catch (error) {
      console.error('❌ FREE AGENTS: Error loading free agents:', error);
      toast.error('Failed to load free agents');
    }
  };

  const loadAllPlayers = async () => {
    try {
      console.log('🔍 FREE AGENTS: Loading all players...');
      // Use the safe utility function with retry logic (already filters hide_from_free_agents = true)
      const data = await getAllPlayers();
      setAllPlayers(data || []);
      console.log(`✅ FREE AGENTS: Loaded ${data?.length || 0} players`);
    } catch (error) {
      console.error('❌ FREE AGENTS: Error loading all players:', error);
      toast.error('Failed to load players');
    }
  };

  const loadUserProfile = async () => {
    if (!effectiveUser) {
      console.log('⚠️ FREE AGENTS: loadUserProfile called but no effective user');
      return;
    }
    
    setProfileLoading(true);
    try {
      console.log('🔍 FREE AGENTS: Loading user profile for:', effectiveUser.id);
      const { data, error } = await supabase
        .from('profiles')
        .select('id, in_game_alias, is_league_banned, hide_from_free_agents')
        .eq('id', effectiveUser.id)
        .single();

      if (error) {
        console.error('❌ FREE AGENTS: Profile loading error:', error);
        throw error;
      }
      
      console.log('✅ FREE AGENTS: Loaded profile data:', {
        id: data.id,
        alias: data.in_game_alias,
        banned: data.is_league_banned,
        hidden: data.hide_from_free_agents
      });
      setProfile(data);
      console.log('🔄 FREE AGENTS: Profile state updated, should trigger re-render');
    } catch (error) {
      console.error('❌ FREE AGENTS: Error loading user profile:', error);
    } finally {
      setProfileLoading(false);
    }
  };

  // New function to load profile directly with user ID (for force resolution)
  const loadUserProfileDirect = async (userId: string) => {
    setProfileLoading(true);
    try {
      console.log('🔍 FREE AGENTS: Loading profile directly for:', userId);
      const { data, error } = await supabase
        .from('profiles')
        .select('id, in_game_alias, is_league_banned, hide_from_free_agents')
        .eq('id', userId)
        .single();

      if (error) {
        console.error('❌ FREE AGENTS: Direct profile loading error:', error);
        throw error;
      }
      
      console.log('✅ FREE AGENTS: Loaded profile data directly:', {
        id: data.id,
        alias: data.in_game_alias,
        banned: data.is_league_banned,
        hidden: data.hide_from_free_agents
      });
      setProfile(data);
      
      // Also check if user is in free agent pool
      checkIfInFreeAgentPoolDirect(userId);
    } catch (error) {
      console.error('❌ FREE AGENTS: Error loading user profile directly:', error);
    } finally {
      setProfileLoading(false);
    }
  };

  // Direct version for force auth resolution
  const checkIfInFreeAgentPoolDirect = async (userId: string) => {
    try {
      console.log('🔍 FREE AGENTS: Checking if user is in free agent pool (direct):', userId);
      
      const { data: freeAgentData, error: freeAgentError } = await supabase
        .from('free_agents')
        .select('id')
        .eq('player_id', userId)
        .eq('is_active', true)
        .maybeSingle();

      if (freeAgentError) {
        console.error('❌ FREE AGENTS: Error checking free agent status (direct):', freeAgentError);
        setIsInFreeAgentPool(false);
        return;
      }

      const isInPool = !!freeAgentData;
      console.log('✅ FREE AGENTS: User is in free agent pool (direct):', isInPool);
      setIsInFreeAgentPool(isInPool);
      
    } catch (error) {
      console.error('❌ FREE AGENTS: Error checking free agent pool status (direct):', error);
      setIsInFreeAgentPool(false);
    }
  };

  const checkIfInFreeAgentPool = async () => {
    if (!effectiveUser) return;

    try {
      console.log('Checking if user is in free agent pool:', effectiveUser.id);
      
      // First check if user is in free agent pool directly
      const { data: freeAgentData, error: freeAgentError } = await supabase
        .from('free_agents')
        .select('id')
        .eq('player_id', effectiveUser.id)
        .eq('is_active', true)
        .maybeSingle(); // Use maybeSingle to avoid errors when no record found

      if (freeAgentError) {
        console.error('Error checking free agent status:', freeAgentError);
        setIsInFreeAgentPool(false);
        return;
      }

      const isInPool = !!freeAgentData;
      console.log('User is in free agent pool:', isInPool);
      setIsInFreeAgentPool(isInPool);
      
    } catch (error) {
      console.error('Error checking free agent pool status:', error);
      setIsInFreeAgentPool(false);
    }
  };

  const joinFreeAgentPool = async (formData: {
    preferred_roles: string[];
    secondary_roles?: string[];
    availability: string;
    availability_days?: string[];
    availability_times?: Record<string, { start: string; end: string }>;
    skill_level: string;
    class_ratings?: Record<string, number>;
    classes_to_try?: string[];
    notes?: string;
    contact_info?: string;
    timezone?: string;
  }) => {
    if (!effectiveUser || !profile) {
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
          player_id: effectiveUser.id,
          preferred_roles: formData.preferred_roles,
          secondary_roles: formData.secondary_roles || [],
          availability: formData.availability,
          availability_days: formData.availability_days || [],
          availability_times: formData.availability_times || {},
          skill_level: formData.skill_level,
          class_ratings: formData.class_ratings || {},
          classes_to_try: formData.classes_to_try || [],
          notes: formData.notes,
          contact_info: formData.contact_info,
          timezone: formData.timezone || 'America/New_York',
          is_active: true
        });

      if (error) throw error;

      toast.success('Successfully joined the free agent pool!');
      setIsInFreeAgentPool(true);
      setShowJoinForm(false);
      loadData(); // Refresh the list
    } catch (error: any) {
      console.error('Error joining free agent pool:', error);
      toast.error(error.message || 'Failed to join free agent pool');
    }
  };

  const leaveFreeAgentPool = async () => {
    if (!effectiveUser) return;

    try {
      const { error } = await supabase
        .from('free_agents')
        .update({ is_active: false })
        .eq('player_id', effectiveUser.id)
        .eq('is_active', true);

      if (error) throw error;

      toast.success('Left the free agent pool');
      setIsInFreeAgentPool(false);
      loadData(); // Refresh the list
    } catch (error) {
      console.error('Error leaving free agent pool:', error);
      toast.error('Failed to leave free agent pool');
    }
  };

  const toggleFreeAgentVisibility = async () => {
    // Try direct session check if effectiveUser is not available
    let userToUse = effectiveUser;
    if (!userToUse) {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        userToUse = session?.user || null;
        console.log('🔄 DIRECT SESSION CHECK:', !!userToUse);
      } catch (error) {
        console.error('❌ Direct session check failed:', error);
      }
    }
    
    if (!userToUse) {
      console.error('❌ NO USER AVAILABLE - Cannot toggle');
      toast.error('Please sign in to update your visibility');
      return;
    }

    setIsTogglingVisibility(true);
    console.log('🚀 TOGGLE STARTING - User ID:', userToUse.id);
    
    try {
      // Get current value from state first
      const currentValue = profile?.hide_from_free_agents || false;
      const newValue = !currentValue;
      
      console.log(`📝 UPDATING: ${currentValue} → ${newValue}`);
      
      // Get the user's session token
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        throw new Error('No active session');
      }

      // Call the API endpoint
      const response = await fetch('/api/profile/visibility', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify({
          hide_from_free_agents: newValue
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to update visibility');
      }

      const result = await response.json();
      console.log('✅ API UPDATE SUCCESS:', result);
      
      if (result.success) {
        console.log('🎉 SUCCESS - Database updated correctly!');
        // Update local state immediately
        setProfile(prev => {
          if (prev) {
            const updatedProfile = { ...prev, hide_from_free_agents: result.hide_from_free_agents };
            console.log('🔄 TOGGLE: Updated profile state:', updatedProfile);
            return updatedProfile;
          }
          return null;
        });
        toast.success(`Visibility ${result.hide_from_free_agents ? 'hidden' : 'visible'} successfully!`);
        
        // Don't reload immediately to prevent flicker - the state is already updated
        // Only reload after a short delay if needed
        setTimeout(() => {
          console.log('🔄 TOGGLE: Reloading profile after successful toggle');
          if (effectiveUser) {
            loadUserProfile();
          } else if (hasDirectSession) {
            const reloadWithDirectSession = async () => {
              try {
                const { data: { session } } = await supabase.auth.getSession();
                if (session?.user) {
                  await loadUserProfileDirect(session.user.id);
                }
              } catch (error) {
                console.error('❌ Error reloading profile:', error);
              }
            };
            reloadWithDirectSession();
          }
        }, 500); // Small delay to prevent flicker
      } else {
        console.log('💥 FAILURE - Database not updated correctly!');
        toast.error('Failed to update visibility');
      }
      
    } catch (error: any) {
      console.error('❌ TOGGLE ERROR:', error);
      toast.error(error.message || 'Failed to update visibility');
    } finally {
      setIsTogglingVisibility(false);
    }
  };

  // Get the appropriate data source based on filter
  const getDataSource = (): FreeAgent[] => {
    if (playerTypeFilter === 'players') {
      // Convert all players to FreeAgent format for consistent display
      // Filter out hidden players at the frontend level as a backup
      const visiblePlayers = allPlayers.filter(player => !player.hide_from_free_agents);
      
      return visiblePlayers.map(player => ({
        id: player.id,
        player_id: player.id,
        player_alias: player.in_game_alias || 'Unknown Player',
        preferred_roles: [] as string[],
        secondary_roles: [] as string[],
        availability: 'Contact player directly',
        availability_days: [] as string[],
        availability_times: {} as Record<string, { start: string; end: string }>,
        skill_level: 'unknown',
        class_ratings: {} as Record<string, number>,
        classes_to_try: [] as string[],
        notes: `Registered player`,
        created_at: player.created_at,
        contact_info: player.email,
        timezone: 'Unknown'
      }));
    } else if (playerTypeFilter === 'free_agents') {
      // Filter out free agents whose profiles are hidden
      return freeAgents.filter(agent => {
        // Find the corresponding player profile to check visibility
        const playerProfile = allPlayers.find(p => p.id === agent.player_id);
        return !playerProfile || !playerProfile.hide_from_free_agents;
      });
    } else {
      // Combined: merge both lists, prioritizing free agents
      // Filter out hidden players from both lists
      const visiblePlayers = allPlayers.filter(player => !player.hide_from_free_agents);
      const visibleFreeAgents = freeAgents.filter(agent => {
        const playerProfile = allPlayers.find(p => p.id === agent.player_id);
        return !playerProfile || !playerProfile.hide_from_free_agents;
      });
      
      const freeAgentPlayerIds = new Set(visibleFreeAgents.map(fa => fa.player_id));
      const playersNotInFreeAgents = visiblePlayers
        .filter(player => !freeAgentPlayerIds.has(player.id))
        .map(player => ({
          id: player.id,
          player_id: player.id,
          player_alias: player.in_game_alias || 'Unknown Player',
          preferred_roles: [] as string[],
          secondary_roles: [] as string[],
          availability: 'Contact player directly',
          availability_days: [] as string[],
          availability_times: {} as Record<string, { start: string; end: string }>,
          skill_level: 'unknown',
          class_ratings: {} as Record<string, number>,
          classes_to_try: [] as string[],
          notes: `Registered player`,
          created_at: player.created_at,
          contact_info: player.email,
          timezone: 'Unknown'
        }));
      
      return [...visibleFreeAgents, ...playersNotInFreeAgents];
    }
  };

  const filteredAndSortedAgents = getDataSource()
    .filter(agent => {
      // Search filter
      if (searchTerm && !agent.player_alias.toLowerCase().includes(searchTerm.toLowerCase()) &&
          !(agent.preferred_roles || []).some(role => role.toLowerCase().includes(searchTerm.toLowerCase())) &&
          !(agent.secondary_roles || []).some(role => role.toLowerCase().includes(searchTerm.toLowerCase())) &&
          !(agent.notes?.toLowerCase().includes(searchTerm.toLowerCase()))) {
        return false;
      }
      
      if (classFilter !== 'all' && 
          !(agent.preferred_roles || []).includes(classFilter) && 
          !(agent.secondary_roles || []).includes(classFilter)) return false;
      return true;
    })
    .sort((a: FreeAgent, b: FreeAgent) => {
      let aValue = a[sortField];
      let bValue = b[sortField];
      
      // Handle array fields (preferred_roles)
      if (Array.isArray(aValue)) aValue = aValue.join(', ');
      if (Array.isArray(bValue)) bValue = bValue.join(', ');
      
      // Handle string comparison
      if (typeof aValue === 'string' && typeof bValue === 'string') {
        const comparison = aValue.localeCompare(bValue);
        return sortDirection === 'asc' ? comparison : -comparison;
      }
      
      // Handle date comparison
      if (sortField === 'created_at') {
        const dateA = new Date(aValue as string).getTime();
        const dateB = new Date(bValue as string).getTime();
        return sortDirection === 'asc' ? dateA - dateB : dateB - dateA;
      }
      
      return 0;
    });

  const handleSort = (field: keyof FreeAgent) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  // Helper function to format availability
  const formatAvailability = (agent: FreeAgent) => {
    if (agent.availability_days && agent.availability_days.length > 0) {
      const timezone = agent.timezone || 'EST';
      const times = agent.availability_times || {};
      const timeEntries = Object.entries(times);
      
      if (timeEntries.length === 0) {
        return (
          <div className="flex flex-wrap items-center gap-2">
            {agent.availability_days.map(day => (
              <span key={day} className="bg-blue-500/20 text-blue-300 px-2 py-1 rounded text-xs font-medium border border-blue-500/30">
                {day.slice(0, 3)}
              </span>
            ))}
            <span className="text-purple-400 text-xs font-medium bg-purple-500/20 border border-purple-500/30 rounded px-2 py-1">
              {timezone}
            </span>
          </div>
        );
      }
      
      // Group consecutive days with same times
      const dayGroups: { days: string[], time: { start: string, end: string } }[] = [];
      const dayOrder = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
      
      // Sort available days by day order
      const sortedDays = agent.availability_days.sort((a, b) => 
        dayOrder.indexOf(a) - dayOrder.indexOf(b)
      );
      
      let currentGroup: { days: string[], time: { start: string, end: string } } | null = null;
      
      for (const day of sortedDays) {
        const dayTime = times[day];
        if (!dayTime) continue;
        
        if (!currentGroup || 
            currentGroup.time.start !== dayTime.start || 
            currentGroup.time.end !== dayTime.end) {
          // Start new group
          currentGroup = { days: [day], time: dayTime };
          dayGroups.push(currentGroup);
        } else {
          // Add to current group
          currentGroup.days.push(day);
        }
      }
      
      return (
        <div className="flex flex-wrap items-center gap-2">
          {dayGroups.map((group, index) => {
            const dayRange = group.days.length > 2 && 
                           dayOrder.indexOf(group.days[group.days.length - 1]) - dayOrder.indexOf(group.days[0]) === group.days.length - 1
              ? `${group.days[0].slice(0, 3)}-${group.days[group.days.length - 1].slice(0, 3)}`
              : group.days.map(d => d.slice(0, 3)).join(', ');
            
            return (
              <div key={index} className="flex items-center gap-1 bg-blue-500/20 border border-blue-500/30 rounded px-2 py-1">
                <span className="text-blue-300 text-xs font-medium">{dayRange}</span>
                <span className="text-green-400 text-xs font-medium">
                  {formatTime(group.time.start)}
                </span>
                <span className="text-gray-400 text-xs">-</span>
                <span className="text-red-400 text-xs font-medium">
                  {formatTime(group.time.end)}
                </span>
              </div>
            );
          })}
          <span className="text-purple-400 text-xs font-medium bg-purple-500/20 border border-purple-500/30 rounded px-2 py-1">
            {timezone}
          </span>
        </div>
      );
    }
    
    // Fallback to old availability text
    return <span className="text-gray-400 text-sm">{agent.availability || 'Not specified'}</span>;
  };

  // Helper function to format time
  const formatTime = (time: string) => {
    if (!time) return '';
    const [hours, minutes] = time.split(':');
    const hour = parseInt(hours);
    const ampm = hour >= 12 ? 'PM' : 'AM';
    const displayHour = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
    return `${displayHour}:${minutes} ${ampm}`;
  };

  // Helper function to render class badges with ratings
  const renderClassBadges = (agent: FreeAgent, type: 'preferred' | 'secondary' | 'try') => {
    let classes: string[] = [];
    let opacity = '';
    
    switch (type) {
      case 'preferred':
        classes = agent.preferred_roles || [];
        opacity = '';
        break;
      case 'secondary':
        classes = agent.secondary_roles || [];
        opacity = 'opacity-75';
        break;
      case 'try':
        classes = agent.classes_to_try || [];
        opacity = 'opacity-60';
        break;
    }

    return classes.map((className: string, index: number) => {
      const rating = agent.class_ratings?.[className];
      const colorClass = CLASS_COLORS[className as keyof typeof CLASS_COLORS] || 'bg-gray-500/20 text-gray-300 border-gray-500/30';
      
      return (
        <div key={`${type}-${index}`} className={`inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium border ${colorClass} ${opacity}`}>
          <span>{className}</span>
          {rating && type !== 'try' && (
            <div className="flex">
              {[1, 2, 3, 4, 5].map((star) => (
                <span key={star} className={`text-xs ${star <= rating ? 'text-yellow-400' : 'text-gray-600'}`}>
                  ★
                </span>
              ))}
            </div>
          )}
        </div>
      );
    });
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-slate-800 to-gray-900">
      <Navbar user={user} />
      
      <main className="container mx-auto px-4 py-8">
        <div className="max-w-7xl mx-auto">
          {/* Hero Header */}
          <div className="text-center mb-12 relative">
            <div className="absolute inset-0 bg-gradient-to-r from-cyan-500/10 via-purple-500/10 to-pink-500/10 rounded-3xl blur-3xl"></div>
            <div className="relative bg-gradient-to-br from-gray-900/80 via-gray-800/80 to-gray-900/80 backdrop-blur-sm rounded-3xl p-12 border border-cyan-500/20 shadow-2xl">
              <h1 className="text-6xl font-bold bg-gradient-to-r from-cyan-400 via-purple-400 to-pink-400 bg-clip-text text-transparent mb-6 animate-pulse">
                🎯 CTF Free Agent Pool
              </h1>
              <p className="text-2xl text-gray-300 mb-8 font-medium">
                <span className="text-cyan-400">Players</span> looking for <span className="text-purple-400">squads</span> • <span className="text-pink-400">Squads</span> looking for <span className="text-green-400">players</span>
              </p>
              
              <div className="flex items-center justify-center gap-3 mb-8">
                <div className="w-24 h-1 bg-gradient-to-r from-cyan-400 to-purple-400 rounded-full animate-pulse"></div>
                <span className="text-4xl animate-bounce">⚡</span>
                <div className="w-24 h-1 bg-gradient-to-r from-purple-400 to-pink-400 rounded-full animate-pulse"></div>
              </div>
              
              {/* User Actions */}
              {(() => {
                // More robust check - show if we have user or if profile exists
                // This fixes the auth loading issue where user exists but component doesn't mount
                const hasUserOrProfile = effectiveUser || (profile && profile.id) || hasDirectSession;
                const isNotBanned = !profile?.is_league_banned;
                const canShowSection = hasUserOrProfile && isNotBanned;
                
                console.log('🔍 VISIBILITY SECTION CHECK:', {
                  mounted,
                  authLoading,
                  hasUser: !!user,
                  userId: user?.id,
                  hasProfile: !!profile,
                  hasUserOrProfile,
                  hasDirectSession,
                  isLeagueBanned: profile?.is_league_banned,
                  isNotBanned,
                  canShowSection,
                  profileData: profile ? {
                    id: profile.id,
                    alias: profile.in_game_alias,
                    hidden: profile.hide_from_free_agents
                  } : null
                });
                return canShowSection;
              })() && (
                <div className="flex flex-col items-center gap-4 mb-8">
                  <div className="flex justify-center gap-6">
                    {!isInFreeAgentPool ? (
                      <button
                        onClick={() => setShowJoinForm(true)}
                        className="px-8 py-4 bg-gradient-to-r from-green-500 via-emerald-500 to-cyan-500 text-white rounded-xl hover:from-green-400 hover:via-emerald-400 hover:to-cyan-400 transition-all duration-300 transform hover:scale-105 font-bold shadow-lg shadow-green-500/30 border border-green-400/30 relative overflow-hidden group"
                      >
                        <span className="relative flex items-center gap-2">
                          🚀 Join Free Agent Pool
                          <span className="group-hover:translate-x-1 transition-transform duration-300">→</span>
                        </span>
                        <div className="absolute inset-0 bg-gradient-to-r from-green-400/20 to-cyan-400/20 translate-y-full group-hover:translate-y-0 transition-transform duration-300"></div>
                      </button>
                    ) : (
                      <button
                        onClick={leaveFreeAgentPool}
                        className="px-8 py-4 bg-gradient-to-r from-red-500 via-pink-500 to-rose-500 text-white rounded-xl hover:from-red-400 hover:via-pink-400 hover:to-rose-400 transition-all duration-300 transform hover:scale-105 font-bold shadow-lg shadow-red-500/30 border border-red-400/30 relative overflow-hidden group"
                      >
                        <span className="relative flex items-center gap-2">
                          🚪 Leave Free Agent Pool
                          <span className="group-hover:translate-x-1 transition-transform duration-300">→</span>
                        </span>
                        <div className="absolute inset-0 bg-gradient-to-r from-red-400/20 to-rose-400/20 translate-y-full group-hover:translate-y-0 transition-transform duration-300"></div>
                      </button>
                    )}
                  </div>
                  
                  {/* Free Agent Visibility Toggle */}
                  <div className="bg-gradient-to-r from-indigo-500/10 to-purple-500/10 border border-indigo-500/30 rounded-xl p-4 backdrop-blur-sm shadow-lg">
                    <div className="flex items-center justify-center gap-3">
                      {profile ? (
                        <>
                          <span className="text-sm text-indigo-300 font-medium">
                            {profile.hide_from_free_agents ? 'Hidden from free agents page' : 'Visible on free agents page'}
                            <span className="text-xs text-gray-500 ml-2">
                              (DB: {profile.hide_from_free_agents === true ? 'true' : profile.hide_from_free_agents === false ? 'false' : 'null'})
                            </span>
                          </span>
                          <button
                            onClick={toggleFreeAgentVisibility}
                            disabled={isTogglingVisibility || !profile}
                            className={`relative w-12 h-6 rounded-full transition-all duration-300 ${
                              !profile.hide_from_free_agents ? 'bg-green-500 shadow-green-500/50' : 'bg-gray-600'
                            } shadow-sm flex-shrink-0 ${isTogglingVisibility ? 'opacity-50 cursor-not-allowed' : ''}`}
                            title={profile.hide_from_free_agents ? 'Click to show on free agents page' : 'Click to hide from free agents page'}
                          >
                            <div className={`absolute top-0.5 w-5 h-5 bg-white rounded-full transition-transform duration-300 ${
                              !profile.hide_from_free_agents ? 'translate-x-6' : 'translate-x-0.5'
                            } ${isTogglingVisibility ? 'animate-pulse' : ''}`}></div>
                          </button>
                          <span className="text-xs text-gray-400">
                            {profile.hide_from_free_agents ? '👁️‍🗨️ Show me' : '🫥 Hide me'}
                          </span>
                        </>
                      ) : (hasDirectSession || effectiveUser) ? (
                        <div className="flex items-center justify-center gap-3">
                          <span className="text-sm text-indigo-300 font-medium animate-pulse">
                            Loading visibility settings...
                          </span>
                          <button
                            onClick={toggleFreeAgentVisibility}
                            disabled={isTogglingVisibility}
                            className={`relative w-12 h-6 rounded-full transition-all duration-300 bg-gray-600 shadow-sm flex-shrink-0 ${isTogglingVisibility ? 'opacity-50 cursor-not-allowed animate-pulse' : ''}`}
                            title="Loading visibility settings..."
                          >
                            <div className="absolute top-0.5 w-5 h-5 bg-white rounded-full translate-x-0.5"></div>
                          </button>
                          <span className="text-xs text-gray-400 animate-pulse">
                            Loading...
                          </span>
                        </div>
                      ) : (
                        <div className="flex items-center justify-center gap-3">
                          <span className="text-sm text-red-300 font-medium">
                            Please sign in to manage visibility
                          </span>
                        </div>
                      )}
                    </div>
                    <p className="text-xs text-gray-400 text-center mt-2">
                      Control whether you appear on this page for squad recruitment
                    </p>
                  </div>
                </div>
              )}

              {profile?.is_league_banned && (
                <div className="bg-gradient-to-r from-red-500/10 to-pink-500/10 border border-red-500/30 rounded-2xl p-6 mb-8 max-w-md mx-auto backdrop-blur-sm shadow-lg">
                  <div className="flex items-center gap-3 mb-2">
                    <span className="text-2xl animate-pulse">🚫</span>
                    <span className="text-red-400 font-bold text-lg">Access Restricted</span>
                  </div>
                  <p className="text-red-300">
                    You are banned from the CTF league and cannot join the free agent pool.
                  </p>
                </div>
              )}

              {!effectiveUser && (
                <div className="bg-gradient-to-r from-blue-500/10 to-cyan-500/10 border border-blue-500/30 rounded-2xl p-6 mb-8 max-w-md mx-auto backdrop-blur-sm shadow-lg">
                  <div className="flex items-center gap-3 mb-2">
                    <span className="text-2xl animate-bounce">🔐</span>
                    <span className="text-blue-400 font-bold text-lg">Login Required</span>
                  </div>
                  <p className="text-blue-300">
                    <a href="/auth/login" className="underline hover:text-cyan-300 transition-colors font-medium">
                      Log in
                    </a> to join the free agent pool
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Compact Controls */}
          <div className="bg-gradient-to-r from-gray-900/80 via-gray-800/80 to-gray-900/80 backdrop-blur-sm rounded-xl p-4 border border-cyan-500/20 shadow-xl mb-6">
            {/* Mobile: Stack vertically, Desktop: Side by side */}
            <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
              {/* View Toggle & Results */}
              <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                <div className="bg-gray-800/50 rounded-lg p-1 border border-gray-600/50 w-fit">
                  <button
                    onClick={() => setViewMode('cards')}
                    className={`px-2 sm:px-3 py-2 rounded-md text-xs sm:text-sm font-medium transition-all duration-300 flex items-center gap-1 ${
                      viewMode === 'cards'
                        ? 'bg-gradient-to-r from-cyan-500 to-purple-500 text-white shadow-lg'
                        : 'text-gray-400 hover:text-white hover:bg-gray-700/50'
                    }`}
                  >
                    <span className="text-sm sm:text-lg">🎴</span>
                    <span className="hidden sm:inline">Card View</span>
                  </button>
                  <button
                    onClick={() => setViewMode('table')}
                    className={`px-2 sm:px-3 py-2 rounded-md text-xs sm:text-sm font-medium transition-all duration-300 flex items-center gap-1 ${
                      viewMode === 'table'
                        ? 'bg-gradient-to-r from-purple-500 to-pink-500 text-white shadow-lg'
                        : 'text-gray-400 hover:text-white hover:bg-gray-700/50'
                    }`}
                  >
                    <span className="text-sm sm:text-lg">📊</span>
                    <span className="hidden sm:inline">Table View</span>
                  </button>
                </div>
                
                <span className="bg-gradient-to-r from-cyan-500/20 to-purple-500/20 border border-cyan-500/30 rounded-full px-3 sm:px-4 py-1 text-cyan-300 text-xs sm:text-sm font-medium w-fit">
                  <span className="text-white font-bold">{filteredAndSortedAgents.length}</span> players found
                </span>
              </div>

              {/* Filters - Mobile: Stack vertically, Desktop: Horizontal */}
              <div className="flex flex-col sm:flex-row gap-3 overflow-x-auto">
                {/* Search */}
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-sm sm:text-lg flex-shrink-0">🔍</span>
                  <input
                    type="text"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="Search players..."
                    className="bg-gray-700/50 border border-cyan-500/30 rounded-lg px-2 sm:px-3 py-2 text-white placeholder-gray-400 focus:border-cyan-400 transition-all duration-300 text-sm min-w-0 flex-1 sm:w-48"
                  />
                </div>

                {/* Player Type Filter */}
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-sm sm:text-lg flex-shrink-0">👥</span>
                  <select
                    value={playerTypeFilter}
                    onChange={(e) => setPlayerTypeFilter(e.target.value)}
                    className="bg-gray-700/50 border border-purple-500/30 rounded-lg px-2 sm:px-3 py-2 text-white focus:border-purple-400 transition-all duration-300 text-sm min-w-0 flex-1 sm:w-auto"
                  >
                    <option value="combined">Combined</option>
                    <option value="free_agents">Free Agents</option>
                    <option value="players">Players</option>
                  </select>
                </div>

                {/* Classes Filter */}
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-sm sm:text-lg flex-shrink-0">⚔️</span>
                  <select
                    value={classFilter}
                    onChange={(e) => setClassFilter(e.target.value)}
                    className="bg-gray-700/50 border border-pink-500/30 rounded-lg px-2 sm:px-3 py-2 text-white focus:border-pink-400 transition-all duration-300 text-sm min-w-0 flex-1 sm:w-auto"
                  >
                    <option value="all">All Classes</option>
                    <option value="O INF">O INF</option>
                    <option value="D INF">D INF</option>
                    <option value="O HVY">O HVY</option>
                    <option value="D HVY">D HVY</option>
                    <option value="Medic">Medic</option>
                    <option value="SL">SL</option>
                    <option value="Foot JT">Foot JT</option>
                    <option value="D Foot JT">D Foot JT</option>
                    <option value="Pack JT">Pack JT</option>
                    <option value="Engineer">Engineer</option>
                    <option value="Infil">Infil</option>
                    <option value="10-man Infil">10-man Infil</option>
                  </select>
                </div>
              </div>
            </div>
          </div>

          {/* Content Area */}
          {loading ? (
            <div className={viewMode === 'cards' ? "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6" : "space-y-4"}>
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <div key={i} className={viewMode === 'cards' ? "bg-gray-800/50 rounded-2xl p-6 animate-pulse border border-gray-700/50" : "bg-gray-800/50 rounded-xl p-4 animate-pulse border border-gray-700/50"}>
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
          ) : filteredAndSortedAgents.length === 0 ? (
            <div className="text-center py-16">
              <div className="text-6xl mb-4 animate-bounce">😔</div>
              <p className="text-gray-400 text-2xl font-medium mb-2">No free agents found</p>
              <p className="text-gray-500">Try adjusting your filters or search terms</p>
            </div>
          ) : viewMode === 'cards' ? (
            /* Card View */
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
              {filteredAndSortedAgents.map((agent: FreeAgent, index: number) => (
                <div 
                  key={agent.id} 
                  className="bg-gradient-to-br from-gray-800/80 via-gray-900/80 to-gray-800/80 border border-gray-700/50 rounded-2xl p-6 hover:border-cyan-500/50 hover:shadow-xl hover:shadow-cyan-500/10 transition-all duration-300 transform hover:scale-105 backdrop-blur-sm animate-slideUp"
                  style={{ animationDelay: `${index * 100}ms` }}
                >
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-12 h-12 bg-gradient-to-r from-cyan-500 to-purple-500 rounded-full flex items-center justify-center text-white font-bold text-lg">
                      {agent.player_alias.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <h3 className="text-xl font-bold bg-gradient-to-r from-cyan-400 to-purple-400 bg-clip-text text-transparent">
                        {agent.player_alias}
                      </h3>
                      <div className={`inline-flex px-2 py-1 rounded-full text-xs font-medium border ${SKILL_LEVEL_COLORS[agent.skill_level as keyof typeof SKILL_LEVEL_COLORS]}`}>
                        {agent.skill_level.charAt(0).toUpperCase() + agent.skill_level.slice(1)}
                      </div>
                    </div>
                  </div>
                  
                  <div className="space-y-4">
                    <div className="mb-4">
                      <h4 className="text-sm font-medium text-gray-400 mb-2">Classes Played</h4>
                      <div className="space-y-2">
                        {agent.preferred_roles && agent.preferred_roles.length > 0 && (
                          <div>
                            <span className="text-xs text-cyan-400 font-medium">Preferred:</span>
                            <div className="flex flex-wrap gap-1 mt-1">
                              {renderClassBadges(agent, 'preferred')}
                            </div>
                          </div>
                        )}
                        {agent.secondary_roles && agent.secondary_roles.length > 0 && (
                          <div>
                            <span className="text-xs text-purple-400 font-medium">Secondary:</span>
                            <div className="flex flex-wrap gap-1 mt-1">
                              {renderClassBadges(agent, 'secondary')}
                            </div>
                          </div>
                        )}
                        {agent.classes_to_try && agent.classes_to_try.length > 0 && (
                          <div>
                            <span className="text-xs text-indigo-400 font-medium">Want to Try:</span>
                            <div className="flex flex-wrap gap-1 mt-1">
                              {renderClassBadges(agent, 'try')}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="mb-4">
                      <h4 className="text-sm font-medium text-gray-400 mb-2">Availability</h4>
                      <div className="text-sm text-gray-300">{formatAvailability(agent)}</div>
                    </div>

                    {agent.notes && (
                      <div>
                        <div className="flex items-center gap-2 mb-2">
                          <span className="text-lg">📝</span>
                          <span className="text-gray-300 font-medium">Notes</span>
                        </div>
                        <p className="text-gray-400 text-sm bg-gray-800/50 rounded-lg p-3 border border-gray-700/50">{agent.notes}</p>
                      </div>
                    )}



                    <div className="flex items-center justify-between pt-4 border-t border-gray-700/50">
                      <div className="flex items-center gap-2 text-xs text-gray-500">
                        <span className="text-lg">📅</span>
                        <span>Joined {new Date(agent.created_at).toLocaleDateString()}</span>
                      </div>
                      <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            /* Table View */
            <div className="bg-gradient-to-br from-gray-900/80 via-gray-800/80 to-gray-900/80 backdrop-blur-sm rounded-2xl border border-cyan-500/20 shadow-2xl overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="bg-gradient-to-r from-cyan-600/20 to-purple-600/20 border-b border-cyan-500/20">
                      <th 
                        className="px-6 py-4 text-left text-sm font-bold text-cyan-300 cursor-pointer hover:text-cyan-200 transition-colors"
                        onClick={() => handleSort('player_alias')}
                      >
                        <div className="flex items-center gap-2">
                          <span className="text-lg">👤</span>
                          Player Name
                          {sortField === 'player_alias' && (
                            <span className="text-xs">{sortDirection === 'asc' ? '↑' : '↓'}</span>
                          )}
                        </div>
                      </th>
                      <th 
                        className="px-6 py-4 text-left text-sm font-bold text-purple-300 cursor-pointer hover:text-purple-200 transition-colors"
                        onClick={() => handleSort('skill_level')}
                      >
                        <div className="flex items-center gap-2">
                          <span className="text-lg">🏆</span>
                          Level
                          {sortField === 'skill_level' && (
                            <span className="text-xs">{sortDirection === 'asc' ? '↑' : '↓'}</span>
                          )}
                        </div>
                      </th>
                      <th 
                        className="px-6 py-4 text-left text-sm font-bold text-pink-300 cursor-pointer hover:text-pink-200 transition-colors"
                        onClick={() => handleSort('preferred_roles')}
                      >
                        <div className="flex items-center gap-2">
                          <span className="text-lg">⚔️</span>
                          Classes
                          {sortField === 'preferred_roles' && (
                            <span className="text-xs">{sortDirection === 'asc' ? '↑' : '↓'}</span>
                          )}
                        </div>
                      </th>
                      <th className="px-6 py-4 text-left text-sm font-bold text-green-300">
                        <div className="flex items-center gap-2">
                          <span className="text-lg">📅</span>
                          Availability
                        </div>
                      </th>
                      <th 
                        className="px-6 py-4 text-left text-sm font-bold text-yellow-300 cursor-pointer hover:text-yellow-200 transition-colors"
                        onClick={() => handleSort('created_at')}
                      >
                        <div className="flex items-center gap-2">
                          <span className="text-lg">📅</span>
                          Joined
                          {sortField === 'created_at' && (
                            <span className="text-xs">{sortDirection === 'asc' ? '↑' : '↓'}</span>
                          )}
                        </div>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredAndSortedAgents.map((agent: FreeAgent, index: number) => (
                      <tr 
                        key={agent.id} 
                        className="border-b border-gray-700/30 hover:bg-gradient-to-r hover:from-cyan-500/5 hover:to-purple-500/5 transition-all duration-300"
                        style={{ animationDelay: `${index * 50}ms` }}
                      >
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 bg-gradient-to-r from-cyan-500 to-purple-500 rounded-full flex items-center justify-center text-white font-bold text-sm">
                              {agent.player_alias.charAt(0).toUpperCase()}
                            </div>
                            <span className="font-medium text-white">{agent.player_alias}</span>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <span className={`inline-flex px-2 py-1 rounded-full text-xs font-medium border ${SKILL_LEVEL_COLORS[agent.skill_level as keyof typeof SKILL_LEVEL_COLORS]}`}>
                            {agent.skill_level.charAt(0).toUpperCase() + agent.skill_level.slice(1)}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <div className="space-y-1">
                            {agent.preferred_roles && agent.preferred_roles.length > 0 && (
                              <div className="flex flex-wrap gap-1">
                                {renderClassBadges(agent, 'preferred')}
                              </div>
                            )}
                            {agent.secondary_roles && agent.secondary_roles.length > 0 && (
                              <div className="flex flex-wrap gap-1">
                                {renderClassBadges(agent, 'secondary')}
                              </div>
                            )}
                            {agent.classes_to_try && agent.classes_to_try.length > 0 && (
                              <div className="flex flex-wrap gap-1">
                                {renderClassBadges(agent, 'try')}
                              </div>
                            )}
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <div className="text-gray-300 text-sm">{formatAvailability(agent)}</div>
                        </td>
                        <td className="px-6 py-4">
                          <span className="text-gray-400 text-sm">{new Date(agent.created_at).toLocaleDateString()}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
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
    secondary_roles: [] as string[],
    availability_days: [] as string[],
    availability_times: {} as Record<string, { start: string; end: string }>,
    skill_level: 'intermediate',
    class_ratings: {} as Record<string, number>,
    classes_to_try: [] as string[],
    notes: '',
    contact_info: ''
  });

  const [userTimezone, setUserTimezone] = useState('America/New_York'); // Default to EST
  const [expandedSections, setExpandedSections] = useState({
    preferred: true,
    secondary: false,
    ratings: false,
    tryClasses: false
  });
  const [syncTimes, setSyncTimes] = useState(true);
  const [masterTime, setMasterTime] = useState({ start: '18:00', end: '22:00' });

  // Generate time slots in 15-minute increments
  const generateTimeSlots = () => {
    const slots = [];
    for (let hour = 0; hour < 24; hour++) {
      for (let minute = 0; minute < 60; minute += 15) {
        const timeString = `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
        slots.push(timeString);
      }
    }
    return slots;
  };

  const timeSlots = generateTimeSlots();

  // Format time for display with timezone conversion
  const formatTimeForDisplay = (time: string, fromTimezone: string = 'America/New_York') => {
    if (!time) return '';
    
    try {
      // Create a date object for today with the given time
      const today = new Date().toISOString().split('T')[0];
      const dateTime = new Date(`${today}T${time}:00`);
      
      // If user timezone is different from EST, show both times
      if (userTimezone !== 'America/New_York') {
        const estTime = new Intl.DateTimeFormat('en-US', {
          timeZone: 'America/New_York',
          hour: '2-digit',
          minute: '2-digit',
          hour12: true
        }).format(dateTime);
        
        const userTime = new Intl.DateTimeFormat('en-US', {
          timeZone: userTimezone,
          hour: '2-digit',
          minute: '2-digit',
          hour12: true
        }).format(dateTime);
        
        return `${estTime} EST (${userTime} your time)`;
      } else {
        const estTime = new Intl.DateTimeFormat('en-US', {
          timeZone: 'America/New_York',
          hour: '2-digit',
          minute: '2-digit',
          hour12: true
        }).format(dateTime);
        
        return `${estTime} EST`;
      }
    } catch (error) {
      return `${time} EST`;
    }
  };

  // Get timezone abbreviation
  const getTimezoneAbbr = (timezone: string) => {
    const abbreviations: Record<string, string> = {
      'America/Los_Angeles': 'PST',
      'America/Denver': 'MST', 
      'America/Phoenix': 'MST',
      'America/Chicago': 'CST',
      'America/New_York': 'EST',
      'Europe/London': 'GMT',
      'Europe/Paris': 'CET',
      'Europe/Berlin': 'CET',
      'Asia/Tokyo': 'JST',
      'Australia/Sydney': 'AEST',
      'America/Toronto': 'EST',
      'America/Vancouver': 'PST'
    };
    return abbreviations[timezone] || timezone.split('/')[1];
  };

  const toggleSection = (section: keyof typeof expandedSections) => {
    setExpandedSections(prev => ({
      ...prev,
      [section]: !prev[section]
    }));
  };

  const handleRoleToggle = (role: string, type: 'preferred' | 'secondary' | 'try') => {
    if (type === 'preferred') {
      setFormData(prev => ({
        ...prev,
        preferred_roles: prev.preferred_roles.includes(role)
          ? prev.preferred_roles.filter(r => r !== role)
          : [...prev.preferred_roles, role]
      }));
    } else if (type === 'secondary') {
      setFormData(prev => ({
        ...prev,
        secondary_roles: prev.secondary_roles.includes(role)
          ? prev.secondary_roles.filter(r => r !== role)
          : [...prev.secondary_roles, role]
      }));
    } else {
      setFormData(prev => ({
        ...prev,
        classes_to_try: prev.classes_to_try.includes(role)
          ? prev.classes_to_try.filter(r => r !== role)
          : [...prev.classes_to_try, role]
      }));
    }
  };

  // Helper function to get tag color
  const getTagColor = (tag: string) => {
    switch (tag) {
      case 'Offense': return 'bg-gray-500/20 text-gray-300';
      case 'Defense': return 'bg-gray-600/20 text-gray-400';
      case 'Fighter': return 'bg-slate-500/20 text-slate-300';
      case 'Support': return 'bg-green-500/20 text-green-300';
      default: return 'bg-purple-500/20 text-purple-300';
    }
  };

  const handleDayToggle = (day: string) => {
    setFormData(prev => {
      const isCurrentlySelected = prev.availability_days.includes(day);
      
      if (isCurrentlySelected) {
        // Remove day and its time range
        const newTimes = { ...prev.availability_times };
        delete newTimes[day];
        
        return {
          ...prev,
          availability_days: prev.availability_days.filter(d => d !== day),
          availability_times: newTimes
        };
      } else {
        // Add day with synced or default time range
        const timeToUse = syncTimes ? masterTime : { start: '18:00', end: '22:00' };
        return {
          ...prev,
          availability_days: [...prev.availability_days, day],
          availability_times: {
            ...prev.availability_times,
            [day]: timeToUse
          }
        };
      }
    });
  };

  const handleTimeChange = (day: string, type: 'start' | 'end', value: string) => {
    if (syncTimes) {
      // Update master time and sync to all selected days
      const newMasterTime = { ...masterTime, [type]: value };
      setMasterTime(newMasterTime);
      
      setFormData(prev => {
        const newTimes = { ...prev.availability_times };
        prev.availability_days.forEach(selectedDay => {
          newTimes[selectedDay] = { ...newMasterTime };
        });
        
        return {
          ...prev,
          availability_times: newTimes
        };
      });
    } else {
      // Update only the specific day
      setFormData(prev => ({
        ...prev,
        availability_times: {
          ...prev.availability_times,
          [day]: {
            ...prev.availability_times[day],
            [type]: value
          }
        }
      }));
    }
  };

  const handleMasterTimeChange = (type: 'start' | 'end', value: string) => {
    const newMasterTime = { ...masterTime, [type]: value };
    setMasterTime(newMasterTime);
    
    if (syncTimes) {
      // Sync to all selected days
      setFormData(prev => {
        const newTimes = { ...prev.availability_times };
        prev.availability_days.forEach(day => {
          newTimes[day] = { ...newMasterTime };
        });
        
        return {
          ...prev,
          availability_times: newTimes
        };
      });
    }
  };

  const handleRatingChange = (role: string, rating: number) => {
    setFormData(prev => ({
      ...prev,
      class_ratings: {
        ...prev.class_ratings,
        [role]: rating
      }
    }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (formData.preferred_roles.length === 0) {
      toast.error('Please select at least one preferred role');
      return;
    }
    if (formData.availability_days.length === 0) {
      toast.error('Please select at least one day of availability');
      return;
    }
    
    // Convert availability days and times to string for storage
    const availabilityString = formData.availability_days.map(day => {
      const times = formData.availability_times[day];
      return times ? `${day}: ${times.start}-${times.end}` : day;
    }).join(', ');
    
    const submissionData = {
      preferred_roles: formData.preferred_roles,
      secondary_roles: formData.secondary_roles,
      availability: availabilityString,
      availability_days: formData.availability_days,
      availability_times: formData.availability_times,
      skill_level: 'intermediate', // Default since we removed the player type selection
      class_ratings: formData.class_ratings,
      classes_to_try: formData.classes_to_try,
      notes: formData.notes,
      contact_info: formData.contact_info,
      timezone: userTimezone
    };
    
    onSubmit(submissionData);
  };

  const availableRoles = ['O INF', 'D INF', 'O HVY', 'D HVY', 'Medic', 'SL', 'Foot JT', 'D Foot JT', 'Pack JT', 'Engineer', 'Infil', '10-man Infil'];
  
  // Individual role structure with grouped display
  const roleGroups = [
    {
      name: 'Infantry',
      roles: [
        { key: 'O INF', label: 'Offense', tag: 'Offense' },
        { key: 'D INF', label: 'Defense', tag: 'Defense' }
      ]
    },
    {
      name: 'Heavy Weapons', 
      roles: [
        { key: 'O HVY', label: 'Offense', tag: 'Offense' },
        { key: 'D HVY', label: 'Defense', tag: 'Defense' }
      ]
    },
    {
      name: 'Jump Trooper',
      roles: [
        { key: 'Foot JT', label: 'Offense', tag: 'Fighter' },
        { key: 'D Foot JT', label: 'Defense', tag: 'Fighter' }
      ]
    },
    {
      name: 'Jump Trooper Pack',
      roles: [
        { key: 'Pack JT', label: 'Pack', tag: 'Offense' }
      ]
    },
    {
      name: 'Field Medic',
      roles: [
        { key: 'Medic', label: 'Medic', tag: 'Support' }
      ]
    },
    {
      name: 'Combat Engineer',
      roles: [
        { key: 'Engineer', label: 'Engineer', tag: 'Support' }
      ]
    },
    {
      name: 'Squad Leader',
      roles: [
        { key: 'SL', label: 'Leader', tag: 'Support' }
      ]
    },
    {
      name: 'Infiltrator',
      roles: [
        { key: 'Infil', label: '5-man', tag: 'Offense' },
        { key: '10-man Infil', label: '10-man', tag: 'Fighter' }
      ]
    }
  ];
  
  const getClassColor = (role: string, isSelected: boolean) => {
    const colorMap: Record<string, string> = {
      'O INF': isSelected ? 'bg-red-600 border-red-500 text-white' : 'bg-gray-700 border-gray-600 text-gray-300 hover:border-red-500',
      'D INF': isSelected ? 'bg-red-600 border-red-500 text-white' : 'bg-gray-700 border-gray-600 text-gray-300 hover:border-red-500',
      'O HVY': isSelected ? 'bg-blue-600 border-blue-500 text-white' : 'bg-gray-700 border-gray-600 text-gray-300 hover:border-blue-500',
      'D HVY': isSelected ? 'bg-blue-600 border-blue-500 text-white' : 'bg-gray-700 border-gray-600 text-gray-300 hover:border-blue-500',
      'Medic': isSelected ? 'bg-yellow-600 border-yellow-500 text-white' : 'bg-gray-700 border-gray-600 text-gray-300 hover:border-yellow-500',
      'SL': isSelected ? 'bg-green-600 border-green-500 text-white' : 'bg-gray-700 border-gray-600 text-gray-300 hover:border-green-500',
      'Foot JT': isSelected ? 'bg-gray-400 border-gray-300 text-black' : 'bg-gray-700 border-gray-600 text-gray-300 hover:border-gray-400',
      'D Foot JT': isSelected ? 'bg-gray-400 border-gray-300 text-black' : 'bg-gray-700 border-gray-600 text-gray-300 hover:border-gray-400',
      'Pack JT': isSelected ? 'bg-gray-400 border-gray-300 text-black' : 'bg-gray-700 border-gray-600 text-gray-300 hover:border-gray-400',
      'Engineer': isSelected ? 'bg-amber-700 border-amber-600 text-white' : 'bg-gray-700 border-gray-600 text-gray-300 hover:border-amber-600',
      'Infil': isSelected ? 'bg-purple-600 border-purple-500 text-white' : 'bg-gray-700 border-gray-600 text-gray-300 hover:border-purple-500',
      '10-man Infil': isSelected ? 'bg-purple-600 border-purple-500 text-white' : 'bg-gray-700 border-gray-600 text-gray-300 hover:border-purple-500'
    };
    return colorMap[role] || (isSelected ? 'bg-purple-600 border-purple-500 text-white' : 'bg-gray-700 border-gray-600 text-gray-300 hover:border-purple-500');
  };

  return (
    <div className="fixed inset-0 bg-gradient-to-br from-black/80 via-purple-900/20 to-black/80 backdrop-blur-sm flex items-center justify-center p-4 z-50 overflow-y-auto animate-fadeIn">
      <div className="bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 rounded-2xl p-8 w-full max-w-4xl max-h-[90vh] overflow-y-auto shadow-2xl border border-cyan-500/20 animate-slideUp">
        <div className="text-center mb-8">
          <h3 className="text-4xl font-bold bg-gradient-to-r from-cyan-400 via-purple-400 to-pink-400 bg-clip-text text-transparent mb-2 animate-pulse">
            🎯 Join Free Agent Pool
          </h3>
          <p className="text-gray-400 text-lg">Show your skills and find your perfect squad!</p>
          <div className="w-24 h-1 bg-gradient-to-r from-cyan-400 to-purple-400 mx-auto mt-4 rounded-full animate-pulse"></div>
        </div>
        
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Preferred Classes */}
          <div className="border border-cyan-500/30 rounded-xl bg-gradient-to-r from-cyan-500/5 to-purple-500/5 shadow-lg hover:shadow-cyan-500/20 transition-all duration-300">
            <button
              type="button"
              onClick={() => toggleSection('preferred')}
              className="w-full flex items-center justify-between p-6 bg-gradient-to-r from-cyan-600/20 to-purple-600/20 hover:from-cyan-600/30 hover:to-purple-600/30 transition-all duration-300 rounded-t-xl group"
            >
              <div className="flex items-center gap-3">
                <span className="text-2xl animate-bounce">⭐</span>
                <span className="text-lg font-bold bg-gradient-to-r from-cyan-300 to-purple-300 bg-clip-text text-transparent">
                  Preferred Classes
                </span>
                <span className="bg-red-500/20 text-red-300 px-3 py-1 rounded-full text-xs font-bold border border-red-500/30 animate-pulse">
                  REQUIRED
                </span>
              </div>
              <span className="text-cyan-400 text-xl group-hover:scale-110 transition-transform duration-300">
                {expandedSections.preferred ? '−' : '+'}
              </span>
            </button>
            {expandedSections.preferred && (
              <div className="p-4 border-t border-cyan-500/20 animate-slideDown">
                {/* Row 1: Infantry and Heavy Weapons (4 buttons total) */}
                <div className="grid grid-cols-2 gap-4 mb-4">
                  {roleGroups.slice(0, 2).map((group, groupIndex) => (
                    <div key={group.name} className="space-y-2">
                      <h4 className="text-sm font-bold text-cyan-300 mb-2">{group.name}</h4>
                      <div className="border border-gray-600 rounded-lg overflow-hidden grid grid-cols-2">
                        {group.roles.map((role, roleIndex) => (
                          <button
                            key={role.key}
                            type="button"
                            onClick={() => handleRoleToggle(role.key, 'preferred')}
                            className={`p-2 text-xs border-r last:border-r-0 transition-all duration-300 font-medium ${
                              formData.preferred_roles.includes(role.key)
                                ? getClassColor(role.key, true)
                                : getClassColor(role.key, false)
                            }`}
                            style={{ animationDelay: `${(groupIndex * 2 + roleIndex) * 50}ms` }}
                          >
                            <div className="text-sm font-bold mb-1">{role.label}</div>
                            <div className={`text-xs px-1 py-0.5 rounded ${getTagColor(role.tag)}`}>
                              {role.tag}
                            </div>
                            {formData.preferred_roles.includes(role.key) && (
                              <div className="text-xs mt-1 animate-pulse">✓</div>
                            )}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Row 2: Jump Trooper, Pack JT (half width), and Infiltrator (5 buttons total) */}
                <div className="grid grid-cols-5 gap-2 mb-4">
                  {/* Jump Trooper - 2 columns */}
                  <div className="col-span-2 space-y-2">
                    <h4 className="text-sm font-bold text-cyan-300 mb-2">Jump Trooper</h4>
                    <div className="border border-gray-600 rounded-lg overflow-hidden grid grid-cols-2">
                      {roleGroups[2].roles.map((role, roleIndex) => (
                        <button
                          key={role.key}
                          type="button"
                          onClick={() => handleRoleToggle(role.key, 'preferred')}
                          className={`p-2 text-xs border-r last:border-r-0 transition-all duration-300 font-medium ${
                            formData.preferred_roles.includes(role.key)
                              ? getClassColor(role.key, true)
                              : getClassColor(role.key, false)
                          }`}
                        >
                          <div className="text-sm font-bold mb-1">{role.label}</div>
                          <div className={`text-xs px-1 py-0.5 rounded ${getTagColor(role.tag)}`}>
                            {role.tag}
                          </div>
                          {formData.preferred_roles.includes(role.key) && (
                            <div className="text-xs mt-1 animate-pulse">✓</div>
                          )}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Pack JT - 1 column (half width) */}
                  <div className="col-span-1 space-y-2">
                    <h4 className="text-sm font-bold text-cyan-300 mb-2">Pack JT</h4>
                    <div className="border border-gray-600 rounded-lg overflow-hidden">
                      <button
                        type="button"
                        onClick={() => handleRoleToggle('Pack JT', 'preferred')}
                        className={`p-2 text-xs transition-all duration-300 font-medium w-full ${
                          formData.preferred_roles.includes('Pack JT')
                            ? getClassColor('Pack JT', true)
                            : getClassColor('Pack JT', false)
                        }`}
                      >
                        <div className="text-sm font-bold mb-1">Pack</div>
                        <div className={`text-xs px-1 py-0.5 rounded ${getTagColor('Offense')}`}>
                          Offense
                        </div>
                        {formData.preferred_roles.includes('Pack JT') && (
                          <div className="text-xs mt-1 animate-pulse">✓</div>
                        )}
                      </button>
                    </div>
                  </div>

                  {/* Infiltrator - 2 columns */}
                  <div className="col-span-2 space-y-2">
                    <h4 className="text-sm font-bold text-cyan-300 mb-2">Infiltrator</h4>
                    <div className="border border-gray-600 rounded-lg overflow-hidden grid grid-cols-2">
                      {roleGroups[7].roles.map((role, roleIndex) => (
                        <button
                          key={role.key}
                          type="button"
                          onClick={() => handleRoleToggle(role.key, 'preferred')}
                          className={`p-2 text-xs border-r last:border-r-0 transition-all duration-300 font-medium ${
                            formData.preferred_roles.includes(role.key)
                              ? getClassColor(role.key, true)
                              : getClassColor(role.key, false)
                          }`}
                        >
                          <div className="text-sm font-bold mb-1">{role.label}</div>
                          <div className={`text-xs px-1 py-0.5 rounded ${getTagColor(role.tag)}`}>
                            {role.tag}
                          </div>
                          {formData.preferred_roles.includes(role.key) && (
                            <div className="text-xs mt-1 animate-pulse">✓</div>
                          )}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Row 3: Medic, Engineer, Squad Leader (3 buttons, 1/3 width each) */}
                <div className="grid grid-cols-3 gap-4">
                  {[roleGroups[4], roleGroups[5], roleGroups[6]].map((group, groupIndex) => (
                    <div key={group.name} className="space-y-2">
                      <h4 className="text-sm font-bold text-cyan-300 mb-2">{group.name}</h4>
                      <div className="border border-gray-600 rounded-lg overflow-hidden">
                        <button
                          type="button"
                          onClick={() => handleRoleToggle(group.roles[0].key, 'preferred')}
                          className={`p-2 text-xs transition-all duration-300 font-medium w-full ${
                            formData.preferred_roles.includes(group.roles[0].key)
                              ? getClassColor(group.roles[0].key, true)
                              : getClassColor(group.roles[0].key, false)
                          }`}
                        >
                          <div className="text-sm font-bold mb-1">{group.roles[0].label}</div>
                          <div className={`text-xs px-1 py-0.5 rounded ${getTagColor(group.roles[0].tag)}`}>
                            {group.roles[0].tag}
                          </div>
                          {formData.preferred_roles.includes(group.roles[0].key) && (
                            <div className="text-xs mt-1 animate-pulse">✓</div>
                          )}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Consolidated Row: Secondary Classes, Rate Your Classes, Classes to Try */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* Secondary Classes */}
            <div className="border border-yellow-500/30 rounded-xl bg-gradient-to-r from-yellow-500/5 to-amber-500/5 shadow-lg hover:shadow-yellow-500/20 transition-all duration-300">
              <button
                type="button"
                onClick={() => toggleSection('secondary')}
                className="w-full flex items-center justify-between p-4 bg-gradient-to-r from-yellow-600/20 to-amber-600/20 hover:from-yellow-600/30 hover:to-amber-600/30 transition-all duration-300 rounded-t-xl group"
              >
                <div className="flex items-center gap-2">
                  <span className="text-lg animate-bounce">⚡</span>
                  <span className="text-sm font-bold bg-gradient-to-r from-yellow-300 to-amber-300 bg-clip-text text-transparent">
                    Secondary Classes
                  </span>
                </div>
                <span className="text-yellow-400 text-lg group-hover:scale-110 transition-transform duration-300">
                  {expandedSections.secondary ? '−' : '+'}
                </span>
              </button>
              {expandedSections.secondary && (
                <div className="p-4 border-t border-yellow-500/20 animate-slideDown">
                  <p className="text-gray-400 text-xs mb-3">Can play but not preferred</p>
                  <div className="grid grid-cols-1 gap-2">
                    {availableRoles.map((role, index) => (
                      <button
                        key={role}
                        type="button"
                        onClick={() => handleRoleToggle(role, 'secondary')}
                        className={`p-2 rounded-lg text-xs border-2 transition-all duration-300 transform hover:scale-105 font-medium opacity-75 ${getClassColor(role, formData.secondary_roles?.includes(role) || false)}`}
                        style={{ animationDelay: `${index * 30}ms` }}
                      >
                        <span className="block text-sm mb-1">{role}</span>
                        {formData.secondary_roles?.includes(role) && (
                          <span className="text-xs opacity-80 animate-pulse">✓</span>
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Rate Your Classes */}
            <div className="border border-pink-500/30 rounded-xl bg-gradient-to-r from-pink-500/5 to-rose-500/5 shadow-lg hover:shadow-pink-500/20 transition-all duration-300">
              <button
                type="button"
                onClick={() => toggleSection('ratings')}
                className="w-full flex items-center justify-between p-4 bg-gradient-to-r from-pink-600/20 to-rose-600/20 hover:from-pink-600/30 hover:to-rose-600/30 transition-all duration-300 rounded-t-xl group"
              >
                <div className="flex items-center gap-2">
                  <span className="text-lg animate-pulse">⭐</span>
                  <span className="text-sm font-bold bg-gradient-to-r from-pink-300 to-rose-300 bg-clip-text text-transparent">
                    Rate Your Classes
                  </span>
                </div>
                <span className="text-pink-400 text-lg group-hover:scale-110 transition-transform duration-300">
                  {expandedSections.ratings ? '−' : '+'}
                </span>
              </button>
              {expandedSections.ratings && (
                <div className="p-4 border-t border-pink-500/20 animate-slideDown">
                  <p className="text-gray-400 text-xs mb-3">Rate 1-5 scale</p>
                  <div className="space-y-3">
                    {[...formData.preferred_roles, ...(formData.secondary_roles || [])].filter((role, index, arr) => arr.indexOf(role) === index).map(role => (
                      <div key={role} className="flex items-center justify-between p-2 bg-gray-800/50 rounded-lg border border-pink-500/20">
                        <span className="font-medium text-pink-300 text-xs">{role}</span>
                        <div className="flex gap-1">
                          {[1, 2, 3, 4, 5].map(rating => (
                            <button
                              key={rating}
                              type="button"
                              onClick={() => handleRatingChange(role, rating)}
                                                             className={`w-6 h-6 rounded-lg text-xs font-bold transition-all duration-300 transform hover:scale-110 border ${
                                 (formData.class_ratings?.[role] || 0) >= rating
                                   ? 'bg-gradient-to-r from-yellow-400 to-orange-400 text-black border-yellow-300 shadow-sm shadow-yellow-400/30'
                                   : 'bg-gray-700 text-gray-400 border-gray-600 hover:bg-gray-600 hover:text-yellow-300 hover:border-yellow-500'
                               }`}
                             >
                               {rating}
                             </button>
                           ))}
                         </div>
                       </div>
                     ))}
                   </div>
                 </div>
               )}
             </div>

             {/* Classes to Try */}
             <div className="border border-indigo-500/30 rounded-xl bg-gradient-to-r from-indigo-500/5 to-violet-500/5 shadow-lg hover:shadow-indigo-500/20 transition-all duration-300">
               <button
                 type="button"
                 onClick={() => toggleSection('tryClasses')}
                 className="w-full flex items-center justify-between p-4 bg-gradient-to-r from-indigo-600/20 to-violet-600/20 hover:from-indigo-600/30 hover:to-violet-600/30 transition-all duration-300 rounded-t-xl group"
               >
                 <div className="flex items-center gap-2">
                   <span className="text-lg animate-bounce">🎯</span>
                   <span className="text-sm font-bold bg-gradient-to-r from-indigo-300 to-violet-300 bg-clip-text text-transparent">
                     Classes to Try
                   </span>
                 </div>
                 <span className="text-indigo-400 text-lg group-hover:scale-110 transition-transform duration-300">
                   {expandedSections.tryClasses ? '−' : '+'}
                 </span>
               </button>
               {expandedSections.tryClasses && (
                 <div className="p-4 border-t border-indigo-500/20 animate-slideDown">
                   <p className="text-gray-400 text-xs mb-3">Want to learn this season</p>
                   <div className="grid grid-cols-1 gap-2">
                     {availableRoles.map((role, index) => (
                       <button
                         key={role}
                         type="button"
                         onClick={() => handleRoleToggle(role, 'try')}
                         className={`p-2 rounded-lg text-xs border-2 transition-all duration-300 transform hover:scale-105 font-medium opacity-60 ${getClassColor(role, formData.classes_to_try?.includes(role) || false)}`}
                         style={{ animationDelay: `${index * 30}ms` }}
                       >
                         <span className="block text-sm mb-1">{role}</span>
                         {formData.classes_to_try?.includes(role) && (
                           <span className="text-xs opacity-80 animate-pulse">✓</span>
                         )}
                       </button>
                     ))}
                   </div>
                 </div>
               )}
             </div>
           </div>



          {/* Availability */}
          <div className="border border-green-500/30 rounded-xl bg-gradient-to-r from-green-500/5 to-blue-500/5 shadow-lg hover:shadow-green-500/20 transition-all duration-300">
            <div className="p-4 bg-gradient-to-r from-green-600/20 to-blue-600/20 rounded-t-xl">
              {/* Mobile: Stack vertically, Desktop: Horizontal layout */}
              <div className="space-y-4 mb-4">
                {/* Title - Always at top */}
                <div className="flex items-center gap-3">
                  <span className="text-xl sm:text-2xl animate-pulse">⏰</span>
                  <span className="text-base sm:text-lg font-bold bg-gradient-to-r from-green-300 to-blue-300 bg-clip-text text-transparent">
                    Practice Availability
                  </span>
                </div>

                {/* Controls - Mobile: Stack, Desktop: Side by side */}
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                  {/* Time Controls & Sync Toggle */}
                  <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                    {syncTimes && (
                      <div className="flex items-center gap-2">
                        <select
                          value={masterTime.start}
                          onChange={(e) => handleMasterTimeChange('start', e.target.value)}
                          className="bg-gray-700/80 border border-green-500/30 rounded-lg px-2 py-1 text-white text-xs focus:border-green-400 transition-all duration-300 min-w-0 flex-1 sm:w-auto"
                        >
                          {generateTimeSlots().map(time => (
                            <option key={time} value={time}>{formatTimeForDisplay(time, userTimezone)}</option>
                          ))}
                        </select>
                        <span className="text-gray-400 text-xs flex-shrink-0">to</span>
                        <select
                          value={masterTime.end}
                          onChange={(e) => handleMasterTimeChange('end', e.target.value)}
                          className="bg-gray-700/80 border border-green-500/30 rounded-lg px-2 py-1 text-white text-xs focus:border-green-400 transition-all duration-300 min-w-0 flex-1 sm:w-auto"
                        >
                          {generateTimeSlots().map(time => (
                            <option key={time} value={time}>{formatTimeForDisplay(time, userTimezone)}</option>
                          ))}
                        </select>
                      </div>
                    )}
                    
                    {/* Sync Times Toggle */}
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-medium text-green-300">Sync Times</span>
                      <button
                        type="button"
                        onClick={() => setSyncTimes(!syncTimes)}
                        className={`relative w-8 h-4 rounded-full transition-all duration-300 ${
                          syncTimes ? 'bg-green-500 shadow-green-500/50' : 'bg-gray-600'
                        } shadow-sm flex-shrink-0`}
                      >
                        <div className={`absolute top-0.5 w-3 h-3 bg-white rounded-full transition-transform duration-300 ${
                          syncTimes ? 'translate-x-4' : 'translate-x-0.5'
                        }`}></div>
                      </button>
                    </div>
                  </div>
                  
                  {/* Timezone Selection */}
                  <div className="flex items-center gap-2">
                    <span className="text-sm animate-spin-slow flex-shrink-0">🌍</span>
                    <select
                      value={userTimezone}
                      onChange={(e) => setUserTimezone(e.target.value)}
                      className="bg-gray-700/80 border border-blue-500/30 rounded-lg px-2 sm:px-3 py-1 text-white text-xs sm:text-sm focus:border-blue-400 transition-all duration-300 min-w-0 flex-1 sm:w-auto"
                    >
                      <option value="America/Los_Angeles">PST - Pacific</option>
                      <option value="America/Denver">MST - Mountain</option>
                      <option value="America/Phoenix">MST - Arizona</option>
                      <option value="America/Chicago">CST - Central</option>
                      <option value="America/New_York">EST - Eastern</option>
                      <option value="Europe/London">GMT - London</option>
                      <option value="Europe/Paris">CET - Central Europe</option>
                      <option value="Europe/Berlin">CET - Berlin</option>
                      <option value="Asia/Tokyo">JST - Tokyo</option>
                      <option value="Australia/Sydney">AEST - Sydney</option>
                      <option value="America/Toronto">EST - Toronto</option>
                      <option value="America/Vancouver">PST - Vancouver</option>
                    </select>
                  </div>
                </div>
              </div>
              
              {/* Days of Week - Moved to top */}
              <div className="grid grid-cols-7 gap-2 mb-4">
                {['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'].map((day, index) => (
                  <button
                    key={day}
                    type="button"
                    onClick={() => handleDayToggle(day)}
                    className={`p-2 rounded-lg text-xs border-2 transition-all duration-300 transform hover:scale-105 font-medium ${
                      formData.availability_days.includes(day)
                        ? 'bg-gradient-to-r from-green-500 to-emerald-500 border-green-400 text-white shadow-lg shadow-green-500/30'
                        : 'bg-gray-700/50 border-gray-600 text-gray-300 hover:border-green-500 hover:bg-gray-700'
                    }`}
                    style={{ animationDelay: `${index * 50}ms` }}
                  >
                    {formData.availability_days.includes(day) && <span className="block text-xs mb-1 animate-pulse">✓</span>}
                    {day.substring(0, 3)}
                  </button>
                ))}
              </div>
              

            </div>
            
            {/* Time Settings for Selected Days */}
            <div className="p-4 space-y-3">
              {formData.availability_days.map((day, index) => (
                <div key={day} className="space-y-2" style={{ animationDelay: `${index * 100}ms` }}>
                  <div className="flex items-center gap-3">
                    <span className="w-16 text-sm font-medium text-green-300">{day.substring(0, 3)}</span>
                    
                    <div className="flex items-center gap-2 text-sm flex-wrap animate-slideIn">
                      <select
                        value={formData.availability_times[day]?.start || '18:00'}
                        onChange={(e) => handleTimeChange(day, 'start', e.target.value)}
                        disabled={syncTimes}
                        className={`border rounded px-2 py-1 text-white text-xs transition-all duration-300 ${
                          syncTimes 
                            ? 'bg-gray-600 border-gray-500 cursor-not-allowed opacity-75' 
                            : 'bg-gray-700 border-green-500/30 focus:border-green-400 hover:border-green-400'
                        }`}
                      >
                        {generateTimeSlots().map(time => (
                          <option key={time} value={time}>
                            {new Intl.DateTimeFormat('en-US', {
                              hour: 'numeric',
                              minute: '2-digit',
                              hour12: true
                            }).format(new Date(`2000-01-01T${time}:00`))}
                          </option>
                        ))}
                      </select>
                      <span className="text-gray-400 text-xs">to</span>
                      <select
                        value={formData.availability_times[day]?.end || '22:00'}
                        onChange={(e) => handleTimeChange(day, 'end', e.target.value)}
                        disabled={syncTimes}
                        className={`border rounded px-2 py-1 text-white text-xs transition-all duration-300 ${
                          syncTimes 
                            ? 'bg-gray-600 border-gray-500 cursor-not-allowed opacity-75' 
                            : 'bg-gray-700 border-green-500/30 focus:border-green-400 hover:border-green-400'
                        }`}
                      >
                        {generateTimeSlots().map(time => (
                          <option key={time} value={time}>
                            {new Intl.DateTimeFormat('en-US', {
                              hour: 'numeric',
                              minute: '2-digit',
                              hour12: true
                            }).format(new Date(`2000-01-01T${time}:00`))}
                          </option>
                        ))}
                      </select>
                      <span className="text-green-400 text-xs font-bold">EST</span>
                    </div>
                  </div>
                  
                  {/* Show timezone conversion */}
                  {userTimezone !== 'America/New_York' && (
                    <div className="ml-16 text-xs text-blue-400 bg-blue-500/10 rounded p-1 border border-blue-500/20 animate-fadeIn">
                      <span className="text-blue-300">🌍</span> {formatTimeForDisplay(formData.availability_times[day]?.start || '18:00')} - {formatTimeForDisplay(formData.availability_times[day]?.end || '22:00')}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Contact Info */}
          <div className="border border-purple-500/30 rounded-xl bg-gradient-to-r from-purple-500/5 to-pink-500/5 p-6 shadow-lg hover:shadow-purple-500/20 transition-all duration-300">
            <div className="flex items-center gap-3 mb-4">
              <span className="text-2xl animate-bounce">💬</span>
              <span className="text-lg font-bold bg-gradient-to-r from-purple-300 to-pink-300 bg-clip-text text-transparent">
                Discord Username
              </span>
              <span className="bg-purple-500/20 text-purple-300 px-2 py-1 rounded-full text-xs font-medium border border-purple-500/30">
                optional
              </span>
            </div>
            <input
              type="text"
              value={formData.contact_info}
              onChange={(e) => setFormData(prev => ({ ...prev, contact_info: e.target.value }))}
              placeholder="Discord username, Steam profile, etc."
              className="w-full bg-gray-700/80 border border-purple-500/30 rounded-xl px-4 py-3 text-white focus:border-purple-400 focus:ring-2 focus:ring-purple-400/20 transition-all duration-300 backdrop-blur-sm placeholder-gray-400"
            />
          </div>

          {/* Additional Notes */}
          <div className="border border-orange-500/30 rounded-xl bg-gradient-to-r from-orange-500/5 to-red-500/5 p-6 shadow-lg hover:shadow-orange-500/20 transition-all duration-300">
            <div className="flex items-center gap-3 mb-4">
              <span className="text-2xl animate-pulse">📝</span>
              <span className="text-lg font-bold bg-gradient-to-r from-orange-300 to-red-300 bg-clip-text text-transparent">
                Additional Notes
              </span>
              <span className="bg-orange-500/20 text-orange-300 px-2 py-1 rounded-full text-xs font-medium border border-orange-500/30">
                optional
              </span>
            </div>
            <textarea
              value={formData.notes}
              onChange={(e) => setFormData(prev => ({ ...prev, notes: e.target.value }))}
              placeholder="Previous experience, goals, what you're looking for in a squad, etc."
              className="w-full bg-gray-700/80 border border-orange-500/30 rounded-xl px-4 py-3 text-white resize-none focus:border-orange-400 focus:ring-2 focus:ring-orange-400/20 transition-all duration-300 backdrop-blur-sm placeholder-gray-400"
              rows={4}
            />
          </div>

          <div className="flex gap-6 pt-8 border-t border-gradient-to-r from-cyan-500/20 to-purple-500/20">
            <button
              type="button"
              onClick={onCancel}
              className="flex-1 px-8 py-4 bg-gradient-to-r from-gray-600 to-gray-700 text-white rounded-xl hover:from-gray-500 hover:to-gray-600 transition-all duration-300 transform hover:scale-105 font-medium border border-gray-500/30 shadow-lg"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={formData.preferred_roles.length === 0}
              className="flex-1 px-8 py-4 bg-gradient-to-r from-green-500 via-emerald-500 to-cyan-500 text-white rounded-xl hover:from-green-400 hover:via-emerald-400 hover:to-cyan-400 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none transition-all duration-300 transform hover:scale-105 font-bold shadow-lg shadow-green-500/30 border border-green-400/30 relative overflow-hidden group"
            >
              <span className="relative flex items-center justify-center gap-2">
                🚀 Join Free Agent Pool
                <span className="group-hover:translate-x-1 transition-transform duration-300">→</span>
              </span>
              <div className="absolute inset-0 bg-gradient-to-r from-green-400/20 to-cyan-400/20 translate-y-full group-hover:translate-y-0 transition-transform duration-300"></div>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
} 