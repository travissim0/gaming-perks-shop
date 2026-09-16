'use client';

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/lib/AuthContext';
import { supabase } from '@/lib/supabase';
import CSVUploadZone from '@/components/admin/CSVUploadZone';
import { parseCSV, processPlayerStats, validatePlayerStats, ProcessedPlayerStat } from '@/lib/csv-parser';
import { toast } from 'react-hot-toast';
import { AlertCircle, CheckCircle, Loader2, ChevronDown } from 'lucide-react';
import { Chip, Panel, Spinner, Empty, StaffShell, HeaderStrip, th, td } from '@/components/ctf/AdminBits';
import { inputCls, labelCls, btnPrimary, btnQuiet } from '@/components/ctf/FormBits';

interface League { id: string; slug: string; name: string }
interface Season { id: string; season_number: number; season_name: string | null; status: 'upcoming' | 'active' | 'completed' }
interface Squad { id: string; name: string; tag: string; is_active: boolean }

interface MatchRecord {
  id: string;
  title: string;
  squad_a_name: string;
  squad_b_name: string;
  squad_a_score: number;
  squad_b_score: number;
  played_at: string;
  status: string;
  season_number: number;
  game_id?: string;
}

interface StandingRow {
  rank: number;
  squad_name: string;
  squad_tag: string;
  wins: number;
  losses: number;
  no_shows: number;
  overtime_wins: number;
  overtime_losses: number;
  points: number;
  win_percentage: number;
  kill_death_difference: number;
  matches_played: number;
}

/** A scheduled fixture without a recorded result yet (from /api/league/schedule). */
interface Fixture {
  id: string;
  week: number | null;
  stage: 'regular' | 'playoff';
  playoff_round: number | null;
  scheduled_at: string;
  title: string;
  squad_a_id: string | null;
  squad_b_id: string | null;
  squad_a_name: string | null;
  squad_a_tag: string | null;
  squad_b_name: string | null;
  squad_b_tag: string | null;
  game_id: string | null;
  result: { a_score: number; b_score: number } | null;
}

const SEASON_PILL: Record<string, string> = {
  active: 'bg-[#34D399]/15 text-[#34D399]',
  upcoming: 'bg-[#F59E0B]/15 text-[#F59E0B]',
  completed: 'bg-white/5 text-[#8B98B0]',
};

const localDate = (iso: string) => {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

/**
 * Match manager: record official league results (which drive the standings),
 * optionally with a player-stats CSV. Scheduled fixtures can prefill the form.
 */
export default function MatchManagerPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const [isCTFAdmin, setIsCTFAdmin] = useState(false);

  // League + season
  const [leagues, setLeagues] = useState<League[]>([]);
  const [selectedLeague, setSelectedLeague] = useState<string>('ctfpl');
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [selectedSeason, setSelectedSeason] = useState<Season | null>(null);
  const [squads, setSquads] = useState<Squad[]>([]);

  // Match form
  const [squadAName, setSquadAName] = useState('');
  const [squadAId, setSquadAId] = useState('');
  const [squadAScore, setSquadAScore] = useState('0');
  const [squadBName, setSquadBName] = useState('');
  const [squadBId, setSquadBId] = useState('');
  const [squadBScore, setSquadBScore] = useState('0');
  const [matchTitle, setMatchTitle] = useState('');
  const [playedAt, setPlayedAt] = useState(new Date().toISOString().split('T')[0]);
  const [isOvertime, setIsOvertime] = useState(false);
  const [squadANoShow, setSquadANoShow] = useState(false);
  const [squadBNoShow, setSquadBNoShow] = useState(false);
  const [arenaName, setArenaName] = useState('');
  const [matchType, setMatchType] = useState('Season');
  const [matchLength, setMatchLength] = useState('');
  const [mvp, setMvp] = useState('');
  const [existingGameId, setExistingGameId] = useState('');
  const [fromFixture, setFromFixture] = useState<Fixture | null>(null);

  // Squad search
  const [squadASearch, setSquadASearch] = useState('');
  const [squadBSearch, setSquadBSearch] = useState('');
  const [showSquadADropdown, setShowSquadADropdown] = useState(false);
  const [showSquadBDropdown, setShowSquadBDropdown] = useState(false);
  const squadARef = useRef<HTMLDivElement>(null);
  const squadBRef = useRef<HTMLDivElement>(null);

  // CSV
  const [csvPreview, setCsvPreview] = useState<ProcessedPlayerStat[]>([]);
  const [showCsvUpload, setShowCsvUpload] = useState(false);
  const [showDetails, setShowDetails] = useState(false);

  // Data
  const [matches, setMatches] = useState<MatchRecord[]>([]);
  const [standings, setStandings] = useState<StandingRow[]>([]);
  const [fixtures, setFixtures] = useState<Fixture[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [loadingData, setLoadingData] = useState(false);

  // Auth check
  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/auth/login');
      return;
    }
    const checkAdmin = async () => {
      if (user && !isCTFAdmin) {
        const { data } = await supabase.from('profiles').select('is_admin, ctf_role').eq('id', user.id).single();
        const hasAccess = data && (data.is_admin === true || data.ctf_role === 'ctf_admin');
        if (!hasAccess) {
          router.push('/dashboard');
          toast.error('Unauthorized: CTF Admin access required');
          return;
        }
        setIsCTFAdmin(true);
      }
    };
    checkAdmin();
  }, [user, authLoading, isCTFAdmin, router]);

  // Leagues
  useEffect(() => {
    (async () => {
      const { data } = await supabase.from('leagues').select('id, slug, name').order('slug');
      if (data) setLeagues(data);
    })();
  }, []);

  // Seasons (all statuses) when the league changes
  useEffect(() => {
    (async () => {
      let data: Season[] | null = null;
      if (selectedLeague === 'ctfpl') {
        const result = await supabase.from('ctfpl_seasons').select('id, season_number, season_name, status').order('season_number', { ascending: false });
        data = result.data;
      } else {
        const league = leagues.find((l) => l.slug === selectedLeague);
        if (!league) return;
        const result = await supabase.from('league_seasons').select('id, season_number, season_name, status').eq('league_id', league.id).order('season_number', { ascending: false });
        data = result.data;
      }
      setSeasons(data || []);
      setSelectedSeason(data && data.length > 0 ? data[0] : null);
    })();
  }, [selectedLeague, leagues]);

  // Squads
  useEffect(() => {
    (async () => {
      const { data } = await supabase.from('squads').select('id, name, tag, is_active').order('name');
      if (data) setSquads(data);
    })();
  }, []);

  // Matches, standings and fixtures when the season changes
  useEffect(() => {
    if (selectedSeason) { fetchSeasonData(); fetchFixtures(); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedSeason]);

  // Click outside closes the squad dropdowns
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (squadARef.current && !squadARef.current.contains(e.target as Node)) setShowSquadADropdown(false);
      if (squadBRef.current && !squadBRef.current.contains(e.target as Node)) setShowSquadBDropdown(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const fetchSeasonData = async () => {
    if (!selectedSeason) return;
    setLoadingData(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`/api/ctf/matches?season_number=${selectedSeason.season_number}&league=${selectedLeague}`, {
        headers: session ? { Authorization: `Bearer ${session.access_token}` } : {},
      });
      const data = await res.json();
      setMatches(data.matches || []);
      setStandings(data.standings || []);
    } catch (error) {
      console.error('Error fetching season data:', error);
    } finally {
      setLoadingData(false);
    }
  };

  const fetchFixtures = async () => {
    if (!selectedSeason) return;
    try {
      const res = await fetch(`/api/league/schedule?league=${encodeURIComponent(selectedLeague)}&season=${selectedSeason.season_number}`, { cache: 'no-store' });
      const json = res.ok ? await res.json() : { fixtures: [] };
      setFixtures((json.fixtures || []) as Fixture[]);
    } catch {
      setFixtures([]);
    }
  };

  const pendingFixtures = useMemo(
    () => fixtures.filter((f) => !f.result && f.squad_a_name && f.squad_b_name).sort((a, b) => new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime()),
    [fixtures],
  );

  const useFixture = (f: Fixture) => {
    const a = squads.find((s) => s.id === f.squad_a_id);
    const b = squads.find((s) => s.id === f.squad_b_id);
    setSquadAName(a?.name || f.squad_a_name || ''); setSquadAId(a?.id || f.squad_a_id || ''); setSquadASearch(a?.name || f.squad_a_name || '');
    setSquadBName(b?.name || f.squad_b_name || ''); setSquadBId(b?.id || f.squad_b_id || ''); setSquadBSearch(b?.name || f.squad_b_name || '');
    setPlayedAt(localDate(f.scheduled_at));
    setMatchTitle(f.title && !f.title.includes(' vs ') ? f.title : '');
    setMatchType(f.stage === 'playoff' ? 'Playoffs' : 'Season');
    if (f.game_id) setExistingGameId(f.game_id);
    setFromFixture(f);
    setMessage(null);
    document.getElementById('record-match')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const filteredSquadsA = squads.filter((s) => squadASearch && (s.name.toLowerCase().includes(squadASearch.toLowerCase()) || s.tag.toLowerCase().includes(squadASearch.toLowerCase()))).slice(0, 10);
  const filteredSquadsB = squads.filter((s) => squadBSearch && (s.name.toLowerCase().includes(squadBSearch.toLowerCase()) || s.tag.toLowerCase().includes(squadBSearch.toLowerCase()))).slice(0, 10);

  const selectSquadA = (squad: Squad) => { setSquadAName(squad.name); setSquadAId(squad.id); setSquadASearch(squad.name); setShowSquadADropdown(false); };
  const selectSquadB = (squad: Squad) => { setSquadBName(squad.name); setSquadBId(squad.id); setSquadBSearch(squad.name); setShowSquadBDropdown(false); };
  const handleSquadAInput = (value: string) => { setSquadASearch(value); setSquadAName(value); setSquadAId(''); setShowSquadADropdown(true); setFromFixture(null); };
  const handleSquadBInput = (value: string) => { setSquadBSearch(value); setSquadBName(value); setSquadBId(''); setShowSquadBDropdown(true); setFromFixture(null); };

  const handleCsvUpload = (file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const csvText = e.target?.result as string;
        const csvData = parseCSV(csvText);
        const seasonLabel = selectedSeason ? `Season ${selectedSeason.season_number}${selectedSeason.season_name ? ' - ' + selectedSeason.season_name : ''}` : undefined;
        const processedData = processPlayerStats(csvData, undefined, undefined, seasonLabel, arenaName || undefined);
        const errors = validatePlayerStats(processedData);
        if (errors.length > 0) {
          setMessage({ type: 'error', text: `CSV validation errors:\n${errors.join('\n')}` });
          return;
        }
        setCsvPreview(processedData);
        toast.success(`Parsed ${processedData.length} player stat records`);
      } catch (error: any) {
        setMessage({ type: 'error', text: `CSV parse error: ${error.message}` });
      }
    };
    reader.readAsText(file);
  };

  const resetForm = () => {
    setSquadAName(''); setSquadAId(''); setSquadASearch(''); setSquadAScore('0');
    setSquadBName(''); setSquadBId(''); setSquadBSearch(''); setSquadBScore('0');
    setMatchTitle(''); setIsOvertime(false); setSquadANoShow(false); setSquadBNoShow(false);
    setCsvPreview([]); setExistingGameId(''); setArenaName(''); setMatchType('Season'); setMatchLength(''); setMvp('');
    setPlayedAt(new Date().toISOString().split('T')[0]);
    setFromFixture(null);
  };

  const handleSubmit = async () => {
    if (!selectedSeason || !squadAName || !squadBName) {
      setMessage({ type: 'error', text: 'Season, Squad A, and Squad B are required' });
      return;
    }
    if (squadAScore === '' || squadBScore === '') {
      setMessage({ type: 'error', text: 'Scores are required' });
      return;
    }

    setSubmitting(true);
    setMessage(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { setMessage({ type: 'error', text: 'Not authenticated' }); return; }

      const body: Record<string, unknown> = {
        league: selectedLeague,
        season_number: selectedSeason.season_number,
        squad_a_name: squadAName,
        squad_b_name: squadBName,
        squad_a_id: squadAId || undefined,
        squad_b_id: squadBId || undefined,
        squad_a_score: parseInt(squadAScore),
        squad_b_score: parseInt(squadBScore),
        title: matchTitle || undefined,
        played_at: playedAt ? new Date(playedAt).toISOString() : undefined,
        is_overtime: isOvertime,
        squad_a_no_show: squadANoShow,
        squad_b_no_show: squadBNoShow,
        arena_name: arenaName || undefined,
        match_type: matchType,
        match_length: matchLength || undefined,
        mvp: mvp || undefined,
        game_id: existingGameId || undefined,
      };
      if (csvPreview.length > 0) body.player_stats = csvPreview;

      const res = await fetch('/api/ctf/matches', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        const errorText = data.details ? `${data.error}: ${data.details}` : data.error || 'Failed to create match';
        setMessage({ type: 'error', text: errorText });
        return;
      }

      const parts = ['Match recorded.'];
      if (data.standings_updated) parts.push('Standings updated.');
      if (data.stats_inserted > 0) parts.push(`${data.stats_inserted} player stats imported.`);
      if (data.warning) parts.push(`Warning: ${data.warning}`);
      setMessage({ type: 'success', text: parts.join(' ') });

      resetForm();
      fetchSeasonData();
      fetchFixtures();
      const { data: updatedSquads } = await supabase.from('squads').select('id, name, tag, is_active').order('name');
      if (updatedSquads) setSquads(updatedSquads);
    } catch (error: any) {
      setMessage({ type: 'error', text: `Error: ${error.message}` });
    } finally {
      setSubmitting(false);
    }
  };

  if (authLoading || !isCTFAdmin) {
    return <StaffShell user={user}><Spinner label="Checking staff access…" /></StaffShell>;
  }

  const seasonLabel = selectedSeason ? `Season ${selectedSeason.season_number}${selectedSeason.season_name ? ` · ${selectedSeason.season_name}` : ''}` : 'No season';
  const leagueName = selectedLeague === 'ctfpl' ? 'CTFPL' : leagues.find((l) => l.slug === selectedLeague)?.name || selectedLeague.toUpperCase();
  const canSubmit = !submitting && !!squadAName && !!squadBName && squadAScore !== '' && squadBScore !== '';

  const squadPicker = (
    label: string, search: string, onInput: (v: string) => void, matchedId: string, open: boolean, setOpen: (v: boolean) => void,
    list: Squad[], pick: (s: Squad) => void, ref: React.RefObject<HTMLDivElement | null>, score: string, setScore: (v: string) => void, noShow: boolean, setNoShow: (v: boolean) => void,
  ) => (
    <div className="rounded-md bg-[#1B2438] p-3">
      <label className={labelCls}>{label}</label>
      <div className="flex items-start gap-3">
        <div className="relative flex-1" ref={ref}>
          <input
            type="text"
            value={search}
            onChange={(e) => onInput(e.target.value)}
            onFocus={() => search && setOpen(true)}
            placeholder="Search or type a squad name"
            className={inputCls}
          />
          {matchedId && <span className="absolute right-3 top-2.5 text-[10px] uppercase tracking-wide text-[#34D399]">matched</span>}
          {open && list.length > 0 && (
            <div className="absolute z-10 mt-1 w-full max-h-48 overflow-y-auto rounded-md border border-white/10 bg-[#0B0F1A] shadow-xl">
              {list.map((s) => (
                <button key={s.id} type="button" onClick={() => pick(s)} className="flex w-full items-center justify-between px-3 py-2 text-left text-sm text-[#E6EDF7] hover:bg-white/5">
                  <span>{s.name}</span>
                  <span className="text-xs text-[#8B98B0]">[{s.tag}]{!s.is_active && ' · legacy'}</span>
                </button>
              ))}
            </div>
          )}
        </div>
        <input
          type="number"
          min="0"
          value={score}
          onChange={(e) => setScore(e.target.value)}
          placeholder="0"
          className="w-20 rounded-md border border-white/10 bg-[#0B0F1A] px-2 py-1.5 text-center font-display text-2xl text-[#E6EDF7] focus:border-[#22D3EE] focus:outline-none"
          aria-label={`${label} score`}
        />
      </div>
      <div className="mt-2">
        <Chip active={noShow} tone="warn" onClick={() => setNoShow(!noShow)}>No-show</Chip>
      </div>
    </div>
  );

  return (
    <StaffShell user={user}>
      <HeaderStrip
        title="Match manager"
        meta={
          <>
            <span className="text-[#E6EDF7]">{leagueName} · {seasonLabel}</span>
            {selectedSeason && <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${SEASON_PILL[selectedSeason.status] || SEASON_PILL.completed}`}>{selectedSeason.status}</span>}
            <span>Official results recorded here drive the standings.</span>
          </>
        }
        actions={
          <>
            <Link href="/admin/ctf" className={btnQuiet}>CTF admin</Link>
            <Link href={`/league/schedule?league=${selectedLeague}`} className={btnQuiet}>Schedule</Link>
            <Link href={`/league/standings?league=${selectedLeague}`} className={btnQuiet}>Standings</Link>
          </>
        }
      >
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <div className="flex flex-wrap gap-1.5">
            <Chip active={selectedLeague === 'ctfpl'} onClick={() => setSelectedLeague('ctfpl')}>CTFPL</Chip>
            {leagues.filter((l) => l.slug !== 'ctfpl').map((league) => (
              <Chip key={league.slug} active={selectedLeague === league.slug} onClick={() => setSelectedLeague(league.slug)}>{league.name}</Chip>
            ))}
          </div>
          <select
            value={selectedSeason?.id || ''}
            onChange={(e) => setSelectedSeason(seasons.find((s) => s.id === e.target.value) || null)}
            className="rounded-md border border-white/10 bg-[#0B0F1A] px-2 py-1.5 text-sm text-[#E6EDF7] focus:border-[#22D3EE] focus:outline-none"
            style={{ colorScheme: 'dark' }}
          >
            {seasons.length === 0 && <option value="">No seasons found</option>}
            {seasons.map((s) => <option key={s.id} value={s.id}>Season {s.season_number}{s.season_name ? ` · ${s.season_name}` : ''} ({s.status})</option>)}
          </select>
        </div>
      </HeaderStrip>

      {/* From the schedule */}
      {pendingFixtures.length > 0 && (
        <Panel title="From the schedule" hint={`${pendingFixtures.length} fixture${pendingFixtures.length === 1 ? '' : 's'} without a result. Pick one to fill in the form.`}>
          <ul className="divide-y divide-white/[0.06]">
            {pendingFixtures.slice(0, 12).map((f) => {
              const when = new Date(f.scheduled_at);
              const past = when.getTime() < Date.now();
              return (
                <li key={f.id} className={`flex flex-wrap items-center gap-3 px-5 py-2 ${fromFixture?.id === f.id ? 'bg-[#22D3EE]/[0.06]' : ''}`}>
                  <span className="w-28 shrink-0 text-xs tabular-nums text-[#8B98B0]">
                    {when.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}
                    {past ? '' : <span className="ml-1 text-[#F59E0B]">upcoming</span>}
                  </span>
                  <span className="w-16 shrink-0 text-[11px] uppercase tracking-wide text-[#8B98B0]">{f.stage === 'playoff' ? 'Playoffs' : f.week ? `Week ${f.week}` : ''}</span>
                  <span className="min-w-0 flex-1 text-sm text-[#E6EDF7]">
                    {f.squad_a_name} <span className="text-[10px] uppercase tracking-wide text-[#F59E0B]/80">home</span> <span className="text-[#8B98B0]">vs</span> {f.squad_b_name}
                  </span>
                  <button type="button" onClick={() => useFixture(f)} className="text-xs text-[#22D3EE] hover:text-[#67E8F9]">Record result</button>
                </li>
              );
            })}
          </ul>
        </Panel>
      )}

      {/* Message */}
      {message && (
        <div className={`flex items-start gap-2 rounded-xl px-4 py-3 text-sm ${message.type === 'success' ? 'bg-[#34D399]/10 text-[#34D399]' : 'bg-[#F87171]/10 text-[#F87171]'}`}>
          {message.type === 'success' ? <CheckCircle className="mt-0.5 h-4 w-4 shrink-0" /> : <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />}
          <pre className="whitespace-pre-wrap font-sans">{message.text}</pre>
        </div>
      )}

      {/* Record match */}
      <div id="record-match">
      <Panel
        title="Record a match"
        hint={fromFixture ? `Filled from the schedule: ${fromFixture.squad_a_name} vs ${fromFixture.squad_b_name}.` : 'Squads, scores and the date. Everything else is optional.'}
        actions={
          <>
            {(squadAName || squadBName) && <button type="button" onClick={resetForm} className={btnQuiet}>Clear</button>}
            <button type="button" onClick={handleSubmit} disabled={!canSubmit} className={`${btnPrimary} inline-flex items-center gap-2`}>
              {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
              Record match
            </button>
          </>
        }
      >
        <div className="p-5 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {squadPicker('Squad A · home', squadASearch, handleSquadAInput, squadAId, showSquadADropdown, setShowSquadADropdown, filteredSquadsA, selectSquadA, squadARef, squadAScore, setSquadAScore, squadANoShow, setSquadANoShow)}
            {squadPicker('Squad B · away', squadBSearch, handleSquadBInput, squadBId, showSquadBDropdown, setShowSquadBDropdown, filteredSquadsB, selectSquadB, squadBRef, squadBScore, setSquadBScore, squadBNoShow, setSquadBNoShow)}
          </div>

          <div className="flex flex-wrap items-end gap-3">
            <div>
              <label className={labelCls}>Match type</label>
              <div className="flex gap-1.5">
                {['Season', 'Playoffs', 'Finals'].map((type) => (
                  <Chip key={type} active={matchType === type} onClick={() => setMatchType(type)}>{type}</Chip>
                ))}
              </div>
            </div>
            <div>
              <label className={labelCls}>Flags</label>
              <Chip active={isOvertime} onClick={() => setIsOvertime(!isOvertime)}>Overtime</Chip>
            </div>
            <label className="block">
              <span className={labelCls}>Date played</span>
              <input type="date" value={playedAt} onChange={(e) => setPlayedAt(e.target.value)} className={inputCls} style={{ colorScheme: 'dark' }} />
            </label>
            {matchType !== 'Season' && <span className="pb-2 text-xs text-[#F59E0B]">Standings are not updated for {matchType} matches.</span>}
          </div>

          <button type="button" onClick={() => setShowDetails((v) => !v)} className="flex items-center gap-1 text-sm text-[#8B98B0] hover:text-[#E6EDF7]">
            <ChevronDown className={`h-4 w-4 transition-transform ${showDetails ? 'rotate-180' : ''}`} />
            Details{(matchTitle || arenaName || matchLength || mvp || existingGameId) ? ' · filled' : ' (optional)'}
          </button>
          {showDetails && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <label className="block">
                <span className={labelCls}>Title</span>
                <input type="text" value={matchTitle} onChange={(e) => setMatchTitle(e.target.value)} placeholder={squadAName && squadBName ? `${squadAName} vs ${squadBName}` : 'Auto-generated'} className={inputCls} />
              </label>
              <label className="block">
                <span className={labelCls}>Arena</span>
                <input type="text" value={arenaName} onChange={(e) => setArenaName(e.target.value)} placeholder="e.g. CTF_Extreme" className={inputCls} />
              </label>
              <label className="block">
                <span className={labelCls}>Match length</span>
                <input type="text" value={matchLength} onChange={(e) => setMatchLength(e.target.value)} placeholder="e.g. 22:45" className={inputCls} />
              </label>
              <label className="block">
                <span className={labelCls}>MVP</span>
                <input type="text" value={mvp} onChange={(e) => setMvp(e.target.value)} placeholder="Player alias" className={inputCls} />
              </label>
              <label className="block md:col-span-2">
                <span className={labelCls}>Link game id</span>
                <input type="text" value={existingGameId} onChange={(e) => setExistingGameId(e.target.value)} placeholder="e.g. Tournament_20260101_1234567890 — connects existing player stats" className={inputCls} />
              </label>
            </div>
          )}

          <button type="button" onClick={() => setShowCsvUpload(!showCsvUpload)} className="flex items-center gap-1 text-sm text-[#8B98B0] hover:text-[#E6EDF7]">
            <ChevronDown className={`h-4 w-4 transition-transform ${showCsvUpload ? 'rotate-180' : ''}`} />
            {csvPreview.length > 0 ? `Player stats CSV · ${csvPreview.length} records attached` : 'Attach a player stats CSV'}
          </button>
          {showCsvUpload && (
            <div className="space-y-2">
              <CSVUploadZone onFileUpload={handleCsvUpload} isProcessing={false} disabled={submitting} />
              {csvPreview.length > 0 && (
                <div className="rounded-md bg-[#1B2438] p-3">
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-sm text-[#34D399]">{csvPreview.length} records parsed</span>
                    <button type="button" onClick={() => setCsvPreview([])} className="text-xs text-[#F87171] hover:text-[#FCA5A5]">Clear</button>
                  </div>
                  <div className="max-h-32 overflow-y-auto text-xs text-[#8B98B0]">
                    {csvPreview.slice(0, 5).map((s, i) => (
                      <div key={i}>{s.player_name} — {s.team} — {s.main_class} — K:{s.kills} D:{s.deaths} — {s.result}</div>
                    ))}
                    {csvPreview.length > 5 && <div className="text-[#8B98B0]/60">…and {csvPreview.length - 5} more</div>}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </Panel>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        {/* Season matches */}
        <div className="lg:col-span-3">
          <Panel title="Recorded matches" hint={`${matches.length} this season`}>
            {loadingData ? (
              <Spinner label="Loading…" />
            ) : matches.length === 0 ? (
              <Empty>No matches recorded for this season yet.</Empty>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr>
                      <th className={th}>Date</th>
                      <th className={`${th} text-right`}>Squad A</th>
                      <th className={`${th} text-center`}>Score</th>
                      <th className={th}>Squad B</th>
                    </tr>
                  </thead>
                  <tbody>
                    {matches.map((m) => {
                      const aWon = m.squad_a_score > m.squad_b_score;
                      const bWon = m.squad_b_score > m.squad_a_score;
                      return (
                        <tr key={m.id} className="border-t border-white/[0.06] hover:bg-white/[0.02]">
                          <td className={`${td} whitespace-nowrap text-xs text-[#8B98B0]`}>{m.played_at ? new Date(m.played_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : '—'}</td>
                          <td className={`${td} text-right ${aWon ? 'text-[#E6EDF7]' : 'text-[#8B98B0]'}`}>{m.squad_a_name}</td>
                          <td className={`${td} text-center font-display text-lg tabular-nums whitespace-nowrap`}>
                            <span className={aWon ? 'text-[#34D399]' : 'text-[#8B98B0]'}>{m.squad_a_score}</span>
                            <span className="mx-1 text-white/20">:</span>
                            <span className={bWon ? 'text-[#34D399]' : 'text-[#8B98B0]'}>{m.squad_b_score}</span>
                          </td>
                          <td className={`${td} ${bWon ? 'text-[#E6EDF7]' : 'text-[#8B98B0]'}`}>{m.squad_b_name}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>
        </div>

        {/* Standings */}
        <div className="lg:col-span-2">
          <Panel title="Standings" hint="Live from recorded season matches.">
            {loadingData ? (
              <Spinner label="Loading…" />
            ) : standings.length === 0 ? (
              <Empty>No standings for this season yet.</Empty>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr>
                      <th className={th}>#</th>
                      <th className={th}>Squad</th>
                      <th className={`${th} text-center`}>W</th>
                      <th className={`${th} text-center`}>L</th>
                      <th className={`${th} text-center`} title="No-shows">NS</th>
                      <th className={`${th} text-center`} title="Overtime wins">OTW</th>
                      <th className={`${th} text-right`}>Pts</th>
                    </tr>
                  </thead>
                  <tbody>
                    {standings.map((s) => (
                      <tr key={`${s.squad_name}-${s.rank}`} className="border-t border-white/[0.06] hover:bg-white/[0.02]">
                        <td className={`${td} tabular-nums text-[#8B98B0]`}>{s.rank}</td>
                        <td className={`${td} text-[#E6EDF7]`}>{s.squad_name}{s.squad_tag && <span className="ml-1 text-xs text-[#8B98B0]">[{s.squad_tag}]</span>}</td>
                        <td className={`${td} text-center tabular-nums text-[#34D399]`}>{s.wins}</td>
                        <td className={`${td} text-center tabular-nums text-[#F87171]`}>{s.losses}</td>
                        <td className={`${td} text-center tabular-nums text-[#F59E0B]`}>{s.no_shows || 0}</td>
                        <td className={`${td} text-center tabular-nums text-[#8B98B0]`}>{s.overtime_wins || 0}</td>
                        <td className={`${td} text-right font-display text-lg tabular-nums text-[#E6EDF7]`}>{s.points}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>
        </div>
      </div>
    </StaffShell>
  );
}
