'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { toast } from 'react-hot-toast';
import Navbar from '@/components/Navbar';
import { useAuth } from '@/lib/AuthContext';
import { CLASS_OPTIONS } from '@/lib/constants';
import { useDraft } from '@/components/ctfdl/useDraft';
import DraftPlayerCard from '@/components/ctfdl/DraftPlayerCard';
import DraftChat from '@/components/ctfdl/DraftChat';
import {
  teamOnClock,
  teamIndexForPick,
  roundOf,
  totalPicks,
  formatClock,
  avgRating,
  autoPickCandidate,
  type DraftPlayer,
  type DraftTeam,
} from '@/lib/ctfdl-draft';

/**
 * CTFDL draft lobby. Captains pick when on the clock, staff run the room,
 * everyone else watches the board fill in live.
 */
export default function CtfdlDraftLobbyPage() {
  const { user } = useAuth();
  const { bundle, loading, error, refetch, applyBundle, clock, viewers, authHeaders } = useDraft({ presence: true });

  const [search, setSearch] = useState('');
  const [classFilter, setClassFilter] = useState('all');
  const [dayFilter, setDayFilter] = useState<'any' | 'weekdays' | 'weekends'>('any');
  const [sortBy, setSortBy] = useState<'staff' | 'rating' | 'name'>('staff');
  const [showDetails, setShowDetails] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<string | null>(null);
  const [queue, setQueue] = useState<string[]>([]);
  const queueDirty = useRef(false);
  const queueSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const draft = bundle?.draft || null;
  const teams = useMemo(() => [...(bundle?.teams || [])].sort((a, b) => a.pick_order - b.pick_order), [bundle]);
  const picks = bundle?.picks || [];
  const players = bundle?.players || [];
  const viewer = bundle?.viewer;
  const isStaff = !!viewer?.is_staff;
  const myTeamId = viewer?.my_team_id || null;
  const onClock = teamOnClock(draft, teams);
  const iAmOnClock = !!(onClock && myTeamId === onClock.id);
  const canPick = !!draft && draft.status === 'live' && (isStaff || iAmOnClock);

  // Keep the local queue in sync with the server copy unless we're mid-edit.
  useEffect(() => {
    if (!queueDirty.current && bundle?.my_queue) setQueue(bundle.my_queue);
  }, [bundle]);

  const saveQueue = (next: string[]) => {
    setQueue(next);
    queueDirty.current = true;
    if (queueSaveTimer.current) clearTimeout(queueSaveTimer.current);
    queueSaveTimer.current = setTimeout(async () => {
      if (!draft) return;
      try {
        const res = await fetch('/api/ctfdl/draft/queue', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
          body: JSON.stringify({ draft_id: draft.id, player_ids: next }),
        });
        if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Failed to save queue');
        queueDirty.current = false;
      } catch (e: any) {
        toast.error(e.message);
      }
    }, 600);
  };

  const toggleQueue = (id: string) => {
    saveQueue(queue.includes(id) ? queue.filter((q) => q !== id) : [...queue, id]);
  };
  const moveQueue = (id: string, dir: -1 | 1) => {
    const i = queue.indexOf(id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= queue.length) return;
    const next = [...queue];
    [next[i], next[j]] = [next[j], next[i]];
    saveQueue(next);
  };

  const pick = async (playerId: string) => {
    if (!draft) return;
    setBusy(playerId);
    try {
      const res = await fetch('/api/ctfdl/draft/pick', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
        body: JSON.stringify({ draft_id: draft.id, player_id: playerId }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || 'Pick failed');
      applyBundle(json.bundle);
    } catch (e: any) {
      toast.error(e.message);
      refetch();
    } finally {
      setBusy(null);
    }
  };

  const staffAction = async (action: string) => {
    if (!draft) return;
    if (action === 'end' && !confirm('End the draft now? Remaining picks will not be made.')) return;
    if (action === 'undo' && !confirm('Undo the last pick? The player goes back to the pool and that team is back on the clock.')) return;
    setBusy(action);
    try {
      const res = await fetch('/api/ctfdl/draft', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
        body: JSON.stringify({ action, draft_id: draft.id }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || 'Action failed');
      applyBundle(json.bundle);
    } catch (e: any) {
      toast.error(e.message);
      refetch();
    } finally {
      setBusy(null);
    }
  };

  const undrafted = useMemo(() => players.filter((p) => !p.picked_team_id), [players]);

  // How many undrafted players list each class (preferred or secondary) — tells captains how scarce a class is.
  const classCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const c of CLASS_OPTIONS) counts[c] = undrafted.filter((p) => p.preferred_roles.includes(c) || p.secondary_roles.includes(c)).length;
    return counts;
  }, [undrafted]);

  const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
  const WEEKENDS = ['Saturday', 'Sunday'];

  const available = useMemo(() => {
    const term = search.trim().toLowerCase();
    const focusRating = (p: DraftPlayer) => (classFilter === 'all' ? 0 : p.class_ratings?.[classFilter] || 0);
    const prefersFocus = (p: DraftPlayer) => (classFilter !== 'all' && p.preferred_roles.includes(classFilter) ? 1 : 0);
    return undrafted
      .filter((p) => classFilter === 'all' || p.preferred_roles.includes(classFilter) || p.secondary_roles.includes(classFilter))
      .filter((p) => dayFilter === 'any' || (dayFilter === 'weekdays' ? WEEKDAYS : WEEKENDS).some((d) => p.availability_days.includes(d)))
      .filter((p) => !term || [p.alias, p.notes || '', p.contact_info || '', ...p.preferred_roles, ...p.secondary_roles].join(' ').toLowerCase().includes(term))
      .sort((a, b) => {
        if (classFilter !== 'all') {
          // Preferred beats secondary, then rating in that class.
          const pf = prefersFocus(b) - prefersFocus(a);
          if (pf !== 0) return pf;
          const fr = focusRating(b) - focusRating(a);
          if (fr !== 0) return fr;
        }
        if (sortBy === 'name') return a.alias.localeCompare(b.alias);
        if (sortBy === 'staff') {
          const ra = a.staff_rank ?? 999, rb = b.staff_rank ?? 999;
          if (ra !== rb) return ra - rb;
        }
        const d = avgRating(b) - avgRating(a);
        if (d !== 0) return d;
        return a.alias.localeCompare(b.alias);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [undrafted, search, classFilter, dayFilter, sortBy]);

  // Captains see their queued players pinned on top, in queue order.
  const queuedAvailable = useMemo(() => queue.map((id) => available.find((p) => p.player_id === id)).filter((p): p is DraftPlayer => !!p), [queue, available]);
  const restAvailable = useMemo(() => (queuedAvailable.length > 0 ? available.filter((p) => !queue.includes(p.player_id)) : available), [available, queuedAvailable, queue]);

  const toggleExpanded = (id: string) => setExpanded((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  const nextAuto = useMemo(() => (myTeamId && draft?.auto_pick ? autoPickCandidate(players, queue) : null), [players, queue, myTeamId, draft]);

  const playerById = useMemo(() => Object.fromEntries(players.map((p) => [p.player_id, p])), [players]);
  const rosterFor = (t: DraftTeam) => picks.filter((p) => p.team_id === t.id);
  const teamById = useMemo(() => Object.fromEntries(teams.map((t) => [t.id, t])), [teams]);

  const seasonLabel = bundle?.season ? `CTFDL Season ${bundle.season.season_number}` : 'CTFDL';
  const total = draft ? totalPicks(draft, teams.length) : 0;
  const round = draft ? roundOf(draft.current_pick, teams.length) : 0;

  // Upcoming pick order (fantasy-style ticker): from the current pick forward.
  const upcoming = useMemo(() => {
    if (!draft || teams.length === 0 || draft.status === 'complete') return [] as { k: number; round: number; team: DraftTeam }[];
    const start = draft.status === 'setup' ? 1 : draft.current_pick;
    const end = Math.min(total, start + Math.max(teams.length * 2, 12) - 1);
    const out: { k: number; round: number; team: DraftTeam }[] = [];
    for (let k = start; k <= end; k++) {
      const idx = teamIndexForPick(k, teams.length, draft.order_type);
      if (idx >= 0) out.push({ k, round: roundOf(k, teams.length), team: teams[idx] });
    }
    return out;
  }, [draft, teams, total]);

  const myNextPick = useMemo(() => {
    if (!draft || !myTeamId || teams.length === 0 || draft.status === 'complete') return null;
    const start = draft.status === 'setup' ? 1 : draft.current_pick;
    for (let k = start; k <= total; k++) {
      const idx = teamIndexForPick(k, teams.length, draft.order_type);
      if (teams[idx]?.id === myTeamId) return { k, round: roundOf(k, teams.length), away: k - start };
    }
    return null;
  }, [draft, teams, total, myTeamId]);

  const shell = (children: React.ReactNode) => (
    <div className="ctf-theme min-h-screen">
      <Navbar user={user} />
      <main className="mx-auto max-w-[1400px] px-4 py-5">{children}</main>
    </div>
  );

  if (loading) return shell(<div className="py-16 text-center text-[#8B98B0]">Loading draft…</div>);
  if (error) return shell(<div className="rounded-xl bg-[#131A2B] p-8 text-center text-[#F87171]">{error}</div>);

  if (!draft) {
    return shell(
      <div className="rounded-xl bg-[#131A2B] p-8 text-center">
        <div className="mb-2 text-[11px] uppercase tracking-[0.2em] text-[#8B98B0]">CTFDL draft</div>
        <h1 className="font-display text-4xl text-[#E6EDF7]">No draft scheduled yet</h1>
        <p className="mx-auto mt-3 max-w-md text-[#8B98B0]">Register for the season so you're in the pool when the draft opens.</p>
        <div className="mt-6 flex justify-center gap-2">
          <Link href="/league/register" className="rounded-md bg-[#22D3EE] px-4 py-2 text-sm font-semibold text-[#0B0F1A] hover:bg-[#67E8F9]">Register</Link>
          <Link href="/free-agents" className="rounded-md bg-white/5 px-4 py-2 text-sm text-[#E6EDF7] hover:bg-white/10">Free agent pool</Link>
          {isStaff && <Link href="/admin/ctfdl-draft" className="rounded-md bg-white/5 px-4 py-2 text-sm text-[#F59E0B] hover:bg-white/10">Set up a draft</Link>}
        </div>
      </div>,
    );
  }

  const statusPill = {
    setup: ['Not started', 'bg-white/10 text-[#8B98B0]'],
    live: ['Live', 'bg-[#34D399]/15 text-[#34D399]'],
    paused: ['Paused', 'bg-[#F59E0B]/15 text-[#F59E0B]'],
    complete: ['Complete', 'bg-[#22D3EE]/15 text-[#22D3EE]'],
  }[draft.status];

  const clockUrgent = clock != null && clock <= 10 && draft.status === 'live';

  return shell(
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl bg-[#131A2B] p-4 md:p-5">
        <div>
          <div className="mb-1 flex items-center gap-2">
            <span className="text-[11px] uppercase tracking-[0.2em] text-[#8B98B0]">{seasonLabel} · Draft</span>
            <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${statusPill[1]}`}>{statusPill[0]}</span>
            {viewers > 0 && <span className="text-[11px] text-[#8B98B0]">{viewers} in the lobby</span>}
          </div>
          <h1 className="font-display text-3xl leading-none text-[#E6EDF7] md:text-4xl">
            {draft.status === 'complete' ? 'Draft complete' : draft.status === 'setup' ? 'Waiting for staff to start' : `Round ${round} · Pick ${draft.current_pick} of ${total}`}
          </h1>
          <div className="mt-1 text-sm text-[#8B98B0]">
            {draft.order_type === 'snake' ? 'Snake order' : 'Straight order'} · {teams.length} teams · {draft.roster_size} rounds
            {draft.pick_seconds ? ` · ${draft.pick_seconds}s clock${draft.auto_pick ? ', auto-pick on' : ''}` : ' · no clock'}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {onClock && (
            <div className={`rounded-md px-3 py-2 ${iAmOnClock ? 'bg-[#22D3EE] text-[#0B0F1A]' : 'bg-[#22D3EE]/10 text-[#E6EDF7]'}`}>
              <div className="text-[10px] uppercase tracking-wide opacity-80">{iAmOnClock ? 'You are on the clock' : 'On the clock'}</div>
              <div className="font-display text-lg leading-tight">{onClock.squad_tag ? `[${onClock.squad_tag}] ` : ''}{onClock.squad_name}</div>
            </div>
          )}
          {draft.pick_seconds != null && draft.status !== 'complete' && draft.status !== 'setup' && (
            <div className={`rounded-md px-3 py-2 text-center ${clockUrgent ? 'bg-[#F87171]/20 text-[#F87171]' : 'bg-[#F59E0B]/10 text-[#F59E0B]'}`}>
              <div className="text-[10px] uppercase tracking-wide opacity-80">Clock</div>
              <div className="font-display text-2xl leading-none tabular-nums">{formatClock(clock)}</div>
            </div>
          )}
          {draft.status === 'complete' && (
            <Link href="/league/ctfdl/draft/recap" className="rounded-md bg-[#22D3EE] px-3 py-2 text-sm font-semibold text-[#0B0F1A] hover:bg-[#67E8F9]">View recap</Link>
          )}
        </div>
      </div>

      {/* Draft order ticker */}
      {upcoming.length > 0 && (
        <div className="rounded-xl bg-[#131A2B] px-4 py-3">
          <div className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[#8B98B0]">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-[#8B98B0]">{draft.status === 'setup' ? 'Draft order' : 'Up next'}</span>
            {myNextPick && (
              <span className="text-[#E6EDF7]">
                {myNextPick.away === 0 && draft.status !== 'setup'
                  ? 'You are on the clock now.'
                  : <>Your next pick is <span className="text-[#22D3EE]">#{myNextPick.k}</span> (round {myNextPick.round}), {myNextPick.away} pick{myNextPick.away === 1 ? '' : 's'} away.</>}
              </span>
            )}
            <span className="ml-auto">{draft.order_type === 'snake' ? 'Snake: order reverses each round' : 'Straight: same order every round'}</span>
          </div>
          <div className="flex gap-1.5 overflow-x-auto pb-1">
            {upcoming.map(({ k, round: r, team }, i) => {
              const current = draft.status !== 'setup' && i === 0;
              const mine = team.id === myTeamId;
              return (
                <div
                  key={k}
                  className={`flex shrink-0 flex-col items-center rounded-md px-2.5 py-1.5 text-center ${current ? 'bg-[#22D3EE] text-[#0B0F1A]' : mine ? 'bg-[#F59E0B]/15 text-[#F59E0B]' : 'bg-[#0B0F1A] text-[#E6EDF7]'}`}
                  title={`Pick ${k} · Round ${r} · ${team.squad_name}`}
                >
                  <span className={`text-[10px] tabular-nums ${current ? 'opacity-80' : 'text-[#8B98B0]'}`}>{r}.{String(((k - 1) % teams.length) + 1).padStart(2, '0')}</span>
                  <span className="font-display text-sm leading-tight">{team.squad_tag || team.squad_name.slice(0, 6)}</span>
                </div>
              );
            })}
            {upcoming.length > 0 && upcoming[upcoming.length - 1].k < total && <div className="shrink-0 self-center text-xs text-[#8B98B0]">… {total - upcoming[upcoming.length - 1].k} more</div>}
          </div>
        </div>
      )}

      {/* Staff controls */}
      {isStaff && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl bg-[#F59E0B]/10 px-4 py-3">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-[#F59E0B]">Staff</span>
          {draft.status === 'setup' && <button onClick={() => staffAction('start')} disabled={!!busy || teams.length < 2} className="rounded-md bg-[#34D399] px-3 py-1.5 text-sm font-semibold text-[#0B0F1A] disabled:opacity-50">Start draft</button>}
          {draft.status === 'live' && <button onClick={() => staffAction('pause')} disabled={!!busy} className="rounded-md bg-white/10 px-3 py-1.5 text-sm text-[#E6EDF7] hover:bg-white/15 disabled:opacity-50">Pause</button>}
          {draft.status === 'paused' && <button onClick={() => staffAction('resume')} disabled={!!busy} className="rounded-md bg-[#34D399] px-3 py-1.5 text-sm font-semibold text-[#0B0F1A] disabled:opacity-50">Resume</button>}
          {draft.status !== 'setup' && draft.current_pick > 1 && <button onClick={() => staffAction('undo')} disabled={!!busy} className="rounded-md bg-white/10 px-3 py-1.5 text-sm text-[#E6EDF7] hover:bg-white/15 disabled:opacity-50">Undo last pick</button>}
          {draft.status === 'live' && <button onClick={() => staffAction('skip')} disabled={!!busy} className="rounded-md bg-white/10 px-3 py-1.5 text-sm text-[#E6EDF7] hover:bg-white/15 disabled:opacity-50">Skip turn</button>}
          {(draft.status === 'live' || draft.status === 'paused') && <button onClick={() => staffAction('end')} disabled={!!busy} className="rounded-md px-3 py-1.5 text-sm text-[#F87171] hover:bg-white/10 disabled:opacity-50">End draft</button>}
          {draft.status === 'live' && onClock && <span className="text-xs text-[#8B98B0]">Pick buttons below pick for {onClock.squad_name}.</span>}
          <Link href="/admin/ctfdl-draft" className="ml-auto text-xs text-[#F59E0B] hover:underline">Draft settings</Link>
        </div>
      )}

      {/* Private draft-room chat (captains + staff) */}
      {(isStaff || myTeamId) && (
        <DraftChat draftId={draft.id} meId={viewer?.user_id || null} authHeaders={authHeaders} />
      )}

      {/* Captain queue */}
      {myTeamId && draft.status !== 'complete' && (
        <div className="rounded-xl bg-[#131A2B] p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <div className="font-display text-lg text-[#E6EDF7]">Your queue · {teamById[myTeamId]?.squad_name}</div>
              <div className="text-xs text-[#8B98B0]">
                Private to you. {draft.auto_pick ? 'If your clock runs out, the first available player here is picked for you' : 'Auto-pick is off; this is just your own shortlist'}
                {draft.auto_pick && queue.length === 0 ? ', otherwise staff ranking, then best self-rating' : ''}.
                {nextAuto && draft.auto_pick && <> Next auto-pick: <span className="text-[#E6EDF7]">{nextAuto.alias}</span>.</>}
              </div>
            </div>
          </div>
          {queue.length > 0 ? (
            <ol className="mt-3 flex flex-wrap gap-1.5">
              {queue.map((id, i) => {
                const p = playerById[id];
                if (!p) return null;
                const gone = !!p.picked_team_id;
                return (
                  <li key={id} className={`flex items-center gap-1 rounded-md px-2 py-1 text-xs ${gone ? 'bg-white/5 text-[#8B98B0] line-through' : 'bg-[#22D3EE]/10 text-[#E6EDF7]'}`}>
                    <span className="text-[#22D3EE]">{i + 1}</span> {p.alias}
                    <button onClick={() => moveQueue(id, -1)} className="ml-1 text-[#8B98B0] hover:text-[#E6EDF7]" aria-label="Move up">‹</button>
                    <button onClick={() => moveQueue(id, 1)} className="text-[#8B98B0] hover:text-[#E6EDF7]" aria-label="Move down">›</button>
                    <button onClick={() => toggleQueue(id)} className="text-[#8B98B0] hover:text-[#F87171]" aria-label="Remove">✕</button>
                  </li>
                );
              })}
            </ol>
          ) : (
            <p className="mt-2 text-xs text-[#8B98B0]">Use the + buttons on players to build your list before and during the draft.</p>
          )}
        </div>
      )}

      {/* Board */}
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1.4fr)_minmax(0,0.55fr)]">
        {/* Available */}
        <section className="rounded-xl bg-[#131A2B] p-4">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <h2 className="font-display text-lg text-[#E6EDF7]">Available · {available.length}</h2>
            <span className="text-xs text-[#8B98B0]">{players.filter((p) => p.picked_team_id).length} drafted</span>
            <label className="ml-auto flex cursor-pointer items-center gap-1.5 text-xs text-[#8B98B0]">
              <input type="checkbox" checked={showDetails} onChange={(e) => setShowDetails(e.target.checked)} className="text-[#22D3EE]" />
              Show details
            </label>
          </div>

          {/* Class chips with counts */}
          <div className="mb-2 flex flex-wrap gap-1">
            <button type="button" onClick={() => setClassFilter('all')} className={`rounded-md px-2 py-0.5 text-[11px] font-medium ${classFilter === 'all' ? 'bg-[#22D3EE] text-[#0B0F1A]' : 'bg-white/5 text-[#E6EDF7] hover:bg-white/10'}`}>
              All {undrafted.length}
            </button>
            {CLASS_OPTIONS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setClassFilter(classFilter === c ? 'all' : c)}
                className={`rounded-md px-2 py-0.5 text-[11px] font-medium ${classFilter === c ? 'bg-[#22D3EE] text-[#0B0F1A]' : classCounts[c] === 0 ? 'bg-white/5 text-[#8B98B0]/50' : 'bg-white/5 text-[#E6EDF7] hover:bg-white/10'}`}
                title={`${classCounts[c]} available who play ${c}`}
              >
                {c} <span className={classFilter === c ? 'opacity-70' : 'text-[#8B98B0]'}>{classCounts[c]}</span>
              </button>
            ))}
          </div>

          <div className="mb-3 flex flex-wrap gap-2">
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search…" className="min-w-0 flex-1 rounded-md border border-white/10 bg-[#0B0F1A] px-2.5 py-1.5 text-sm text-[#E6EDF7] placeholder-[#8B98B0]/70 focus:border-[#22D3EE] focus:outline-none" />
            <div className="flex overflow-hidden rounded-md border border-white/10 text-xs">
              {(['any', 'weekdays', 'weekends'] as const).map((d) => (
                <button key={d} type="button" onClick={() => setDayFilter(d)} className={`px-2 py-1.5 ${dayFilter === d ? 'bg-[#34D399]/20 text-[#34D399]' : 'bg-[#0B0F1A] text-[#8B98B0] hover:text-[#E6EDF7]'}`}>
                  {d === 'any' ? 'Any day' : d === 'weekdays' ? 'Weekdays' : 'Weekends'}
                </button>
              ))}
            </div>
            <select value={sortBy} onChange={(e) => setSortBy(e.target.value as any)} className="rounded-md border border-white/10 bg-[#0B0F1A] px-2 py-1.5 text-sm text-[#E6EDF7] focus:border-[#22D3EE] focus:outline-none">
              <option value="staff">Staff rank</option>
              <option value="rating">Self-rating</option>
              <option value="name">Name</option>
            </select>
          </div>

          <div className="max-h-[70vh] space-y-1 overflow-y-auto pr-1">
            {available.length === 0 && <p className="py-8 text-center text-sm text-[#8B98B0]">Nobody matches.</p>}
            {queuedAvailable.length > 0 && (
              <div className="pb-1 text-[10px] font-semibold uppercase tracking-wide text-[#22D3EE]">Your queue</div>
            )}
            {[...queuedAvailable, ...restAvailable].map((p, i) => {
              const qi = queue.indexOf(p.player_id);
              const isFirstRest = queuedAvailable.length > 0 && i === queuedAvailable.length;
              return (
                <div key={p.player_id}>
                  {isFirstRest && <div className="pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wide text-[#8B98B0]">Everyone else</div>}
                  <DraftPlayerCard
                    player={p}
                    compact
                    expanded={showDetails || expanded.has(p.player_id)}
                    onToggle={() => toggleExpanded(p.player_id)}
                    focusClass={classFilter === 'all' ? null : classFilter}
                    queuePos={qi >= 0 ? qi + 1 : null}
                    highlight={!!nextAuto && nextAuto.player_id === p.player_id}
                    actions={
                      <>
                        {myTeamId && draft.status !== 'complete' && (
                          <button onClick={() => toggleQueue(p.player_id)} title={qi >= 0 ? 'Remove from queue' : 'Add to queue'} className={`rounded-md px-2 py-1 text-xs ${qi >= 0 ? 'bg-[#22D3EE]/20 text-[#22D3EE]' : 'bg-white/5 text-[#E6EDF7] hover:bg-white/10'}`}>
                            {qi >= 0 ? '✓' : '+'}
                          </button>
                        )}
                        {canPick && (
                          <button onClick={() => pick(p.player_id)} disabled={busy === p.player_id} className="rounded-md bg-[#22D3EE] px-2.5 py-1 text-xs font-semibold text-[#0B0F1A] hover:bg-[#67E8F9] disabled:opacity-50">
                            {busy === p.player_id ? '…' : 'Pick'}
                          </button>
                        )}
                      </>
                    }
                  />
                </div>
              );
            })}
          </div>
        </section>

        {/* Teams */}
        <section className="rounded-xl bg-[#131A2B] p-4">
          <h2 className="mb-3 font-display text-lg text-[#E6EDF7]">Teams</h2>
          {teams.length === 0 ? (
            <p className="text-sm text-[#8B98B0]">Staff haven't added teams yet.</p>
          ) : (
            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
              {teams.map((t) => {
                const roster = rosterFor(t);
                const live = onClock?.id === t.id;
                return (
                  <div key={t.id} className={`rounded-lg p-3 ${live ? 'bg-[#22D3EE]/10 ring-1 ring-[#22D3EE]/50' : 'bg-[#0B0F1A]'} ${myTeamId === t.id ? 'ring-1 ring-[#F59E0B]/40' : ''}`}>
                    <div className="flex items-baseline justify-between gap-2">
                      <div className="truncate font-display text-base text-[#E6EDF7]">{t.squad_tag ? `[${t.squad_tag}] ` : ''}{t.squad_name}</div>
                      <span className="text-[10px] text-[#8B98B0]">#{t.pick_order}</span>
                    </div>
                    <div className="text-[11px] text-[#8B98B0]">Captain {t.captain_alias || '—'}{live ? ' · picking' : ''}</div>
                    <ol className="mt-2 space-y-0.5 text-xs">
                      {Array.from({ length: draft.roster_size }).map((_, i) => {
                        const pk = roster[i];
                        const pl = pk?.player_id ? playerById[pk.player_id] : null;
                        return (
                          <li key={i} className="flex items-center gap-1.5">
                            <span className="w-4 text-right text-[#8B98B0]">{i + 1}</span>
                            {pk ? (
                              pk.pick_type === 'skip' ? <span className="italic text-[#8B98B0]">skipped</span> : (
                                <span className="text-[#E6EDF7]">
                                  {pl?.alias || 'Unknown'}
                                  {pk.pick_type === 'auto' && <span className="ml-1 text-[10px] text-[#F59E0B]">auto</span>}
                                  {pk.pick_type === 'staff' && <span className="ml-1 text-[10px] text-[#8B98B0]">staff</span>}
                                </span>
                              )
                            ) : <span className="text-[#8B98B0]/50">—</span>}
                          </li>
                        );
                      })}
                    </ol>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* Pick log */}
        <section className="rounded-xl bg-[#131A2B] p-4">
          <h2 className="mb-3 font-display text-lg text-[#E6EDF7]">Pick log</h2>
          {picks.length === 0 ? (
            <p className="text-sm text-[#8B98B0]">No picks yet.</p>
          ) : (
            <ol className="max-h-[70vh] space-y-1 overflow-y-auto text-xs">
              {[...picks].reverse().map((pk) => {
                const t = teamById[pk.team_id];
                const pl = pk.player_id ? playerById[pk.player_id] : null;
                return (
                  <li key={pk.id} className="flex items-baseline gap-2 rounded bg-[#0B0F1A] px-2 py-1">
                    <span className="tabular-nums text-[#22D3EE]">{pk.round}.{String(((pk.overall - 1) % Math.max(teams.length, 1)) + 1).padStart(2, '0')}</span>
                    <span className="truncate text-[#8B98B0]">{t?.squad_tag ? `[${t.squad_tag}]` : t?.squad_name}</span>
                    <span className="truncate text-[#E6EDF7]">{pk.pick_type === 'skip' ? 'skipped' : pl?.alias || '—'}</span>
                    {pk.pick_type === 'auto' && <span className="ml-auto text-[10px] text-[#F59E0B]">auto</span>}
                    {pk.pick_type === 'staff' && <span className="ml-auto text-[10px] text-[#8B98B0]">staff</span>}
                  </li>
                );
              })}
            </ol>
          )}
        </section>
      </div>
    </div>,
  );
}
