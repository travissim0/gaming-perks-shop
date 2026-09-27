'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { toast } from 'react-hot-toast';
import { ArrowDown, ArrowUp, X } from 'lucide-react';
import Navbar from '@/components/Navbar';
import { useAuth } from '@/lib/AuthContext';
import { supabase } from '@/lib/supabase';
import { displayFont, bodyFont } from '@/lib/fonts';
import { MIN_PUBLIC_BOARDS, REQUIRED_SHARE, type MockPoolPlayer, type MockResponse } from '@/lib/ctfdl-mock';

/*
 * CTFDL mock draft: predict the order the season's players will be drafted.
 * Tap players in the order you expect them to go (phones included), fix mistakes with the arrows,
 * save. One board per account; edit until the draft starts. Public ADP averages everyone's
 * public boards. Captains' boards are private to them (sortable in the draft room).
 */

type Tab = 'board' | 'adp' | 'boards' | 'scores';

const roles = (p: MockPoolPlayer) => [...p.preferred_roles, ...p.secondary_roles.filter((r) => !p.preferred_roles.includes(r))];

export default function MockDraftPage() {
  const { user } = useAuth();
  const [data, setData] = useState<MockResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>('board');
  const [order, setOrder] = useState<string[]>([]);
  const [anonymous, setAnonymous] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [openBoard, setOpenBoard] = useState<string | null>(null);
  const [boardSort, setBoardSort] = useState<'newest' | 'hot' | 'name'>('newest');
  const [boardSearch, setBoardSearch] = useState('');

  const authHeaders = async (): Promise<Record<string, string>> => {
    const { data: { session } } = await supabase.auth.getSession();
    return session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {};
  };

  const load = useCallback(async (keepEdits = false) => {
    try {
      const res = await fetch('/api/ctfdl/mock-draft', { headers: await authHeaders(), cache: 'no-store' });
      const json = (await res.json()) as MockResponse & { error?: string };
      if (!res.ok) throw new Error(json.error || 'Could not load the mock draft');
      setData(json);
      if (!keepEdits) {
        setOrder(json.mine?.player_ids || []);
        setAnonymous(!!json.mine?.anonymous);
        setDirty(false);
      }
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load, user?.id]);

  const pool = data?.pool || [];
  const byId = useMemo(() => Object.fromEntries(pool.map((p) => [p.player_id, p])), [pool]);
  const selfId = user?.id || null;
  const placeable = useMemo(() => pool.filter((p) => p.player_id !== selfId), [pool, selfId]);
  const validOrder = order.filter((id) => byId[id] && id !== selfId);
  const required = data?.viewer.required ?? 0;
  const enough = validOrder.length >= required;
  const locked = !!data?.locked;
  const savedIds = new Set(data?.mine?.player_ids || []);
  const newSinceSave = data?.mine ? placeable.filter((p) => !savedIds.has(p.player_id)).length : 0;

  const unplaced = useMemo(() => {
    const term = search.trim().toLowerCase();
    const placed = new Set(validOrder);
    return placeable
      .filter((p) => !placed.has(p.player_id))
      .filter((p) => !term || [p.alias, ...roles(p)].join(' ').toLowerCase().includes(term));
  }, [placeable, validOrder, search]);

  // Boards vs the Public ADP. delta > 0 = this board takes the player EARLIER than the consensus
  // ("▲6" = six spots higher). The biggest |delta| is the board's "hot take"; the average |delta|
  // is how far the board sits from the consensus (for the "most different" sort).
  const adpRankOf = useMemo(() => Object.fromEntries((data?.adp || []).map((r, i) => [r.player_id, i + 1])), [data?.adp]);
  const hasAdp = !!data?.adp;
  const boardRows = useMemo(() => {
    return (data?.boards || []).map((b) => {
      const deltas: Record<string, number> = {};
      let sum = 0, n = 0;
      let hot: { id: string; delta: number } | null = null;
      b.player_ids.forEach((id, i) => {
        const consensus = adpRankOf[id];
        if (consensus == null) return;
        const d = consensus - (i + 1);
        deltas[id] = d;
        sum += Math.abs(d); n++;
        if (!hot || Math.abs(d) > Math.abs(hot.delta)) hot = { id, delta: d };
      });
      return { board: b, deltas, divergence: n ? sum / n : 0, hot: hot as { id: string; delta: number } | null };
    });
  }, [data?.boards, adpRankOf]);
  const shownBoards = useMemo(() => {
    const term = boardSearch.trim().toLowerCase();
    const rows = boardRows.filter(({ board }) => !term || [board.label, board.author_alias || ''].join(' ').toLowerCase().includes(term));
    return rows.sort((a, b) => {
      if (boardSort === 'name') return a.board.label.localeCompare(b.board.label);
      if (boardSort === 'hot' && hasAdp) return b.divergence - a.divergence || b.board.updated_at.localeCompare(a.board.updated_at);
      return b.board.updated_at.localeCompare(a.board.updated_at);
    });
  }, [boardRows, boardSearch, boardSort, hasAdp]);

  const edit = (next: string[]) => { setOrder(next); setDirty(true); };
  const add = (id: string) => !locked && edit([...validOrder, id]);
  const remove = (id: string) => !locked && edit(validOrder.filter((x) => x !== id));
  const move = (id: string, dir: -1 | 1) => {
    if (locked) return;
    const i = validOrder.indexOf(id), j = i + dir;
    if (i < 0 || j < 0 || j >= validOrder.length) return;
    const next = [...validOrder]; [next[i], next[j]] = [next[j], next[i]]; edit(next);
  };
  const moveTo = (id: string, pos: number) => {
    if (locked || !Number.isFinite(pos)) return;
    const next = validOrder.filter((x) => x !== id);
    next.splice(Math.max(0, Math.min(next.length, pos - 1)), 0, id);
    edit(next);
  };
  const startFromAdp = () => {
    if (!data?.adp || locked) return;
    const adpIds = data.adp.map((r) => r.player_id).filter((id) => byId[id] && id !== selfId);
    edit(adpIds);
    toast.success('Loaded the public ADP. Adjust it, then save.');
  };

  const save = async () => {
    setSaving(true);
    try {
      const res = await fetch('/api/ctfdl/mock-draft', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
        body: JSON.stringify({ player_ids: validOrder, anonymous }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || 'Save failed');
      toast.success(json.private ? 'Saved. Your board is private to you.' : 'Mock draft saved');
      await load();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  };

  const deleteBoard = async () => {
    if (!confirm('Delete your mock draft? You can make a new one until the draft starts.')) return;
    const res = await fetch('/api/ctfdl/mock-draft', { method: 'DELETE', headers: await authHeaders() });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) { toast.error(json.error || 'Delete failed'); return; }
    toast.success('Mock draft deleted');
    await load();
  };

  const shell = (children: React.ReactNode) => (
    <div className={`ctf-theme ${displayFont.variable} ${bodyFont.variable} min-h-screen`}>
      <Navbar user={user} />
      <main className="mx-auto max-w-[1200px] px-4 py-5">{children}</main>
    </div>
  );

  if (loading) return shell(<div className="py-16 text-center text-[#8B98B0]">Loading mock draft…</div>);
  if (!data?.season) {
    return shell(
      <div className="rounded-xl bg-[#131A2B] p-8 text-center">
        <h1 className="font-display text-4xl text-[#E6EDF7]">No CTFDL season is open</h1>
        <p className="mt-2 text-[#8B98B0]">Mock drafts open with the next season's registration.</p>
      </div>,
    );
  }

  const seasonLabel = `CTFDL Season ${data.season.season_number}`;
  const tabs: Array<[Tab, string]> = [
    ['board', data.viewer.is_captain ? 'My board (private)' : 'My mock draft'],
    ['adp', 'Public ADP'],
    ['boards', `Boards (${data.public_board_count})`],
    ...(data.scoreboard ? [['scores', 'Scoreboard'] as [Tab, string]] : []),
  ];

  return shell(
    <div className="space-y-4">
      {/* Header */}
      <div className="relative overflow-hidden rounded-xl bg-[#131A2B] p-4 md:p-5">
        <div className="pointer-events-none absolute inset-0" style={{ backgroundImage: 'radial-gradient(circle at 10% 20%, rgba(34,211,238,0.12), transparent 40%)' }} />
        <div className="relative flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="mb-1 flex flex-wrap items-center gap-2">
              <span className="text-[11px] uppercase tracking-[0.25em] text-[#22D3EE]/80">{seasonLabel} · Mock draft</span>
              <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${locked ? 'bg-white/10 text-[#8B98B0]' : 'bg-[#34D399]/15 text-[#34D399]'}`}>{locked ? 'Locked' : 'Open'}</span>
            </div>
            <h1 className="font-display text-3xl leading-none text-[#E6EDF7] md:text-4xl">Predict the draft</h1>
            <p className="mt-2 max-w-2xl text-sm text-[#8B98B0]">
              Put the pool in the order you think they'll be drafted. One board per account, and you can keep editing until the draft starts.
              {' '}Everyone's public boards add up to the Public ADP.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href="/league/ctfdl/draft" className="rounded-md bg-white/5 px-3 py-2 text-sm text-[#E6EDF7] hover:bg-white/10">Draft room</Link>
            <Link href="/league/register" className="rounded-md bg-white/5 px-3 py-2 text-sm text-[#E6EDF7] hover:bg-white/10">Register</Link>
          </div>
        </div>
      </div>

      {data.needs_setup && (
        <div className="rounded-xl bg-[#F59E0B]/10 p-4 text-sm text-[#F59E0B]">Mock drafts aren't switched on yet. Staff: run create-ctfdl-mock-drafts.sql in Supabase.</div>
      )}

      {/* Tabs */}
      <div className="flex flex-wrap gap-1 rounded-xl bg-[#131A2B] p-1.5">
        {tabs.map(([k, label]) => (
          <button key={k} type="button" onClick={() => setTab(k)} className={`rounded-md px-3 py-1.5 text-sm transition-colors ${tab === k ? 'bg-[#22D3EE]/15 text-[#22D3EE]' : 'text-[#8B98B0] hover:bg-white/5 hover:text-[#E6EDF7]'}`}>{label}</button>
        ))}
      </div>

      {tab === 'board' && (
        !data.viewer.signed_in ? (
          <div className="rounded-xl bg-[#131A2B] p-8 text-center">
            <p className="text-[#E6EDF7]">Sign in to make your mock draft.</p>
            <Link href="/auth/login?redirect=/league/ctfdl/mock-draft" className="mt-4 inline-block rounded-md bg-[#22D3EE] px-4 py-2 text-sm font-semibold text-[#0B0F1A] hover:bg-[#67E8F9]">Sign in</Link>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Status strip */}
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl bg-[#131A2B] px-4 py-3 text-sm">
              <div className="min-w-[220px] flex-1">
                <div className="mb-1 flex justify-between text-xs text-[#8B98B0]">
                  <span><span className={enough ? 'text-[#34D399]' : 'text-[#E6EDF7]'}>{validOrder.length}</span> placed · {required} needed ({Math.round(REQUIRED_SHARE * 100)}% of the pool)</span>
                  <span>{placeable.length} in the pool</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-[#0B0F1A]">
                  <div className={`h-full rounded-full ${enough ? 'bg-[#34D399]' : 'bg-[#22D3EE]'}`} style={{ width: `${placeable.length ? Math.min(100, (validOrder.length / placeable.length) * 100) : 0}%` }} />
                </div>
              </div>
              {!data.viewer.is_captain && (
                <label className="flex cursor-pointer items-center gap-2 text-[#E6EDF7]">
                  <input type="checkbox" checked={anonymous} disabled={locked} onChange={(e) => { setAnonymous(e.target.checked); setDirty(true); }} className="h-4 w-4 accent-[#22D3EE]" />
                  Post anonymously
                </label>
              )}
              <div className="flex flex-wrap gap-2">
                {data.adp && !locked && <button type="button" onClick={startFromAdp} className="rounded-md bg-white/5 px-3 py-1.5 text-sm text-[#E6EDF7] hover:bg-white/10">Start from Public ADP</button>}
                {dirty && !locked && <button type="button" onClick={() => load()} className="rounded-md bg-white/5 px-3 py-1.5 text-sm text-[#8B98B0] hover:bg-white/10">Undo changes</button>}
                {data.mine && !locked && <button type="button" onClick={deleteBoard} className="rounded-md px-3 py-1.5 text-sm text-[#8B98B0] hover:bg-[#F87171]/10 hover:text-[#F87171]">Delete</button>}
                <button type="button" onClick={save} disabled={locked || saving || !enough || (!dirty && !!data.mine)} className="rounded-md bg-[#22D3EE] px-4 py-1.5 text-sm font-semibold text-[#0B0F1A] hover:bg-[#67E8F9] disabled:cursor-not-allowed disabled:opacity-40">
                  {saving ? 'Saving…' : data.mine ? 'Save changes' : 'Save mock draft'}
                </button>
              </div>
            </div>

            {locked && <div className="rounded-xl bg-white/5 px-4 py-3 text-sm text-[#8B98B0]">The draft has started, so boards are locked.{data.scoreboard ? ' See the scoreboard for how everyone did.' : ''}</div>}
            {data.viewer.is_captain && (
              <div className="rounded-xl bg-[#F59E0B]/10 px-4 py-3 text-sm text-[#F59E0B]">
                You're a captain this season, so your board is private. Nobody else sees it, it doesn't count toward the Public ADP, and in the draft room you can sort the pool by it.
              </div>
            )}
            {data.viewer.feeds_staff_adp && (
              <div className="rounded-xl bg-[#22D3EE]/10 px-4 py-3 text-sm text-[#22D3EE]">
                You're staff, so your board also counts toward the Staff ADP. That's the staff ranking captains see in the draft room, and auto-pick uses it when a captain's queue runs out.
              </div>
            )}
            {data.viewer.in_pool &&<div className="text-xs text-[#8B98B0]">You're in the pool yourself, so you're left off your own board.</div>}
            {newSinceSave > 0 && !locked && (
              <div className="rounded-xl bg-[#22D3EE]/10 px-4 py-3 text-sm text-[#22D3EE]">{newSinceSave} player{newSinceSave === 1 ? ' has' : 's have'} joined the pool since you saved. Add them where you think they'll go.</div>
            )}

            <div className="grid gap-4 lg:grid-cols-2">
              {/* Your order */}
              <section className="rounded-xl bg-[#131A2B] p-4">
                <h2 className="mb-1 font-display text-lg text-[#E6EDF7]">Your predicted order</h2>
                <p className="mb-3 text-xs text-[#8B98B0]">Pick 1 is who you think goes first overall. Type a number to jump a player to that spot.</p>
                {validOrder.length === 0 ? (
                  <p className="py-8 text-center text-sm text-[#8B98B0]">Tap players in the pool list in the order you expect them to be drafted.</p>
                ) : (
                  <ol className="max-h-[65vh] divide-y divide-white/[0.04] overflow-y-auto pr-1">
                    {validOrder.map((id, i) => {
                      const p = byId[id];
                      return (
                        <li key={id} className="flex items-center gap-2 py-1.5">
                          <input
                            key={`${id}-${i}`}
                            defaultValue={i + 1}
                            disabled={locked}
                            inputMode="numeric"
                            onBlur={(e) => { const v = parseInt(e.target.value, 10); if (v !== i + 1) moveTo(id, v); }}
                            onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                            className="w-10 shrink-0 rounded bg-[#0B0F1A] px-1 py-0.5 text-center font-display text-base text-[#22D3EE] tabular-nums focus:outline-none focus:ring-1 focus:ring-[#22D3EE]"
                            aria-label={`Position of ${p.alias}`}
                          />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm text-[#E6EDF7]">{p.alias}</span>
                            <span className="block truncate text-[11px] text-[#8B98B0]">{roles(p).join(', ') || '—'}</span>
                          </span>
                          {!locked && (
                            <>
                              <button type="button" onClick={() => move(id, -1)} disabled={i === 0} className="rounded p-1 text-[#8B98B0] hover:bg-white/5 hover:text-[#E6EDF7] disabled:opacity-30" title="Move up"><ArrowUp className="h-4 w-4" /></button>
                              <button type="button" onClick={() => move(id, 1)} disabled={i === validOrder.length - 1} className="rounded p-1 text-[#8B98B0] hover:bg-white/5 hover:text-[#E6EDF7] disabled:opacity-30" title="Move down"><ArrowDown className="h-4 w-4" /></button>
                              <button type="button" onClick={() => remove(id)} className="rounded p-1 text-[#8B98B0] hover:bg-[#F87171]/10 hover:text-[#F87171]" title="Take off your board"><X className="h-4 w-4" /></button>
                            </>
                          )}
                        </li>
                      );
                    })}
                  </ol>
                )}
              </section>

              {/* Pool */}
              <section className="rounded-xl bg-[#131A2B] p-4">
                <div className="mb-3 flex items-center justify-between gap-2">
                  <h2 className="font-display text-lg text-[#E6EDF7]">Still to place <span className="text-sm text-[#8B98B0]">({unplaced.length})</span></h2>
                  <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search…" className="w-40 rounded-md border border-white/10 bg-[#0B0F1A] px-2.5 py-1.5 text-sm text-[#E6EDF7] placeholder-[#8B98B0]/70 focus:border-[#22D3EE] focus:outline-none" />
                </div>
                {unplaced.length === 0 ? (
                  <p className="py-8 text-center text-sm text-[#8B98B0]">{search ? 'Nobody matches.' : 'Everyone is on your board.'}</p>
                ) : (
                  <ul className="max-h-[65vh] divide-y divide-white/[0.04] overflow-y-auto pr-1">
                    {unplaced.map((p) => (
                      <li key={p.player_id}>
                        <button type="button" disabled={locked} onClick={() => add(p.player_id)} className="flex w-full items-center gap-3 rounded px-2 py-2 text-left hover:bg-white/[0.04] disabled:cursor-not-allowed">
                          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-[#22D3EE]/10 text-sm font-semibold text-[#22D3EE]">+</span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm text-[#E6EDF7]">{p.alias}</span>
                            <span className="block truncate text-[11px] text-[#8B98B0]">{roles(p).join(', ') || '—'}</span>
                          </span>
                          <span className="text-[11px] text-[#8B98B0]">→ #{validOrder.length + 1}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </div>
          </div>
        )
      )}

      {tab === 'adp' && (
        <section className="rounded-xl bg-[#131A2B] p-4">
          <h2 className="mb-1 font-display text-lg text-[#E6EDF7]">Public ADP</h2>
          <p className="mb-3 text-xs text-[#8B98B0]">Average predicted pick across every public board. Range is the earliest and latest anyone put them. Captains' boards aren't included.</p>
          {!data.adp ? (
            <p className="py-8 text-center text-sm text-[#8B98B0]">The ADP appears once {MIN_PUBLIC_BOARDS} people have posted a board ({data.public_board_count} so far).</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-white/[0.06] text-left text-[11px] uppercase tracking-wide text-[#8B98B0]">
                    <th className="px-2 py-2">#</th><th className="px-2 py-2">Player</th><th className="px-2 py-2">Classes</th>
                    <th className="px-2 py-2 text-right">ADP</th><th className="px-2 py-2 text-right">Range</th><th className="px-2 py-2 text-right">Boards</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.04]">
                  {data.adp.map((r, i) => (
                    <tr key={r.player_id} className="hover:bg-white/[0.02]">
                      <td className="px-2 py-2 font-display text-base text-[#22D3EE] tabular-nums">{i + 1}</td>
                      <td className="px-2 py-2"><Link href={`/stats/player/${encodeURIComponent(r.alias)}`} className="text-[#E6EDF7] hover:text-[#22D3EE]">{r.alias}</Link></td>
                      <td className="px-2 py-2 text-xs text-[#8B98B0]">{byId[r.player_id] ? roles(byId[r.player_id]).join(', ') : ''}</td>
                      <td className="px-2 py-2 text-right font-display text-base text-[#E6EDF7] tabular-nums">{r.adp.toFixed(1)}</td>
                      <td className="px-2 py-2 text-right text-xs text-[#8B98B0] tabular-nums">{r.best}–{r.worst}</td>
                      <td className="px-2 py-2 text-right text-xs text-[#8B98B0] tabular-nums">{r.boards}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {tab === 'boards' && (
        <section className="rounded-xl bg-[#131A2B] p-4">
          <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="mb-1 font-display text-lg text-[#E6EDF7]">Everyone's boards</h2>
              <p className="text-xs text-[#8B98B0]">
                {hasAdp ? '▲ means they have a player earlier than the Public ADP, ▼ later. ' : 'Once the Public ADP is live, each board shows where it differs from the consensus. '}
                {data.viewer.is_staff ? 'Staff: the real name shows next to anonymous boards.' : ''}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <input value={boardSearch} onChange={(e) => setBoardSearch(e.target.value)} placeholder="Find a board…" className="w-40 rounded-md border border-white/10 bg-[#0B0F1A] px-2.5 py-1.5 text-sm text-[#E6EDF7] placeholder-[#8B98B0]/70 focus:border-[#22D3EE] focus:outline-none" />
              <div className="flex overflow-hidden rounded-md border border-white/10 text-xs">
                {([['newest', 'Newest'], ...(hasAdp ? [['hot', 'Most different']] : []), ['name', 'Name']] as Array<[typeof boardSort, string]>).map(([k, label]) => (
                  <button key={k} type="button" onClick={() => setBoardSort(k)} className={`px-2.5 py-1.5 ${boardSort === k ? 'bg-[#22D3EE]/15 text-[#22D3EE]' : 'bg-[#0B0F1A] text-[#8B98B0] hover:text-[#E6EDF7]'}`}>{label}</button>
                ))}
              </div>
            </div>
          </div>

          {data.boards.length === 0 ? (
            <p className="py-8 text-center text-sm text-[#8B98B0]">No boards yet. Be the first.</p>
          ) : shownBoards.length === 0 ? (
            <p className="py-8 text-center text-sm text-[#8B98B0]">No board matches that name.</p>
          ) : (
            <ul className="divide-y divide-white/[0.05] overflow-hidden rounded-lg bg-[#1B2438]">
              {shownBoards.map(({ board: b, deltas, divergence, hot }) => {
                const open = openBoard === b.id;
                const half = Math.ceil(b.player_ids.length / 2);
                const deltaChip = (d: number | undefined) =>
                  d == null || d === 0 ? null : (
                    <span className={`shrink-0 rounded px-1 text-[10px] font-semibold tabular-nums ${d > 0 ? 'bg-[#34D399]/15 text-[#34D399]' : 'bg-[#F87171]/15 text-[#F87171]'}`}>{d > 0 ? `▲${d}` : `▼${-d}`}</span>
                  );
                return (
                  <li key={b.id}>
                    <button type="button" onClick={() => setOpenBoard(open ? null : b.id)} className="flex w-full flex-wrap items-center gap-x-4 gap-y-1 px-3 py-2.5 text-left hover:bg-white/[0.03]">
                      <span className="min-w-[9rem] font-display text-base text-[#E6EDF7]">
                        {b.label}{b.author_alias && <span className="ml-2 font-sans text-xs text-[#F59E0B]">({b.author_alias})</span>}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-sm text-[#8B98B0]">
                        {b.player_ids.slice(0, 3).map((id, i) => (
                          <span key={id}>{i > 0 && <span className="mx-1.5 text-white/20">·</span>}<span className="text-[#8B98B0]">{i + 1}</span> <span className="text-[#E6EDF7]">{byId[id]?.alias || '—'}</span></span>
                        ))}
                      </span>
                      {hot && hot.delta !== 0 && (
                        <span className="flex items-center gap-1.5 text-xs">
                          <span className="rounded bg-[#F59E0B]/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[#F59E0B]">Hot take</span>
                          <span className="text-[#E6EDF7]">{byId[hot.id]?.alias || '—'}</span>
                          {deltaChip(hot.delta)}
                        </span>
                      )}
                      {hasAdp && <span className="text-[11px] text-[#8B98B0] tabular-nums" title="Average spots away from the Public ADP">±{divergence.toFixed(1)}</span>}
                      <span className="text-[11px] text-[#8B98B0]">{new Date(b.updated_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span>
                      <span className="text-xs text-[#22D3EE]">{open ? 'Hide' : 'View'}</span>
                    </button>
                    {open && (
                      <div className="grid gap-x-6 border-t border-white/[0.05] bg-[#131A2B]/40 px-3 py-3 sm:grid-cols-2">
                        {[b.player_ids.slice(0, half), b.player_ids.slice(half)].map((col, c) => (
                          <ol key={c} className="text-sm">
                            {col.map((id, j) => {
                              const pos = c * half + j + 1;
                              const p = byId[id];
                              return (
                                <li key={id} className="flex items-center gap-2 py-0.5">
                                  <span className="w-6 shrink-0 text-right text-[#8B98B0] tabular-nums">{pos}</span>
                                  <span className="min-w-0 truncate text-[#E6EDF7]">{p?.alias || '—'}</span>
                                  {p && p.preferred_roles[0] && <span className="shrink-0 text-[10px] uppercase tracking-wide text-[#8B98B0]">{p.preferred_roles[0]}</span>}
                                  {deltaChip(deltas[id])}
                                </li>
                              );
                            })}
                          </ol>
                        ))}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      )}

      {tab === 'scores' && data.scoreboard && (
        <section className="rounded-xl bg-[#131A2B] p-4">
          <h2 className="mb-1 font-display text-lg text-[#E6EDF7]">Scoreboard</h2>
          <p className="mb-3 text-xs text-[#8B98B0]">Each board against the real draft: 10 points for the exact pick, 2 fewer for every spot off.</p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/[0.06] text-left text-[11px] uppercase tracking-wide text-[#8B98B0]">
                  <th className="px-2 py-2">#</th><th className="px-2 py-2">Board</th><th className="px-2 py-2 text-right">Points</th><th className="px-2 py-2 text-right">Exact picks</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.04]">
                {data.scoreboard.map((s, i) => (
                  <tr key={s.board_id}>
                    <td className={`px-2 py-2 font-display text-base tabular-nums ${i < 3 ? 'text-[#F59E0B]' : 'text-[#8B98B0]'}`}>{i + 1}</td>
                    <td className="px-2 py-2 text-[#E6EDF7]">{s.label}</td>
                    <td className="px-2 py-2 text-right font-display text-base text-[#E6EDF7] tabular-nums">{s.points}</td>
                    <td className="px-2 py-2 text-right text-[#8B98B0] tabular-nums">{s.exact}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>,
  );
}
