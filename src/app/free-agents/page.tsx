'use client';

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { useAuth } from '@/lib/AuthContext';
import { supabase } from '@/lib/supabase';
import Navbar from '@/components/Navbar';
import { toast } from 'react-hot-toast';
import { getFreeAgents } from '@/utils/supabaseHelpers';
import ClassDistributionView from '@/components/ClassDistributionView';
import { CLASS_COLORS, CLASS_OPTIONS } from '@/lib/constants';
import {
  getLeagues,
  pickFeatured,
  getOpenSeason,
  seasonLabel,
  poolBlurb,
  type LeagueInfo,
  type LeagueSeason,
} from '@/lib/leagues';

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
  league_slug?: string | null;
  season_number?: number | null;
}

interface UserProfile {
  id: string;
  in_game_alias: string;
  is_league_banned: boolean;
  is_admin?: boolean;
  ctf_role?: string | null;
}

type SquadRef = { id: string; name: string; tag?: string | null; is_legacy?: boolean; is_active?: boolean };

const DAY_ORDER = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

/**
 * Free agent pool — the roster board for the featured league's open season.
 * Joining the pool = registering for the league (/league/register).
 */
export default function FreeAgentsPage() {
  const { user, loading: authLoading } = useAuth();

  // League context
  const [league, setLeague] = useState<LeagueInfo | null>(null);
  const [season, setSeason] = useState<LeagueSeason | null>(null);

  // Data
  const [freeAgents, setFreeAgents] = useState<FreeAgent[]>([]);
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [isInFreeAgentPool, setIsInFreeAgentPool] = useState(false);
  const [activeSquadMemberIds, setActiveSquadMemberIds] = useState<Set<string>>(new Set());
  const [playerIdToActiveSquad, setPlayerIdToActiveSquad] = useState<Record<string, SquadRef>>({});
  const [isCaptain, setIsCaptain] = useState(false);
  const [captainSquad, setCaptainSquad] = useState<SquadRef | null>(null);
  const [captainCandidates, setCaptainCandidates] = useState<Set<string>>(new Set());

  // UI
  const [flash, setFlash] = useState<'registered' | 'updated' | null>(null);
  const [showClassDistribution, setShowClassDistribution] = useState(false);
  const [classFilter, setClassFilter] = useState<string>('all');
  const [sortBy, setSortBy] = useState<'newest' | 'name'>('newest');
  const [searchTerm, setSearchTerm] = useState('');
  const [includeInSquadPlayers, setIncludeInSquadPlayers] = useState(false);
  const [captainOnly, setCaptainOnly] = useState(false);
  const [leaving, setLeaving] = useState(false);

  const [messageModal, setMessageModal] = useState<{ open: boolean; recipientId: string; recipientAlias: string }>({ open: false, recipientId: '', recipientAlias: '' });
  const [messageSubject, setMessageSubject] = useState('');
  const [messageContent, setMessageContent] = useState('');
  const [isSendingMessage, setIsSendingMessage] = useState(false);
  const [isInviting, setIsInviting] = useState<string | null>(null);

  const isStaff = !!profile && (profile.is_admin === true || profile.ctf_role === 'ctf_admin');

  // "?registered=1" / "?updated=1" flash after coming back from the form.
  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      if (params.get('registered')) setFlash('registered');
      else if (params.get('updated')) setFlash('updated');
      if (params.get('registered') || params.get('updated')) {
        window.history.replaceState({}, '', window.location.pathname);
      }
    } catch { /* ignore */ }
  }, []);

  // League context first, then the pool for that season.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      let featured: LeagueInfo | null = null;
      let open: LeagueSeason | null = null;
      try {
        const leagues = await getLeagues();
        featured = pickFeatured(leagues);
        if (featured) open = await getOpenSeason(featured);
      } catch (e) {
        console.error('Error loading league context:', e);
      }
      if (cancelled) return;
      setLeague(featured);
      setSeason(open);
      await Promise.all([loadFreeAgents(featured, open), loadActiveSquadMemberIds()]);
      if (!cancelled) setLoading(false);
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // User-specific data
  useEffect(() => {
    if (user) {
      loadUserProfile();
      checkIfInFreeAgentPool();
      loadCaptainStatus();
    } else if (!authLoading) {
      setProfile(null);
      setIsInFreeAgentPool(false);
      setCaptainCandidates(new Set());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, authLoading]);

  // Staff → captain candidates for this season (server-gated).
  useEffect(() => {
    if (!isStaff || !league || !season) { setCaptainCandidates(new Set()); return; }
    let cancelled = false;
    (async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) return;
        const res = await fetch(`/api/free-agents/captain-interest?league=${encodeURIComponent(league.slug)}&season=${season.season_number}`, {
          headers: { Authorization: `Bearer ${session.access_token}` },
        });
        if (!res.ok) return;
        const json = await res.json();
        if (!cancelled) setCaptainCandidates(new Set<string>(json.player_ids || []));
      } catch (e) {
        console.error('Error loading captain candidates:', e);
      }
    })();
    return () => { cancelled = true; };
  }, [isStaff, league, season]);

  const loadFreeAgents = async (lg: LeagueInfo | null = league, sn: LeagueSeason | null = season) => {
    try {
      const data = await getFreeAgents(lg?.slug, sn?.season_number);
      const formatted: FreeAgent[] = (data || []).map((agent: any) => ({
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
        league_slug: agent.league_slug ?? null,
        season_number: agent.season_number ?? null,
      }));
      setFreeAgents(formatted);
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
      const displayMap: Record<string, SquadRef> = {};
      (data || []).forEach((m: any) => {
        if (!m.player_id || !m.squads) return;
        const squad = m.squads;
        // Prefer an active squad if the player is in several; an archived one is only "last season".
        const prev = displayMap[m.player_id];
        if (!prev || (!prev.is_active && squad.is_active)) {
          displayMap[m.player_id] = { id: squad.id, name: squad.name, tag: squad.tag, is_legacy: squad.is_legacy, is_active: !!squad.is_active };
        }
        if (squad.is_active) activeIds.push(m.player_id);
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
        .select('id, in_game_alias, is_league_banned, is_admin, ctf_role')
        .eq('id', user.id)
        .single();
      if (error) throw error;
      setProfile(data as UserProfile);
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
        .limit(1);
      if (error) {
        console.error('Error checking free agent status:', error);
        setIsInFreeAgentPool(false);
        return;
      }
      setIsInFreeAgentPool(!!data && data.length > 0);
    } catch (error) {
      console.error('Error checking free agent pool status:', error);
      setIsInFreeAgentPool(false);
    }
  };

  const leaveFreeAgentPool = async () => {
    if (!user) return;
    if (!confirm('Leave the pool? Captains will no longer see you for this season. You can register again any time while registration is open.')) return;
    setLeaving(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Session expired');
      const res = await fetch('/api/league/register', {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error || 'Failed to leave the pool');
      }
      toast.success('You left the pool');
      setIsInFreeAgentPool(false);
      await loadFreeAgents();
    } catch (error: any) {
      console.error('Error leaving free agent pool:', error);
      toast.error(error.message || 'Failed to leave free agent pool');
    } finally {
      setLeaving(false);
    }
  };

  // ---- Derived -------------------------------------------------------------

  const baseAgentsForCharts: FreeAgent[] = useMemo(() => freeAgents, [freeAgents]);

  const visibleAgents = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    return freeAgents
      .filter((agent) => {
        if (!includeInSquadPlayers && activeSquadMemberIds.has(agent.player_id)) return false;
        if (captainOnly && !captainCandidates.has(agent.player_id)) return false;
        if (classFilter !== 'all' &&
            !(agent.preferred_roles || []).includes(classFilter) &&
            !(agent.secondary_roles || []).includes(classFilter)) return false;
        if (term) {
          const hay = [
            agent.player_alias,
            agent.contact_info || '',
            agent.notes || '',
            ...(agent.preferred_roles || []),
            ...(agent.secondary_roles || []),
          ].join(' ').toLowerCase();
          if (!hay.includes(term)) return false;
        }
        return true;
      })
      .sort((a, b) => {
        if (sortBy === 'name') return a.player_alias.localeCompare(b.player_alias);
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      });
  }, [freeAgents, searchTerm, classFilter, includeInSquadPlayers, captainOnly, captainCandidates, activeSquadMemberIds, sortBy]);

  const formatTime = (time: string) => {
    if (!time) return '';
    const [hours, minutes] = time.split(':');
    const hour = parseInt(hours, 10);
    const ampm = hour >= 12 ? 'PM' : 'AM';
    const displayHour = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
    return minutes === '00' ? `${displayHour}${ampm}` : `${displayHour}:${minutes}${ampm}`;
  };

  const timeWindows = (agent: FreeAgent) => {
    const times = agent.availability_times || {};
    const seen = new Set<string>();
    const out: string[] = [];
    for (const d of DAY_ORDER) {
      const t = times[d];
      if (!t) continue;
      const key = `${t.start}-${t.end}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(`${formatTime(t.start)}–${formatTime(t.end)}`);
    }
    return out;
  };

  const classChip = (cls: string, variant: 'preferred' | 'secondary' | 'try', rating?: number) => {
    const color = CLASS_COLORS[cls] || 'bg-gray-500/20 text-gray-300 border-gray-500/30';
    const style =
      variant === 'preferred' ? color
      : variant === 'secondary' ? `${color} opacity-70`
      : 'border-dashed border-white/20 text-[#8B98B0]';
    return (
      <span key={`${variant}-${cls}`} className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[11px] font-medium leading-none ${style}`}>
        {cls}
        {rating ? <span className="text-[#F59E0B]">{'★'}{rating}</span> : null}
      </span>
    );
  };

  const poolTitle = league ? seasonLabel(league, season) : 'Free agent pool';
  const registrationOpen = !!(league && season);

  // ---- Render --------------------------------------------------------------

  return (
    <div className="ctf-theme min-h-screen">
      <Navbar user={user} />

      <main className="mx-auto max-w-7xl px-4 py-6">
        {/* Flash after registering */}
        {flash && (
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-[#34D399]/10 px-4 py-3 text-sm text-[#E6EDF7]">
            <span>
              <span className="font-semibold text-[#34D399]">{flash === 'registered' ? "You're registered." : 'Registration updated.'}</span>{' '}
              {league ? poolBlurb(league) : ''}
            </span>
            <button type="button" onClick={() => setFlash(null)} className="text-[#8B98B0] hover:text-[#E6EDF7]" aria-label="Dismiss">✕</button>
          </div>
        )}

        {/* Header */}
        <div className="mb-5 rounded-xl bg-[#131A2B] p-5 md:p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="mb-1 flex items-center gap-2">
                <span className="text-[11px] uppercase tracking-[0.2em] text-[#8B98B0]">Free agent pool</span>
                {registrationOpen && (
                  <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${season!.status === 'active' ? 'bg-[#34D399]/15 text-[#34D399]' : 'bg-[#F59E0B]/15 text-[#F59E0B]'}`}>
                    {season!.status === 'active' ? 'Season live' : 'Registration open'}
                  </span>
                )}
              </div>
              <h1 className="font-display text-3xl leading-none text-[#E6EDF7] md:text-4xl">{poolTitle}</h1>
              <p className="mt-2 max-w-xl text-sm text-[#8B98B0]">
                {league ? poolBlurb(league) : 'Players looking for a team.'}{' '}
                <span className="text-[#E6EDF7]">{freeAgents.length}</span> registered.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {user && isInFreeAgentPool ? (
                <>
                  <span className="rounded-md bg-[#34D399]/15 px-3 py-1.5 text-sm font-medium text-[#34D399]">You're registered</span>
                  <Link href="/league/register" className="rounded-md bg-white/5 px-3 py-1.5 text-sm text-[#E6EDF7] hover:bg-white/10">Edit</Link>
                  <button type="button" onClick={leaveFreeAgentPool} disabled={leaving} className="rounded-md px-3 py-1.5 text-sm text-[#8B98B0] hover:text-[#F87171] disabled:opacity-50">
                    {leaving ? 'Leaving…' : 'Leave pool'}
                  </button>
                </>
              ) : registrationOpen ? (
                <Link href="/league/register" className="rounded-md bg-[#22D3EE] px-4 py-2 text-sm font-semibold text-[#0B0F1A] hover:bg-[#67E8F9]">
                  {user ? `Register for ${league!.name}` : 'Sign in to register'}
                </Link>
              ) : (
                <span className="rounded-md bg-white/5 px-3 py-1.5 text-sm text-[#8B98B0]">Registration closed</span>
              )}
            </div>
          </div>
        </div>

        {/* Filters */}
        <div className="mb-5 flex flex-wrap items-center gap-2 rounded-xl bg-[#131A2B] px-4 py-3">
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search players, classes, notes…"
            className="min-w-0 flex-1 rounded-md border border-white/10 bg-[#0B0F1A] px-3 py-1.5 text-sm text-[#E6EDF7] placeholder-[#8B98B0]/70 focus:border-[#22D3EE] focus:outline-none sm:max-w-xs"
          />
          <select value={classFilter} onChange={(e) => setClassFilter(e.target.value)} className="rounded-md border border-white/10 bg-[#0B0F1A] px-2 py-1.5 text-sm text-[#E6EDF7] focus:border-[#22D3EE] focus:outline-none">
            <option value="all">All classes</option>
            {CLASS_OPTIONS.map((cls) => <option key={cls} value={cls}>{cls}</option>)}
          </select>
          <select value={sortBy} onChange={(e) => setSortBy(e.target.value as 'newest' | 'name')} className="rounded-md border border-white/10 bg-[#0B0F1A] px-2 py-1.5 text-sm text-[#E6EDF7] focus:border-[#22D3EE] focus:outline-none">
            <option value="newest">Newest first</option>
            <option value="name">Name A–Z</option>
          </select>
          <label className="flex cursor-pointer items-center gap-1.5 text-sm text-[#E6EDF7]">
            <input type="checkbox" checked={includeInSquadPlayers} onChange={(e) => setIncludeInSquadPlayers(e.target.checked)} className="text-[#22D3EE]" />
            Include players in squads
          </label>
          {isStaff && (
            <label className="flex cursor-pointer items-center gap-1.5 rounded-md bg-[#F59E0B]/10 px-2 py-1 text-sm text-[#F59E0B]" title="Staff only — players who ticked 'interested in captaining'">
              <input type="checkbox" checked={captainOnly} onChange={(e) => setCaptainOnly(e.target.checked)} className="text-[#F59E0B]" />
              Captain candidates ({captainCandidates.size})
            </label>
          )}
          <button
            type="button"
            onClick={() => setShowClassDistribution((v) => !v)}
            className={`ml-auto rounded-md px-3 py-1.5 text-sm transition-colors ${showClassDistribution ? 'bg-[#22D3EE]/15 text-[#22D3EE]' : 'bg-white/5 text-[#E6EDF7] hover:bg-white/10'}`}
          >
            Class breakdown
          </button>
          <span className="text-xs text-[#8B98B0]">{visibleAgents.length} shown</span>
        </div>

        {showClassDistribution && (
          <div className="mb-5">
            <ClassDistributionView agents={baseAgentsForCharts} onSelectClass={(cls) => setClassFilter(cls)} />
          </div>
        )}

        {/* Board */}
        {loading ? (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div key={i} className="animate-pulse rounded-xl bg-[#131A2B] p-5">
                <div className="mb-4 h-5 w-1/2 rounded bg-[#1B2438]" />
                <div className="mb-2 h-4 rounded bg-[#1B2438]" />
                <div className="h-4 w-3/4 rounded bg-[#1B2438]" />
              </div>
            ))}
          </div>
        ) : visibleAgents.length === 0 ? (
          <div className="rounded-xl bg-[#131A2B] py-16 text-center">
            <p className="font-display text-2xl text-[#E6EDF7]">{freeAgents.length === 0 ? 'Nobody has registered yet' : 'No players match those filters'}</p>
            <p className="mt-1 text-sm text-[#8B98B0]">
              {freeAgents.length === 0 && registrationOpen ? 'Be the first — registration takes about a minute.' : 'Try clearing the search or class filter.'}
            </p>
            {freeAgents.length === 0 && registrationOpen && user && !isInFreeAgentPool && (
              <Link href="/league/register" className="mt-4 inline-block rounded-md bg-[#22D3EE] px-4 py-2 text-sm font-semibold text-[#0B0F1A] hover:bg-[#67E8F9]">Register</Link>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {visibleAgents.map((agent) => {
              const squad = playerIdToActiveSquad[agent.player_id];
              const days = new Set(agent.availability_days || []);
              const windows = timeWindows(agent);
              const isMe = user?.id === agent.player_id;
              const captainCandidate = isStaff && captainCandidates.has(agent.player_id);
              return (
                <article key={agent.id} className={`flex flex-col rounded-xl bg-[#131A2B] p-4 ${isMe ? 'ring-1 ring-[#22D3EE]/40' : ''}`}>
                  {/* Identity */}
                  <div className="flex items-start gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#1B2438] font-display text-lg text-[#22D3EE]">
                      {agent.player_alias.charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <span className="truncate font-display text-lg leading-tight text-[#E6EDF7]">
                          {agent.player_alias}
                        </span>
                        {isMe && <span className="rounded bg-[#22D3EE]/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[#22D3EE]">You</span>}
                        {captainCandidate && (
                          <span className="rounded bg-[#F59E0B]/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[#F59E0B]" title="Staff only: interested in captaining">
                            Captain candidate
                          </span>
                        )}
                      </div>
                      <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-[#8B98B0]">
                        {agent.contact_info && <span title="Discord">@{agent.contact_info.replace(/^@/, '')}</span>}
                        {squad && squad.is_active ? (
                          <span className="rounded bg-[#22D3EE]/10 px-1.5 py-0.5 text-[#E6EDF7]" title="Currently on this squad">
                            {squad.tag ? `[${squad.tag}] ` : ''}{squad.name}
                          </span>
                        ) : squad ? (
                          <span className="text-[#8B98B0]/80" title="Archived squad from a previous season">
                            Last season · {squad.tag ? `[${squad.tag}] ` : ''}{squad.name}
                          </span>
                        ) : null}
                      </div>
                    </div>
                  </div>

                  {/* Classes */}
                  <div className="mt-3 space-y-1.5">
                    {agent.preferred_roles.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {agent.preferred_roles.map((cls) => classChip(cls, 'preferred', agent.class_ratings?.[cls]))}
                      </div>
                    )}
                    {(agent.secondary_roles?.length || 0) > 0 && (
                      <div className="flex flex-wrap items-center gap-1">
                        <span className="text-[10px] uppercase tracking-wide text-[#8B98B0]">Also</span>
                        {agent.secondary_roles!.map((cls) => classChip(cls, 'secondary', agent.class_ratings?.[cls]))}
                      </div>
                    )}
                    {(agent.classes_to_try?.length || 0) > 0 && (
                      <div className="flex flex-wrap items-center gap-1">
                        <span className="text-[10px] uppercase tracking-wide text-[#8B98B0]">Learning</span>
                        {agent.classes_to_try!.map((cls) => classChip(cls, 'try'))}
                      </div>
                    )}
                  </div>

                  {/* Availability */}
                  <div className="mt-3">
                    <div className="grid grid-cols-7 gap-0.5 overflow-hidden rounded-md">
                      {DAY_ORDER.map((d) => {
                        const on = days.has(d);
                        return (
                          <div key={d} title={d} className={`py-1 text-center text-[10px] font-semibold ${on ? 'bg-[#34D399]/20 text-[#34D399]' : 'bg-[#0B0F1A] text-[#8B98B0]/50'}`}>
                            {d.slice(0, 2)}
                          </div>
                        );
                      })}
                    </div>
                    <div className="mt-1 text-xs text-[#8B98B0]">
                      {windows.length > 0 ? `${windows.join(' · ')} EST` : days.size > 0 ? 'Times not set' : agent.availability || 'Availability not set'}
                    </div>
                  </div>

                  {/* Notes */}
                  {agent.notes && (
                    <p className="mt-3 line-clamp-3 text-sm text-[#E6EDF7]/80" title={agent.notes}>{agent.notes}</p>
                  )}

                  {/* Footer */}
                  <div className="mt-auto flex items-center justify-between pt-4 text-xs text-[#8B98B0]">
                    <span>Joined {new Date(agent.created_at).toLocaleDateString()}</span>
                    <div className="flex items-center gap-1.5">
                      {!isMe && (
                        <button type="button" onClick={() => openMessageModal(agent.player_id, agent.player_alias)} className="rounded-md bg-white/5 px-2.5 py-1 text-xs text-[#E6EDF7] hover:bg-white/10">
                          Message
                        </button>
                      )}
                      {/* Invites only make sense in a squad league (CTFPL). Draft/OvD rosters are built by the draft or staff. */}
                      {isCaptain && !isMe && league?.format === 'squad' && (
                        <button
                          type="button"
                          onClick={() => invitePlayerToSquad(agent.player_id)}
                          disabled={isInviting === agent.player_id}
                          className="rounded-md bg-[#22D3EE] px-2.5 py-1 text-xs font-semibold text-[#0B0F1A] hover:bg-[#67E8F9] disabled:opacity-50"
                          title={`Invite ${agent.player_alias} to ${captainSquad?.name || 'your squad'}`}
                        >
                          {isInviting === agent.player_id ? '…' : 'Invite'}
                        </button>
                      )}
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </main>

      {/* Message Modal */}
      {messageModal.open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="mx-4 w-full max-w-lg rounded-xl bg-[#131A2B] p-6 shadow-2xl">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="font-display text-xl text-[#E6EDF7]">Message {messageModal.recipientAlias}</h3>
              <button onClick={() => setMessageModal({ open: false, recipientId: '', recipientAlias: '' })} className="text-[#8B98B0] hover:text-[#E6EDF7]" aria-label="Close">✕</button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="mb-1 block text-xs uppercase tracking-wide text-[#8B98B0]">Subject</label>
                <input type="text" value={messageSubject} onChange={(e) => setMessageSubject(e.target.value)}
                  placeholder={`Message to ${messageModal.recipientAlias}`}
                  className="w-full rounded-md border border-white/10 bg-[#0B0F1A] px-3 py-2 text-sm text-[#E6EDF7] focus:border-[#22D3EE] focus:outline-none" />
              </div>
              <div>
                <label className="mb-1 block text-xs uppercase tracking-wide text-[#8B98B0]">Message</label>
                <textarea value={messageContent} onChange={(e) => setMessageContent(e.target.value)} rows={6}
                  placeholder="Write your message..."
                  className="w-full resize-y rounded-md border border-white/10 bg-[#0B0F1A] px-3 py-2 text-sm text-[#E6EDF7] focus:border-[#22D3EE] focus:outline-none" />
              </div>
            </div>
            <div className="mt-6 flex items-center justify-end gap-2">
              <button onClick={() => setMessageModal({ open: false, recipientId: '', recipientAlias: '' })} className="rounded-md bg-white/5 px-4 py-2 text-sm text-[#E6EDF7] hover:bg-white/10">Cancel</button>
              <button onClick={sendQuickMessage} disabled={isSendingMessage || !messageContent.trim()}
                className="rounded-md bg-[#22D3EE] px-4 py-2 text-sm font-semibold text-[#0B0F1A] hover:bg-[#67E8F9] disabled:cursor-not-allowed disabled:opacity-50">
                {isSendingMessage ? 'Sending…' : 'Send'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
