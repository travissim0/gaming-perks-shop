'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { ChevronLeft, ChevronRight, ChevronDown } from 'lucide-react';
import { useAuth } from '@/lib/AuthContext';
import { supabase } from '@/lib/supabase';
import Navbar from '@/components/Navbar';
import { toast } from 'react-hot-toast';
import { localDateTimeToIso } from '@/lib/schedule';
import { displayFont, bodyFont } from '@/lib/fonts';

/*
 * Match log — every match on the site: pickups, scrims, squad matches and the
 * league fixtures created from /league/schedule. Readable by anyone; signing
 * in unlocks creating matches and joining as player / commentator / recorder /
 * referee. Results, videos and game linking live on the match detail page.
 */

type Role = 'player' | 'commentator' | 'recording' | 'referee';
type MatchType = 'squad_vs_squad' | 'pickup' | 'tournament';
type Status = 'scheduled' | 'in_progress' | 'completed' | 'cancelled' | 'expired' | 'auto_logged';

interface Participant {
  id: string;
  player_id: string;
  in_game_alias: string;
  role: Role;
}

interface Match {
  id: string;
  title: string;
  description: string | null;
  scheduled_at: string;
  match_type: MatchType;
  status: Status;
  game_mode?: string | null;
  map_name?: string | null;
  squad_a_id?: string | null;
  squad_b_id?: string | null;
  squad_a_name?: string | null;
  squad_a_tag?: string | null;
  squad_b_name?: string | null;
  squad_b_tag?: string | null;
  squad_a_score?: number | null;
  squad_b_score?: number | null;
  winner_name?: string | null;
  game_id?: string | null;
  vod_url?: string | null;
  created_by: string;
  created_by_alias: string;
  participants: Participant[];
  gameStats?: any[];
  league_slug?: string | null;
  week?: number | null;
}

interface SquadRef { id: string; name: string; tag: string | null }
interface UserSquad extends SquadRef { role: string }

const ROLES: { key: Role; label: string; plural: string }[] = [
  { key: 'player', label: 'Player', plural: 'Players' },
  { key: 'commentator', label: 'Commentator', plural: 'Commentators' },
  { key: 'recording', label: 'Recorder', plural: 'Recorders' },
  { key: 'referee', label: 'Referee', plural: 'Referees' },
];

const TYPE_LABEL: Record<MatchType, string> = { squad_vs_squad: 'Squad match', pickup: 'Pickup', tournament: 'League' };

const dayLabel = (iso: string) => new Date(iso).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
const timeLabel = (iso: string) => new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
const relTime = (iso: string) => {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (days <= 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
};
const tzName = () => {
  try {
    return new Intl.DateTimeFormat(undefined, { timeZoneName: 'short' }).formatToParts(new Date()).find((p) => p.type === 'timeZoneName')?.value || '';
  } catch { return ''; }
};

const inputCls = 'w-full bg-[#0B0F1A] border border-white/10 rounded-md px-3 py-2 text-sm text-[#E6EDF7] focus:border-[#22D3EE] focus:outline-none';
const labelCls = 'block text-[11px] uppercase tracking-wide text-[#8B98B0] mb-1';
const btnPrimary = 'px-3.5 py-2 rounded-md text-sm font-medium bg-[#22D3EE] text-[#0B0F1A] hover:bg-[#67E8F9] disabled:opacity-50 transition-colors';
const btnQuiet = 'px-3 py-2 rounded-md text-sm bg-white/5 text-[#E6EDF7] hover:bg-white/10 transition-colors';

function TypePill({ type, league }: { type: MatchType; league?: string | null }) {
  const cls = type === 'tournament' ? 'bg-[#F59E0B]/15 text-[#F59E0B]' : type === 'squad_vs_squad' ? 'bg-[#22D3EE]/15 text-[#22D3EE]' : 'bg-white/5 text-[#8B98B0]';
  return <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded uppercase tracking-wide ${cls}`}>{league ? league.toUpperCase() : TYPE_LABEL[type]}</span>;
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} className={`px-3 py-1.5 rounded-md text-sm transition-colors ${active ? 'bg-[#22D3EE]/15 text-[#22D3EE]' : 'text-[#8B98B0] hover:text-[#E6EDF7] hover:bg-white/5'}`}>
      {children}
    </button>
  );
}

export default function MatchesPage() {
  const { user, loading: authLoading } = useAuth();
  const [planned, setPlanned] = useState<Match[]>([]);
  const [expired, setExpired] = useState<Match[]>([]);
  const [completed, setCompleted] = useState<Match[]>([]);
  const [autoLogged, setAutoLogged] = useState<Match[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<'list' | 'calendar'>('list');
  const [month, setMonth] = useState(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1); });
  const [showPast, setShowPast] = useState(false);
  const [openStats, setOpenStats] = useState<Set<string>>(new Set());
  // Timezone label only after mount (server and browser zones differ → hydration mismatch otherwise).
  const [tz, setTz] = useState('');
  useEffect(() => { setTz(tzName()); }, []);

  const [userSquad, setUserSquad] = useState<UserSquad | null>(null);
  const [squads, setSquads] = useState<SquadRef[]>([]);
  const [ctfRole, setCtfRole] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  // Create form
  const [showCreate, setShowCreate] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [type, setType] = useState<MatchType>('pickup');
  const [opponent, setOpponent] = useState('');
  const [squadA, setSquadA] = useState('');
  const [squadB, setSquadB] = useState('');
  const [date, setDate] = useState('');
  const [time, setTime] = useState('21:00');

  const isStaff = (ctfRole || '').toLowerCase() === 'ctf_admin';
  const canJoinRole = (role: Role) => {
    const r = (ctfRole || '').toLowerCase();
    if (role === 'commentator') return r === 'commentator' || r === 'ctf_admin';
    if (role === 'referee') return r === 'head referee' || r === 'referee' || r === 'ctf_admin';
    return true;
  };

  const fetchList = async (status: string, limit: number, stats = false) => {
    const r = await fetch(`/api/matches?status=${status}&limit=${limit}${stats ? '&includeStats=true' : ''}`, { cache: 'no-store' });
    if (!r.ok) return [] as Match[];
    return ((await r.json()).matches || []) as Match[];
  };

  const load = useCallback(async () => {
    setLoading(true);
    const [p, e, c, a] = await Promise.all([
      fetchList('scheduled', 60).catch(() => []),
      fetchList('expired', 20).catch(() => []),
      fetchList('completed', 30, true).catch(() => []),
      fetchList('auto_logged', 20, true).catch(() => []),
    ]);
    setPlanned(p);
    setExpired(e);
    setCompleted(c);
    setAutoLogged(a);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!user) { setUserSquad(null); setCtfRole(null); return; }
    (async () => {
      const [{ data: sm }, { data: p }, { data: sq }] = await Promise.all([
        supabase.from('squad_members').select('role, squads!inner(id, name, tag, is_active, is_legacy)').eq('player_id', user.id).eq('status', 'active'),
        supabase.from('profiles').select('ctf_role').eq('id', user.id).maybeSingle(),
        supabase.from('squads').select('id, name, tag').eq('is_active', true).order('name'),
      ]);
      const mine = (sm || []).map((r: any) => r.squads).find((s: any) => s && s.is_active && !s.is_legacy);
      const row = (sm || []).find((r: any) => r.squads?.id === mine?.id);
      setUserSquad(mine ? { id: mine.id, name: mine.name, tag: mine.tag ?? null, role: row?.role || 'member' } : null);
      setCtfRole((p as any)?.ctf_role || null);
      setSquads(((sq || []) as any[]).map((s) => ({ id: s.id, name: s.name, tag: s.tag ?? null })));
    })();
  }, [user]);

  // ── Actions ─────────────────────────────────────────────────────────
  const join = async (matchId: string, role: Role) => {
    if (!user) { toast.error('Sign in to join a match'); return; }
    if (!canJoinRole(role)) { toast.error(role === 'commentator' ? 'Commentator role required' : 'Referee role required'); return; }
    setBusy(`${matchId}:${role}`);
    try {
      const { error } = await supabase.from('match_participants').insert({ match_id: matchId, player_id: user.id, role });
      if (error) throw error;
      await load();
    } catch (e: any) {
      toast.error(e.message || 'Could not join');
    } finally {
      setBusy(null);
    }
  };
  const leave = async (participantId: string) => {
    setBusy(participantId);
    try {
      const { error } = await supabase.from('match_participants').delete().eq('id', participantId);
      if (error) throw error;
      await load();
    } catch (e: any) {
      toast.error(e.message || 'Could not leave');
    } finally {
      setBusy(null);
    }
  };
  const remove = async (matchId: string) => {
    if (!user || !confirm('Delete this match?')) return;
    setBusy(matchId);
    try {
      const r = await fetch(`/api/matches?id=${matchId}&userId=${user.id}`, { method: 'DELETE' });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || 'Could not delete');
      toast.success('Match deleted');
      await load();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setBusy(null);
    }
  };
  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    if (type === 'tournament' && (!squadA || !squadB || squadA === squadB)) { toast.error('Pick two different squads'); return; }
    if (type === 'squad_vs_squad' && !opponent) { toast.error('Pick an opponent'); return; }
    setBusy('create');
    try {
      const r = await fetch('/api/matches', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          description,
          matchType: type,
          scheduledAt: localDateTimeToIso(date, time),
          squadAId: type === 'tournament' ? squadA : type === 'squad_vs_squad' ? userSquad?.id : null,
          squadBId: type === 'tournament' ? squadB : type === 'squad_vs_squad' ? opponent : null,
          createdBy: user.id,
        }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || 'Could not create match');
      toast.success('Match created');
      setShowCreate(false);
      setTitle(''); setDescription(''); setType('pickup'); setOpponent(''); setSquadA(''); setSquadB('');
      await load();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setBusy(null);
    }
  };
  const openCreate = () => {
    if (!user) { toast.error('Sign in to create a match'); return; }
    if (!date) setDate(new Date().toISOString().slice(0, 10));
    setShowCreate(true);
  };

  // ── Derived ─────────────────────────────────────────────────────────
  const canSquadMatch = !!userSquad && ['captain', 'co_captain'].includes(userSquad.role);
  const past = useMemo(
    () => [...completed, ...expired].sort((a, b) => new Date(b.scheduled_at).getTime() - new Date(a.scheduled_at).getTime()),
    [completed, expired],
  );
  const upcoming = useMemo(() => [...planned].sort((a, b) => new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime()), [planned]);
  const mine = (m: Match) => !!user && m.participants.some((p) => p.player_id === user.id);
  const myNext = user ? upcoming.find(mine) : null;

  // Calendar
  const first = new Date(month.getFullYear(), month.getMonth(), 1);
  const daysInMonth = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const blanks = first.getDay();
  const calendarItems = useMemo(() => [...upcoming, ...past, ...autoLogged], [upcoming, past, autoLogged]);
  const onDay = (d: number) => calendarItems.filter((m) => {
    const x = new Date(m.scheduled_at);
    return x.getFullYear() === month.getFullYear() && x.getMonth() === month.getMonth() && x.getDate() === d;
  });
  const today = new Date();

  return (
    <div className={`ctf-theme ${displayFont.variable} ${bodyFont.variable} min-h-screen`}>
      <Navbar user={user} />
      <main className="container mx-auto px-4 py-6 space-y-4">
        {/* Header strip */}
        <section className="relative overflow-hidden rounded-xl bg-[#131A2B]">
          <div className="absolute inset-0 pointer-events-none" style={{ backgroundImage: 'radial-gradient(circle at 10% 20%, rgba(34,211,238,0.12), transparent 40%)' }} />
          <div className="relative px-5 sm:px-6 py-5 flex flex-col lg:flex-row lg:items-end gap-4">
            <div className="min-w-0 flex-1">
              <div className="text-[11px] uppercase tracking-[0.25em] text-[#22D3EE]/80 mb-1">Free Infantry · CTF</div>
              <h1 className="font-display text-5xl leading-none text-[#E6EDF7]">Match log</h1>
              <div className="mt-2 flex items-center gap-x-3 gap-y-1 flex-wrap text-sm text-[#8B98B0]">
                <span><span className="text-[#E6EDF7] tabular-nums">{upcoming.length}</span> upcoming</span>
                <span className="text-white/20">·</span>
                <span><span className="text-[#E6EDF7] tabular-nums">{past.length + autoLogged.length}</span> played</span>
                <span className="text-white/20">·</span>
                <span>Times in your zone{tz ? ` (${tz})` : ''}</span>
              </div>
              <p className="mt-1.5 text-sm text-[#8B98B0] max-w-xl">Pickups, scrims, squad matches and league fixtures. Sign up on a match to play, cast, record or ref it.</p>
            </div>
            <div className="flex flex-wrap items-center gap-2 lg:justify-end">
              <button type="button" onClick={openCreate} className={btnPrimary}>{user ? 'Create match' : 'Sign in to create'}</button>
              <Link href="/league/schedule" className={btnQuiet}>League schedule</Link>
              <Link href="/stats" className="inline-flex items-center gap-1 px-2 py-2 text-sm text-[#8B98B0] hover:text-[#22D3EE] transition-colors">
                Game stats <ChevronRight className="w-3.5 h-3.5" aria-hidden="true" />
              </Link>
            </div>
          </div>
        </section>

        {/* Your next match */}
        {myNext && (
          <section className="rounded-xl bg-[#131A2B] ring-1 ring-[#22D3EE]/40 px-4 py-3 flex items-center gap-3 flex-wrap">
            <span className="text-[11px] uppercase tracking-wide text-[#22D3EE]">You’re signed up</span>
            <span className="text-sm text-[#E6EDF7] truncate">{myNext.title}</span>
            <span className="text-sm text-[#8B98B0]">{dayLabel(myNext.scheduled_at)} · {timeLabel(myNext.scheduled_at)}</span>
            <span className="text-xs text-[#8B98B0]">as {myNext.participants.filter((p) => p.player_id === user!.id).map((p) => ROLES.find((r) => r.key === p.role)?.label.toLowerCase()).join(', ')}</span>
            <Link href={`/matches/${myNext.id}`} className="ml-auto text-xs text-[#22D3EE] hover:text-[#67E8F9]">Details</Link>
          </section>
        )}

        {/* View chips */}
        <div className="flex items-center gap-1 flex-wrap">
          <Chip active={view === 'list'} onClick={() => setView('list')}>List</Chip>
          <Chip active={view === 'calendar'} onClick={() => setView('calendar')}>Calendar</Chip>
          {view === 'calendar' && (
            <div className="ml-auto flex items-center gap-1 text-sm">
              <button type="button" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))} className="p-1.5 rounded-md text-[#8B98B0] hover:text-[#E6EDF7] hover:bg-white/5" aria-label="Previous month"><ChevronLeft className="w-4 h-4" /></button>
              <span className="text-[#E6EDF7] w-36 text-center">{month.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</span>
              <button type="button" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))} className="p-1.5 rounded-md text-[#8B98B0] hover:text-[#E6EDF7] hover:bg-white/5" aria-label="Next month"><ChevronRight className="w-4 h-4" /></button>
            </div>
          )}
        </div>

        {loading ? (
          <section className="rounded-xl bg-[#131A2B] px-4 py-4 animate-pulse space-y-2">
            {[0, 1, 2].map((i) => <div key={i} className="h-14 rounded-md bg-white/5" />)}
          </section>
        ) : view === 'calendar' ? (
          <section className="rounded-xl bg-[#131A2B] p-3">
            <div className="grid grid-cols-7 gap-1.5">
              {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
                <div key={d} className="text-center text-[11px] uppercase tracking-wide text-[#8B98B0] py-1">{d}</div>
              ))}
              {Array.from({ length: blanks }).map((_, i) => <div key={`b${i}`} />)}
              {Array.from({ length: daysInMonth }).map((_, i) => {
                const d = i + 1;
                const items = onDay(d);
                const isToday = today.getFullYear() === month.getFullYear() && today.getMonth() === month.getMonth() && today.getDate() === d;
                return (
                  <div key={d} className={`min-h-[84px] rounded-md p-1.5 ${isToday ? 'bg-[#22D3EE]/10 ring-1 ring-[#22D3EE]/40' : 'bg-[#1B2438]'}`}>
                    <div className={`text-xs mb-1 ${isToday ? 'text-[#22D3EE]' : 'text-[#8B98B0]'}`}>{d}</div>
                    <div className="space-y-0.5">
                      {items.slice(0, 3).map((m) => (
                        <Link
                          key={m.id}
                          href={`/matches/${m.id}`}
                          title={`${m.title} · ${timeLabel(m.scheduled_at)}`}
                          className={`block text-[10px] leading-tight truncate rounded px-1 py-0.5 ${
                            m.status === 'scheduled' ? 'bg-[#22D3EE]/15 text-[#22D3EE]' : m.status === 'expired' ? 'bg-white/5 text-[#8B98B0] line-through' : 'bg-white/5 text-[#E6EDF7]'
                          }`}
                        >
                          {m.squad_a_name && m.squad_b_name ? `${m.squad_a_tag || m.squad_a_name} v ${m.squad_b_tag || m.squad_b_name}` : m.title}
                        </Link>
                      ))}
                      {items.length > 3 && <div className="text-[10px] text-[#8B98B0]">+{items.length - 3}</div>}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        ) : (
          <>
            {/* Upcoming */}
            <section className="rounded-xl overflow-hidden bg-[#131A2B]">
              <div className="px-4 py-2.5 flex items-center justify-between">
                <h2 className="font-display text-lg text-[#E6EDF7]">Upcoming</h2>
                <span className="text-xs text-[#8B98B0] tabular-nums">{upcoming.length}</span>
              </div>
              {upcoming.length === 0 ? (
                <div className="px-4 pb-5 text-sm text-[#8B98B0]">
                  Nothing scheduled. {user ? <button type="button" onClick={openCreate} className="text-[#22D3EE] hover:text-[#67E8F9]">Create one.</button> : 'Sign in to create one.'}
                </div>
              ) : (
                <ul className="divide-y divide-white/[0.06]">
                  {upcoming.map((m) => (
                    <li key={m.id} className={`px-4 py-3 ${mine(m) ? 'bg-[#22D3EE]/[0.04]' : ''}`}>
                      <div className="flex items-start gap-3">
                        <div className="w-24 shrink-0 text-xs text-[#8B98B0] tabular-nums pt-0.5">
                          <div>{dayLabel(m.scheduled_at)}</div>
                          <div className="text-[#E6EDF7]">{timeLabel(m.scheduled_at)}</div>
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <Link href={`/matches/${m.id}`} className="text-sm text-[#E6EDF7] hover:text-[#22D3EE] transition-colors truncate">{m.title}</Link>
                            <TypePill type={m.match_type} league={m.league_slug} />
                            {m.status === 'in_progress' && (
                              <span className="inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-[#34D399]/15 text-[#34D399]"><span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse" />Live</span>
                            )}
                          </div>
                          {(m.squad_a_name || m.squad_b_name) && (
                            <div className="text-xs text-[#8B98B0] mt-0.5">
                              {m.squad_a_name || 'TBD'} <span className="text-white/30">vs</span> {m.squad_b_name || 'TBD'}
                            </div>
                          )}
                          {m.description && <div className="text-xs text-[#8B98B0] mt-0.5 line-clamp-2">{m.description}</div>}
                          {/* Crew */}
                          <div className="mt-2 grid grid-cols-2 md:grid-cols-4 gap-1.5">
                            {ROLES.map((r) => {
                              const people = m.participants.filter((p) => p.role === r.key);
                              const me = people.find((p) => p.player_id === user?.id);
                              const allowed = !!user && canJoinRole(r.key);
                              return (
                                <div key={r.key} className="rounded-md bg-[#1B2438] px-2 py-1.5">
                                  <div className="flex items-center justify-between text-[10px] uppercase tracking-wide text-[#8B98B0]">
                                    <span>{r.plural}</span>
                                    <span className="tabular-nums">{people.length}</span>
                                  </div>
                                  <div className="text-xs text-[#E6EDF7] mt-0.5 leading-snug">
                                    {people.length === 0 ? <span className="text-[#8B98B0]/60">—</span> : people.map((p) => p.in_game_alias).join(', ')}
                                  </div>
                                  {user && m.status === 'scheduled' && (
                                    me ? (
                                      <button type="button" onClick={() => leave(me.id)} disabled={busy === me.id} className="mt-1 text-[11px] text-[#F87171] hover:text-[#FCA5A5] disabled:opacity-50">Leave</button>
                                    ) : (
                                      <button
                                        type="button"
                                        onClick={() => join(m.id, r.key)}
                                        disabled={!allowed || busy === `${m.id}:${r.key}`}
                                        title={allowed ? '' : `${r.label} role required`}
                                        className="mt-1 text-[11px] text-[#22D3EE] hover:text-[#67E8F9] disabled:opacity-40 disabled:cursor-not-allowed"
                                      >
                                        + Join
                                      </button>
                                    )
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                        <div className="shrink-0 flex flex-col items-end gap-1 text-[11px]">
                          <Link href={`/matches/${m.id}`} className="text-[#8B98B0] hover:text-[#22D3EE]">Details</Link>
                          <span className="text-[#8B98B0]/60">by {m.created_by_alias}</span>
                          {user && m.created_by === user.id && !m.league_slug && (
                            <button type="button" onClick={() => remove(m.id)} disabled={busy === m.id} className="text-[#F87171] hover:text-[#FCA5A5] disabled:opacity-50">Delete</button>
                          )}
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            {/* Recent games (auto-logged) */}
            {autoLogged.length > 0 && (
              <section className="rounded-xl overflow-hidden bg-[#131A2B]">
                <div className="px-4 py-2.5 flex items-center justify-between">
                  <h2 className="font-display text-lg text-[#E6EDF7]">Recent games</h2>
                  <span className="text-xs text-[#8B98B0]">Logged automatically from the server</span>
                </div>
                <ul className="divide-y divide-white/[0.06]">
                  {autoLogged.map((m) => {
                    const open = openStats.has(m.id);
                    const stats: any[] = Array.isArray(m.gameStats) ? m.gameStats : [];
                    const teams = Array.from(new Set(stats.map((p) => p.team).filter(Boolean)));
                    return (
                      <li key={m.id} className="px-4 py-2.5">
                        <div className="flex items-center gap-3">
                          <div className="w-24 shrink-0 text-xs text-[#8B98B0] tabular-nums">{relTime(m.scheduled_at)}</div>
                          <div className="min-w-0 flex-1">
                            <div className="text-sm text-[#E6EDF7] truncate">{m.title}</div>
                            <div className="text-[11px] text-[#8B98B0]">
                              {[m.game_mode, m.map_name].filter(Boolean).join(' · ')}
                              {stats.length > 0 && ` · ${stats.length} players`}
                            </div>
                          </div>
                          <div className="shrink-0 flex items-center gap-3 text-[11px]">
                            {m.game_id && <Link href={`/stats/game/${encodeURIComponent(m.game_id)}`} className="text-[#22D3EE] hover:text-[#67E8F9]">Stats</Link>}
                            <Link href={`/matches/${m.id}`} className="text-[#8B98B0] hover:text-[#22D3EE]">Details</Link>
                            {stats.length > 0 && (
                              <button type="button" onClick={() => setOpenStats((s) => { const n = new Set(s); n.has(m.id) ? n.delete(m.id) : n.add(m.id); return n; })} className="text-[#8B98B0] hover:text-[#E6EDF7]" aria-label="Toggle players">
                                <ChevronDown className={`w-4 h-4 transition-transform ${open ? 'rotate-180' : ''}`} />
                              </button>
                            )}
                          </div>
                        </div>
                        {open && stats.length > 0 && (
                          <div className="mt-2 pl-[6.75rem] grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-0.5 text-xs">
                            {teams.map((t) => (
                              <div key={t}>
                                <div className="text-[10px] uppercase tracking-wide text-[#8B98B0] mb-0.5">{t} · {stats.filter((p) => p.team === t).reduce((n, p) => n + (p.captures || 0), 0)} caps</div>
                                {stats.filter((p) => p.team === t).map((p, i) => (
                                  <div key={i} className="flex justify-between text-[#E6EDF7]">
                                    <span className="truncate">{p.player_name}</span>
                                    <span className="tabular-nums text-[#8B98B0]"><span className="text-[#34D399]">{p.kills || 0}</span>/<span className="text-[#F87171]">{p.deaths || 0}</span>{p.captures > 0 ? ` · ${p.captures}c` : ''}</span>
                                  </div>
                                ))}
                              </div>
                            ))}
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </section>
            )}

            {/* Past */}
            {past.length > 0 && (
              <section className="rounded-xl overflow-hidden bg-[#131A2B]">
                <button type="button" onClick={() => setShowPast((v) => !v)} className="w-full px-4 py-2.5 flex items-center justify-between text-left">
                  <h2 className="font-display text-lg text-[#E6EDF7]">Past matches <span className="text-xs font-body text-[#8B98B0] ml-1 tabular-nums">{past.length}</span></h2>
                  <ChevronDown className={`w-4 h-4 text-[#8B98B0] transition-transform ${showPast ? 'rotate-180' : ''}`} />
                </button>
                {showPast && (
                  <ul className="divide-y divide-white/[0.06]">
                    {past.map((m) => {
                      const hasScore = m.squad_a_score != null && m.squad_b_score != null;
                      return (
                        <li key={m.id} className="px-4 py-2.5 flex items-center gap-3">
                          <div className="w-24 shrink-0 text-xs text-[#8B98B0] tabular-nums">{dayLabel(m.scheduled_at)}</div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <Link href={`/matches/${m.id}`} className={`text-sm truncate hover:text-[#22D3EE] ${m.status === 'expired' ? 'text-[#8B98B0]' : 'text-[#E6EDF7]'}`}>{m.title}</Link>
                              <TypePill type={m.match_type} league={m.league_slug} />
                              {m.status === 'expired' && <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/5 text-[#8B98B0] uppercase tracking-wide">Not played</span>}
                            </div>
                            <div className="text-[11px] text-[#8B98B0] mt-0.5">
                              {m.squad_a_name && m.squad_b_name ? `${m.squad_a_name} vs ${m.squad_b_name}` : m.created_by_alias ? `by ${m.created_by_alias}` : ''}
                              {m.participants.length > 0 && ` · ${m.participants.length} signed up`}
                            </div>
                          </div>
                          <div className="shrink-0 text-right">
                            {hasScore ? (
                              <div className="font-display text-xl tabular-nums text-[#E6EDF7]">{m.squad_a_score}<span className="text-white/20 mx-1">:</span>{m.squad_b_score}</div>
                            ) : m.winner_name ? (
                              <div className="text-xs text-[#34D399]">{m.winner_name} won</div>
                            ) : null}
                            <div className="flex gap-2 justify-end text-[11px]">
                              {m.vod_url && <a href={m.vod_url} target="_blank" rel="noopener noreferrer" className="text-[#22D3EE] hover:text-[#67E8F9]">Video</a>}
                              {m.game_id && <Link href={`/stats/game/${encodeURIComponent(m.game_id)}`} className="text-[#22D3EE] hover:text-[#67E8F9]">Stats</Link>}
                              <Link href={`/matches/${m.id}`} className="text-[#8B98B0] hover:text-[#22D3EE]">Details</Link>
                            </div>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </section>
            )}
          </>
        )}
      </main>

      {/* Create match */}
      {showCreate && user && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4" onClick={(e) => { if (e.target === e.currentTarget) setShowCreate(false); }}>
          <form onSubmit={create} className="w-full max-w-md rounded-xl bg-[#131A2B] p-5 space-y-3 max-h-[90vh] overflow-y-auto">
            <h3 className="font-display text-2xl text-[#E6EDF7]">Create a match</h3>
            <div>
              <label className={labelCls}>Title</label>
              <input value={title} onChange={(e) => setTitle(e.target.value)} required className={inputCls} placeholder="Friday pickup" />
            </div>
            <div>
              <label className={labelCls}>Details</label>
              <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} className={inputCls} placeholder="Map, format, who’s invited…" />
            </div>
            <div>
              <label className={labelCls}>Type</label>
              <select value={type} onChange={(e) => setType(e.target.value as MatchType)} className={inputCls} style={{ colorScheme: 'dark' }}>
                <option value="pickup">Pickup / scrim</option>
                {canSquadMatch && <option value="squad_vs_squad">Squad vs squad ({userSquad!.name})</option>}
                {isStaff && <option value="tournament">Squad match (staff, any two squads)</option>}
              </select>
              {isStaff && <p className="text-[11px] text-[#8B98B0] mt-1">League fixtures with weeks and playoffs are made on the <Link href="/league/schedule" className="text-[#22D3EE]">schedule page</Link>.</p>}
            </div>
            {type === 'squad_vs_squad' && (
              <div>
                <label className={labelCls}>Opponent</label>
                <select value={opponent} onChange={(e) => setOpponent(e.target.value)} required className={inputCls} style={{ colorScheme: 'dark' }}>
                  <option value="">Pick a squad…</option>
                  {squads.filter((s) => s.id !== userSquad?.id).map((s) => <option key={s.id} value={s.id}>{s.tag ? `[${s.tag}] ` : ''}{s.name}</option>)}
                </select>
              </div>
            )}
            {type === 'tournament' && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelCls}>Squad A</label>
                  <select value={squadA} onChange={(e) => setSquadA(e.target.value)} required className={inputCls} style={{ colorScheme: 'dark' }}>
                    <option value="">Pick…</option>
                    {squads.map((s) => <option key={s.id} value={s.id}>{s.tag ? `[${s.tag}] ` : ''}{s.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className={labelCls}>Squad B</label>
                  <select value={squadB} onChange={(e) => setSquadB(e.target.value)} required className={inputCls} style={{ colorScheme: 'dark' }}>
                    <option value="">Pick…</option>
                    {squads.filter((s) => s.id !== squadA).map((s) => <option key={s.id} value={s.id}>{s.tag ? `[${s.tag}] ` : ''}{s.name}</option>)}
                  </select>
                </div>
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>Date</label>
                <input type="date" value={date} onChange={(e) => setDate(e.target.value)} required className={inputCls} style={{ colorScheme: 'dark' }} />
              </div>
              <div>
                <label className={labelCls}>Time (your zone{tz ? `, ${tz}` : ''})</label>
                <input type="time" value={time} onChange={(e) => setTime(e.target.value)} required className={inputCls} style={{ colorScheme: 'dark' }} />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <button type="button" onClick={() => setShowCreate(false)} className={btnQuiet}>Cancel</button>
              <button type="submit" disabled={busy === 'create'} className={btnPrimary}>{busy === 'create' ? 'Creating…' : 'Create match'}</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
