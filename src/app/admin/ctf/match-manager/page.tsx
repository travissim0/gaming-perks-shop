'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/AuthContext';
import { supabase } from '@/lib/supabase';
import Navbar from '@/components/Navbar';
import CSVUploadZone from '@/components/admin/CSVUploadZone';
import { parseCSV, processPlayerStats, validatePlayerStats, ProcessedPlayerStat } from '@/lib/csv-parser';
import { toast } from 'react-hot-toast';
import { ArrowLeft, Trophy, AlertCircle, CheckCircle, Loader2, Plus, Swords, ChevronDown } from 'lucide-react';

interface League {
  id: string;
  slug: string;
  name: string;
}

interface Season {
  id: string;
  season_number: number;
  season_name: string | null;
  status: 'upcoming' | 'active' | 'completed';
}

interface Squad {
  id: string;
  name: string;
  tag: string;
  is_active: boolean;
}

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

export default function MatchManagerPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const [isCTFAdmin, setIsCTFAdmin] = useState(false);

  // League state
  const [leagues, setLeagues] = useState<League[]>([]);
  const [selectedLeague, setSelectedLeague] = useState<string>('ctfpl');

  // Season state
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [selectedSeason, setSelectedSeason] = useState<Season | null>(null);

  // Squad state
  const [squads, setSquads] = useState<Squad[]>([]);

  // Match form state
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

  // Squad search state
  const [squadASearch, setSquadASearch] = useState('');
  const [squadBSearch, setSquadBSearch] = useState('');
  const [showSquadADropdown, setShowSquadADropdown] = useState(false);
  const [showSquadBDropdown, setShowSquadBDropdown] = useState(false);
  const squadARef = useRef<HTMLDivElement>(null);
  const squadBRef = useRef<HTMLDivElement>(null);

  // CSV state
  const [csvPreview, setCsvPreview] = useState<ProcessedPlayerStat[]>([]);
  const [showCsvUpload, setShowCsvUpload] = useState(false);

  // Data state
  const [matches, setMatches] = useState<MatchRecord[]>([]);
  const [standings, setStandings] = useState<StandingRow[]>([]);
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
        const { data } = await supabase
          .from('profiles')
          .select('is_admin, ctf_role')
          .eq('id', user.id)
          .single();
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
  }, [user, authLoading, isCTFAdmin]);

  // Fetch leagues
  useEffect(() => {
    const fetchLeagues = async () => {
      const { data } = await supabase
        .from('leagues')
        .select('id, slug, name')
        .order('slug');
      if (data) setLeagues(data);
    };
    fetchLeagues();
  }, []);

  // Fetch seasons (ALL statuses) when league changes
  useEffect(() => {
    const fetchSeasons = async () => {
      let data: Season[] | null = null;

      if (selectedLeague === 'ctfpl') {
        const result = await supabase
          .from('ctfpl_seasons')
          .select('id, season_number, season_name, status')
          .order('season_number', { ascending: false });
        data = result.data;
      } else {
        const league = leagues.find(l => l.slug === selectedLeague);
        if (!league) return;
        const result = await supabase
          .from('league_seasons')
          .select('id, season_number, season_name, status')
          .eq('league_id', league.id)
          .order('season_number', { ascending: false });
        data = result.data;
      }

      if (data) {
        setSeasons(data);
        setSelectedSeason(data.length > 0 ? data[0] : null);
      } else {
        setSeasons([]);
        setSelectedSeason(null);
      }
    };
    fetchSeasons();
  }, [selectedLeague, leagues]);

  // Fetch squads
  useEffect(() => {
    const fetchSquads = async () => {
      const { data } = await supabase
        .from('squads')
        .select('id, name, tag, is_active')
        .order('name');
      if (data) setSquads(data);
    };
    fetchSquads();
  }, []);

  // Fetch matches + standings when season changes
  useEffect(() => {
    if (selectedSeason) {
      fetchSeasonData();
    }
  }, [selectedSeason]);

  // Click outside to close dropdowns
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (squadARef.current && !squadARef.current.contains(e.target as Node)) {
        setShowSquadADropdown(false);
      }
      if (squadBRef.current && !squadBRef.current.contains(e.target as Node)) {
        setShowSquadBDropdown(false);
      }
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
        headers: session ? { 'Authorization': `Bearer ${session.access_token}` } : {},
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

  const filteredSquadsA = squads.filter(s =>
    squadASearch &&
    (s.name.toLowerCase().includes(squadASearch.toLowerCase()) ||
     s.tag.toLowerCase().includes(squadASearch.toLowerCase()))
  ).slice(0, 10);

  const filteredSquadsB = squads.filter(s =>
    squadBSearch &&
    (s.name.toLowerCase().includes(squadBSearch.toLowerCase()) ||
     s.tag.toLowerCase().includes(squadBSearch.toLowerCase()))
  ).slice(0, 10);

  const selectSquadA = (squad: Squad) => {
    setSquadAName(squad.name);
    setSquadAId(squad.id);
    setSquadASearch(squad.name);
    setShowSquadADropdown(false);
  };

  const selectSquadB = (squad: Squad) => {
    setSquadBName(squad.name);
    setSquadBId(squad.id);
    setSquadBSearch(squad.name);
    setShowSquadBDropdown(false);
  };

  const handleSquadAInput = (value: string) => {
    setSquadASearch(value);
    setSquadAName(value);
    setSquadAId(''); // Clear ID — will be resolved server-side if no match
    setShowSquadADropdown(true);
  };

  const handleSquadBInput = (value: string) => {
    setSquadBSearch(value);
    setSquadBName(value);
    setSquadBId(''); // Clear ID
    setShowSquadBDropdown(true);
  };

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
      if (!session) {
        setMessage({ type: 'error', text: 'Not authenticated' });
        return;
      }

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

      if (csvPreview.length > 0) {
        body.player_stats = csvPreview;
      }

      const res = await fetch('/api/ctf/matches', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify(body),
      });

      const data = await res.json();

      if (!res.ok) {
        const errorText = data.details ? `${data.error}: ${data.details}` : data.error || 'Failed to create match';
        setMessage({ type: 'error', text: errorText });
        return;
      }

      const parts = ['Match recorded successfully!'];
      if (data.standings_updated) parts.push('Standings updated.');
      if (data.stats_inserted > 0) parts.push(`${data.stats_inserted} player stats imported.`);
      if (data.warning) parts.push(`Warning: ${data.warning}`);
      setMessage({ type: 'success', text: parts.join(' ') });

      // Reset form
      setSquadAName(''); setSquadAId(''); setSquadASearch(''); setSquadAScore('0');
      setSquadBName(''); setSquadBId(''); setSquadBSearch(''); setSquadBScore('0');
      setMatchTitle(''); setIsOvertime(false); setSquadANoShow(false); setSquadBNoShow(false);
      setCsvPreview([]); setExistingGameId(''); setArenaName(''); setMatchType('Season'); setMatchLength(''); setMvp('');
      setPlayedAt(new Date().toISOString().split('T')[0]);

      // Refresh data
      fetchSeasonData();

      // Refresh squads in case new ones were created
      const { data: updatedSquads } = await supabase.from('squads').select('id, name, tag, is_active').order('name');
      if (updatedSquads) setSquads(updatedSquads);

    } catch (error: any) {
      setMessage({ type: 'error', text: `Error: ${error.message}` });
    } finally {
      setSubmitting(false);
    }
  };

  if (authLoading || !isCTFAdmin) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-500" />
      </div>
    );
  }

  const statusBadge = (status: string) => {
    const colors: Record<string, string> = {
      active: 'bg-green-500/20 text-green-400',
      completed: 'bg-gray-500/20 text-gray-400',
      upcoming: 'bg-blue-500/20 text-blue-400',
    };
    return (
      <span className={`text-xs px-2 py-0.5 rounded-full ${colors[status] || 'bg-gray-500/20 text-gray-400'}`}>
        {status}
      </span>
    );
  };

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      <Navbar user={user} />
      <div className="max-w-7xl mx-auto p-6">
        {/* Header */}
        <div className="flex items-center gap-4 mb-6">
          <button onClick={() => router.push('/admin/ctf')} className="text-gray-400 hover:text-white">
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Swords className="h-6 w-6 text-indigo-400" />
              Match Manager
            </h1>
            <p className="text-gray-400 text-sm">Record league matches and update standings</p>
          </div>
        </div>

        {/* League + Season Selector */}
        <div className="bg-gray-800 rounded-lg p-4 mb-6">
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-300 mb-2">League</label>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => setSelectedLeague('ctfpl')}
                className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                  selectedLeague === 'ctfpl' ? 'bg-indigo-600 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                }`}
              >
                CTFPL
              </button>
              {leagues.map(league => (
                <button
                  key={league.slug}
                  onClick={() => setSelectedLeague(league.slug)}
                  className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                    selectedLeague === league.slug ? 'bg-indigo-600 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                  }`}
                >
                  {league.name}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">Season</label>
            <select
              value={selectedSeason?.id || ''}
              onChange={(e) => {
                const s = seasons.find(s => s.id === e.target.value);
                setSelectedSeason(s || null);
              }}
              className="bg-gray-700 text-white rounded-lg px-4 py-2 w-full max-w-md border border-gray-600 focus:border-indigo-500 focus:outline-none"
            >
              {seasons.length === 0 && <option value="">No seasons found</option>}
              {seasons.map((s) => (
                <option key={s.id} value={s.id}>
                  Season {s.season_number}{s.season_name ? ` - ${s.season_name}` : ''} ({s.status})
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Message */}
        {message && (
          <div className={`p-4 rounded-lg flex items-start gap-2 mb-6 ${
            message.type === 'success' ? 'bg-green-900/50 text-green-200 border border-green-700' : 'bg-red-900/50 text-red-200 border border-red-700'
          }`}>
            {message.type === 'success' ? <CheckCircle className="h-5 w-5 mt-0.5 shrink-0" /> : <AlertCircle className="h-5 w-5 mt-0.5 shrink-0" />}
            <pre className="whitespace-pre-wrap text-sm">{message.text}</pre>
          </div>
        )}

        {/* Record Match Form */}
        <div className="bg-gray-800 rounded-lg p-6 mb-6">
          <h2 className="text-lg font-bold mb-4 flex items-center gap-2">
            <Plus className="h-5 w-5 text-indigo-400" />
            Record Match
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-4">
            {/* Squad A */}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">Squad A</label>
              <div className="relative" ref={squadARef}>
                <input
                  type="text"
                  value={squadASearch}
                  onChange={(e) => handleSquadAInput(e.target.value)}
                  onFocus={() => squadASearch && setShowSquadADropdown(true)}
                  placeholder="Search or type squad name..."
                  className="w-full bg-gray-700 text-white rounded-lg px-4 py-2 border border-gray-600 focus:border-indigo-500 focus:outline-none"
                />
                {squadAId && <span className="absolute right-3 top-2.5 text-green-400 text-xs">matched</span>}
                {showSquadADropdown && filteredSquadsA.length > 0 && (
                  <div className="absolute z-10 mt-1 w-full bg-gray-700 rounded-lg border border-gray-600 shadow-lg max-h-48 overflow-y-auto">
                    {filteredSquadsA.map((s) => (
                      <button
                        key={s.id}
                        onClick={() => selectSquadA(s)}
                        className="w-full text-left px-4 py-2 hover:bg-gray-600 flex justify-between items-center"
                      >
                        <span>{s.name}</span>
                        <span className="text-gray-400 text-xs">[{s.tag}] {!s.is_active && '(legacy)'}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <div className="mt-2">
                <label className="block text-xs text-gray-400 mb-1">Score</label>
                <input
                  type="number"
                  min="0"
                  value={squadAScore}
                  onChange={(e) => setSquadAScore(e.target.value)}
                  placeholder="0"
                  className="w-24 bg-gray-700 text-white rounded-lg px-3 py-2 border border-gray-600 focus:border-indigo-500 focus:outline-none text-center text-lg"
                />
              </div>
            </div>

            {/* Squad B */}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">Squad B</label>
              <div className="relative" ref={squadBRef}>
                <input
                  type="text"
                  value={squadBSearch}
                  onChange={(e) => handleSquadBInput(e.target.value)}
                  onFocus={() => squadBSearch && setShowSquadBDropdown(true)}
                  placeholder="Search or type squad name..."
                  className="w-full bg-gray-700 text-white rounded-lg px-4 py-2 border border-gray-600 focus:border-indigo-500 focus:outline-none"
                />
                {squadBId && <span className="absolute right-3 top-2.5 text-green-400 text-xs">matched</span>}
                {showSquadBDropdown && filteredSquadsB.length > 0 && (
                  <div className="absolute z-10 mt-1 w-full bg-gray-700 rounded-lg border border-gray-600 shadow-lg max-h-48 overflow-y-auto">
                    {filteredSquadsB.map((s) => (
                      <button
                        key={s.id}
                        onClick={() => selectSquadB(s)}
                        className="w-full text-left px-4 py-2 hover:bg-gray-600 flex justify-between items-center"
                      >
                        <span>{s.name}</span>
                        <span className="text-gray-400 text-xs">[{s.tag}] {!s.is_active && '(legacy)'}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <div className="mt-2">
                <label className="block text-xs text-gray-400 mb-1">Score</label>
                <input
                  type="number"
                  min="0"
                  value={squadBScore}
                  onChange={(e) => setSquadBScore(e.target.value)}
                  placeholder="0"
                  className="w-24 bg-gray-700 text-white rounded-lg px-3 py-2 border border-gray-600 focus:border-indigo-500 focus:outline-none text-center text-lg"
                />
              </div>
            </div>
          </div>

          {/* Match Type + Details Row */}
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-300 mb-2">Match Type</label>
            <div className="flex gap-2">
              {['Season', 'Playoffs', 'Finals'].map((type) => (
                <button
                  key={type}
                  type="button"
                  onClick={() => setMatchType(type)}
                  className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                    matchType === type ? 'bg-indigo-600 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                  }`}
                >
                  {type}
                </button>
              ))}
            </div>
            {matchType !== 'Season' && (
              <p className="text-xs text-yellow-400 mt-1">Standings will NOT be updated for {matchType} matches</p>
            )}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">Match Title (optional)</label>
              <input
                type="text"
                value={matchTitle}
                onChange={(e) => setMatchTitle(e.target.value)}
                placeholder={squadAName && squadBName ? `${squadAName} vs ${squadBName}` : 'Auto-generated'}
                className="w-full bg-gray-700 text-white rounded-lg px-4 py-2 border border-gray-600 focus:border-indigo-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">Date Played</label>
              <input
                type="date"
                value={playedAt}
                onChange={(e) => setPlayedAt(e.target.value)}
                className="w-full bg-gray-700 text-white rounded-lg px-4 py-2 border border-gray-600 focus:border-indigo-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">Arena (optional)</label>
              <input
                type="text"
                value={arenaName}
                onChange={(e) => setArenaName(e.target.value)}
                placeholder="e.g. CTF_Extreme"
                className="w-full bg-gray-700 text-white rounded-lg px-4 py-2 border border-gray-600 focus:border-indigo-500 focus:outline-none"
              />
            </div>
          </div>

          {/* Match Length + MVP Row */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">Match Length (optional)</label>
              <input
                type="text"
                value={matchLength}
                onChange={(e) => setMatchLength(e.target.value)}
                placeholder="e.g. 22:45"
                className="w-full bg-gray-700 text-white rounded-lg px-4 py-2 border border-gray-600 focus:border-indigo-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">MVP (optional)</label>
              <input
                type="text"
                value={mvp}
                onChange={(e) => setMvp(e.target.value)}
                placeholder="e.g. PlayerName"
                className="w-full bg-gray-700 text-white rounded-lg px-4 py-2 border border-gray-600 focus:border-indigo-500 focus:outline-none"
              />
            </div>
          </div>

          {/* Flags */}
          <div className="flex flex-wrap gap-6 mb-4">
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={isOvertime} onChange={(e) => setIsOvertime(e.target.checked)} className="rounded bg-gray-700 border-gray-600 text-indigo-500 focus:ring-indigo-500" />
              <span className="text-sm text-gray-300">Overtime</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={squadANoShow} onChange={(e) => setSquadANoShow(e.target.checked)} className="rounded bg-gray-700 border-gray-600 text-red-500 focus:ring-red-500" />
              <span className="text-sm text-gray-300">Squad A No-Show</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={squadBNoShow} onChange={(e) => setSquadBNoShow(e.target.checked)} className="rounded bg-gray-700 border-gray-600 text-red-500 focus:ring-red-500" />
              <span className="text-sm text-gray-300">Squad B No-Show</span>
            </label>
          </div>

          {/* Link Game ID */}
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-300 mb-1">Link Game ID (optional)</label>
            <input
              type="text"
              value={existingGameId}
              onChange={(e) => setExistingGameId(e.target.value)}
              placeholder="e.g. Tournament_20260101_1234567890"
              className="w-full max-w-md bg-gray-700 text-white rounded-lg px-4 py-2 border border-gray-600 focus:border-indigo-500 focus:outline-none text-sm"
            />
            <p className="text-xs text-gray-500 mt-1">Connect to existing player stats by game ID</p>
          </div>

          {/* CSV Upload Toggle */}
          <div className="mb-4">
            <button
              onClick={() => setShowCsvUpload(!showCsvUpload)}
              className="text-sm text-indigo-400 hover:text-indigo-300 flex items-center gap-1"
            >
              <ChevronDown className={`h-4 w-4 transition-transform ${showCsvUpload ? 'rotate-180' : ''}`} />
              {showCsvUpload ? 'Hide' : 'Attach'} Player Stats CSV
            </button>
            {showCsvUpload && (
              <div className="mt-3">
                <CSVUploadZone
                  onFileUpload={handleCsvUpload}
                  isProcessing={false}
                  disabled={submitting}
                />
                {csvPreview.length > 0 && (
                  <div className="mt-2 p-3 bg-gray-700 rounded-lg">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm text-green-400">{csvPreview.length} records parsed</span>
                      <button onClick={() => setCsvPreview([])} className="text-xs text-red-400 hover:text-red-300">Clear</button>
                    </div>
                    <div className="max-h-32 overflow-y-auto text-xs text-gray-400">
                      {csvPreview.slice(0, 5).map((s, i) => (
                        <div key={i}>{s.player_name} — {s.team} — {s.main_class} — K:{s.kills} D:{s.deaths} — {s.result}</div>
                      ))}
                      {csvPreview.length > 5 && <div className="text-gray-500">...and {csvPreview.length - 5} more</div>}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Submit */}
          <button
            onClick={handleSubmit}
            disabled={submitting || !squadAName || !squadBName || squadAScore === '' || squadBScore === ''}
            className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white px-6 py-2.5 rounded-lg font-medium flex items-center gap-2 transition-colors"
          >
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trophy className="h-4 w-4" />}
            Record Match
          </button>
        </div>

        {/* Season Matches */}
        <div className="bg-gray-800 rounded-lg p-6 mb-6">
          <h2 className="text-lg font-bold mb-4">
            Season Matches {matches.length > 0 && <span className="text-gray-400 font-normal text-sm">({matches.length})</span>}
          </h2>
          {loadingData ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
            </div>
          ) : matches.length === 0 ? (
            <p className="text-gray-500 text-sm py-4">No matches recorded for this season yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-700 text-gray-400 text-left">
                    <th className="pb-2 pr-4">Title</th>
                    <th className="pb-2 pr-4 text-right">Squad A</th>
                    <th className="pb-2 px-4 text-center">Score</th>
                    <th className="pb-2 pl-4">Squad B</th>
                    <th className="pb-2 pl-4">Date</th>
                  </tr>
                </thead>
                <tbody>
                  {matches.map((m) => (
                    <tr key={m.id} className="border-b border-gray-700/50 hover:bg-gray-700/30">
                      <td className="py-2 pr-4 text-gray-300">{m.title}</td>
                      <td className={`py-2 pr-4 text-right font-medium ${m.squad_a_score > m.squad_b_score ? 'text-green-400' : 'text-gray-400'}`}>
                        {m.squad_a_name}
                      </td>
                      <td className="py-2 px-4 text-center font-mono font-bold">
                        {m.squad_a_score} - {m.squad_b_score}
                      </td>
                      <td className={`py-2 pl-4 font-medium ${m.squad_b_score > m.squad_a_score ? 'text-green-400' : 'text-gray-400'}`}>
                        {m.squad_b_name}
                      </td>
                      <td className="py-2 pl-4 text-gray-500 text-xs">
                        {m.played_at ? new Date(m.played_at).toLocaleDateString() : '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Standings */}
        <div className="bg-gray-800 rounded-lg p-6">
          <h2 className="text-lg font-bold mb-4">
            Current Standings {selectedSeason && statusBadge(selectedSeason.status)}
          </h2>
          {loadingData ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
            </div>
          ) : standings.length === 0 ? (
            <p className="text-gray-500 text-sm py-4">No standings data for this season yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-700 text-gray-400 text-left">
                    <th className="pb-2 pr-2 w-8">#</th>
                    <th className="pb-2 pr-4">Squad</th>
                    <th className="pb-2 pr-3 text-center">MP</th>
                    <th className="pb-2 pr-3 text-center">W</th>
                    <th className="pb-2 pr-3 text-center">L</th>
                    <th className="pb-2 pr-3 text-center">NS</th>
                    <th className="pb-2 pr-3 text-center">OTW</th>
                    <th className="pb-2 pr-3 text-center">Pts</th>
                    <th className="pb-2 pr-3 text-center">Win%</th>
                    <th className="pb-2 text-center">K/D Diff</th>
                  </tr>
                </thead>
                <tbody>
                  {standings.map((s) => (
                    <tr key={`${s.squad_name}-${s.rank}`} className="border-b border-gray-700/50 hover:bg-gray-700/30">
                      <td className="py-2 pr-2 text-gray-500 font-mono">{s.rank}</td>
                      <td className="py-2 pr-4 font-medium">
                        {s.squad_name}
                        {s.squad_tag && <span className="text-gray-500 text-xs ml-1">[{s.squad_tag}]</span>}
                      </td>
                      <td className="py-2 pr-3 text-center text-gray-400">{s.matches_played}</td>
                      <td className="py-2 pr-3 text-center text-green-400">{s.wins}</td>
                      <td className="py-2 pr-3 text-center text-red-400">{s.losses}</td>
                      <td className="py-2 pr-3 text-center text-yellow-400">{s.no_shows || 0}</td>
                      <td className="py-2 pr-3 text-center text-blue-400">{s.overtime_wins || 0}</td>
                      <td className="py-2 pr-3 text-center font-bold text-white">{s.points}</td>
                      <td className="py-2 pr-3 text-center text-gray-300">{s.win_percentage != null ? `${s.win_percentage}%` : '-'}</td>
                      <td className={`py-2 text-center ${s.kill_death_difference > 0 ? 'text-green-400' : s.kill_death_difference < 0 ? 'text-red-400' : 'text-gray-400'}`}>
                        {s.kill_death_difference > 0 ? '+' : ''}{s.kill_death_difference}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
