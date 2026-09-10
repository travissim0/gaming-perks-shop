'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ChevronLeft, ExternalLink } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { useAuth } from '@/lib/AuthContext';
import { supabase } from '@/lib/supabase';
import Navbar from '@/components/Navbar';
import { getClassColor } from '@/utils/classColors';
import { displayFont, bodyFont } from '@/lib/fonts';
import MatchSetup from '@/components/ctf/MatchSetup';

/*
 * Match detail — where the schedule and the match log land. Crew sign-ups,
 * the result, the linked game's stats and the video all live here.
 */

type Role = 'player' | 'commentator' | 'recording' | 'referee';

interface Participant { id: string; player_id: string; in_game_alias: string; role: Role }

interface Match {
  id: string;
  title: string;
  description: string | null;
  scheduled_at: string;
  match_type: 'squad_vs_squad' | 'pickup' | 'tournament';
  status: string;
  map_name?: string | null;
  game_mode?: string | null;
  squad_a_id?: string | null;
  squad_b_id?: string | null;
  squad_a_name?: string | null;
  squad_a_tag?: string | null;
  squad_b_name?: string | null;
  squad_b_tag?: string | null;
  squad_a_score?: number | null;
  squad_b_score?: number | null;
  winner_squad_id?: string | null;
  winner_name?: string | null;
  game_id?: string | null;
  vod_url?: string | null;
  vod_title?: string | null;
  match_notes?: string | null;
  created_by: string;
  created_by_alias: string;
  participants: Participant[];
  league_slug?: string | null;
  season_number?: number | null;
  week?: number | null;
  stage?: string | null;
}

interface SquadInfo { id: string; name: string; tag: string | null; banner_url: string | null; members: { id: string; alias: string }[] }

interface GamePlayer { player_name: string; team: string; side?: string; main_class?: string; kills: number; deaths: number; flag_captures?: number; result?: string }
interface GameData {
  gameId: string;
  gameMode: string;
  mapName: string;
  gameDate: string;
  duration: number;
  winningInfo: { type: string; winner: string } | null;
  videoInfo?: { has_video?: boolean; youtube_url?: string; vod_url?: string } | null;
  players: GamePlayer[];
  teamStats: Record<string, GamePlayer[]>;
}

interface Candidate { gameId: string; gameDate: string; arena: string; gameMode: string; players: number }

const ROLES: { key: Role; label: string; plural: string }[] = [
  { key: 'player', label: 'Player', plural: 'Players' },
  { key: 'commentator', label: 'Commentator', plural: 'Commentators' },
  { key: 'recording', label: 'Recorder', plural: 'Recorders' },
  { key: 'referee', label: 'Referee', plural: 'Referees' },
];

const TYPE_LABEL: Record<Match['match_type'], string> = { squad_vs_squad: 'Squad match', pickup: 'Pickup', tournament: 'League match' };

const inputCls = 'w-full bg-[#0B0F1A] border border-white/10 rounded-md px-3 py-2 text-sm text-[#E6EDF7] focus:border-[#22D3EE] focus:outline-none';
const labelCls = 'block text-[11px] uppercase tracking-wide text-[#8B98B0] mb-1';
const btnPrimary = 'px-3.5 py-2 rounded-md text-sm font-medium bg-[#22D3EE] text-[#0B0F1A] hover:bg-[#67E8F9] disabled:opacity-50 transition-colors';
const btnQuiet = 'px-3 py-2 rounded-md text-sm bg-white/5 text-[#E6EDF7] hover:bg-white/10 transition-colors';

const youTubeId = (url?: string | null) => {
  const m = url?.match(/(?:youtube\.com\/(?:watch\?v=|embed\/)|youtu\.be\/)([^&\s?#]+)/);
  return m ? m[1] : null;
};

function Card({ title, action, children }: { title: React.ReactNode; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="rounded-xl overflow-hidden bg-[#131A2B]">
      <div className="px-4 py-2.5 flex items-center justify-between gap-3">
        <h2 className="font-display text-lg text-[#E6EDF7]">{title}</h2>
        {action}
      </div>
      <div className="px-4 pb-4">{children}</div>
    </section>
  );
}

function TeamMark({ tag, name, size = 'md' }: { tag?: string | null; name?: string | null; size?: 'md' | 'lg' }) {
  return (
    <span className={`${size === 'lg' ? 'w-14 h-14 text-base' : 'w-8 h-8 text-[11px]'} rounded-lg bg-[#1B2438] text-[#22D3EE] font-medium flex items-center justify-center shrink-0`}>
      {(tag || name || '?').slice(0, 4).toUpperCase()}
    </span>
  );
}

export default function MatchDetailPage() {
  const { user } = useAuth();
  const params = useParams();
  const matchId = params.id as string;

  const [match, setMatch] = useState<Match | null>(null);
  const [loading, setLoading] = useState(true);
  const [squads, setSquads] = useState<Record<string, SquadInfo>>({});
  const [game, setGame] = useState<GameData | null>(null);
  const [ctfRole, setCtfRole] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);

  // Manage panel
  const [panel, setPanel] = useState<'none' | 'link' | 'video' | 'result'>('none');
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [gameIdInput, setGameIdInput] = useState('');
  const [vodUrl, setVodUrl] = useState('');
  const [vodTitle, setVodTitle] = useState('');
  const [scoreA, setScoreA] = useState('');
  const [scoreB, setScoreB] = useState('');
  const [winner, setWinner] = useState('');

  useEffect(() => { setMounted(true); }, []);

  const load = useCallback(async () => {
    try {
      const r = await fetch(`/api/matches?id=${encodeURIComponent(matchId)}&limit=1`, { cache: 'no-store' });
      const j = r.ok ? await r.json() : { matches: [] };
      const m: Match | null = j.matches?.[0] || null;
      setMatch(m);
      if (!m) return;
      setVodUrl(m.vod_url || '');
      setVodTitle(m.vod_title || '');
      setScoreA(m.squad_a_score != null ? String(m.squad_a_score) : '');
      setScoreB(m.squad_b_score != null ? String(m.squad_b_score) : '');
      setWinner(m.winner_squad_id || '');

      const ids = [m.squad_a_id, m.squad_b_id].filter(Boolean) as string[];
      if (ids.length) {
        const [{ data: sq }, { data: mem }] = await Promise.all([
          supabase.from('squads').select('id, name, tag, banner_url').in('id', ids),
          supabase.from('squad_members').select('squad_id, player_id, profiles!squad_members_player_id_fkey(in_game_alias)').in('squad_id', ids).eq('status', 'active'),
        ]);
        const byId: Record<string, SquadInfo> = {};
        (sq || []).forEach((s: any) => { byId[s.id] = { id: s.id, name: s.name, tag: s.tag ?? null, banner_url: s.banner_url ?? null, members: [] }; });
        (mem || []).forEach((r: any) => { byId[r.squad_id]?.members.push({ id: r.player_id, alias: r.profiles?.in_game_alias || 'Unknown' }); });
        Object.values(byId).forEach((s) => s.members.sort((a, b) => a.alias.localeCompare(b.alias)));
        setSquads(byId);
      }

      if (m.game_id) {
        const gr = await fetch(`/api/player-stats/game/${encodeURIComponent(m.game_id)}`);
        const gj = gr.ok ? await gr.json() : null;
        setGame(gj?.success && gj.data ? gj.data : null);
      } else {
        setGame(null);
      }
    } catch (e) {
      console.error('match detail load failed', e);
    } finally {
      setLoading(false);
    }
  }, [matchId]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!user) { setCtfRole(null); setIsAdmin(false); return; }
    supabase.from('profiles').select('ctf_role, is_admin').eq('id', user.id).maybeSingle().then(({ data }) => {
      setCtfRole((data as any)?.ctf_role || null);
      setIsAdmin(!!(data as any)?.is_admin);
    });
  }, [user]);

  // ── Permissions ─────────────────────────────────────────────────────
  const isStaff = isAdmin || (ctfRole || '').toLowerCase() === 'ctf_admin';
  const canManage = !!user && !!match && (match.created_by === user.id || isStaff);
  const canJoinRole = (role: Role) => {
    const r = (ctfRole || '').toLowerCase();
    if (role === 'commentator') return r === 'commentator' || r === 'ctf_admin';
    if (role === 'referee') return r === 'head referee' || r === 'referee' || r === 'ctf_admin';
    return true;
  };

  // ── Actions ─────────────────────────────────────────────────────────
  const join = async (role: Role) => {
    if (!user || !match) return;
    if (!canJoinRole(role)) { toast.error(role === 'commentator' ? 'Commentator role required' : 'Referee role required'); return; }
    setBusy(role);
    try {
      const { error } = await supabase.from('match_participants').insert({ match_id: match.id, player_id: user.id, role });
      if (error) throw error;
      toast.success(`Signed up as ${role === 'recording' ? 'recorder' : role}`);
      await load();
    } catch (e: any) { toast.error(e.message || 'Could not join'); } finally { setBusy(null); }
  };
  const leave = async (p: Participant) => {
    setBusy(p.id);
    try {
      const { error, count } = await supabase.from('match_participants').delete({ count: 'exact' }).eq('id', p.id);
      if (error) throw error;
      if (!count) { toast.error('Could not leave that role'); return; }
      await load();
    } catch (e: any) { toast.error(e.message || 'Could not leave'); } finally { setBusy(null); }
  };
  const put = async (body: Record<string, unknown>) => {
    if (!user || !match) return;
    const r = await fetch('/api/matches', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ matchId: match.id, userId: user.id, ...body }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || 'Update failed');
  };
  const saveVideo = async () => {
    setBusy('video');
    try {
      await put({ vodUrl: vodUrl.trim() || null, vodTitle: vodTitle.trim() || null });
      toast.success(vodUrl.trim() ? 'Video saved' : 'Video removed');
      setPanel('none');
      await load();
    } catch (e: any) { toast.error(e.message); } finally { setBusy(null); }
  };
  const saveResult = async () => {
    setBusy('result');
    try {
      const a = scoreA === '' ? null : Number(scoreA);
      const b = scoreB === '' ? null : Number(scoreB);
      const w = winner || (a != null && b != null && a !== b ? (a > b ? match!.squad_a_id : match!.squad_b_id) : null);
      await put({ squadAScore: a, squadBScore: b, winnerSquadId: w || null, status: a != null || w ? 'completed' : match!.status });
      toast.success('Result saved');
      setPanel('none');
      await load();
    } catch (e: any) { toast.error(e.message); } finally { setBusy(null); }
  };
  const openLink = async () => {
    setPanel('link');
    if (!match) return;
    try {
      const r = await fetch('/api/player-stats/leaderboard?limit=200&sortBy=game_date&sortOrder=desc');
      const j = r.ok ? await r.json() : null;
      const map = new Map<string, Candidate>();
      (j?.players || j?.data || []).forEach((p: any) => {
        if (!p.game_id) return;
        const c = map.get(p.game_id) || { gameId: p.game_id, gameDate: p.game_date, arena: p.arena || p.arena_name || '', gameMode: p.game_mode || '', players: 0 };
        c.players += 1;
        map.set(p.game_id, c);
      });
      const t = new Date(match.scheduled_at).getTime();
      const near = Array.from(map.values())
        .filter((c) => Math.abs(new Date(c.gameDate).getTime() - t) < 12 * 3600 * 1000)
        .sort((x, y) => Math.abs(new Date(x.gameDate).getTime() - t) - Math.abs(new Date(y.gameDate).getTime() - t))
        .slice(0, 12);
      setCandidates(near);
    } catch { setCandidates([]); }
  };
  const linkGame = async (gameId: string) => {
    if (!user || !match || !gameId.trim()) return;
    setBusy('link');
    try {
      const r = await fetch('/api/matches/link-game', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gameId: gameId.trim(), matchId: match.id, userId: user.id }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || 'Could not link game');
      toast.success('Game linked');
      setPanel('none');
      await load();
    } catch (e: any) { toast.error(e.message); } finally { setBusy(null); }
  };
  const unlinkGame = async () => {
    if (!confirm('Unlink the game from this match?')) return;
    setBusy('unlink');
    try {
      await put({ gameId: null, status: 'scheduled' });
      toast.success('Game unlinked');
      await load();
    } catch (e: any) { toast.error(e.message); } finally { setBusy(null); }
  };
  const remove = async () => {
    if (!user || !match || !confirm('Delete this match?')) return;
    setBusy('delete');
    try {
      const r = await fetch(`/api/matches?id=${match.id}&userId=${user.id}`, { method: 'DELETE' });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || 'Could not delete');
      toast.success('Match deleted');
      window.location.href = '/matches';
    } catch (e: any) { toast.error(e.message); setBusy(null); }
  };

  // ── Derived ─────────────────────────────────────────────────────────
  const a = match?.squad_a_id ? squads[match.squad_a_id] : null;
  const b = match?.squad_b_id ? squads[match.squad_b_id] : null;
  const hasTeams = !!(match && (match.squad_a_id || match.squad_b_id));
  const hasScore = match?.squad_a_score != null && match?.squad_b_score != null;
  const played = !!match && (match.status === 'completed' || !!match.game_id || hasScore);
  const notPlayed = match?.status === 'expired' || match?.status === 'cancelled';
  const live = match?.status === 'in_progress';
  const aWon = !!match && (match.winner_squad_id ? match.winner_squad_id === match.squad_a_id : hasScore && match.squad_a_score! > match.squad_b_score!);
  const bWon = !!match && (match.winner_squad_id ? match.winner_squad_id === match.squad_b_id : hasScore && match.squad_b_score! > match.squad_a_score!);
  const when = useMemo(() => {
    if (!match || !mounted) return { day: '', time: '', tz: '' };
    const d = new Date(match.scheduled_at);
    let tz = '';
    try { tz = new Intl.DateTimeFormat(undefined, { timeZoneName: 'short' }).formatToParts(d).find((p) => p.type === 'timeZoneName')?.value || ''; } catch { /* ignore */ }
    return {
      day: d.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }),
      time: d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }),
      tz,
    };
  }, [match, mounted]);
  const yt = youTubeId(match?.vod_url) || youTubeId(game?.videoInfo?.youtube_url);
  const videoHref = match?.vod_url || game?.videoInfo?.vod_url || game?.videoInfo?.youtube_url || null;
  const statusPill = notPlayed
    ? { label: match!.status === 'cancelled' ? 'Cancelled' : 'Not played', cls: 'bg-white/5 text-[#8B98B0]' }
    : live
      ? { label: 'Live', cls: 'bg-[#34D399]/15 text-[#34D399]' }
      : played
        ? { label: 'Played', cls: 'bg-white/5 text-[#E6EDF7]' }
        : { label: 'Scheduled', cls: 'bg-[#22D3EE]/15 text-[#22D3EE]' };

  const shell = (children: React.ReactNode) => (
    <div className={`ctf-theme ${displayFont.variable} ${bodyFont.variable} min-h-screen`}>
      <Navbar user={user} />
      <main className="container mx-auto px-4 py-6 max-w-5xl space-y-4">{children}</main>
    </div>
  );

  if (loading) {
    return shell(
      <section className="rounded-xl bg-[#131A2B] px-6 py-8 animate-pulse space-y-3">
        <div className="h-3 w-40 rounded bg-white/5" />
        <div className="h-12 w-2/3 rounded bg-white/5" />
        <div className="h-3 w-56 rounded bg-white/5" />
      </section>,
    );
  }
  if (!match) {
    return shell(
      <section className="rounded-xl bg-[#131A2B] px-6 py-8">
        <h1 className="font-display text-4xl text-[#E6EDF7]">Match not found</h1>
        <p className="text-sm text-[#8B98B0] mt-2">It may have been deleted.</p>
        <Link href="/matches" className="inline-block mt-4 text-sm text-[#22D3EE] hover:text-[#67E8F9]">Back to the match log</Link>
      </section>,
    );
  }

  return shell(
    <>
      <Link href={match.league_slug ? `/league/schedule?league=${match.league_slug}` : '/matches'} className="inline-flex items-center gap-1 text-xs text-[#8B98B0] hover:text-[#22D3EE]">
        <ChevronLeft className="w-3.5 h-3.5" /> {match.league_slug ? 'League schedule' : 'Match log'}
      </Link>

      {/* Header strip */}
      <section className="relative overflow-hidden rounded-xl bg-[#131A2B]">
        <div className="absolute inset-0 pointer-events-none" style={{ backgroundImage: 'radial-gradient(circle at 10% 20%, rgba(34,211,238,0.12), transparent 40%)' }} />
        <div className="relative px-5 sm:px-6 py-5 flex flex-col lg:flex-row lg:items-end gap-4">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap text-[11px] mb-1">
              <span className={`px-1.5 py-0.5 rounded uppercase tracking-wide font-medium ${match.league_slug ? 'bg-[#F59E0B]/15 text-[#F59E0B]' : 'bg-[#22D3EE]/15 text-[#22D3EE]'}`}>
                {match.league_slug ? `${match.league_slug.toUpperCase()}${match.season_number ? ` S${match.season_number}` : ''}${match.stage === 'playoff' ? ' · Playoffs' : match.week ? ` · Week ${match.week}` : ''}` : TYPE_LABEL[match.match_type]}
              </span>
              <span className={`px-1.5 py-0.5 rounded uppercase tracking-wide font-medium inline-flex items-center gap-1 ${statusPill.cls}`}>
                {live && <span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse" />}
                {statusPill.label}
              </span>
            </div>
            <h1 className="font-display text-4xl sm:text-5xl leading-none text-[#E6EDF7]">
              {hasTeams ? `${a?.name || match.squad_a_name || 'TBD'} vs ${b?.name || match.squad_b_name || 'TBD'}` : match.title}
            </h1>
            <div className="mt-2 flex items-center gap-x-3 gap-y-1 flex-wrap text-sm text-[#8B98B0]">
              <span className="text-[#E6EDF7]">{when.day}</span>
              <span className="text-white/20">·</span>
              <span className="text-[#E6EDF7]">{when.time}</span>{when.tz && <span>{when.tz}</span>}
              {(match.map_name || match.game_mode) && (<><span className="text-white/20">·</span><span>{[match.game_mode, match.map_name].filter(Boolean).join(' · ')}</span></>)}
              <span className="text-white/20">·</span>
              <span>Created by {match.created_by_alias}</span>
            </div>
            {hasTeams && match.title && !match.title.includes(' vs ') && <p className="mt-1 text-sm text-[#8B98B0]">{match.title}</p>}
            {match.description && <p className="mt-1.5 text-sm text-[#8B98B0] max-w-2xl whitespace-pre-line">{match.description}</p>}
          </div>
          {canManage && (
            <div className="flex flex-wrap gap-2 lg:justify-end">
              <button type="button" onClick={() => setPanel(panel === 'result' ? 'none' : 'result')} className={btnQuiet} disabled={!hasTeams}>Set result</button>
              <button type="button" onClick={() => (panel === 'link' ? setPanel('none') : openLink())} className={btnQuiet}>{match.game_id ? 'Change game' : 'Link game'}</button>
              <button type="button" onClick={() => setPanel(panel === 'video' ? 'none' : 'video')} className={btnQuiet}>{match.vod_url ? 'Edit video' : 'Add video'}</button>
              {!match.league_slug && <button type="button" onClick={remove} disabled={busy === 'delete'} className="px-3 py-2 rounded-md text-sm text-[#F87171] hover:bg-[#F87171]/10 disabled:opacity-50">Delete</button>}
            </div>
          )}
        </div>
      </section>

      {/* Manage panels */}
      {canManage && panel === 'result' && hasTeams && (
        <section className="rounded-xl bg-[#131A2B] ring-1 ring-[#F59E0B]/30 px-4 py-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 items-end">
            <div><label className={labelCls}>{a?.tag || match.squad_a_name || 'A'} score</label><input type="number" min={0} value={scoreA} onChange={(e) => setScoreA(e.target.value)} className={inputCls} /></div>
            <div><label className={labelCls}>{b?.tag || match.squad_b_name || 'B'} score</label><input type="number" min={0} value={scoreB} onChange={(e) => setScoreB(e.target.value)} className={inputCls} /></div>
            <div>
              <label className={labelCls}>Winner</label>
              <select value={winner} onChange={(e) => setWinner(e.target.value)} className={inputCls} style={{ colorScheme: 'dark' }}>
                <option value="">From the score</option>
                {match.squad_a_id && <option value={match.squad_a_id}>{a?.name || match.squad_a_name}</option>}
                {match.squad_b_id && <option value={match.squad_b_id}>{b?.name || match.squad_b_name}</option>}
              </select>
            </div>
            <div className="flex justify-end gap-2"><button type="button" onClick={() => setPanel('none')} className={btnQuiet}>Cancel</button><button type="button" onClick={saveResult} disabled={busy === 'result'} className={btnPrimary}>Save</button></div>
          </div>
          {match.league_slug && <p className="text-[11px] text-[#8B98B0] mt-2">This records the score on the match. Standings come from the admin match manager, where the official result is entered.</p>}
        </section>
      )}
      {canManage && panel === 'link' && (
        <section className="rounded-xl bg-[#131A2B] ring-1 ring-[#F59E0B]/30 px-4 py-4 space-y-3">
          <div className="text-sm text-[#E6EDF7]">Link the recorded game so its stats show here.</div>
          {candidates.length > 0 ? (
            <ul className="divide-y divide-white/[0.06] rounded-md bg-[#0B0F1A]/60">
              {candidates.map((c) => (
                <li key={c.gameId} className="flex items-center gap-3 px-3 py-2 text-sm">
                  <span className="text-[#8B98B0] w-40 shrink-0 tabular-nums">{new Date(c.gameDate).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</span>
                  <span className="min-w-0 flex-1 truncate text-[#E6EDF7]">{[c.gameMode, c.arena].filter(Boolean).join(' · ')} <span className="text-[#8B98B0]">· {c.players} players</span></span>
                  <button type="button" onClick={() => linkGame(c.gameId)} disabled={busy === 'link'} className="text-xs text-[#22D3EE] hover:text-[#67E8F9] disabled:opacity-50">Link</button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-[#8B98B0]">No recorded games within 12 hours of the match time. Paste a game id instead.</p>
          )}
          <div className="flex gap-2 items-end">
            <div className="flex-1"><label className={labelCls}>Game id</label><input value={gameIdInput} onChange={(e) => setGameIdInput(e.target.value)} className={inputCls} placeholder="From the stats page URL" /></div>
            <button type="button" onClick={() => setPanel('none')} className={btnQuiet}>Cancel</button>
            <button type="button" onClick={() => linkGame(gameIdInput)} disabled={busy === 'link' || !gameIdInput.trim()} className={btnPrimary}>Link</button>
          </div>
          {match.game_id && <button type="button" onClick={unlinkGame} disabled={busy === 'unlink'} className="text-xs text-[#F87171] hover:text-[#FCA5A5]">Unlink current game ({match.game_id})</button>}
        </section>
      )}
      {canManage && panel === 'video' && (
        <section className="rounded-xl bg-[#131A2B] ring-1 ring-[#F59E0B]/30 px-4 py-4">
          <div className="grid grid-cols-1 md:grid-cols-[2fr_1fr_auto] gap-3 items-end">
            <div><label className={labelCls}>Video URL (YouTube or VOD)</label><input value={vodUrl} onChange={(e) => setVodUrl(e.target.value)} className={inputCls} placeholder="https://youtube.com/watch?v=…" /></div>
            <div><label className={labelCls}>Title</label><input value={vodTitle} onChange={(e) => setVodTitle(e.target.value)} className={inputCls} /></div>
            <div className="flex gap-2"><button type="button" onClick={() => setPanel('none')} className={btnQuiet}>Cancel</button><button type="button" onClick={saveVideo} disabled={busy === 'video'} className={btnPrimary}>Save</button></div>
          </div>
        </section>
      )}

      {/* Face-off */}
      {hasTeams && (
        <section className="rounded-xl bg-[#131A2B] px-5 py-5">
          <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-4">
            {[{ s: a, id: match.squad_a_id, name: match.squad_a_name, tag: match.squad_a_tag, won: aWon, score: match.squad_a_score, align: 'right' }, { s: b, id: match.squad_b_id, name: match.squad_b_name, tag: match.squad_b_tag, won: bWon, score: match.squad_b_score, align: 'left' }].map((t, i) => (
              <div key={i} className={`min-w-0 flex items-center gap-3 ${t.align === 'right' ? 'flex-row-reverse text-right' : ''} ${i === 1 ? 'order-3' : ''}`}>
                <TeamMark tag={t.s?.tag || t.tag} name={t.s?.name || t.name} size="lg" />
                <div className="min-w-0">
                  {t.id ? (
                    <Link href={`/squads/${t.id}`} className={`block font-display text-2xl leading-tight truncate hover:text-[#22D3EE] ${played && !t.won ? 'text-[#8B98B0]' : 'text-[#E6EDF7]'}`}>{t.s?.name || t.name}</Link>
                  ) : (
                    <span className="block font-display text-2xl text-[#8B98B0]">TBD</span>
                  )}
                  {t.s && <span className="block text-xs text-[#8B98B0]">{t.s.members.length} on roster{played && t.won ? ' · Winner' : ''}</span>}
                </div>
              </div>
            ))}
            <div className="order-2 text-center px-2">
              {hasScore ? (
                <div className="font-display text-5xl tabular-nums leading-none">
                  <span className={aWon ? 'text-[#34D399]' : 'text-[#8B98B0]'}>{match.squad_a_score}</span>
                  <span className="text-white/20 mx-2">:</span>
                  <span className={bWon ? 'text-[#34D399]' : 'text-[#8B98B0]'}>{match.squad_b_score}</span>
                </div>
              ) : match.winner_name ? (
                <div className="text-sm text-[#34D399]">{match.winner_name} won</div>
              ) : (
                <div className="font-display text-3xl text-white/20">VS</div>
              )}
            </div>
          </div>
          {(a?.members.length || b?.members.length) ? (
            <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
              {[a, b].map((s, i) => s && (
                <div key={s.id} className={i === 0 ? 'sm:text-right' : ''}>
                  <div className="text-[10px] uppercase tracking-wide text-[#8B98B0] mb-1">Roster</div>
                  <div className={`flex flex-wrap gap-1 ${i === 0 ? 'sm:justify-end' : ''}`}>
                    {s.members.map((m) => <Link key={m.id} href={`/stats/player/${encodeURIComponent(m.alias)}`} className="px-1.5 py-0.5 rounded bg-[#1B2438] text-[#E6EDF7] hover:text-[#22D3EE]">{m.alias}</Link>)}
                  </div>
                </div>
              ))}
            </div>
          ) : null}
        </section>
      )}

      {/* Side + lineups (both teams set, not yet played) */}
      {match.squad_a_id && match.squad_b_id && !played && !notPlayed && (
        <MatchSetup matchId={match.id} user={user} />
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Crew */}
        <div className="lg:col-span-1">
          <Card title="Crew" action={<span className="text-xs text-[#8B98B0] tabular-nums">{match.participants.length}</span>}>
            <div className="space-y-2">
              {ROLES.map((r) => {
                const people = match.participants.filter((p) => p.role === r.key);
                const me = people.find((p) => p.player_id === user?.id);
                const allowed = !!user && canJoinRole(r.key);
                const open = match.status === 'scheduled' || live;
                return (
                  <div key={r.key} className="rounded-md bg-[#1B2438] px-3 py-2">
                    <div className="flex items-center justify-between text-[10px] uppercase tracking-wide text-[#8B98B0]">
                      <span>{r.plural}</span>
                      <span className="tabular-nums">{people.length}</span>
                    </div>
                    <div className="text-sm text-[#E6EDF7] mt-0.5 flex flex-wrap gap-x-2">
                      {people.length === 0 ? <span className="text-[#8B98B0]/60">Nobody yet</span> : people.map((p) => (
                        <Link key={p.id} href={`/stats/player/${encodeURIComponent(p.in_game_alias)}`} className="hover:text-[#22D3EE]">{p.in_game_alias}</Link>
                      ))}
                    </div>
                    {user && open && (
                      me ? (
                        <button type="button" onClick={() => leave(me)} disabled={busy === me.id} className="mt-1 text-[11px] text-[#F87171] hover:text-[#FCA5A5] disabled:opacity-50">Leave</button>
                      ) : (
                        <button type="button" onClick={() => join(r.key)} disabled={!allowed || busy === r.key} title={allowed ? '' : `${r.label} role required`} className="mt-1 text-[11px] text-[#22D3EE] hover:text-[#67E8F9] disabled:opacity-40 disabled:cursor-not-allowed">+ Join as {r.label.toLowerCase()}</button>
                      )
                    )}
                  </div>
                );
              })}
              {!user && <p className="text-[11px] text-[#8B98B0]"><Link href="/auth/login" className="text-[#22D3EE]">Sign in</Link> to sign up for a role.</p>}
            </div>
          </Card>
        </div>

        {/* Result / recording */}
        <div className="lg:col-span-2 space-y-4">
          {(yt || videoHref) && (
            <Card title={match.vod_title || 'Video'} action={videoHref ? <a href={videoHref} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-[#8B98B0] hover:text-[#22D3EE]">Open <ExternalLink className="w-3 h-3" /></a> : undefined}>
              {yt ? (
                <div className="aspect-video rounded-lg overflow-hidden bg-black">
                  <iframe src={`https://www.youtube.com/embed/${yt}`} title={match.vod_title || match.title} className="w-full h-full" allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen />
                </div>
              ) : (
                <a href={videoHref!} target="_blank" rel="noopener noreferrer" className="text-sm text-[#22D3EE] hover:text-[#67E8F9]">Watch the recording</a>
              )}
            </Card>
          )}

          <Card
            title="Game stats"
            action={match.game_id ? <Link href={`/stats/game/${encodeURIComponent(match.game_id)}`} className="text-xs text-[#8B98B0] hover:text-[#22D3EE]">Full stats</Link> : undefined}
          >
            {!match.game_id ? (
              <p className="text-sm text-[#8B98B0]">
                {notPlayed ? 'This match was not played.' : played ? 'No recorded game is linked to this match yet.' : 'Stats appear here once the game is played and linked.'}
                {canManage && !notPlayed && <> <button type="button" onClick={openLink} className="text-[#22D3EE] hover:text-[#67E8F9]">Link a game</button></>}
              </p>
            ) : !game ? (
              <p className="text-sm text-[#8B98B0]">Game {match.game_id} is linked, but its stats couldn’t be loaded.</p>
            ) : (
              <div className="space-y-3">
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-[#8B98B0]">
                  <span>{[game.gameMode, game.mapName].filter(Boolean).join(' · ')}</span>
                  {game.duration > 0 && <span>{Math.round(game.duration / 60)} min</span>}
                  <span>{game.players.length} players</span>
                  {game.winningInfo && <span className="text-[#34D399]">{game.winningInfo.winner} won</span>}
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {Object.entries(game.teamStats).map(([team, players]) => {
                    const caps = players.reduce((n, p) => n + (p.flag_captures || 0), 0);
                    const won = game.winningInfo?.winner === team || players.some((p) => p.result === 'Win');
                    return (
                      <div key={team} className="rounded-md bg-[#1B2438] overflow-hidden">
                        <div className="px-3 py-1.5 flex items-center justify-between text-[11px] uppercase tracking-wide">
                          <span className={won ? 'text-[#34D399]' : 'text-[#8B98B0]'}>{team}{won ? ' · won' : ''}</span>
                          <span className="text-[#8B98B0] tabular-nums">{caps} caps</span>
                        </div>
                        <table className="w-full text-xs">
                          <tbody>
                            {[...players].sort((x, y) => y.kills - x.kills).map((p, i) => (
                              <tr key={i} className="border-t border-white/[0.06]">
                                <td className="px-3 py-1.5">
                                  <Link href={`/stats/player/${encodeURIComponent(p.player_name)}`} className="text-[#E6EDF7] hover:text-[#22D3EE]">{p.player_name}</Link>
                                  {p.main_class && <span className="ml-2 text-[10px]" style={{ color: getClassColor(p.main_class) }}>{p.main_class}</span>}
                                </td>
                                <td className="px-2 py-1.5 text-right tabular-nums text-[#34D399]">{p.kills}</td>
                                <td className="px-2 py-1.5 text-right tabular-nums text-[#F87171]">{p.deaths}</td>
                                <td className="px-3 py-1.5 text-right tabular-nums text-[#8B98B0]">{p.flag_captures || 0}c</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </Card>

          {match.match_notes && (
            <Card title="Notes"><p className="text-sm text-[#E6EDF7] whitespace-pre-line">{match.match_notes}</p></Card>
          )}
        </div>
      </div>
    </>,
  );
}
