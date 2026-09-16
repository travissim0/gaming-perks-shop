'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Lock, Unlock, AlertTriangle, CheckCircle } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/AuthContext';
import { Chip, Panel, Modal, Spinner, Empty, StaffShell, HeaderStrip } from '@/components/ctf/AdminBits';
import { inputCls, labelCls, btnPrimary, btnQuiet, btnDanger } from '@/components/ctf/FormBits';

interface SeasonRosterLockStatus {
  id: number;
  season_id: string;
  is_locked: boolean;
  locked_at: string | null;
  unlocked_at: string | null;
  locked_by: string | null;
  reason: string | null;
  created_at: string;
  updated_at: string;
  season?: Season;
}

interface Season { id: string; season_number: number; season_name: string | null; status: 'upcoming' | 'active' | 'completed' }
interface League { id: string; slug: string; name: string; description?: string | null }
interface PendingInvite { id: string; squad_name: string; squad_tag: string; invited_player_alias: string; created_at: string; expires_at: string }

const emptyStatus = (seasonId: string, season?: Season): SeasonRosterLockStatus => ({
  id: 0, season_id: seasonId, is_locked: false, locked_at: null, unlocked_at: null, locked_by: null, reason: null,
  created_at: new Date().toISOString(), updated_at: new Date().toISOString(), season,
});

/**
 * Roster lock: freeze squad invitations for a league season (e.g. once the
 * season starts or for playoffs). Locking cancels pending invites. CTFPL uses
 * season_roster_locks; every other league uses league_season_roster_locks.
 */
export default function RosterLockAdminPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const [access, setAccess] = useState<'checking' | 'ok' | 'denied'>('checking');

  const [leagues, setLeagues] = useState<League[]>([]);
  const [selectedLeague, setSelectedLeague] = useState<League | null>(null);
  const [lockStatus, setLockStatus] = useState<SeasonRosterLockStatus | null>(null);
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [selectedSeason, setSelectedSeason] = useState<string>('');
  const [pendingInvites, setPendingInvites] = useState<PendingInvite[]>([]);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [reason, setReason] = useState('');
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const isCTFPL = selectedLeague?.slug === 'ctfpl';

  // Staff only.
  useEffect(() => {
    if (authLoading) return;
    if (!user) { router.push('/auth/login?redirect=/admin/roster-lock'); return; }
    (async () => {
      const { data } = await supabase.from('profiles').select('is_admin, ctf_role').eq('id', user.id).maybeSingle();
      const ok = !!data && (data.is_admin === true || data.ctf_role === 'ctf_admin');
      setAccess(ok ? 'ok' : 'denied');
      if (!ok) toast.error('CTF admin access required');
    })();
  }, [user, authLoading, router]);

  useEffect(() => {
    if (access !== 'ok') return;
    fetchLeagues();
    fetchPendingInvites();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [access]);

  useEffect(() => {
    if (selectedLeague) {
      setSelectedSeason('');
      setLockStatus(null);
      fetchSeasons();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedLeague?.id]);

  useEffect(() => {
    if (!selectedSeason) { setLockStatus(null); return; }
    if (isCTFPL) fetchSeasonRosterLockStatus(selectedSeason);
    else fetchLeagueSeasonRosterLockStatus(selectedSeason);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedSeason, isCTFPL]);

  const fetchLeagues = async () => {
    try {
      const { data, error } = await supabase.from('leagues').select('id, slug, name, description').order('name');
      if (error) throw error;
      const list = (data || []) as League[];
      setLeagues(list);
      setSelectedLeague(list.find((l) => l.slug === 'ctfpl') || list[0] || null);
    } catch (error: any) {
      setMessage({ type: 'error', text: `Error fetching leagues: ${error.message}` });
    } finally {
      setLoading(false);
    }
  };

  const fetchSeasons = async () => {
    if (!selectedLeague) return;
    try {
      setSeasons([]);
      setSelectedSeason('');
      if (selectedLeague.slug === 'ctfpl') {
        const { data, error } = await supabase.from('ctfpl_seasons').select('id, season_number, season_name, status').order('season_number', { ascending: false });
        if (error) throw error;
        const list = (data || []) as Season[];
        setSeasons(list);
        const active = list.find((s) => s.status === 'active');
        setSelectedSeason(active ? active.id : (list[0]?.id || ''));
      } else {
        const { data, error } = await supabase.from('league_seasons').select('id, season_number, season_name, status').eq('league_id', selectedLeague.id).order('season_number', { ascending: false });
        if (error) throw error;
        const list = (data || []) as Season[];
        setSeasons(list);
        setSelectedSeason(list[0]?.id || '');
      }
    } catch (error: any) {
      setMessage({ type: 'error', text: `Error fetching seasons: ${error.message}` });
    }
  };

  const fetchSeasonRosterLockStatus = async (seasonId: string) => {
    try {
      const { data, error } = await supabase
        .from('season_roster_locks')
        .select('*, season:ctfpl_seasons(id, season_number, season_name, status)')
        .eq('season_id', seasonId)
        .eq('is_current', true)
        .maybeSingle();
      if (error && error.code !== 'PGRST116') throw error;
      setLockStatus(data ? (data as any) : emptyStatus(seasonId, seasons.find((s) => s.id === seasonId)));
    } catch (error: any) {
      setMessage({ type: 'error', text: `Error fetching season roster lock: ${error.message}` });
    }
  };

  const fetchLeagueSeasonRosterLockStatus = async (leagueSeasonId: string) => {
    try {
      const { data, error } = await supabase
        .from('league_season_roster_locks')
        .select('id, league_season_id, is_locked, locked_at, unlocked_at, locked_by, reason, created_at, updated_at, is_current, season:league_seasons(id, season_number, season_name, status)')
        .eq('league_season_id', leagueSeasonId)
        .eq('is_current', true)
        .maybeSingle();
      if (error && error.code !== 'PGRST116') throw error;
      const seasonInfo = seasons.find((s) => s.id === leagueSeasonId);
      if (!data) { setLockStatus(emptyStatus(leagueSeasonId, seasonInfo)); return; }
      const row = data as any;
      setLockStatus({
        id: row.id, season_id: row.league_season_id, is_locked: row.is_locked, locked_at: row.locked_at, unlocked_at: row.unlocked_at,
        locked_by: row.locked_by, reason: row.reason, created_at: row.created_at, updated_at: row.updated_at, season: row.season ?? seasonInfo,
      });
    } catch (error: any) {
      setMessage({ type: 'error', text: `Error fetching roster lock: ${error.message}` });
    }
  };

  const fetchPendingInvites = async () => {
    try {
      // Expire old invites first so the count is honest.
      const { data: expiredData, error: expiredError } = await supabase.rpc('expire_old_squad_invites');
      if (expiredError) console.error('Error expiring old invites:', expiredError);
      else if (expiredData && expiredData > 0) console.log(`Auto-expired ${expiredData} old invites`);

      const { data, error } = await supabase
        .from('squad_invites')
        .select('id, created_at, expires_at, squad_id, invited_player_id')
        .eq('status', 'pending')
        .order('created_at', { ascending: false });
      if (error) { console.error('Error fetching pending invites:', error); return; }
      if (!data || data.length === 0) { setPendingInvites([]); return; }

      const squadIds = [...new Set(data.map((i) => i.squad_id))];
      const profileIds = [...new Set(data.map((i) => i.invited_player_id))];
      const [{ data: squadData }, { data: profileData }] = await Promise.all([
        supabase.from('squads').select('id, name, tag').in('id', squadIds),
        supabase.from('profiles').select('id, in_game_alias').in('id', profileIds),
      ]);
      setPendingInvites(data.map((invite: any) => {
        const squad = squadData?.find((s) => s.id === invite.squad_id);
        const profile = profileData?.find((p) => p.id === invite.invited_player_id);
        return {
          id: invite.id,
          squad_name: squad?.name || 'Unknown squad',
          squad_tag: squad?.tag || '???',
          invited_player_alias: profile?.in_game_alias || 'Unknown player',
          created_at: invite.created_at,
          expires_at: invite.expires_at,
        };
      }));
    } catch (error: any) {
      console.error('Error fetching pending invites:', error.message);
      setPendingInvites([]);
    }
  };

  const toggleRosterLock = async () => {
    if (!lockStatus || !selectedSeason || !reason.trim()) {
      setMessage({ type: 'error', text: 'Give a reason for the change' });
      return;
    }
    setUpdating(true);
    try {
      const newLockState = !lockStatus.is_locked;
      if (isCTFPL) {
        const { error } = await supabase.rpc('set_season_roster_lock', { p_season_id: selectedSeason, p_is_locked: newLockState, p_reason: reason.trim(), p_user_id: user?.id || null });
        if (error) throw error;
        await fetchSeasonRosterLockStatus(selectedSeason);
      } else {
        const { error } = await supabase.rpc('set_league_season_roster_lock', { p_league_season_id: selectedSeason, p_is_locked: newLockState, p_reason: reason.trim(), p_user_id: user?.id || null });
        if (error) throw error;
        await fetchLeagueSeasonRosterLockStatus(selectedSeason);
      }
      setReason('');
      setConfirmOpen(false);
      const seasonNum = lockStatus.season?.season_number ?? '';
      setMessage({
        type: 'success',
        text: `${selectedLeague?.name ?? 'League'} Season ${seasonNum} roster ${newLockState ? 'locked' : 'unlocked'}. ${newLockState ? 'All pending invites were cancelled.' : 'Squad invitations are allowed again.'}`,
      });
      setTimeout(() => fetchPendingInvites(), 1000);
    } catch (error: any) {
      setMessage({ type: 'error', text: `Error updating roster lock: ${error.message}` });
      setConfirmOpen(false);
    } finally {
      setUpdating(false);
    }
  };

  if (authLoading || access === 'checking' || (access === 'ok' && loading)) {
    return <StaffShell user={user}><Spinner label="Checking staff access…" /></StaffShell>;
  }
  if (access === 'denied') {
    return (
      <StaffShell user={user}>
        <section className="rounded-xl bg-[#131A2B] px-6 py-8 text-center">
          <h1 className="font-display text-3xl text-[#E6EDF7]">Staff only</h1>
          <p className="mt-2 text-sm text-[#8B98B0]">CTF admin privileges are required for this page.</p>
        </section>
      </StaffShell>
    );
  }

  const season = seasons.find((s) => s.id === selectedSeason);
  const locked = !!lockStatus?.is_locked;
  const seasonLabel = season ? `Season ${season.season_number}${season.season_name ? ` · ${season.season_name}` : ''}` : 'No season';

  return (
    <StaffShell user={user} maxWidth="max-w-5xl">
      <HeaderStrip
        title="Roster lock"
        meta={
          <>
            <span className="text-[#E6EDF7]">{selectedLeague?.name || 'League'} · {seasonLabel}</span>
            {selectedSeason && lockStatus && (
              <span className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${locked ? 'bg-[#F87171]/15 text-[#F87171]' : 'bg-[#34D399]/15 text-[#34D399]'}`}>
                {locked ? <Lock className="h-3 w-3" /> : <Unlock className="h-3 w-3" />}{locked ? 'Locked' : 'Open'}
              </span>
            )}
            <span>Locking freezes squad invitations for the season and cancels any pending ones.</span>
          </>
        }
        actions={
          <>
            <Link href="/admin/ctf" className={btnQuiet}>CTF admin</Link>
            <Link href="/admin/ctf-management?tab=squads" className={btnQuiet}>Squads</Link>
          </>
        }
      >
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <div className="flex flex-wrap gap-1.5">
            {leagues.map((l) => (
              <Chip key={l.id} active={selectedLeague?.id === l.id} onClick={() => setSelectedLeague(l)}>{l.name}</Chip>
            ))}
          </div>
          <select
            value={selectedSeason}
            onChange={(e) => setSelectedSeason(e.target.value)}
            className="rounded-md border border-white/10 bg-[#0B0F1A] px-2 py-1.5 text-sm text-[#E6EDF7] focus:border-[#22D3EE] focus:outline-none"
            style={{ colorScheme: 'dark' }}
          >
            <option value="">Select a season</option>
            {seasons.map((s) => <option key={s.id} value={s.id}>Season {s.season_number}{s.season_name ? ` · ${s.season_name}` : ''}{s.status === 'active' ? ' (active)' : ''}</option>)}
          </select>
        </div>
      </HeaderStrip>

      {message && (
        <div className={`flex items-start gap-2 rounded-xl px-4 py-3 text-sm ${message.type === 'success' ? 'bg-[#34D399]/10 text-[#34D399]' : 'bg-[#F87171]/10 text-[#F87171]'}`}>
          {message.type === 'success' ? <CheckCircle className="mt-0.5 h-4 w-4 shrink-0" /> : <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />}
          <span>{message.text}</span>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Status + toggle */}
        <Panel
          title={locked ? 'Roster is locked' : 'Roster is open'}
          hint={!selectedSeason ? 'Pick a season first.' : locked ? 'Captains cannot invite and players cannot accept.' : 'Captains can invite and players can accept.'}
        >
          <div className="p-5 space-y-4">
            {selectedSeason && lockStatus ? (
              <>
                <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
                  {lockStatus.locked_at && <><dt className="text-[#8B98B0]">Locked</dt><dd className="text-[#E6EDF7]">{new Date(lockStatus.locked_at).toLocaleString()}</dd></>}
                  {lockStatus.unlocked_at && <><dt className="text-[#8B98B0]">Unlocked</dt><dd className="text-[#E6EDF7]">{new Date(lockStatus.unlocked_at).toLocaleString()}</dd></>}
                  {lockStatus.reason && <><dt className="text-[#8B98B0]">Reason</dt><dd className="text-[#E6EDF7]">{lockStatus.reason}</dd></>}
                  {!lockStatus.locked_at && !lockStatus.unlocked_at && <><dt className="text-[#8B98B0]">History</dt><dd className="text-[#8B98B0]">Never locked this season.</dd></>}
                </dl>
                <label className="block">
                  <span className={labelCls}>Reason for {locked ? 'unlocking' : 'locking'} (required)</span>
                  <textarea
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder={locked ? 'e.g. Season over, roster changes allowed' : 'e.g. Week 1 starts tonight, rosters frozen'}
                    className={`${inputCls} resize-none`}
                    rows={3}
                  />
                </label>
                <div className="flex justify-end">
                  <button type="button" onClick={() => setConfirmOpen(true)} disabled={updating || !reason.trim()} className={locked ? btnPrimary : `${btnDanger} bg-[#F87171]/10`}>
                    {locked ? 'Unlock roster' : 'Lock roster'}
                  </button>
                </div>
              </>
            ) : (
              <p className="text-sm text-[#8B98B0]">No season selected.</p>
            )}
          </div>
        </Panel>

        {/* Pending invites */}
        <Panel title="Pending invitations" hint={`${pendingInvites.length} across all squads. Locking cancels them.`}>
          {pendingInvites.length === 0 ? (
            <Empty>No pending invitations.</Empty>
          ) : (
            <ul className="divide-y divide-white/[0.06] max-h-96 overflow-y-auto">
              {pendingInvites.map((invite) => (
                <li key={invite.id} className="flex items-center gap-3 px-5 py-2 text-sm">
                  <span className="min-w-0 flex-1 truncate">
                    <span className="text-[#E6EDF7]">{invite.invited_player_alias}</span>
                    <span className="text-[#8B98B0]"> → {invite.squad_tag ? `[${invite.squad_tag}] ` : ''}{invite.squad_name}</span>
                  </span>
                  <span className="text-xs tabular-nums text-[#8B98B0]">{new Date(invite.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      {confirmOpen && lockStatus && (
        <Modal title={locked ? `Unlock ${selectedLeague?.name} ${seasonLabel}?` : `Lock ${selectedLeague?.name} ${seasonLabel}?`} onClose={() => !updating && setConfirmOpen(false)}>
          <p className="text-sm text-[#8B98B0] mb-4">
            {locked
              ? 'Captains will be able to send invitations again and players to accept them.'
              : `All ${pendingInvites.length} pending invitation${pendingInvites.length === 1 ? '' : 's'} will be cancelled right away, and no new invitations can be sent or accepted until you unlock.`}
          </p>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setConfirmOpen(false)} disabled={updating} className={btnQuiet}>Cancel</button>
            <button type="button" onClick={toggleRosterLock} disabled={updating} className={locked ? btnPrimary : `${btnDanger} bg-[#F87171]/10`}>
              {updating ? 'Working…' : locked ? 'Unlock roster' : 'Lock roster'}
            </button>
          </div>
        </Modal>
      )}
    </StaffShell>
  );
}
