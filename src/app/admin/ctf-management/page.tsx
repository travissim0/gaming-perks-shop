'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/lib/AuthContext';
import { supabase } from '@/lib/supabase';
import { patchSquads } from '@/lib/admin-squads';
import Navbar from '@/components/Navbar';
import { toast } from 'react-hot-toast';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ExternalLink } from 'lucide-react';
import {
  getLeagues,
  pickFeatured,
  getOpenSeason,
  getLatestSeason,
  getSeasonDraft,
  seasonPhase,
  type LeagueInfo,
  type LeagueSeason,
} from '@/lib/leagues';
import { displayFont, bodyFont } from '@/lib/fonts';
import { inputCls, labelCls, btnPrimary, btnQuiet, btnDanger } from '@/components/ctf/FormBits';
import { Chip, Panel, Modal, Spinner, Empty, th, td, pill } from '@/components/ctf/AdminBits';
import SeasonSettingsPanel from '@/components/admin/SeasonSettingsPanel';
import DiscordBotPanel from '@/components/admin/DiscordBotPanel';
import DiscordAppPanel from '@/components/admin/DiscordAppPanel';

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
  league_slug?: string | null;
}

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
  notes?: string;
  is_active: boolean;
  created_at: string;
  contact_info?: string;
  league_slug?: string | null;
  season_number?: number | null;
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

type Tab = 'squads' | 'pool' | 'season' | 'discord' | 'tournament' | 'bans';
const TAB_ALIASES: Record<string, Tab> = { squads: 'squads', pool: 'pool', 'free-agents': 'pool', season: 'season', discord: 'discord', tournament: 'tournament', tournaments: 'tournament', bans: 'bans' };

// ---- Page ---------------------------------------------------------------------

export default function CTFManagementPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [hasAccess, setHasAccess] = useState(false);
  const [accessChecked, setAccessChecked] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [activeTab, setActiveTab] = useState<Tab>('squads');

  // Header context: featured league, its season and phase.
  const [ctx, setCtx] = useState<{ league: LeagueInfo; season: LeagueSeason | null; phase: string | null } | null>(null);

  // Squad management state
  const [squads, setSquads] = useState<Squad[]>([]);
  const [squadsLoading, setSquadsLoading] = useState(true);
  const [squadFilter, setSquadFilter] = useState<'all' | 'active' | 'inactive' | 'tournament-eligible' | 'tournament-ineligible'>('all');
  const [squadSearch, setSquadSearch] = useState('');
  const [showDeleteSquadConfirm, setShowDeleteSquadConfirm] = useState<string | null>(null);
  const [deletingSquad, setDeletingSquad] = useState(false);
  const [showChangeCaptain, setShowChangeCaptain] = useState<Squad | null>(null);
  // Season rollover (draft/OvD leagues only): archive the squads that played the latest season.
  const [rollover, setRollover] = useState<{ league: LeagueInfo; season: LeagueSeason; squadIds: string[] } | null>(null);
  const [showArchiveConfirm, setShowArchiveConfirm] = useState(false);
  const [archiving, setArchiving] = useState(false);
  const [squadMembersForCaptain, setSquadMembersForCaptain] = useState<{ id: string; player_id: string; in_game_alias: string; role: string }[]>([]);
  const [loadingMembersForCaptain, setLoadingMembersForCaptain] = useState(false);
  const [transferringCaptain, setTransferringCaptain] = useState(false);

  // Free agent state
  const [freeAgents, setFreeAgents] = useState<FreeAgent[]>([]);
  const [freeAgentsLoading, setFreeAgentsLoading] = useState(true);
  const [showAddFreeAgent, setShowAddFreeAgent] = useState(false);
  const [editingFreeAgent, setEditingFreeAgent] = useState<FreeAgent | null>(null);
  const [showClearFreeAgentsConfirm, setShowClearFreeAgentsConfirm] = useState(false);
  const [clearingPool, setClearingPool] = useState(false);
  // Staff-only: players who ticked "interested in captaining" (served by /api/free-agents/captain-interest)
  const [captainCandidates, setCaptainCandidates] = useState<Set<string>>(new Set());
  const [captainOnly, setCaptainOnly] = useState(false);

  // League ban state
  const [bannedPlayers, setBannedPlayers] = useState<BannedPlayer[]>([]);
  const [bannedPlayersLoading, setBannedPlayersLoading] = useState(true);
  const [showBanPlayer, setShowBanPlayer] = useState(false);

  // Check access permissions
  useEffect(() => {
    let isMounted = true;

    const checkAccess = async () => {
      if (loading) return;

      if (!user) {
        setTimeout(() => { if (isMounted) router.push('/auth/login'); }, 100);
        return;
      }

      try {
        const { data, error } = await supabase
          .from('profiles')
          .select('id, in_game_alias, email, ctf_role, is_admin')
          .eq('id', user.id)
          .single();

        if (error) throw error;
        if (!isMounted) return;

        setProfile(data);
        const access = data.is_admin || data.ctf_role === 'ctf_admin';

        if (!access) {
          setAccessChecked(true);
          setTimeout(() => {
            if (isMounted) {
              router.push('/dashboard');
              toast.error('Access denied: CTF Admin privileges required');
            }
          }, 100);
          return;
        }

        setHasAccess(true);
        setAccessChecked(true);
      } catch (error) {
        console.error('Error checking access:', error);
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
    return () => { isMounted = false; };
  }, [user, loading, router]);

  // Mount + ?tab= parameter
  useEffect(() => {
    setMounted(true);
    if (typeof window !== 'undefined') {
      const tabParam = new URLSearchParams(window.location.search).get('tab');
      if (tabParam && TAB_ALIASES[tabParam]) setActiveTab(TAB_ALIASES[tabParam]);
    }
  }, []);

  const selectTab = (tab: Tab) => {
    setActiveTab(tab);
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href);
      url.searchParams.set('tab', tab);
      window.history.replaceState(null, '', url.toString());
    }
  };

  // Load data when access is granted
  useEffect(() => {
    if (hasAccess) {
      loadSquads();
      loadFreeAgents();
      loadBannedPlayers();
      loadHeaderContext();
    }
  }, [hasAccess]);

  const loadHeaderContext = async () => {
    try {
      const L = pickFeatured(await getLeagues());
      if (!L) return;
      const S = (await getOpenSeason(L)) || (await getLatestSeason(L));
      let draftDone: boolean | undefined;
      if (S && L.format === 'draft') {
        const d = await getSeasonDraft(S.id).catch(() => null);
        draftDone = d?.status === 'complete';
      }
      const phase = S
        ? seasonPhase(L, S, S.status === 'active' ? 'active' : S.status === 'upcoming' ? 'upcoming' : 'off-season', { draftDone }).label
        : null;
      setCtx({ league: L, season: S, phase });
    } catch (e) {
      console.error('header context failed', e);
    }
  };

  const loadSquads = async () => {
    try {
      setSquadsLoading(true);
      const cols = `
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
        `;
      let { data, error }: { data: any[] | null; error: any } = await supabase
        .from('squads')
        .select(`${cols}, league_slug`)
        .order('created_at', { ascending: false });
      // league_slug arrives with add-squad-league.sql; fall back until it's run.
      if (error && String(error.message || '').includes('league_slug')) {
        ({ data, error } = await supabase.from('squads').select(cols).order('created_at', { ascending: false }) as any);
      }

      if (error) throw error;

      const formattedSquads: Squad[] = (data || []).map((squad: any) => ({
        id: squad.id,
        name: squad.name,
        tag: squad.tag,
        description: squad.description,
        captain_alias: squad.profiles?.in_game_alias || 'Unknown',
        captain_id: squad.captain_id,
        member_count: squad.squad_members?.length || 0,
        league_slug: squad.league_slug ?? null,
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

      const { data, error } = await supabase
        .from('free_agents')
        .select(`
          *,
          profiles!free_agents_player_id_fkey(in_game_alias)
        `)
        .eq('is_active', true)
        .order('created_at', { ascending: false });

      if (error) {
        if (error.message?.includes('relation') || error.message?.includes('does not exist')) {
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
        secondary_roles: Array.isArray(agent.secondary_roles) ? agent.secondary_roles : [],
        availability: agent.availability || '',
        availability_days: Array.isArray(agent.availability_days) ? agent.availability_days : [],
        availability_times: agent.availability_times || {},
        skill_level: agent.skill_level || 'intermediate',
        notes: agent.notes,
        is_active: agent.is_active,
        created_at: agent.created_at,
        contact_info: agent.contact_info,
        league_slug: agent.league_slug ?? null,
        season_number: agent.season_number ?? null,
      }));

      setFreeAgents(formattedAgents);
      loadCaptainCandidates();
    } catch (error) {
      console.error('Error loading free agents:', error);
      setFreeAgents([]);
    } finally {
      setFreeAgentsLoading(false);
    }
  };

  // Staff-only captain interest, read through the service-role API (the table has no client RLS policies).
  const loadCaptainCandidates = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const res = await fetch('/api/free-agents/captain-interest', {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (!res.ok) return;
      const json = await res.json();
      setCaptainCandidates(new Set<string>(json.player_ids || []));
    } catch (e) {
      console.error('Error loading captain candidates:', e);
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
      loadFreeAgents();
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

  // Which squads played the featured league's latest season? Draft/OvD teams are
  // rebuilt every season, so they should be archived (is_active=false) at rollover.
  // CTFPL squads persist across seasons and are never touched here.
  const loadRolloverContext = async () => {
    try {
      const league = pickFeatured(await getLeagues());
      if (!league || league.format === 'squad' || league.data_source === 'ctfpl') { setRollover(null); return; }
      const season = await getLatestSeason(league);
      if (!season) { setRollover(null); return; }
      const { data, error } = await supabase
        .from('league_standings')
        .select('squad_id')
        .eq('league_season_id', season.id);
      if (error) throw error;
      const squadIds = Array.from(new Set((data || []).map((r: any) => r.squad_id).filter(Boolean)));
      setRollover({ league, season, squadIds });
    } catch (e) {
      console.error('Error loading rollover context:', e);
      setRollover(null);
    }
  };

  useEffect(() => {
    if (hasAccess) loadRolloverContext();
  }, [hasAccess]);

  const archiveSeasonSquads = async () => {
    if (!rollover) return;
    const ids = rollover.squadIds.filter((id) => squads.some((s) => s.id === id && s.is_active));
    if (ids.length === 0) { setShowArchiveConfirm(false); return; }
    setArchiving(true);
    try {
      // Inactive + legacy: the site already lets players hold legacy memberships
      // alongside one current squad, so this frees them to create/join next season.
      await patchSquads(ids, { is_active: false, is_legacy: true });
      setSquads((prev) => prev.map((s) => (ids.includes(s.id) ? { ...s, is_active: false } : s)));
      toast.success(`Archived ${ids.length} squad${ids.length === 1 ? '' : 's'} from ${rollover.league.name} Season ${rollover.season.season_number}`);
      setShowArchiveConfirm(false);
    } catch (e) {
      console.error('Error archiving squads:', e);
      toast.error('Failed to archive squads');
    } finally {
      setArchiving(false);
    }
  };

  // Which league a squad plays in. Drives the squad page layout (recruiting vs draft).
  const setSquadLeague = async (squadId: string, leagueSlug: string) => {
    const value = leagueSlug || null;
    try {
      await patchSquads(squadId, { league_slug: value });
      setSquads((prev) => prev.map((s) => (s.id === squadId ? { ...s, league_slug: value } : s)));
      toast.success(value ? `Squad set to ${value.toUpperCase()}` : 'Squad league cleared');
    } catch (error) {
      console.error('Error setting squad league:', error);
      toast.error('Failed to set squad league (has add-squad-league.sql been run?)');
    }
  };

  const toggleSquadStatus = async (squadId: string, field: 'is_active' | 'tournament_eligible', currentValue: boolean) => {
    try {
      await patchSquads(squadId, { [field]: !currentValue });
      setSquads(prev => prev.map(squad => squad.id === squadId ? { ...squad, [field]: !currentValue } : squad));
      const fieldName = field === 'is_active' ? 'squad status' : 'tournament eligibility';
      toast.success(`Updated ${fieldName}`);
    } catch (error: any) {
      console.error(`Error updating ${field}:`, error);
      toast.error(error?.message || `Failed to update ${field}`);
    }
  };

  const deleteSquad = async (squadId: string) => {
    try {
      setDeletingSquad(true);
      const { error: membersError } = await supabase.from('squad_members').delete().eq('squad_id', squadId);
      if (membersError) throw membersError;
      const { error: squadError } = await supabase.from('squads').delete().eq('id', squadId);
      if (squadError) throw squadError;
      toast.success('Squad deleted');
      setShowDeleteSquadConfirm(null);
      loadSquads();
    } catch (error) {
      console.error('Error deleting squad:', error);
      toast.error('Failed to delete squad. You may need admin RLS or an API route.');
    } finally {
      setDeletingSquad(false);
    }
  };

  const openChangeCaptain = async (squad: Squad) => {
    setShowChangeCaptain(squad);
    setSquadMembersForCaptain([]);
    setLoadingMembersForCaptain(true);
    try {
      const { data, error } = await supabase
        .from('squad_members')
        .select('id, player_id, role, profiles!squad_members_player_id_fkey(in_game_alias)')
        .eq('squad_id', squad.id);
      if (error) throw error;
      const members = (data || []).map((m: any) => ({
        id: m.id,
        player_id: m.player_id,
        in_game_alias: (m.profiles as any)?.in_game_alias || 'Unknown',
        role: (m as any).role || 'player'
      }));
      setSquadMembersForCaptain(members);
    } catch (e) {
      console.error('Error loading squad members:', e);
      toast.error('Failed to load members');
      setShowChangeCaptain(null);
    } finally {
      setLoadingMembersForCaptain(false);
    }
  };

  const transferCaptain = async (newCaptainId: string) => {
    if (!showChangeCaptain) return;
    try {
      setTransferringCaptain(true);
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      const res = await fetch('/api/squads/transfer-captain', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token && { Authorization: `Bearer ${token}` }),
        },
        body: JSON.stringify({ squadId: showChangeCaptain.id, newCaptainId }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || res.statusText || 'Transfer failed');
      toast.success('Captain updated');
      setShowChangeCaptain(null);
      loadSquads();
    } catch (error) {
      const msg = (error as Error)?.message;
      console.error('Error transferring captain:', msg, error);
      toast.error(msg || 'Failed to change captain.');
    } finally {
      setTransferringCaptain(false);
    }
  };

  const addToFreeAgentPool = async (formData: Partial<FreeAgent>) => {
    try {
      // Tag the row with the featured league's open season so it shows in the
      // current pool and survives season rollover the same way self-registrations do.
      let league_slug: string | null = null;
      let season_number: number | null = null;
      try {
        const featured = pickFeatured(await getLeagues());
        const open = featured ? await getOpenSeason(featured) : null;
        if (featured && open) {
          league_slug = featured.slug;
          season_number = open.season_number;
        }
      } catch (e) {
        console.warn('Could not resolve open season for manual add:', e);
      }

      const { error } = await supabase
        .from('free_agents')
        .insert({
          player_id: formData.player_id,
          preferred_roles: formData.preferred_roles || [],
          availability: formData.availability || '',
          skill_level: formData.skill_level || 'intermediate',
          notes: formData.notes,
          contact_info: formData.contact_info,
          league_slug,
          season_number,
          is_active: true
        });

      if (error) throw error;

      toast.success('Added to the pool');
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

      toast.success('Registration updated');
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
      const { error } = await supabase.from('free_agents').delete().eq('id', agentId);
      if (error) throw error;
      toast.success('Removed from the pool');
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
      const { error } = await supabase.from('free_agents').delete().eq('is_active', true);
      if (error) {
        console.error('Error clearing free agent pool:', error.message, error.code, error.details);
        throw error;
      }
      toast.success('Pool cleared. Players can register again when the next season opens.');
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

  // ---- Derived -----------------------------------------------------------------

  const squadTerm = squadSearch.trim().toLowerCase();
  const filteredSquads = squads.filter((squad) => {
    if (squadTerm && !`${squad.tag} ${squad.name} ${squad.captain_alias}`.toLowerCase().includes(squadTerm)) return false;
    switch (squadFilter) {
      case 'active': return squad.is_active;
      case 'inactive': return !squad.is_active;
      case 'tournament-eligible': return squad.tournament_eligible;
      case 'tournament-ineligible': return !squad.tournament_eligible;
      default: return true;
    }
  });
  const eligibleSquads = squads.filter((s) => s.tournament_eligible);
  const availableSquads = squads.filter((s) => s.is_active && !s.tournament_eligible);
  const candidateCount = freeAgents.filter((a) => captainCandidates.has(a.player_id)).length;
  const rolloverPending = rollover ? rollover.squadIds.filter((id) => squads.some((s) => s.id === id && s.is_active)) : [];

  const shell = (children: React.ReactNode) => (
    <div className={`ctf-theme ${displayFont.variable} ${bodyFont.variable} min-h-screen`}>
      <Navbar user={user} />
      <main className="container mx-auto px-4 py-6 max-w-7xl space-y-4">{children}</main>
    </div>
  );

  if (loading || !accessChecked || !mounted) {
    return shell(<Spinner label={loading ? 'Loading…' : 'Checking staff access…'} />);
  }

  if (!hasAccess) {
    return shell(
      <section className="rounded-xl bg-[#131A2B] px-6 py-8 text-center">
        <h1 className="font-display text-3xl text-[#E6EDF7]">Staff only</h1>
        <p className="mt-2 text-sm text-[#8B98B0]">CTF admin privileges are required for this page.</p>
      </section>,
    );
  }

  const tabs: { key: Tab; label: string; count?: number }[] = [
    { key: 'squads', label: 'Squads', count: squads.length },
    { key: 'pool', label: 'Player pool', count: freeAgents.length },
    { key: 'season', label: 'Season' },
    { key: 'discord', label: 'Discord' },
    { key: 'tournament', label: 'Tournament', count: eligibleSquads.length },
    { key: 'bans', label: 'Bans', count: bannedPlayers.length },
  ];

  const seasonName = ctx?.season ? `${ctx.league.name} Season ${ctx.season.season_number}` : ctx?.league.name || null;

  return shell(
    <>
      {/* Header strip */}
      <section className="relative overflow-hidden rounded-xl bg-[#131A2B]">
        <div className="absolute inset-0 pointer-events-none" style={{ backgroundImage: 'radial-gradient(circle at 10% 20%, rgba(34,211,238,0.12), transparent 40%)' }} />
        <div className="relative px-5 sm:px-6 py-5">
          <div className="text-[11px] uppercase tracking-[0.25em] text-[#22D3EE]/80 mb-1">Free Infantry · CTF leagues</div>
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <h1 className="font-display text-4xl sm:text-5xl leading-none text-[#E6EDF7]">CTF management</h1>
              <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-[#8B98B0]">
                {seasonName && <span className="text-[#E6EDF7]">{seasonName}</span>}
                {ctx?.phase && <span className="text-[#F59E0B]">{ctx.phase}</span>}
                <span>
                  Signed in as <span className="text-[#E6EDF7]">{profile?.in_game_alias}</span> · {profile?.is_admin ? 'site admin' : 'CTF admin'}
                </span>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link href="/league" className={btnQuiet}>League page</Link>
              <Link href="/free-agents" target="_blank" rel="noopener noreferrer" className={`${btnQuiet} inline-flex items-center gap-1.5`}>
                Public pool <ExternalLink className="w-3.5 h-3.5" />
              </Link>
              {ctx?.league.format === 'draft' && <Link href="/league/ctfdl/draft" className={btnQuiet}>Draft lobby</Link>}
              <Link href="/league/schedule" className={btnQuiet}>Schedule</Link>
            </div>
          </div>

          {/* Tabs */}
          <div className="mt-4 flex flex-wrap gap-1.5">
            {tabs.map((t) => (
              <Chip key={t.key} active={activeTab === t.key} onClick={() => selectTab(t.key)}>
                {t.label}
                {typeof t.count === 'number' && <span className={`ml-1.5 tabular-nums ${activeTab === t.key ? 'text-[#22D3EE]/70' : 'text-[#8B98B0]'}`}>{t.count}</span>}
              </Chip>
            ))}
          </div>
        </div>
      </section>

      {/* Squads */}
      {activeTab === 'squads' && (
        <Panel
          title="Squads"
          hint="Active, league and tournament flags. Captain changes and deletion live in the row menu."
          actions={
            <input
              type="text"
              value={squadSearch}
              onChange={(e) => setSquadSearch(e.target.value)}
              placeholder="Search squads, captains…"
              className={`${inputCls} w-56`}
            />
          }
        >
          <div className="px-5 py-3 flex flex-wrap gap-1.5 border-b border-white/[0.06]">
            {([
              ['all', `All ${squads.length}`],
              ['active', `Active ${squads.filter((s) => s.is_active).length}`],
              ['inactive', `Inactive ${squads.filter((s) => !s.is_active).length}`],
              ['tournament-eligible', `Tournament eligible ${squads.filter((s) => s.tournament_eligible).length}`],
              ['tournament-ineligible', `Not eligible ${squads.filter((s) => !s.tournament_eligible).length}`],
            ] as const).map(([k, label]) => (
              <Chip key={k} active={squadFilter === k} onClick={() => setSquadFilter(k)}>{label}</Chip>
            ))}
          </div>

          {squadsLoading ? (
            <Spinner label="Loading squads…" />
          ) : filteredSquads.length === 0 ? (
            <Empty>No squads match that filter.</Empty>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr>
                    <th className={th}>Squad</th>
                    <th className={th}>Captain</th>
                    <th className={`${th} text-right`}>Members</th>
                    <th className={th}>League</th>
                    <th className={th}>Status</th>
                    <th className={th}>Tournament</th>
                    <th className={`${th} text-right`}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredSquads.map((squad) => (
                    <tr key={squad.id} className="border-t border-white/[0.06] hover:bg-white/[0.02]">
                      <td className={td}>
                        <div className="flex items-center gap-3">
                          <span className="w-9 h-9 rounded-md bg-[#1B2438] text-[#22D3EE] text-[11px] font-medium flex items-center justify-center shrink-0">
                            {(squad.tag || squad.name || '?').slice(0, 4).toUpperCase()}
                          </span>
                          <div className="min-w-0">
                            <div className="font-medium text-[#E6EDF7] truncate">{squad.name}</div>
                            {squad.description && <div className="text-xs text-[#8B98B0] truncate max-w-xs">{squad.description}</div>}
                          </div>
                        </div>
                      </td>
                      <td className={`${td} text-[#E6EDF7]`}>{squad.captain_alias}</td>
                      <td className={`${td} text-right tabular-nums text-[#E6EDF7]`}>{squad.member_count}</td>
                      <td className={td}>
                        <select
                          value={squad.league_slug || ''}
                          onChange={(e) => setSquadLeague(squad.id, e.target.value)}
                          className="rounded-md border border-white/10 bg-[#0B0F1A] px-2 py-1 text-xs text-[#E6EDF7] focus:border-[#22D3EE] focus:outline-none"
                          title="Which league this squad plays in (sets the squad page layout)"
                        >
                          <option value="">—</option>
                          <option value="ctfpl">CTFPL</option>
                          <option value="ctfdl">CTFDL</option>
                          <option value="ovdl">OVDL</option>
                        </select>
                      </td>
                      <td className={td}>
                        <button onClick={() => toggleSquadStatus(squad.id, 'is_active', squad.is_active)} className={pill(squad.is_active, 'bg-[#34D399]/15 text-[#34D399] hover:bg-[#34D399]/25')} title="Click to toggle">
                          {squad.is_active ? 'Active' : 'Inactive'}
                        </button>
                      </td>
                      <td className={td}>
                        <button onClick={() => toggleSquadStatus(squad.id, 'tournament_eligible', squad.tournament_eligible)} className={pill(squad.tournament_eligible, 'bg-[#F59E0B]/15 text-[#F59E0B] hover:bg-[#F59E0B]/25')} title="Click to toggle">
                          {squad.tournament_eligible ? 'Eligible' : 'Not eligible'}
                        </button>
                      </td>
                      <td className={`${td} text-right whitespace-nowrap`}>
                        <Link href={`/squads/${squad.id}`} target="_blank" rel="noopener noreferrer" className="text-xs text-[#8B98B0] hover:text-[#22D3EE] mr-3">View</Link>
                        <button type="button" onClick={() => openChangeCaptain(squad)} className="text-xs text-[#F59E0B] hover:text-[#FBBF24] mr-3">Captain</button>
                        <button type="button" onClick={() => setShowDeleteSquadConfirm(squad.id)} className="text-xs text-[#F87171] hover:text-[#FCA5A5]">Delete</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      )}

      {/* Player pool */}
      {activeTab === 'pool' && (
        <Panel
          title="Player pool"
          hint={`${freeAgents.length} active registration${freeAgents.length === 1 ? '' : 's'}. Captain interest is staff-only.`}
          actions={
            <>
              <Chip active={captainOnly} tone="warn" onClick={() => setCaptainOnly((v) => !v)} title="Players who ticked 'interested in captaining' when registering">
                Captain candidates <span className="ml-1 tabular-nums opacity-70">{candidateCount}</span>
              </Chip>
              <button onClick={() => setShowClearFreeAgentsConfirm(true)} disabled={freeAgents.length === 0 || clearingPool} className={btnDanger} title="Remove everyone from the pool, e.g. after season end. Players can register again.">
                {clearingPool ? 'Clearing…' : 'Clear pool'}
              </button>
              <button onClick={() => setShowAddFreeAgent(true)} className={btnPrimary}>Add player</button>
            </>
          }
        >
          {freeAgentsLoading ? (
            <Spinner label="Loading the pool…" />
          ) : freeAgents.length === 0 ? (
            <Empty>Nobody is in the pool. Players register from the league page, or add one here.</Empty>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr>
                    <th className={th}>Player</th>
                    <th className={th}>Classes</th>
                    <th className={th}>Availability (EST)</th>
                    <th className={th}>Season</th>
                    <th className={`${th} text-[#F59E0B]`} title="Staff only">Captain?</th>
                    <th className={`${th} text-right`}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {freeAgents.filter((a) => !captainOnly || captainCandidates.has(a.player_id)).map((agent) => (
                    <tr key={agent.id} className="border-t border-white/[0.06] hover:bg-white/[0.02] align-top">
                      <td className={td}>
                        <div className="font-medium text-[#E6EDF7]">{agent.player_alias}</div>
                        {agent.contact_info && <div className="text-xs text-[#8B98B0]">@{agent.contact_info.replace(/^@/, '')}</div>}
                        {agent.notes && <div className="mt-1 max-w-xs text-xs text-[#8B98B0]/80 line-clamp-2" title={agent.notes}>{agent.notes}</div>}
                      </td>
                      <td className={td}>
                        <div className="flex flex-wrap gap-1">
                          {agent.preferred_roles.map((role, i) => (
                            <span key={`p-${i}`} className="rounded bg-[#22D3EE]/15 px-1.5 py-0.5 text-[11px] text-[#22D3EE]">{role}</span>
                          ))}
                          {(agent.secondary_roles || []).map((role, i) => (
                            <span key={`s-${i}`} className="rounded bg-white/5 px-1.5 py-0.5 text-[11px] text-[#8B98B0]" title="Secondary">{role}</span>
                          ))}
                        </div>
                      </td>
                      <td className={`${td} text-[#8B98B0]`}>
                        {(agent.availability_days?.length || 0) > 0 ? (
                          <div className="space-y-1">
                            <div className="flex gap-0.5">
                              {['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'].map((d) => {
                                const on = agent.availability_days!.includes(d);
                                return <span key={d} title={d} className={`w-6 rounded py-0.5 text-center text-[10px] font-semibold ${on ? 'bg-[#34D399]/20 text-[#34D399]' : 'bg-white/5 text-[#8B98B0]/60'}`}>{d.slice(0, 2)}</span>;
                              })}
                            </div>
                            <div className="text-xs">
                              {Array.from(new Set(Object.values(agent.availability_times || {}).map((t) => `${t.start}–${t.end}`))).join(' · ') || 'Times not set'}
                            </div>
                          </div>
                        ) : (
                          <span className="text-xs">{agent.availability || '—'}</span>
                        )}
                      </td>
                      <td className={`${td} text-xs text-[#8B98B0] whitespace-nowrap`}>
                        {agent.league_slug ? `${agent.league_slug.toUpperCase()} S${agent.season_number ?? '?'}` : 'untagged'}
                      </td>
                      <td className={td}>
                        {captainCandidates.has(agent.player_id)
                          ? <span className="rounded bg-[#F59E0B]/15 px-2 py-0.5 text-xs font-semibold text-[#F59E0B]">Yes</span>
                          : <span className="text-xs text-[#8B98B0]/60">—</span>}
                      </td>
                      <td className={`${td} text-right whitespace-nowrap`}>
                        <button onClick={() => setEditingFreeAgent(agent)} className="text-xs text-[#8B98B0] hover:text-[#22D3EE] mr-3">Edit</button>
                        <button onClick={() => removeFromFreeAgentPool(agent.id)} className="text-xs text-[#F87171] hover:text-[#FCA5A5]">Remove</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      )}

      {/* Season */}
      {activeTab === 'season' && (
        <>
          <SeasonSettingsPanel />
          {rollover && (
            <Panel
              title={`Season rollover · ${rollover.league.name} Season ${rollover.season.season_number}`}
              actions={
                <button onClick={() => setShowArchiveConfirm(true)} disabled={rolloverPending.length === 0 || archiving} className={btnQuiet + ' disabled:opacity-50 disabled:cursor-not-allowed'}>
                  Archive {rolloverPending.length} squad{rolloverPending.length === 1 ? '' : 's'}
                </button>
              }
            >
              <div className="px-5 py-4 text-sm text-[#8B98B0]">
                {rolloverPending.length > 0
                  ? `${rolloverPending.length} squad${rolloverPending.length === 1 ? '' : 's'} from this season ${rolloverPending.length === 1 ? 'is' : 'are'} still active. Archiving marks them inactive and legacy, so their players read as "last season" in the pool and can create or join a new squad. Memberships and history are kept.`
                  : 'All squads from this season are already archived.'}
              </div>
            </Panel>
          )}
        </>
      )}

      {/* Discord */}
      {activeTab === 'discord' && (
        <>
          <DiscordBotPanel />
          <DiscordAppPanel />
        </>
      )}

      {/* Tournament */}
      {activeTab === 'tournament' && (
        <div className="grid gap-4 md:grid-cols-2">
          <Panel title="Tournament eligible" hint={`${eligibleSquads.length} squad${eligibleSquads.length === 1 ? '' : 's'}`}>
            {eligibleSquads.length === 0 ? (
              <Empty>No squads are marked eligible.</Empty>
            ) : (
              <ul className="divide-y divide-white/[0.06]">
                {eligibleSquads.map((squad) => (
                  <li key={squad.id} className="flex items-center justify-between gap-3 px-5 py-2.5">
                    <div>
                      <div className="text-sm font-medium text-[#E6EDF7]">{squad.tag ? `[${squad.tag}] ` : ''}{squad.name}</div>
                      <div className="text-xs text-[#8B98B0]">{squad.member_count} member{squad.member_count === 1 ? '' : 's'}{!squad.is_active && ' · inactive'}</div>
                    </div>
                    <button onClick={() => toggleSquadStatus(squad.id, 'tournament_eligible', squad.tournament_eligible)} className="text-xs text-[#F87171] hover:text-[#FCA5A5]">Remove</button>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
          <Panel title="Active, not eligible" hint={`${availableSquads.length} squad${availableSquads.length === 1 ? '' : 's'}`}>
            {availableSquads.length === 0 ? (
              <Empty>Every active squad is tournament eligible.</Empty>
            ) : (
              <ul className="divide-y divide-white/[0.06]">
                {availableSquads.map((squad) => (
                  <li key={squad.id} className="flex items-center justify-between gap-3 px-5 py-2.5">
                    <div>
                      <div className="text-sm font-medium text-[#E6EDF7]">{squad.tag ? `[${squad.tag}] ` : ''}{squad.name}</div>
                      <div className="text-xs text-[#8B98B0]">{squad.member_count} member{squad.member_count === 1 ? '' : 's'}</div>
                    </div>
                    <button onClick={() => toggleSquadStatus(squad.id, 'tournament_eligible', squad.tournament_eligible)} className="text-xs text-[#34D399] hover:text-[#6EE7B7]">Add</button>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>
      )}

      {/* Bans */}
      {activeTab === 'bans' && (
        <Panel
          title="League bans"
          hint="Banned players are removed from the pool and cannot register or play."
          actions={<button onClick={() => setShowBanPlayer(true)} className={btnDanger + ' bg-[#F87171]/10'}>Ban a player</button>}
        >
          {bannedPlayersLoading ? (
            <Spinner label="Loading bans…" />
          ) : bannedPlayers.length === 0 ? (
            <Empty>No banned players.</Empty>
          ) : (
            <ul className="divide-y divide-white/[0.06]">
              {bannedPlayers.map((player) => (
                <li key={player.id} className="flex flex-wrap items-start justify-between gap-3 px-5 py-3">
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-[#E6EDF7]">{player.in_game_alias}</div>
                    <div className="text-xs text-[#8B98B0]">
                      Banned {player.league_ban_date ? new Date(player.league_ban_date).toLocaleDateString() : 'on an unknown date'}
                    </div>
                    {player.league_ban_reason && <div className="mt-1 text-xs text-[#8B98B0]/80 max-w-xl">{player.league_ban_reason}</div>}
                  </div>
                  <button onClick={() => unbanPlayer(player.id)} className={btnQuiet}>Unban</button>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      )}

      {/* ---- Modals ---------------------------------------------------------- */}

      {showArchiveConfirm && rollover && (
        <Modal title={`Archive ${rollover.league.name} Season ${rollover.season.season_number} squads?`} onClose={() => !archiving && setShowArchiveConfirm(false)}>
          <p className="text-sm text-[#8B98B0] mb-3">These squads will be marked inactive and legacy. Nothing is deleted; squad pages and match history stay intact.</p>
          <ul className="mb-4 max-h-48 overflow-y-auto space-y-1 text-sm text-[#E6EDF7]">
            {rollover.squadIds
              .map((id) => squads.find((s) => s.id === id))
              .filter((s): s is Squad => !!s && s.is_active)
              .map((s) => <li key={s.id}>{s.tag ? `[${s.tag}] ` : ''}{s.name}</li>)}
          </ul>
          <div className="flex justify-end gap-2">
            <button onClick={() => setShowArchiveConfirm(false)} disabled={archiving} className={btnQuiet}>Cancel</button>
            <button onClick={archiveSeasonSquads} disabled={archiving} className={btnPrimary}>{archiving ? 'Archiving…' : 'Archive'}</button>
          </div>
        </Modal>
      )}

      {showDeleteSquadConfirm && (
        <Modal title="Delete squad?" onClose={() => !deletingSquad && setShowDeleteSquadConfirm(null)}>
          <p className="text-sm text-[#8B98B0] mb-4">This removes every member and deletes the squad. It cannot be undone. To keep history, mark it inactive instead.</p>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setShowDeleteSquadConfirm(null)} className={btnQuiet}>Cancel</button>
            <button type="button" onClick={() => deleteSquad(showDeleteSquadConfirm)} disabled={deletingSquad} className={btnDanger + ' bg-[#F87171]/10'}>
              {deletingSquad ? 'Deleting…' : 'Delete squad'}
            </button>
          </div>
        </Modal>
      )}

      {showChangeCaptain && (
        <Modal title={<>Change captain · {showChangeCaptain.tag ? `[${showChangeCaptain.tag}] ` : ''}{showChangeCaptain.name}</>} onClose={() => !transferringCaptain && setShowChangeCaptain(null)}>
          <p className="text-sm text-[#8B98B0] mb-3">Pick a member to become captain. Rosters and invites are managed on the squad page.</p>
          {loadingMembersForCaptain ? (
            <p className="text-sm text-[#8B98B0]">Loading members…</p>
          ) : squadMembersForCaptain.length === 0 ? (
            <p className="text-sm text-[#8B98B0]">No members found.</p>
          ) : (
            <ul className="mb-4 max-h-60 overflow-y-auto divide-y divide-white/[0.06]">
              {squadMembersForCaptain.map((m) => (
                <li key={m.player_id} className="flex items-center justify-between gap-2 py-2">
                  <span className="text-sm text-[#E6EDF7]">
                    {m.in_game_alias}
                    {m.role === 'captain' && <span className="ml-2 text-xs text-[#F59E0B]">current captain</span>}
                  </span>
                  <button type="button" disabled={m.role === 'captain' || transferringCaptain} onClick={() => transferCaptain(m.player_id)} className={btnQuiet + ' disabled:opacity-40 disabled:cursor-not-allowed'}>
                    Make captain
                  </button>
                </li>
              ))}
            </ul>
          )}
          <div className="flex justify-end">
            <button type="button" onClick={() => setShowChangeCaptain(null)} className={btnQuiet}>Close</button>
          </div>
        </Modal>
      )}

      {showClearFreeAgentsConfirm && (
        <Modal title="Clear the whole pool?" onClose={() => !clearingPool && setShowClearFreeAgentsConfirm(false)}>
          <p className="text-sm text-[#8B98B0] mb-4">
            Removes all {freeAgents.length} player{freeAgents.length === 1 ? '' : 's'} from the pool. Do this when a season ends so the next one starts fresh. Players can register again from the league page.
          </p>
          <div className="flex justify-end gap-2">
            <button onClick={() => setShowClearFreeAgentsConfirm(false)} disabled={clearingPool} className={btnQuiet}>Cancel</button>
            <button onClick={clearEntireFreeAgentPool} disabled={clearingPool} className={btnDanger + ' bg-[#F87171]/10'}>{clearingPool ? 'Clearing…' : 'Clear pool'}</button>
          </div>
        </Modal>
      )}

      {showBanPlayer && <BanPlayerModal onBan={banPlayer} onCancel={() => setShowBanPlayer(false)} />}

      {showAddFreeAgent && (
        <Modal title="Add a player to the pool" onClose={() => setShowAddFreeAgent(false)}>
          <FreeAgentForm onSubmit={addToFreeAgentPool} onCancel={() => setShowAddFreeAgent(false)} />
        </Modal>
      )}

      {editingFreeAgent && (
        <Modal title={`Edit · ${editingFreeAgent.player_alias}`} onClose={() => setEditingFreeAgent(null)}>
          <FreeAgentForm initialData={editingFreeAgent} onSubmit={(data) => updateFreeAgent(editingFreeAgent.id, data)} onCancel={() => setEditingFreeAgent(null)} />
        </Modal>
      )}
    </>,
  );
}

// ---- Free agent form -----------------------------------------------------------

function FreeAgentForm({ initialData, onSubmit, onCancel }: { initialData?: FreeAgent; onSubmit: (data: Partial<FreeAgent>) => void; onCancel: () => void }) {
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
    const fetchPlayers = async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, in_game_alias')
        .eq('registration_status', 'completed')
        .not('in_game_alias', 'is', null)
        .order('in_game_alias');
      if (!error && data) setAvailablePlayers(data);
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
      toast.error('Pick a player');
      return;
    }
    onSubmit(formData);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      {!initialData && (
        <label className="block">
          <span className={labelCls}>Player</span>
          <select value={formData.player_id} onChange={(e) => setFormData(prev => ({ ...prev, player_id: e.target.value }))} className={inputCls} required>
            <option value="">Select a player</option>
            {availablePlayers.map(player => <option key={player.id} value={player.id}>{player.in_game_alias}</option>)}
          </select>
        </label>
      )}

      <div>
        <span className={labelCls}>Preferred roles</span>
        <div className="flex flex-wrap gap-1.5">
          {roleOptions.map(role => (
            <Chip key={role} active={formData.preferred_roles.includes(role)} onClick={() => handleRoleToggle(role)}>{role}</Chip>
          ))}
        </div>
      </div>

      <label className="block">
        <span className={labelCls}>Skill level</span>
        <select value={formData.skill_level} onChange={(e) => setFormData(prev => ({ ...prev, skill_level: e.target.value }))} className={inputCls}>
          <option value="beginner">Beginner</option>
          <option value="intermediate">Intermediate</option>
          <option value="advanced">Advanced</option>
          <option value="expert">Expert</option>
        </select>
      </label>

      <label className="block">
        <span className={labelCls}>Availability</span>
        <input type="text" value={formData.availability} onChange={(e) => setFormData(prev => ({ ...prev, availability: e.target.value }))} placeholder="e.g. weekends, evenings EST" className={inputCls} />
      </label>

      <label className="block">
        <span className={labelCls}>Contact</span>
        <input type="text" value={formData.contact_info} onChange={(e) => setFormData(prev => ({ ...prev, contact_info: e.target.value }))} placeholder="Discord username" className={inputCls} />
      </label>

      <label className="block">
        <span className={labelCls}>Notes</span>
        <textarea value={formData.notes} onChange={(e) => setFormData(prev => ({ ...prev, notes: e.target.value }))} placeholder="Anything captains should know" className={`${inputCls} h-20`} />
      </label>

      <div className="flex justify-end gap-2 pt-2">
        <button type="button" onClick={onCancel} className={btnQuiet}>Cancel</button>
        <button type="submit" className={btnPrimary}>{initialData ? 'Save' : 'Add to pool'}</button>
      </div>
    </form>
  );
}

// ---- Ban modal ------------------------------------------------------------------

function BanPlayerModal({ onBan, onCancel }: { onBan: (playerId: string, reason: string) => void; onCancel: () => void }) {
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
      if (!error && data) setAvailablePlayers(data);
    };
    fetchPlayers();
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPlayer) { toast.error('Pick a player to ban'); return; }
    if (!banReason.trim()) { toast.error('Give a reason for the ban'); return; }
    onBan(selectedPlayer, banReason.trim());
  };

  return (
    <Modal title="Ban a player from CTF leagues" onClose={onCancel}>
      <form onSubmit={handleSubmit} className="space-y-3">
        <label className="block">
          <span className={labelCls}>Player</span>
          <select value={selectedPlayer} onChange={(e) => setSelectedPlayer(e.target.value)} className={inputCls} required>
            <option value="">Choose a player</option>
            {availablePlayers.map(player => <option key={player.id} value={player.id}>{player.in_game_alias}</option>)}
          </select>
        </label>

        <label className="block">
          <span className={labelCls}>Reason (required)</span>
          <textarea value={banReason} onChange={(e) => setBanReason(e.target.value)} placeholder="Why this player is banned from the CTF leagues" className={`${inputCls} resize-none`} rows={4} required />
        </label>

        <div className="rounded-md border border-[#F87171]/30 bg-[#F87171]/10 px-3 py-2 text-xs text-[#FCA5A5]">
          Banning removes them from the player pool, blocks registration, and blocks tournament play.
        </div>

        <div className="flex justify-end gap-2 pt-1">
          <button type="button" onClick={onCancel} className={btnQuiet}>Cancel</button>
          <button type="submit" className={btnDanger + ' bg-[#F87171]/10'}>Ban player</button>
        </div>
      </form>
    </Modal>
  );
}
