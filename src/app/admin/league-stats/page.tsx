'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Download, AlertCircle, CheckCircle, Loader2, ChevronDown } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/AuthContext';
import { parseCSV, processPlayerStats, validatePlayerStats, ProcessedPlayerStat } from '@/lib/csv-parser';
import CSVUploadZone from '@/components/admin/CSVUploadZone';
import SeasonManagementModal from '@/components/admin/SeasonManagementModal';
import { Chip, Panel, Spinner, Empty, StaffShell, HeaderStrip, th, td } from '@/components/ctf/AdminBits';
import { inputCls, labelCls, btnPrimary, btnQuiet } from '@/components/ctf/FormBits';

interface PlayerStat {
  id: number;
  player_name: string;
  team: string;
  game_mode: string;
  arena_name?: string;
  result: string;
  kills: number;
  deaths: number;
  captures: number;
  carrier_kills?: number;
  carry_time_seconds?: number;
  main_class?: string;
  accuracy?: string;
  left_early?: boolean;
  game_date: string;
  game_id: string;
  season: string;
}

interface Season { id: string; season_number: number; season_name: string | null; status: 'upcoming' | 'active' | 'completed' }
interface League { id: string; slug: string; name: string }

/**
 * League stats: import Tournament player-stat CSVs, export everything, and
 * two fix-up tools (arena rename by game id, team result correction).
 */
export default function LeagueStatsAdminPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const [access, setAccess] = useState<'checking' | 'ok' | 'denied'>('checking');

  const [stats, setStats] = useState<PlayerStat[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [csvPreview, setCsvPreview] = useState<ProcessedPlayerStat[]>([]);
  const [showPreview, setShowPreview] = useState(false);
  const [leagues, setLeagues] = useState<League[]>([]);
  const [selectedLeague, setSelectedLeague] = useState<string>('ctfpl');
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [selectedSeason, setSelectedSeason] = useState<string>('');
  const [selectedArena, setSelectedArena] = useState<string>('');
  const [showBulkEdit, setShowBulkEdit] = useState(false);
  const [bulkEditArena, setBulkEditArena] = useState<string>('');
  const [bulkEditGameId, setBulkEditGameId] = useState<string>('');
  const [bulkEditing, setBulkEditing] = useState(false);
  const [showResultCorrection, setShowResultCorrection] = useState(false);
  const [resultCorrectionGameId, setResultCorrectionGameId] = useState<string>('');
  const [resultCorrectionTeamBase, setResultCorrectionTeamBase] = useState<string>('');
  const [resultCorrectionResult, setResultCorrectionResult] = useState<'Win' | 'Loss'>('Win');

  // Staff only.
  useEffect(() => {
    if (authLoading) return;
    if (!user) { router.push('/auth/login?redirect=/admin/league-stats'); return; }
    (async () => {
      const { data } = await supabase.from('profiles').select('is_admin, ctf_role').eq('id', user.id).maybeSingle();
      const ok = !!data && (data.is_admin === true || data.ctf_role === 'ctf_admin');
      setAccess(ok ? 'ok' : 'denied');
      if (!ok) toast.error('CTF admin access required');
    })();
  }, [user, authLoading, router]);

  useEffect(() => {
    if (access !== 'ok') return;
    fetchStats();
    fetchLeagues();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [access]);

  useEffect(() => {
    if (access === 'ok') fetchActiveSeasons();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedLeague, leagues, access]);

  const fetchLeagues = async () => {
    try {
      const { data } = await supabase.from('leagues').select('id, slug, name').order('slug');
      if (data) setLeagues(data);
    } catch (error: any) {
      console.error('Error fetching leagues:', error.message);
    }
  };

  const fetchStats = async () => {
    try {
      const { data, error } = await supabase.from('player_stats').select('*').eq('game_mode', 'Tournament').order('game_date', { ascending: false }).limit(200);
      if (error) throw error;
      setStats(data || []);
    } catch (error: any) {
      setMessage({ type: 'error', text: `Error fetching stats: ${error.message}` });
    } finally {
      setLoading(false);
    }
  };

  const fetchActiveSeasons = async () => {
    try {
      if (selectedLeague === 'ctfpl') {
        const { data, error } = await supabase.from('ctfpl_seasons').select('id, season_number, season_name, status').eq('status', 'active').order('season_number', { ascending: false });
        if (error) throw error;
        setSeasons(data || []);
        setSelectedSeason(data && data.length > 0 ? data[0].id : '');
      } else {
        const league = leagues.find((l) => l.slug === selectedLeague);
        if (!league) return;
        const { data, error } = await supabase.from('league_seasons').select('id, season_number, season_name, status').eq('league_id', league.id).eq('status', 'active').order('season_number', { ascending: false });
        if (error) throw error;
        setSeasons(data || []);
        setSelectedSeason(data && data.length > 0 ? data[0].id : '');
      }
    } catch (error: any) {
      console.error('Error fetching active seasons:', error.message);
    }
  };

  const handleFileUpload = (file: File) => {
    setUploading(true);
    setMessage(null);
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const csvText = e.target?.result as string;
        const csvData = parseCSV(csvText);
        const selectedSeasonData = seasons.find((s) => s.id === selectedSeason);
        const customSeason = selectedSeasonData ? `Season ${selectedSeasonData.season_number}${selectedSeasonData.season_name ? ' - ' + selectedSeasonData.season_name : ''}` : undefined;
        const processedData = processPlayerStats(csvData, undefined, undefined, customSeason, selectedArena);
        const validationErrors = validatePlayerStats(processedData);
        if (validationErrors.length > 0) {
          setMessage({ type: 'error', text: `Validation errors:\n${validationErrors.join('\n')}` });
          setUploading(false);
          return;
        }
        setCsvPreview(processedData);
        setShowPreview(true);
        setMessage({ type: 'success', text: `Parsed ${processedData.length} records. Check the preview, then import.` });
      } catch (error: any) {
        setMessage({ type: 'error', text: `Error parsing CSV: ${error.message}` });
      } finally {
        setUploading(false);
      }
    };
    reader.readAsText(file);
  };

  const importData = async () => {
    if (csvPreview.length === 0) return;
    setUploading(true);
    try {
      const { error } = await supabase.from('player_stats').insert(csvPreview);
      if (error) throw error;
      setMessage({ type: 'success', text: `Imported ${csvPreview.length} records.` });
      setCsvPreview([]);
      setShowPreview(false);
      fetchStats();
    } catch (error: any) {
      setMessage({ type: 'error', text: `Error importing data: ${error.message}` });
    } finally {
      setUploading(false);
    }
  };

  const handleBulkUpdate = async () => {
    if (!bulkEditGameId || !bulkEditArena) return;
    setBulkEditing(true);
    try {
      const { error } = await supabase.from('player_stats').update({ arena_name: bulkEditArena }).eq('game_id', bulkEditGameId).eq('game_mode', 'Tournament');
      if (error) throw error;
      setMessage({ type: 'success', text: `Arena set to "${bulkEditArena}" for every record in game ${bulkEditGameId}.` });
      setBulkEditArena('');
      setBulkEditGameId('');
      setShowBulkEdit(false);
      fetchStats();
    } catch (error: any) {
      setMessage({ type: 'error', text: `Error updating data: ${error.message}` });
    } finally {
      setBulkEditing(false);
    }
  };

  const handleResultCorrection = async () => {
    if (!resultCorrectionGameId || !resultCorrectionTeamBase) return;
    setBulkEditing(true);
    try {
      const { error } = await supabase
        .from('player_stats')
        .update({ result: resultCorrectionResult })
        .eq('game_id', resultCorrectionGameId)
        .eq('game_mode', 'Tournament')
        .ilike('team', `%${resultCorrectionTeamBase}%`);
      if (error) throw error;
      setMessage({ type: 'success', text: `Result set to "${resultCorrectionResult}" for every "${resultCorrectionTeamBase}" player in game ${resultCorrectionGameId}.` });
      setResultCorrectionGameId('');
      setResultCorrectionTeamBase('');
      setShowResultCorrection(false);
      fetchStats();
    } catch (error: any) {
      setMessage({ type: 'error', text: `Error updating results: ${error.message}` });
    } finally {
      setBulkEditing(false);
    }
  };

  const exportData = async () => {
    try {
      const { data, error } = await supabase.from('player_stats').select('*').order('game_date', { ascending: false });
      if (error) throw error;
      const csv = convertToCSV(data);
      downloadCSV(csv, `league_stats_${new Date().toISOString().split('T')[0]}.csv`);
      setMessage({ type: 'success', text: 'Export downloaded.' });
    } catch (error: any) {
      setMessage({ type: 'error', text: `Error exporting data: ${error.message}` });
    }
  };

  const convertToCSV = (data: any[]) => {
    if (!data.length) return '';
    const headers = Object.keys(data[0]).join(',');
    const rows = data.map((row) => Object.values(row).join(','));
    return [headers, ...rows].join('\n');
  };

  const downloadCSV = (csv: string, filename: string) => {
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  const totalMatches = new Set(stats.map((s) => s.game_id)).size;
  const totalPlayers = new Set(stats.map((s) => s.player_name)).size;
  const totalKills = stats.reduce((sum, s) => sum + s.kills, 0);
  const readyToImport = !!selectedSeason && !!selectedArena;

  if (authLoading || access === 'checking') {
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

  return (
    <StaffShell user={user}>
      <HeaderStrip
        title="League stats"
        meta={
          <>
            <span className="text-[#E6EDF7]">Tournament records · last 200</span>
            <span>{totalMatches} games</span>
            <span>{totalPlayers} players</span>
            <span>{totalKills} kills</span>
          </>
        }
        actions={
          <>
            <Link href="/admin/ctf" className={btnQuiet}>CTF admin</Link>
            <button type="button" onClick={fetchStats} disabled={loading} className={btnQuiet}>{loading ? 'Refreshing…' : 'Refresh'}</button>
            <button type="button" onClick={exportData} className={`${btnQuiet} inline-flex items-center gap-1.5`}><Download className="h-3.5 w-3.5" /> Export all CSV</button>
          </>
        }
      />

      {message && (
        <div className={`flex items-start gap-2 rounded-xl px-4 py-3 text-sm ${message.type === 'success' ? 'bg-[#34D399]/10 text-[#34D399]' : 'bg-[#F87171]/10 text-[#F87171]'}`}>
          {message.type === 'success' ? <CheckCircle className="mt-0.5 h-4 w-4 shrink-0" /> : <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />}
          <pre className="whitespace-pre-wrap font-sans">{message.text}</pre>
        </div>
      )}

      {/* Import */}
      <Panel
        title="Import a stats CSV"
        hint={readyToImport ? 'Rows are tagged with the season and arena below.' : 'Pick a season and type the arena before uploading.'}
        actions={<div className="w-44"><SeasonManagementModal /></div>}
      >
        <div className="p-5 space-y-4">
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <label className={labelCls}>League</label>
              <div className="flex flex-wrap gap-1.5">
                {leagues.map((league) => (
                  <Chip key={league.slug} active={selectedLeague === league.slug} onClick={() => setSelectedLeague(league.slug)}>{league.name}</Chip>
                ))}
              </div>
            </div>
            <label className="block">
              <span className={labelCls}>Active season</span>
              <select value={selectedSeason} onChange={(e) => setSelectedSeason(e.target.value)} className={inputCls} style={{ colorScheme: 'dark' }}>
                <option value="">Select a season</option>
                {seasons.map((season) => <option key={season.id} value={season.id}>Season {season.season_number}{season.season_name ? ` · ${season.season_name}` : ''}</option>)}
              </select>
              {seasons.length === 0 && <span className="block mt-1 text-[11px] text-[#F59E0B]">No active season for this league. Use Manage seasons.</span>}
            </label>
            <label className="block">
              <span className={labelCls}>Arena</span>
              <input type="text" value={selectedArena} onChange={(e) => setSelectedArena(e.target.value)} placeholder="OvD, CTF, Siege…" className={inputCls} />
            </label>
          </div>

          <CSVUploadZone onFileUpload={handleFileUpload} isProcessing={uploading} error={message?.type === 'error' ? message.text : null} disabled={!readyToImport} />

          {showPreview && (
            <div className="rounded-md bg-[#1B2438] overflow-hidden">
              <div className="px-3 py-2 flex items-center justify-between border-b border-white/[0.06]">
                <span className="text-sm text-[#E6EDF7]">Preview · {csvPreview.length} records</span>
                <div className="flex gap-2">
                  <button type="button" onClick={() => { setShowPreview(false); setCsvPreview([]); }} className={btnQuiet}>Discard</button>
                  <button type="button" onClick={importData} disabled={uploading} className={`${btnPrimary} inline-flex items-center gap-2`}>
                    {uploading && <Loader2 className="h-4 w-4 animate-spin" />} Import {csvPreview.length} records
                  </button>
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead><tr><th className={th}>Player</th><th className={th}>Team</th><th className={th}>K/D</th><th className={th}>Result</th><th className={th}>Class</th><th className={th}>Mode</th></tr></thead>
                  <tbody>
                    {csvPreview.slice(0, 8).map((stat, index) => (
                      <tr key={index} className="border-t border-white/[0.06]">
                        <td className={`${td} text-[#E6EDF7]`}>{stat.player_name}</td>
                        <td className={`${td} text-[#8B98B0]`}>{stat.team}</td>
                        <td className={`${td} tabular-nums text-[#8B98B0]`}>{stat.kills}/{stat.deaths}</td>
                        <td className={td}><span className={`rounded px-1.5 py-0.5 text-[11px] ${stat.result === 'Win' ? 'bg-[#34D399]/15 text-[#34D399]' : 'bg-[#F87171]/15 text-[#F87171]'}`}>{stat.result}</span></td>
                        <td className={`${td} text-[#8B98B0]`}>{stat.main_class}</td>
                        <td className={`${td} text-[#8B98B0]`}>{stat.game_mode}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {csvPreview.length > 8 && <p className="px-3 py-2 text-xs text-[#8B98B0]">…and {csvPreview.length - 8} more</p>}
            </div>
          )}
        </div>
      </Panel>

      {/* Fix-ups */}
      <Panel title="Fix-ups" hint="Bulk corrections to already imported Tournament records, by game id.">
        <div className="divide-y divide-white/[0.06]">
          <div className="p-5">
            <button type="button" onClick={() => setShowBulkEdit((v) => !v)} className="flex items-center gap-1 text-sm text-[#E6EDF7]">
              <ChevronDown className={`h-4 w-4 text-[#8B98B0] transition-transform ${showBulkEdit ? 'rotate-180' : ''}`} />
              Set the arena for a game
            </button>
            <p className="ml-5 text-xs text-[#8B98B0]">Updates arena_name on every record with that game id. For imports that were missing it.</p>
            {showBulkEdit && (
              <div className="ml-5 mt-3 flex flex-wrap items-end gap-3">
                <label className="block"><span className={labelCls}>Game id</span><input type="text" value={bulkEditGameId} onChange={(e) => setBulkEditGameId(e.target.value)} className={`${inputCls} w-72`} /></label>
                <label className="block"><span className={labelCls}>Arena</span><input type="text" value={bulkEditArena} onChange={(e) => setBulkEditArena(e.target.value)} className={`${inputCls} w-40`} /></label>
                <button type="button" onClick={handleBulkUpdate} disabled={!bulkEditGameId || !bulkEditArena || bulkEditing} className={btnPrimary}>{bulkEditing ? 'Updating…' : 'Update arena'}</button>
              </div>
            )}
          </div>
          <div className="p-5">
            <button type="button" onClick={() => setShowResultCorrection((v) => !v)} className="flex items-center gap-1 text-sm text-[#E6EDF7]">
              <ChevronDown className={`h-4 w-4 text-[#8B98B0] transition-transform ${showResultCorrection ? 'rotate-180' : ''}`} />
              Fix a team&apos;s result
            </button>
            <p className="ml-5 text-xs text-[#8B98B0]">Sets Win or Loss for every player whose team name contains the base name, e.g. &ldquo;AP&rdquo; matches AP T and AP C.</p>
            {showResultCorrection && (
              <div className="ml-5 mt-3 flex flex-wrap items-end gap-3">
                <label className="block"><span className={labelCls}>Game id</span><input type="text" value={resultCorrectionGameId} onChange={(e) => setResultCorrectionGameId(e.target.value)} className={`${inputCls} w-72`} /></label>
                <label className="block"><span className={labelCls}>Team base name</span><input type="text" value={resultCorrectionTeamBase} onChange={(e) => setResultCorrectionTeamBase(e.target.value)} placeholder="AP, Apex, BDS" className={`${inputCls} w-40`} /></label>
                <div>
                  <span className={labelCls}>Result</span>
                  <div className="flex gap-1.5">
                    <Chip active={resultCorrectionResult === 'Win'} onClick={() => setResultCorrectionResult('Win')}>Win</Chip>
                    <Chip active={resultCorrectionResult === 'Loss'} onClick={() => setResultCorrectionResult('Loss')}>Loss</Chip>
                  </div>
                </div>
                <button type="button" onClick={handleResultCorrection} disabled={!resultCorrectionGameId || !resultCorrectionTeamBase || bulkEditing} className={btnPrimary}>{bulkEditing ? 'Updating…' : 'Fix result'}</button>
              </div>
            )}
          </div>
        </div>
      </Panel>

      {/* Recent records */}
      <Panel title="Recent Tournament records" hint={`Latest ${stats.length} rows.`}>
        {loading ? (
          <Spinner label="Loading…" />
        ) : stats.length === 0 ? (
          <Empty>No Tournament records yet.</Empty>
        ) : (
          <div className="overflow-x-auto max-h-[40rem] overflow-y-auto">
            <table className="w-full">
              <thead className="sticky top-0 bg-[#131A2B]">
                <tr>
                  <th className={th}>Player</th>
                  <th className={th}>Team</th>
                  <th className={th}>K / D / C</th>
                  <th className={th}>Class</th>
                  <th className={th}>Result</th>
                  <th className={th}>Arena</th>
                  <th className={`${th} text-right`}>Acc</th>
                  <th className={th}>Date</th>
                  <th className={th}>Season</th>
                </tr>
              </thead>
              <tbody>
                {stats.map((stat: any) => (
                  <tr key={stat.id} className="border-t border-white/[0.06] hover:bg-white/[0.02]">
                    <td className={`${td} text-[#E6EDF7] whitespace-nowrap`}>
                      {stat.player_name}
                      {stat.left_early && <span className="ml-1.5 text-[10px] uppercase tracking-wide text-[#F59E0B]">left early</span>}
                    </td>
                    <td className={`${td} text-[#8B98B0] whitespace-nowrap`}>{stat.team}</td>
                    <td className={`${td} tabular-nums text-[#8B98B0] whitespace-nowrap`}>
                      {stat.kills} / {stat.deaths} / {stat.captures}
                      {stat.carrier_kills > 0 && <span className="ml-1.5 text-[11px] text-[#22D3EE]">CK {stat.carrier_kills}</span>}
                      {stat.carry_time_seconds > 0 && <span className="ml-1.5 text-[11px] text-[#F59E0B]">CT {stat.carry_time_seconds}s</span>}
                    </td>
                    <td className={`${td} text-[#8B98B0]`}>{stat.main_class || '—'}</td>
                    <td className={td}><span className={`rounded px-1.5 py-0.5 text-[11px] ${stat.result === 'Win' ? 'bg-[#34D399]/15 text-[#34D399]' : 'bg-[#F87171]/15 text-[#F87171]'}`}>{stat.result}</span></td>
                    <td className={`${td} text-[#8B98B0]`}>{stat.arena_name && stat.arena_name !== 'Unknown' ? stat.arena_name : '—'}</td>
                    <td className={`${td} text-right tabular-nums text-[#8B98B0]`}>{stat.accuracy ? `${(parseFloat(stat.accuracy) * 100).toFixed(1)}%` : '—'}</td>
                    <td className={`${td} text-[#8B98B0] whitespace-nowrap`}>{new Date(stat.game_date).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: '2-digit' })}</td>
                    <td className={`${td} text-[#8B98B0] whitespace-nowrap`}>{stat.season}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </StaffShell>
  );
}
