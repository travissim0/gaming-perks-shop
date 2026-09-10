'use client';

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { X } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/AuthContext';
import Navbar from '@/components/Navbar';
import UserAvatar from '@/components/UserAvatar';
import { displayFont, bodyFont } from '@/lib/fonts';

/*
 * Player event log — the site-wide activity feed (squad moves, pool joins,
 * ratings, tournament wins, donations, perks). Signed-in only, as before.
 */

interface PlayerEvent {
  id: string;
  player_id: string;
  event_type: string;
  event_data: any;
  description: string;
  created_at: string;
  squad_id?: string;
  profiles?: { in_game_alias: string; avatar_url?: string | null };
  related_player_profiles?: { in_game_alias: string };
  squads?: { name: string };
}

type Cat = 'all' | 'squads' | 'pool' | 'ratings' | 'money';
const CATS: { key: Cat; label: string; types: string[] | null }[] = [
  { key: 'all', label: 'All', types: null },
  { key: 'squads', label: 'Squads', types: ['squad_joined', 'squad_left', 'squad_kicked', 'squad_promoted', 'squad_demoted', 'squad_ownership_transferred'] },
  { key: 'pool', label: 'Player pool', types: ['free_agents_joined', 'free_agents_left'] },
  { key: 'ratings', label: 'Ratings & wins', types: ['elo_change', 'tournament_win', 'match_played'] },
  { key: 'money', label: 'Donations & perks', types: ['donation_made', 'perk_purchased'] },
];
const RANGES = [
  { value: '1', label: '24 hours' },
  { value: '7', label: '7 days' },
  { value: '30', label: '30 days' },
  { value: '90', label: '90 days' },
  { value: 'all', label: 'All time' },
];

/** Dot colour per event type: green for arrivals, red for departures, amber for money, cyan otherwise. */
const DOT: Record<string, string> = {
  squad_joined: '#34D399', squad_promoted: '#34D399', tournament_win: '#F59E0B', free_agents_joined: '#22D3EE',
  squad_left: '#F87171', squad_kicked: '#F87171', squad_demoted: '#F87171', free_agents_left: '#8B98B0',
  squad_ownership_transferred: '#A78BFA', elo_change: '#22D3EE', match_played: '#22D3EE',
  donation_made: '#F59E0B', perk_purchased: '#F59E0B',
};

const PAGE = 40;
const timeOf = (iso: string) => new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
const dayKey = (iso: string) => { const d = new Date(iso); return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`; };
const dayLabel = (iso: string) => {
  const d = new Date(iso); const t = new Date();
  const same = (a: Date, b: Date) => a.toDateString() === b.toDateString();
  const y = new Date(t); y.setDate(t.getDate() - 1);
  if (same(d, t)) return 'Today';
  if (same(d, y)) return 'Yesterday';
  return d.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', ...(d.getFullYear() !== t.getFullYear() ? { year: 'numeric' } : {}) });
};

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} className={`px-3 py-1.5 rounded-md text-sm transition-colors ${active ? 'bg-[#22D3EE]/15 text-[#22D3EE]' : 'text-[#8B98B0] hover:text-[#E6EDF7] hover:bg-white/5'}`}>
      {children}
    </button>
  );
}

const P = ({ name }: { name: string }) => <Link href={`/stats/player/${encodeURIComponent(name)}`} className="font-medium text-[#E6EDF7] hover:text-[#22D3EE]">{name}</Link>;
const S = ({ id, name }: { id?: string | null; name: string }) => id ? <Link href={`/squads/${id}`} className="font-medium text-[#22D3EE] hover:text-[#67E8F9]">{name}</Link> : <span className="font-medium text-[#22D3EE]">{name}</span>;
const Pool = () => <Link href="/free-agents" className="font-medium text-[#22D3EE] hover:text-[#67E8F9]">player pool</Link>;

function Sentence({ e }: { e: PlayerEvent }) {
  const name = e.profiles?.in_game_alias || 'Unknown player';
  const squad = e.squads?.name;
  const sid = e.event_data?.squad_id || e.squad_id;
  const d = e.event_data || {};
  const m = 'text-[#8B98B0]';
  switch (e.event_type) {
    case 'squad_joined': return <><P name={name} /> <span className="text-[#34D399]">joined</span> <span className={m}>{d.is_legacy ? 'legacy squad' : ''}</span> {squad && <S id={sid} name={squad} />}{d.role && d.role !== 'player' && <span className={m}> as {d.role}</span>}</>;
    case 'squad_left': return <><P name={name} /> <span className="text-[#F87171]">left</span> {squad && <S id={sid} name={squad} />}</>;
    case 'squad_kicked': return <><P name={name} /> <span className="text-[#F87171]">was removed from</span> {squad && <S id={sid} name={squad} />}</>;
    case 'squad_promoted': return <><P name={name} /> <span className="text-[#34D399]">promoted to {d.new_role}</span> <span className={m}>in</span> {squad && <S id={sid} name={squad} />}</>;
    case 'squad_demoted': return <><P name={name} /> <span className="text-[#F87171]">demoted to {d.new_role}</span> <span className={m}>in</span> {squad && <S id={sid} name={squad} />}</>;
    case 'squad_ownership_transferred':
      return d.action === 'transferred_away'
        ? <><P name={name} /> <span className={m}>handed</span> {squad && <S id={sid} name={squad} />} <span className={m}>to</span> <span className="text-[#E6EDF7]">{d.transferred_to}</span></>
        : <><P name={name} /> <span className={m}>took over</span> {squad && <S id={sid} name={squad} />} <span className={m}>from</span> <span className="text-[#E6EDF7]">{d.received_from}</span></>;
    case 'free_agents_joined': return <><P name={name} /> <span className="text-[#22D3EE]">joined the</span> <Pool /></>;
    case 'free_agents_left': return <><P name={name} /> <span className={m}>left the</span> <Pool /></>;
    case 'elo_change': {
      const c = Number(d.change || 0);
      return <><P name={name} /> <span className={m}>ELO</span> <span className="tabular-nums text-[#E6EDF7]">{d.old_elo} → {d.new_elo}</span> <span className={`tabular-nums ${c >= 0 ? 'text-[#34D399]' : 'text-[#F87171]'}`}>({c > 0 ? '+' : ''}{c})</span></>;
    }
    case 'tournament_win': return <><P name={name} /> <span className="text-[#F59E0B]">won</span> <span className="text-[#E6EDF7]">{d.tournament_name}</span>{squad && <> <span className={m}>with</span> <S id={sid} name={squad} /></>}</>;
    case 'donation_made': return <><P name={name} /> <span className={m}>donated</span> <span className="text-[#F59E0B] tabular-nums">${d.amount}</span></>;
    case 'perk_purchased': return <><P name={name} /> <span className={m}>bought</span> <span className="text-[#E6EDF7]">{d.perk_name}</span></>;
    default: return <span className="text-[#E6EDF7]">{e.description}</span>;
  }
}

export default function PlayerEventLogPage() {
  const { user, loading: authLoading } = useAuth();
  const [events, setEvents] = useState<PlayerEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [cat, setCat] = useState<Cat>('all');
  const [range, setRange] = useState('30');
  const [shown, setShown] = useState(PAGE);

  const load = async () => {
    setLoading(true); setError(null);
    try {
      let q = supabase
        .from('player_events')
        .select('*, profiles!player_events_player_id_fkey(in_game_alias, avatar_url), related_player_profiles:profiles!player_events_related_player_id_fkey(in_game_alias), squads(name)')
        .order('created_at', { ascending: false });
      if (range !== 'all') { const d = new Date(); d.setDate(d.getDate() - parseInt(range)); q = q.gte('created_at', d.toISOString()); }
      const { data, error } = await q.limit(1000);
      if (error) throw error;
      setEvents((data || []) as PlayerEvent[]);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { if (user) load(); }, [user, range]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { setShown(PAGE); }, [search, cat, range]);

  const counts = useMemo(() => {
    const c: Record<Cat, number> = { all: events.length, squads: 0, pool: 0, ratings: 0, money: 0 };
    for (const e of events) for (const k of CATS) if (k.types && k.types.includes(e.event_type)) c[k.key]++;
    return c;
  }, [events]);

  const filtered = useMemo(() => {
    const types = CATS.find((c) => c.key === cat)?.types;
    const q = search.trim().toLowerCase();
    return events.filter((e) => {
      if (types && !types.includes(e.event_type)) return false;
      if (!q) return true;
      return [e.profiles?.in_game_alias, e.description, e.squads?.name, e.related_player_profiles?.in_game_alias].some((s) => (s || '').toLowerCase().includes(q));
    });
  }, [events, cat, search]);

  const groups = useMemo(() => {
    const out: { key: string; label: string; items: PlayerEvent[] }[] = [];
    for (const e of filtered.slice(0, shown)) {
      const k = dayKey(e.created_at);
      const g = out[out.length - 1];
      if (g && g.key === k) g.items.push(e);
      else out.push({ key: k, label: dayLabel(e.created_at), items: [e] });
    }
    return out;
  }, [filtered, shown]);

  const shell = (children: React.ReactNode) => (
    <div className={`ctf-theme ${displayFont.variable} ${bodyFont.variable} min-h-screen`}>
      <Navbar user={user} />
      <main className="container mx-auto px-4 py-6 max-w-5xl space-y-4">{children}</main>
    </div>
  );

  if (!authLoading && !user) {
    return shell(
      <section className="rounded-xl bg-[#131A2B] px-6 py-8">
        <div className="text-[11px] uppercase tracking-[0.25em] text-[#22D3EE]/80 mb-1">Free Infantry · CTF</div>
        <h1 className="font-display text-4xl text-[#E6EDF7]">Player event log</h1>
        <p className="text-sm text-[#8B98B0] mt-2">The activity feed is for signed-in players.</p>
        <Link href="/auth/login" className="inline-block mt-4 px-3.5 py-2 rounded-md text-sm font-medium bg-[#22D3EE] text-[#0B0F1A] hover:bg-[#67E8F9]">Sign in</Link>
      </section>,
    );
  }

  return shell(
    <>
      <section className="relative overflow-hidden rounded-xl bg-[#131A2B]">
        <div className="absolute inset-0 pointer-events-none" style={{ backgroundImage: 'radial-gradient(circle at 10% 20%, rgba(34,211,238,0.12), transparent 40%)' }} />
        <div className="relative px-5 sm:px-6 py-5 flex flex-col lg:flex-row lg:items-end gap-4">
          <div className="min-w-0 flex-1">
            <div className="text-[11px] uppercase tracking-[0.25em] text-[#22D3EE]/80 mb-1">Free Infantry · CTF</div>
            <h1 className="font-display text-5xl leading-none text-[#E6EDF7]">Player event log</h1>
            <div className="mt-2 text-sm text-[#8B98B0]">
              {loading ? 'Loading…' : <><span className="text-[#E6EDF7] tabular-nums">{filtered.length}</span> event{filtered.length === 1 ? '' : 's'}{search && ` matching “${search}”`} · {RANGES.find((r) => r.value === range)?.label.toLowerCase()}</>}
            </div>
            <p className="mt-1.5 text-sm text-[#8B98B0] max-w-xl">Who joined or left which squad, pool sign-ups, rating changes, tournament wins, and site support.</p>
          </div>
          <div className="relative lg:self-end">
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Player or squad…" className="w-56 bg-[#0B0F1A] border border-white/10 rounded-md px-3 py-1.5 pr-7 text-sm text-[#E6EDF7] placeholder-[#8B98B0]/70 focus:border-[#22D3EE] focus:outline-none" />
            {search && <button type="button" onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-[#8B98B0] hover:text-[#E6EDF7]" aria-label="Clear"><X className="w-3.5 h-3.5" /></button>}
          </div>
        </div>
        <div className="relative border-t border-white/[0.06] px-3 sm:px-4 py-2 flex flex-wrap items-center gap-x-4 gap-y-1">
          <div className="flex gap-1 flex-wrap">
            {CATS.map((c) => <Chip key={c.key} active={cat === c.key} onClick={() => setCat(c.key)}>{c.label} <span className="tabular-nums opacity-70">{counts[c.key]}</span></Chip>)}
          </div>
          <span className="hidden sm:block w-px h-5 bg-white/10" />
          <div className="flex gap-1 flex-wrap">
            {RANGES.map((r) => <Chip key={r.value} active={range === r.value} onClick={() => setRange(r.value)}>{r.label}</Chip>)}
          </div>
        </div>
      </section>

      {error ? (
        <section className="rounded-xl bg-[#131A2B] px-5 py-5 text-sm"><span className="text-[#F87171]">{error}</span> <button type="button" onClick={load} className="text-[#22D3EE] hover:text-[#67E8F9]">Try again</button></section>
      ) : loading ? (
        <section className="rounded-xl bg-[#131A2B] px-4 py-4 space-y-2 animate-pulse">{[0, 1, 2, 3, 4].map((i) => <div key={i} className="h-9 rounded-md bg-white/5" />)}</section>
      ) : groups.length === 0 ? (
        <section className="rounded-xl bg-[#131A2B] px-5 py-6 text-sm text-[#8B98B0]">Nothing in this range.{search && <> <button type="button" onClick={() => setSearch('')} className="text-[#22D3EE]">Clear the search.</button></>}</section>
      ) : (
        <>
          {groups.map((g) => (
            <section key={g.key} className="rounded-xl overflow-hidden bg-[#131A2B]">
              <div className="px-4 py-2 flex items-baseline justify-between">
                <h2 className="font-display text-lg text-[#E6EDF7]">{g.label}</h2>
                <span className="text-xs text-[#8B98B0] tabular-nums">{g.items.length} event{g.items.length === 1 ? '' : 's'}</span>
              </div>
              <ul className="divide-y divide-white/[0.06]">
                {g.items.map((e) => (
                  <li key={e.id} className="px-4 py-2 flex items-center gap-3">
                    <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: DOT[e.event_type] || '#8B98B0' }} />
                    <UserAvatar user={{ avatar_url: e.profiles?.avatar_url ?? null, in_game_alias: e.profiles?.in_game_alias || '?', email: null }} size="sm" />
                    <div className="min-w-0 flex-1 text-sm leading-snug">
                      <Sentence e={e} />
                      {e.event_data?.reason && <span className="text-xs text-[#F59E0B]"> · {e.event_data.reason}</span>}
                    </div>
                    <span className="text-[11px] text-[#8B98B0] tabular-nums shrink-0" title={new Date(e.created_at).toLocaleString()}>{timeOf(e.created_at)}</span>
                  </li>
                ))}
              </ul>
            </section>
          ))}
          {filtered.length > shown && (
            <div className="flex justify-center">
              <button type="button" onClick={() => setShown((n) => n + PAGE)} className="px-4 py-2 rounded-md text-sm bg-white/5 text-[#E6EDF7] hover:bg-white/10 transition-colors">Show more ({filtered.length - shown} left)</button>
            </div>
          )}
        </>
      )}
    </>,
  );
}
