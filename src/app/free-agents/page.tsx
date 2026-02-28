'use client';

import { useState, useEffect, useMemo } from 'react';
import { useAuth } from '@/lib/AuthContext';
import { supabase } from '@/lib/supabase';
import Navbar from '@/components/Navbar';
import { toast } from 'react-hot-toast';
import { getFreeAgents } from '@/utils/supabaseHelpers';
import ClassDistributionView from '@/components/ClassDistributionView';
import FreeAgentJoinForm, { FreeAgentFormData } from '@/components/FreeAgentJoinForm';
import { CLASS_COLORS, SKILL_LEVEL_COLORS, CLASS_OPTIONS, toTimezoneAbbr } from '@/lib/constants';

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
}

export default function FreeAgentsPage() {
  const { user, loading: authLoading } = useAuth();
  const [freeAgents, setFreeAgents] = useState<FreeAgent[]>([]);
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [showClassDistribution, setShowClassDistribution] = useState(false);

  const [isInFreeAgentPool, setIsInFreeAgentPool] = useState(false);
  const [showJoinForm, setShowJoinForm] = useState(false);
  const [classFilter, setClassFilter] = useState<string>('all');
  const [viewMode, setViewMode] = useState<'cards' | 'table'>('table');
  const [sortField, setSortField] = useState<keyof FreeAgent>('created_at');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
  const [searchTerm, setSearchTerm] = useState('');
  const [includeInSquadPlayers, setIncludeInSquadPlayers] = useState(false);
  const [activeSquadMemberIds, setActiveSquadMemberIds] = useState<Set<string>>(new Set());
  const [playerIdToActiveSquad, setPlayerIdToActiveSquad] = useState<Record<string, { id: string; name: string; tag?: string | null; is_legacy?: boolean }>>({});
  const [freeAgentPlayerIds, setFreeAgentPlayerIds] = useState<Set<string>>(new Set());
  const [isCaptain, setIsCaptain] = useState(false);
  const [captainSquad, setCaptainSquad] = useState<{ id: string; name: string; tag?: string | null; is_legacy?: boolean } | null>(null);
  const [messageModal, setMessageModal] = useState<{ open: boolean; recipientId: string; recipientAlias: string }>({ open: false, recipientId: '', recipientAlias: '' });
  const [messageSubject, setMessageSubject] = useState('');
  const [messageContent, setMessageContent] = useState('');
  const [isSendingMessage, setIsSendingMessage] = useState(false);
  const [isInviting, setIsInviting] = useState<string | null>(null);

  // Load core data on mount
  useEffect(() => {
    loadData();
  }, []);

  // Load user-specific data when auth resolves
  useEffect(() => {
    if (user) {
      loadUserProfile();
      checkIfInFreeAgentPool();
      loadCaptainStatus();
    } else if (!authLoading) {
      setProfile(null);
    }
  }, [user, authLoading]);

  const loadData = async () => {
    setLoading(true);
    try {
      await Promise.all([
        loadFreeAgents(),
        loadActiveSquadMemberIds(),
      ]);
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadFreeAgents = async () => {
    try {
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
        timezone: agent.timezone || 'America/New_York',
      }));
      setFreeAgents(formattedAgents);
      setFreeAgentPlayerIds(new Set(formattedAgents.map(a => a.player_id)));
    } catch (error) {
      console.error('Error loading free agents:', error);
      toast.error('Failed to load free agents');
    }
  };

  const loadCaptainStatus = async () => {
    if (!user) return;
    try {
      const { data, error } = await supabase
        .from('squad_members')
        .select('role, squads!inner(id, name, tag, is_active, is_legacy)')
        .eq('player_id', user.id)
        .eq('status', 'active')
        .eq('squads.is_active', true)
        .limit(5);

      if (!error && data && data.length > 0) {
        const captainRow = data.find((m: any) => m.role === 'captain');
        if (captainRow) {
          const squad = captainRow.squads as any;
          setIsCaptain(true);
          setCaptainSquad({ id: squad.id, name: squad.name, tag: squad.tag, is_legacy: squad.is_legacy });
          return;
        }
      }
      setIsCaptain(false);
      setCaptainSquad(null);
    } catch (e) {
      console.error('Error loading captain status:', e);
      setIsCaptain(false);
      setCaptainSquad(null);
    }
  };

  const openMessageModal = (recipientId: string, recipientAlias: string) => {
    if (!user) {
      toast.error('Please log in to send messages');
      return;
    }
    setMessageModal({ open: true, recipientId, recipientAlias });
    setMessageSubject('');
    setMessageContent('');
  };

  const sendQuickMessage = async () => {
    if (!user || !messageModal.recipientId || !messageContent.trim()) return;
    setIsSendingMessage(true);
    try {
      const { error } = await supabase
        .from('private_messages')
        .insert({
          sender_id: user.id,
          recipient_id: messageModal.recipientId,
          subject: messageSubject.trim() || 'No Subject',
          content: messageContent.trim(),
        });
      if (error) throw error;
      toast.success('Message sent');
      setMessageModal({ open: false, recipientId: '', recipientAlias: '' });
      setMessageSubject('');
      setMessageContent('');
    } catch (err: any) {
      console.error('Error sending message:', err);
      toast.error('Failed to send message');
    } finally {
      setIsSendingMessage(false);
    }
  };

  const invitePlayerToSquad = async (playerId: string) => {
    if (!isCaptain || !captainSquad || !user) return;
    setIsInviting(playerId);
    try {
      const { checkRosterLockStatus } = await import('@/utils/rosterLock');
      const rosterStatus = await checkRosterLockStatus();
      if (rosterStatus.isLocked) {
        toast.error('Squad invitations are currently disabled during roster lock period');
        setIsInviting(null);
        return;
      }

      const { data: existingInvite } = await supabase
        .from('squad_invites')
        .select('id, status, expires_at')
        .eq('squad_id', captainSquad.id)
        .eq('invited_player_id', playerId)
        .eq('status', 'pending')
        .gt('expires_at', new Date().toISOString())
        .maybeSingle();

      if (existingInvite) {
        toast.error('Player already has a pending invitation to your squad');
        setIsInviting(null);
        return;
      }

      const { error } = await supabase
        .from('squad_invites')
        .insert([{
          squad_id: captainSquad.id,
          invited_player_id: playerId,
          invited_by: user.id,
          expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
          message: captainSquad.is_legacy
            ? `Invitation to join legacy squad ${captainSquad.name}.`
            : `Invitation to join ${captainSquad.name}`,
        }]);
      if (error) throw error;
      toast.success('Invitation sent');
    } catch (e) {
      console.error('Error inviting player:', e);
      toast.error('Failed to send invitation');
    } finally {
      setIsInviting(null);
    }
  };

  const loadActiveSquadMemberIds = async () => {
    try {
      // Single query: fetch all active squad members with their squad info
      const { data, error } = await supabase
        .from('squad_members')
        .select('player_id, status, squads!inner(id, is_active, name, tag, is_legacy)')
        .eq('status', 'active');

      if (error) {
        console.error('Error loading squad members:', error);
        setActiveSquadMemberIds(new Set());
        setPlayerIdToActiveSquad({});
        return;
      }

      const activeIds: string[] = [];
      const displayMap: Record<string, { id: string; name: string; tag?: string | null; is_legacy?: boolean }> = {};

      (data || []).forEach((m: any) => {
        if (!m.player_id || !m.squads) return;
        const squad = m.squads;
        // Build display map for all squad memberships (active + legacy/inactive squads)
        displayMap[m.player_id] = {
          id: squad.id,
          name: squad.name,
          tag: squad.tag,
          is_legacy: squad.is_legacy,
        };
        // Only count as "in active squad" if the squad itself is active
        if (squad.is_active) {
          activeIds.push(m.player_id);
        }
      });

      setActiveSquadMemberIds(new Set(activeIds));
      setPlayerIdToActiveSquad(displayMap);
    } catch (e) {
      console.error('Error loading active squad member IDs:', e);
      setActiveSquadMemberIds(new Set());
      setPlayerIdToActiveSquad({});
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
        .maybeSingle();
      if (error) {
        console.error('Error checking free agent status:', error);
        setIsInFreeAgentPool(false);
        return;
      }
      setIsInFreeAgentPool(!!data);
    } catch (error) {
      console.error('Error checking free agent pool status:', error);
      setIsInFreeAgentPool(false);
    }
  };

  const joinFreeAgentPool = async (formData: FreeAgentFormData) => {
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
          is_active: true,
        });
      if (error) throw error;
      toast.success('Successfully joined the free agent pool!');
      setIsInFreeAgentPool(true);
      setShowJoinForm(false);
      loadData();
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
      loadData();
    } catch (error) {
      console.error('Error leaving free agent pool:', error);
      toast.error('Failed to leave free agent pool');
    }
  };

  // Stable dataset for class distribution charts
  const baseAgentsForCharts: FreeAgent[] = useMemo(() => freeAgents, [freeAgents]);

  // Build the data source (free agents only, with optional squad-filter)
  const getDataSource = (): FreeAgent[] => {
    if (!includeInSquadPlayers) {
      return freeAgents.filter(agent => !activeSquadMemberIds.has(agent.player_id));
    }
    return freeAgents;
  };

  const filteredAndSortedAgents = getDataSource()
    .filter(agent => {
      if (searchTerm &&
          !agent.player_alias.toLowerCase().includes(searchTerm.toLowerCase()) &&
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
      if (Array.isArray(aValue)) aValue = aValue.join(', ');
      if (Array.isArray(bValue)) bValue = bValue.join(', ');
      if (typeof aValue === 'string' && typeof bValue === 'string') {
        const comparison = aValue.localeCompare(bValue);
        return sortDirection === 'asc' ? comparison : -comparison;
      }
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

  // Helper: format availability display
  const formatAvailability = (agent: FreeAgent) => {
    if (agent.availability_days && agent.availability_days.length > 0) {
      const times = agent.availability_times || {};
      const dayOrder = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
      const availableSet = new Set(agent.availability_days);

      const dayBar = (
        <div className="grid grid-cols-7 rounded overflow-hidden border-2 border-black">
          {dayOrder.map((d, idx) => {
            const available = availableSet.has(d);
            return (
              <div
                key={d}
                title={d.slice(0, 3)}
                className={`${available ? 'bg-green-500' : 'bg-red-600'} border-2 border-black h-4 flex items-center justify-center ${idx !== 6 ? 'border-r-2' : ''}`}
              >
                <span className="text-[9px] leading-none font-bold text-black">{d.slice(0, 3)}</span>
              </div>
            );
          })}
        </div>
      );

      const timeEntries = Object.entries(times);
      if (timeEntries.length === 0) {
        return <div className="flex items-center gap-2">{dayBar}</div>;
      }

      const uniqueTimeKeys = new Set<string>();
      const uniqueTimes: { start: string; end: string }[] = [];
      for (const d of dayOrder) {
        const t = times[d];
        if (!t) continue;
        const key = `${t.start}-${t.end}`;
        if (!uniqueTimeKeys.has(key)) {
          uniqueTimeKeys.add(key);
          uniqueTimes.push({ start: t.start, end: t.end });
        }
      }

      return (
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2">{dayBar}</div>
          <div className="flex flex-wrap items-center gap-1">
            {uniqueTimes.map((t, idx) => (
              <div key={idx} className="flex items-center gap-1 bg-blue-500/20 border border-blue-500/30 rounded px-1.5 py-0.5">
                <span className="text-green-400 text-xs font-medium">{formatTime(t.start)}</span>
                <span className="text-gray-400 text-xs">-</span>
                <span className="text-red-400 text-xs font-medium">{formatTime(t.end)}</span>
              </div>
            ))}
          </div>
        </div>
      );
    }
    return <span className="text-gray-400 text-sm">{agent.availability || 'Not specified'}</span>;
  };

  const formatTime = (time: string) => {
    if (!time) return '';
    const [hours, minutes] = time.split(':');
    const hour = parseInt(hours);
    const ampm = hour >= 12 ? 'PM' : 'AM';
    const displayHour = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
    return `${displayHour}:${minutes} ${ampm}`;
  };

  const renderClassBadges = (agent: FreeAgent, type: 'preferred' | 'secondary' | 'try') => {
    let classes: string[] = [];
    let opacity = '';
    switch (type) {
      case 'preferred': classes = agent.preferred_roles || []; break;
      case 'secondary': classes = agent.secondary_roles || []; opacity = 'opacity-75'; break;
      case 'try': classes = agent.classes_to_try || []; opacity = 'opacity-60'; break;
    }
    return classes.map((className: string, index: number) => {
      const colorClass = CLASS_COLORS[className] || 'bg-gray-500/20 text-gray-300 border-gray-500/30';
      return (
        <div key={`${type}-${index}`} className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium border ${colorClass} ${opacity}`}>
          <span className="leading-none">{className}</span>
        </div>
      );
    });
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-slate-800 to-gray-900">
      <Navbar user={user} />

      <main className="container mx-auto px-4 py-6">
        <div className="max-w-7xl mx-auto">

          {/* Header */}
          <div className="mb-6">
            <h1 className="text-3xl font-bold text-purple-400 tracking-wider mb-2">
              Free Agent Pool
            </h1>
            <p className="text-gray-400">Players looking for squads — browse availability, class preferences, and reach out.</p>
          </div>

          {/* Compact Controls */}
          <div className="bg-gradient-to-r from-gray-900/80 via-gray-800/80 to-gray-900/80 backdrop-blur-sm rounded-xl p-4 border border-cyan-500/20 shadow-xl mb-6">
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

                {/* Class Distribution Toggle */}
                <button
                  type="button"
                  onClick={() => setShowClassDistribution(v => !v)}
                  className={`inline-flex items-center gap-2 px-3 py-2 rounded-lg text-xs sm:text-sm font-medium transition-all border shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-0 ${
                    showClassDistribution
                      ? 'bg-gradient-to-r from-fuchsia-600/30 to-cyan-600/30 text-white border-fuchsia-400/40 ring-1 ring-fuchsia-400/30'
                      : 'bg-gray-800/60 text-gray-200 border-gray-600/60 hover:bg-gray-700/70'
                  }`}
                  title="Toggle class distribution charts"
                >
                  <span className="text-base">📊</span>
                  {showClassDistribution ? 'Hide Class Breakdown' : 'Show Class Breakdown'}
                </button>

                <span className="bg-gradient-to-r from-cyan-500/20 to-purple-500/20 border border-cyan-500/30 rounded-full px-3 sm:px-4 py-1 text-cyan-300 text-xs sm:text-sm font-medium w-fit">
                  <span className="text-white font-bold">{filteredAndSortedAgents.length}</span> free agents found
                </span>

                {/* Join / Leave / Update buttons */}
                {user && !isInFreeAgentPool && (
                  <button
                    type="button"
                    onClick={() => setShowJoinForm(true)}
                    className="inline-flex items-center gap-2 px-3 py-2 rounded-lg text-xs sm:text-sm font-semibold transition-all bg-green-600/80 hover:bg-green-600 text-white border border-green-400/40 shadow-sm"
                    title="Join the Free Agent pool"
                  >
                    <span>Join Free Agent Pool</span>
                  </button>
                )}
                {user && isInFreeAgentPool && (
                  <div className="flex items-center gap-2">
                    <a
                      href="/free-agents/update"
                      className="inline-flex items-center gap-2 px-3 py-2 rounded-lg text-xs sm:text-sm font-semibold transition-all bg-cyan-600/80 hover:bg-cyan-600 text-white border border-cyan-400/40 shadow-sm"
                    >
                      ✏️ Update Info
                    </a>
                    <button
                      type="button"
                      onClick={leaveFreeAgentPool}
                      className="inline-flex items-center gap-2 px-3 py-2 rounded-lg text-xs sm:text-sm font-semibold transition-all bg-red-600/80 hover:bg-red-600 text-white border border-red-400/40 shadow-sm"
                    >
                      Leave Pool
                    </button>
                  </div>
                )}
              </div>

              {/* Filters */}
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

                {/* Classes Filter */}
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-sm sm:text-lg flex-shrink-0">⚔️</span>
                  <select
                    value={classFilter}
                    onChange={(e) => setClassFilter(e.target.value)}
                    className="bg-gray-700/50 border border-pink-500/30 rounded-lg px-2 sm:px-3 py-2 text-white focus:border-pink-400 transition-all duration-300 text-sm min-w-0 flex-1 sm:w-auto"
                  >
                    <option value="all">All Classes</option>
                    {CLASS_OPTIONS.map(cls => (
                      <option key={cls} value={cls}>{cls}</option>
                    ))}
                  </select>
                </div>

                {/* Include in-squad players toggle */}
                <label
                  className={`flex items-center gap-2 min-w-0 rounded-lg px-3 py-2 text-sm transition-colors border shadow-sm ${
                    includeInSquadPlayers
                      ? 'bg-green-600/20 border-green-400/50 text-green-300 ring-1 ring-green-400/30'
                      : 'bg-gray-700/50 border-gray-600/50 text-gray-200 hover:bg-gray-700/70'
                  }`}
                >
                  <input
                    type="checkbox"
                    className={`form-checkbox h-4 w-4 ${includeInSquadPlayers ? 'accent-green-500' : 'accent-gray-400'}`}
                    checked={includeInSquadPlayers}
                    onChange={(e) => setIncludeInSquadPlayers(e.target.checked)}
                  />
                  Include players already in squads
                </label>
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
            <>
              {showClassDistribution && (
                <div className="mb-6">
                  <ClassDistributionView agents={baseAgentsForCharts} onSelectClass={(cls) => setClassFilter(cls)} />
                </div>
              )}
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
                        <div className={`inline-flex px-2 py-1 rounded-full text-xs font-medium border ${SKILL_LEVEL_COLORS[agent.skill_level] || ''}`}>
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
                              <div className="flex flex-wrap gap-1 mt-1">{renderClassBadges(agent, 'preferred')}</div>
                            </div>
                          )}
                          {agent.secondary_roles && agent.secondary_roles.length > 0 && (
                            <div>
                              <span className="text-xs text-purple-400 font-medium">Secondary:</span>
                              <div className="flex flex-wrap gap-1 mt-1">{renderClassBadges(agent, 'secondary')}</div>
                            </div>
                          )}
                          {agent.classes_to_try && agent.classes_to_try.length > 0 && (
                            <div>
                              <span className="text-xs text-indigo-400 font-medium">Want to Try:</span>
                              <div className="flex flex-wrap gap-1 mt-1">{renderClassBadges(agent, 'try')}</div>
                            </div>
                          )}
                          {agent.class_ratings && Object.keys(agent.class_ratings).length > 0 && (
                            <div>
                              <span className="text-xs text-yellow-400 font-medium">Self Ratings:</span>
                              <div className="flex flex-wrap gap-1 mt-1">
                                {Object.entries(agent.class_ratings).map(([cls, rating]) => {
                                  const colorClass = CLASS_COLORS[cls] || 'bg-gray-500/20 text-gray-300 border-gray-500/30';
                                  return (
                                    <div key={cls} className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium border ${colorClass}`}>
                                      <span className="leading-none">{cls}</span>
                                      <span className="text-yellow-300 font-bold">{rating}/5</span>
                                    </div>
                                  );
                                })}
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

                      <div className="pt-4 border-t border-gray-700/50 space-y-3">
                        {/* Squad badge & contact info */}
                        <div className="flex flex-wrap items-center gap-2">
                          {playerIdToActiveSquad[agent.player_id] && (
                            <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full border border-blue-500/30 text-blue-300 bg-blue-500/10 text-xs">
                              🛡️ {playerIdToActiveSquad[agent.player_id].name}
                            </span>
                          )}
                          {agent.contact_info && (
                            <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full border border-indigo-500/30 text-indigo-300 bg-indigo-500/10 text-xs">
                              💬 {agent.contact_info}
                            </span>
                          )}
                        </div>

                        {/* Action buttons & join date */}
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2 text-xs text-gray-500">
                            <span>📅</span>
                            <span>Joined {new Date(agent.created_at).toLocaleDateString()}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => openMessageModal(agent.player_id, agent.player_alias)}
                              className="px-2 py-1 rounded-md text-xs font-medium bg-cyan-600 hover:bg-cyan-500 text-white border border-cyan-400/30 transition-colors"
                              aria-label={`Message ${agent.player_alias}`}
                            >
                              ✉ Message
                            </button>
                            {isCaptain && freeAgentPlayerIds.has(agent.player_id) && (
                              <button
                                onClick={() => invitePlayerToSquad(agent.player_id)}
                                disabled={isInviting === agent.player_id}
                                className={`px-2 py-1 rounded-md text-xs font-medium border transition-colors ${isInviting === agent.player_id ? 'bg-gray-600 text-gray-300 border-gray-500' : 'bg-purple-600 hover:bg-purple-500 text-white border-purple-400/30'}`}
                                title={`Invite ${agent.player_alias} to your squad`}
                              >
                                {isInviting === agent.player_id ? '…' : '📩 Invite'}
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </>
          ) : (
            /* Table View */
            <>
              {showClassDistribution && (
                <div className="mb-6">
                  <ClassDistributionView agents={baseAgentsForCharts} onSelectClass={(cls) => setClassFilter(cls)} />
                </div>
              )}
              <div className="bg-gradient-to-br from-gray-900/80 via-gray-800/80 to-gray-900/80 backdrop-blur-sm rounded-2xl border border-cyan-500/20 shadow-2xl overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-gradient-to-r from-cyan-600/20 to-purple-600/20 border-b border-cyan-500/20">
                        <th
                          className="px-4 py-3 text-left text-xs font-bold text-cyan-300 cursor-pointer hover:text-cyan-200 transition-colors"
                          onClick={() => handleSort('player_alias')}
                        >
                          <div className="flex items-center gap-2">
                            <span className="text-lg">👤</span>
                            Player Name
                            {sortField === 'player_alias' && <span className="text-xs">{sortDirection === 'asc' ? '↑' : '↓'}</span>}
                          </div>
                        </th>
                        <th
                          className="px-4 py-3 text-left text-xs font-bold text-pink-300 cursor-pointer hover:text-pink-200 transition-colors"
                          onClick={() => handleSort('preferred_roles')}
                        >
                          <div className="flex items-center gap-2">
                            <span className="text-lg">⚔️</span>
                            Preferred
                            {sortField === 'preferred_roles' && <span className="text-xs">{sortDirection === 'asc' ? '↑' : '↓'}</span>}
                          </div>
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-bold text-purple-300">
                          <div className="flex items-center gap-2"><span className="text-lg">🗡️</span> Secondary</div>
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-bold text-indigo-300">
                          <div className="flex items-center gap-2"><span className="text-lg">🧪</span> Try</div>
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-bold text-blue-300 min-w-[8rem] whitespace-nowrap">
                          <div className="flex items-center gap-2"><span className="text-lg">🛡️</span> Squad</div>
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-bold text-green-300 w-[28%]">
                          <div className="flex items-center gap-2">
                            <span className="text-lg">📅</span>
                            <span className="flex items-center gap-1">
                              Availability
                              <span className="text-[10px] text-gray-300">(EST)</span>
                              <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-gray-700 text-gray-200 text-[10px]" title="All availability times are displayed in Eastern Time (EST).">?</span>
                            </span>
                          </div>
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-bold text-gray-300 w-[40%]">
                          <div className="flex items-center gap-2"><span className="text-lg">📝</span> Notes</div>
                        </th>
                        <th className="px-2 py-3 text-left text-xs font-bold text-cyan-300 whitespace-nowrap">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredAndSortedAgents.map((agent: FreeAgent, index: number) => (
                        <tr
                          key={agent.id}
                          className="border-b border-gray-700/30 hover:bg-gradient-to-r hover:from-cyan-500/5 hover:to-purple-500/5 transition-all duration-300"
                          style={{ animationDelay: `${index * 50}ms` }}
                        >
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-3">
                              <div className="w-8 h-8 bg-gradient-to-r from-cyan-500 to-purple-500 rounded-full flex items-center justify-center text-white font-bold text-sm">
                                {agent.player_alias.charAt(0).toUpperCase()}
                              </div>
                              <div>
                                <span className="font-medium text-white text-sm">{agent.player_alias}</span>
                                {agent.contact_info && (
                                  <div className="text-xs text-gray-500">💬 {agent.contact_info}</div>
                                )}
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            {agent.preferred_roles && agent.preferred_roles.length > 0 ? (
                              <div className="flex flex-wrap gap-1">{renderClassBadges(agent, 'preferred')}</div>
                            ) : <span className="text-gray-500 text-xs">—</span>}
                          </td>
                          <td className="px-4 py-3">
                            {agent.secondary_roles && agent.secondary_roles.length > 0 ? (
                              <div className="flex flex-wrap gap-1">{renderClassBadges(agent, 'secondary')}</div>
                            ) : <span className="text-gray-500 text-xs">—</span>}
                          </td>
                          <td className="px-4 py-3">
                            {agent.classes_to_try && agent.classes_to_try.length > 0 ? (
                              <div className="flex flex-wrap gap-1">{renderClassBadges(agent, 'try')}</div>
                            ) : <span className="text-gray-500 text-xs">—</span>}
                          </td>
                          <td className="px-4 py-3 min-w-[8rem] whitespace-nowrap">
                            {playerIdToActiveSquad[agent.player_id] ? (
                              <div className="flex items-center gap-2 text-xs">
                                <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full border border-blue-500/30 text-blue-300 bg-blue-500/10">
                                  <span>{playerIdToActiveSquad[agent.player_id].name}</span>
                                </span>
                              </div>
                            ) : <span className="text-gray-400 text-xs">—</span>}
                          </td>
                          <td className="px-4 py-3 w-[28%]">
                            <div className="text-gray-300 text-xs">{formatAvailability(agent)}</div>
                          </td>
                          <td className="px-4 py-3 w-[40%]">
                            {agent.notes ? (
                              <div className="text-gray-300 text-xs break-words whitespace-pre-line">{agent.notes}</div>
                            ) : <span className="text-gray-500 text-xs">—</span>}
                          </td>
                          <td className="px-2 py-3 whitespace-nowrap">
                            <div className="flex items-center gap-1">
                              <button
                                onClick={() => openMessageModal(agent.player_id, agent.player_alias)}
                                className="px-1.5 py-0.5 rounded-md text-xs font-medium bg-cyan-600 hover:bg-cyan-500 text-white border border-cyan-400/30"
                                aria-label={`Message ${agent.player_alias}`}
                              >
                                ✉
                              </button>
                              {isCaptain && freeAgentPlayerIds.has(agent.player_id) && (
                                <button
                                  onClick={() => invitePlayerToSquad(agent.player_id)}
                                  disabled={isInviting === agent.player_id}
                                  className={`px-1.5 py-0.5 rounded-md text-xs font-medium border ${isInviting === agent.player_id ? 'bg-gray-600 text-gray-300 border-gray-500' : 'bg-purple-600 hover:bg-purple-500 text-white border-purple-400/30'}`}
                                  title={`Invite ${agent.player_alias} to your squad`}
                                >
                                  {isInviting === agent.player_id ? '…' : 'Inv'}
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
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

      {/* Message Modal */}
      {messageModal.open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="w-full max-w-lg mx-4 rounded-xl border border-cyan-500/30 bg-gray-900 p-6 shadow-2xl">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-bold text-cyan-300">Message {messageModal.recipientAlias}</h3>
              <button
                onClick={() => setMessageModal({ open: false, recipientId: '', recipientAlias: '' })}
                className="text-gray-400 hover:text-white"
                aria-label="Close"
              >✕</button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="mb-1 block text-sm text-gray-300">Subject</label>
                <input type="text" value={messageSubject} onChange={(e) => setMessageSubject(e.target.value)}
                  placeholder={`Message to ${messageModal.recipientAlias}`}
                  className="w-full rounded-lg border border-gray-600 bg-gray-800 px-3 py-2 text-gray-200 focus:border-cyan-500 focus:outline-none" />
              </div>
              <div>
                <label className="mb-1 block text-sm text-gray-300">Message</label>
                <textarea value={messageContent} onChange={(e) => setMessageContent(e.target.value)} rows={6}
                  placeholder="Write your message..."
                  className="w-full resize-y rounded-lg border border-gray-600 bg-gray-800 px-3 py-2 text-gray-200 focus:border-cyan-500 focus:outline-none" />
              </div>
            </div>
            <div className="mt-6 flex items-center justify-end gap-3">
              <button onClick={() => setMessageModal({ open: false, recipientId: '', recipientAlias: '' })}
                className="rounded-lg border border-gray-600 bg-gray-700 px-4 py-2 text-sm text-gray-200 hover:bg-gray-600">Cancel</button>
              <button onClick={sendQuickMessage} disabled={isSendingMessage || !messageContent.trim()}
                className={`rounded-lg px-4 py-2 text-sm font-medium ${
                  isSendingMessage || !messageContent.trim()
                    ? 'cursor-not-allowed border-gray-700 bg-gray-700 text-gray-400'
                    : 'border border-cyan-500/40 bg-cyan-600 text-white hover:bg-cyan-500'
                }`}>
                {isSendingMessage ? 'Sending…' : 'Send Message'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
