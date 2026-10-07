'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { toast } from 'react-hot-toast';
import Navbar from '@/components/Navbar';
import { useAuth } from '@/lib/AuthContext';
import { supabase } from '@/lib/supabase';
import { displayFont, bodyFont } from '@/lib/fonts';
import type { SeasonSquad, Trade, TradeContext } from '@/lib/trades-server';

type Roster = Record<string, { player_id: string; alias: string; role: string }[]>;
interface Me { user_id: string; alias: string; staff: boolean; squad_id: string | null }

const STATUS: Record<string, [string, string]> = {
  proposed: ['Waiting for squads', 'bg-[#F59E0B]/15 text-[#F59E0B]'],
  agreed: ['Appeal window', 'bg-[#22D3EE]/15 text-[#22D3EE]'],
  escalated: ['With the admins', 'bg-[#F87171]/15 text-[#F87171]'],
  completed: ['Completed', 'bg-[#34D399]/15 text-[#34D399]'],
  declined: ['Declined', 'bg-white/5 text-[#8B98B0]'],
  cancelled: ['Withdrawn', 'bg-white/5 text-[#8B98B0]'],
  denied: ['Denied by admins', 'bg-[#F87171]/15 text-[#F87171]'],
};
const OPEN = ['proposed', 'agreed', 'escalated'];
const et = (iso: string | null) => (iso ? new Date(iso).toLocaleString('en-US', { timeZone: 'America/New_York', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) + ' ET' : '');
const tagOf = (s: { squad_tag?: string | null; tag?: string | null; squad_name?: string | null; name?: string | null }) => s.squad_tag || s.tag || s.squad_name || s.name || '?';
const btn = 'rounded-md px-3 py-1.5 text-sm transition-colors disabled:opacity-50';
const btnQuiet = `${btn} bg-white/5 text-[#E6EDF7] hover:bg-white/10`;
const btnGo = `${btn} bg-[#22D3EE] font-semibold text-[#0B0F1A] hover:bg-[#67E8F9]`;
const btnWarn = `${btn} bg-[#F87171]/15 text-[#F87171] hover:bg-[#F87171]/25`;

/**
 * Trades between draft-league squads: proposals, the 12-hour appeal window, and the record of what
 * went through. Captains and co-captains act here; everyone can read it.
 */
export default function TradesPage() {
  const { user } = useAuth();
  const [ctx, setCtx] = useState<TradeContext | null>(null);
  const [trades, setTrades] = useState<Trade[]>([]);
  const [rosters, setRosters] = useState<Roster>({});
  const [me, setMe] = useState<Me | null>(null);
  const [pendingSql, setPendingSql] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [proposing, setProposing] = useState(false);
  const [noteFor, setNoteFor] = useState<{ id: string; action: string } | null>(null);
  const [note, setNote] = useState('');

  const headers = useCallback(async (): Promise<Record<string, string>> => {
    const { data: { session } } = await supabase.auth.getSession();
    return session ? { Authorization: `Bearer ${session.access_token}` } : {};
  }, []);

  const load = useCallback(async () => {
    try {
      const r = await fetch('/api/squads/trades', { headers: await headers(), cache: 'no-store' });
      const j = await r.json();
      if (j.pending_sql) { setPendingSql(true); return; }
      setCtx(j.context); setTrades(j.trades || []); setRosters(j.rosters || {}); setMe(j.me || null);
    } catch (e) { console.error('trades load failed', e); } finally { setLoading(false); }
  }, [headers]);
  useEffect(() => { load(); }, [load, user?.id]);

  const act = async (id: string, action: string, withNote = '') => {
    setBusy(`${id}:${action}`);
    try {
      const r = await fetch('/api/squads/trades', { method: 'PATCH', headers: { 'Content-Type': 'application/json', ...(await headers()) }, body: JSON.stringify({ id, action, note: withNote }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || 'That didn’t work');
      toast.success(j.notice || { accept: 'Accepted', decline: 'Declined', cancel: 'Withdrawn', approve: 'Approved', appeal: 'Appeal sent', admin_approve: 'Trade approved', admin_deny: 'Trade denied' }[action] || 'Done');
      setNoteFor(null); setNote('');
      await load();
    } catch (e: any) { toast.error(e.message); } finally { setBusy(null); }
  };

  const open = trades.filter((t) => OPEN.includes(t.status));
  const history = trades.filter((t) => !OPEN.includes(t.status));
  const squadById = useMemo(() => Object.fromEntries((ctx?.squads || []).map((s) => [s.id, s])), [ctx]);
  const deadlinePassed = !!ctx?.deadline && Date.now() >= new Date(ctx.deadline).getTime();

  const shell = (children: React.ReactNode) => (
    <div className={`ctf-theme ${displayFont.variable} ${bodyFont.variable} min-h-screen`}>
      <Navbar user={user} />
      <main className="mx-auto max-w-5xl px-4 py-5 space-y-4">{children}</main>
    </div>
  );
  if (loading) return shell(<div className="py-16 text-center text-[#8B98B0]">Loading…</div>);
  if (pendingSql) return shell(<div className="rounded-xl bg-[#131A2B] p-8 text-center text-[#8B98B0]">Trades aren’t set up on the site yet.</div>);

  const card = (t: Trade) => {
    const [label, cls] = STATUS[t.status] || [t.status, 'bg-white/5 text-[#8B98B0]'];
    const mySeat = me?.squad_id ? t.squads.find((s) => s.squad_id === me.squad_id) : null;
    const outside = !!me?.squad_id && !mySeat;
    const myVote = me?.squad_id ? t.votes.find((v) => v.squad_id === me.squad_id) : null;
    const sq = Object.fromEntries(t.squads.map((s) => [s.squad_id, s]));
    const asking = noteFor?.id === t.id ? noteFor.action : null;
    return (
      <section key={t.id} className="rounded-xl bg-[#131A2B] p-4 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${cls}`}>{label}</span>
          <span className="font-display text-xl text-[#E6EDF7]">{t.squads.map((s) => tagOf(s)).join(' ↔ ')}</span>
          <span className="ml-auto text-xs text-[#8B98B0]">Proposed by {t.proposed_by_alias || '?'} · {et(t.created_at)}</span>
        </div>
        <ul className="grid gap-1 sm:grid-cols-2">
          {t.players.map((p) => (
            <li key={p.player_id} className="rounded-md bg-[#1B2438] px-3 py-1.5 text-sm text-[#E6EDF7]">
              <Link href={`/stats/player/${encodeURIComponent(p.player_alias || '')}`} className="hover:text-[#22D3EE]">{p.player_alias}</Link>
              <span className="text-[#8B98B0]"> · {tagOf(sq[p.from_squad_id || ''] || {})} → {tagOf(sq[p.to_squad_id || ''] || {})}</span>
            </li>
          ))}
        </ul>
        {t.note && <p className="text-sm text-[#8B98B0]">“{t.note}”</p>}
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-[#8B98B0]">
          {t.squads.map((s) => (
            <span key={s.squad_id}>{tagOf(s)}: <span className={s.response === 'accepted' ? 'text-[#34D399]' : s.response === 'declined' ? 'text-[#F87171]' : 'text-[#F59E0B]'}>{s.response}</span>{s.responded_by_alias ? ` (${s.responded_by_alias})` : ''}</span>
          ))}
        </div>
        {t.status === 'agreed' && t.window_ends_at && <p className="text-xs text-[#22D3EE]">Other captains can approve or appeal until {et(t.window_ends_at)}. Two appeals from two squads send it to the admins; otherwise it goes through.</p>}
        {t.votes.length > 0 && (
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-[#8B98B0]">
            {t.votes.map((v) => <span key={v.squad_id}>{tagOf(v)}: <span className={v.vote === 'approve' ? 'text-[#34D399]' : 'text-[#F87171]'}>{v.vote === 'approve' ? 'approved' : 'appealed'}</span>{v.by_alias ? ` (${v.by_alias})` : ''}{v.note ? ` — ${v.note}` : ''}</span>)}
          </div>
        )}
        {(t.decided_by_alias || t.completed_at) && (
          <p className="text-xs text-[#8B98B0]">
            {t.status === 'completed' ? `Completed ${et(t.completed_at)}` : `${label} by ${t.decided_by_alias || '?'} ${et(t.decided_at)}`}
            {t.decision_note && me?.staff ? <> · <span className="text-[#E6EDF7]">Staff note: {t.decision_note}</span></> : null}
          </p>
        )}
        {me && OPEN.includes(t.status) && (
          <div className="flex flex-wrap items-center gap-2 pt-1">
            {t.status === 'proposed' && mySeat?.response === 'pending' && (
              <>
                <button type="button" disabled={!!busy} onClick={() => act(t.id, 'accept')} className={btnGo}>Accept</button>
                <button type="button" disabled={!!busy} onClick={() => act(t.id, 'decline')} className={btnWarn}>Decline</button>
              </>
            )}
            {t.status === 'agreed' && outside && !myVote && (asking ? (
              <>
                <input value={note} onChange={(e) => setNote(e.target.value)} placeholder={asking === 'appeal' ? 'Why you are appealing (optional)' : 'Note (optional)'} className="min-w-[16rem] flex-1 rounded-md border border-white/10 bg-[#0B0F1A] px-3 py-1.5 text-sm text-[#E6EDF7]" />
                <button type="button" disabled={!!busy} onClick={() => act(t.id, asking, note)} className={asking === 'appeal' ? btnWarn : btnGo}>{asking === 'appeal' ? 'Send appeal' : 'Approve'}</button>
                <button type="button" onClick={() => { setNoteFor(null); setNote(''); }} className={btnQuiet}>Cancel</button>
              </>
            ) : (
              <>
                <button type="button" disabled={!!busy} onClick={() => { setNote(''); setNoteFor({ id: t.id, action: 'approve' }); }} className={btnGo}>Approve</button>
                <button type="button" disabled={!!busy} onClick={() => { setNote(''); setNoteFor({ id: t.id, action: 'appeal' }); }} className={btnWarn}>Appeal</button>
              </>
            ))}
            {mySeat && !asking && <button type="button" disabled={!!busy} onClick={() => confirm('Withdraw this trade? Nobody moves.') && act(t.id, 'cancel')} className={btnQuiet}>Withdraw</button>}
            {me.staff && !asking && (asking === null && noteFor?.id === t.id ? null : (
              <span className="ml-auto flex items-center gap-2">
                <span className="text-[11px] uppercase tracking-wide text-[#F59E0B]">Staff</span>
                <button type="button" disabled={!!busy} onClick={() => { setNote(''); setNoteFor({ id: t.id, action: 'admin_approve' }); }} className={btnQuiet}>Approve now</button>
                <button type="button" disabled={!!busy} onClick={() => { setNote(''); setNoteFor({ id: t.id, action: 'admin_deny' }); }} className={btnWarn}>Deny</button>
              </span>
            ))}
            {me.staff && (asking === 'admin_approve' || asking === 'admin_deny') && (
              <span className="flex w-full flex-wrap items-center gap-2">
                <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Reason (admins only)" className="min-w-[16rem] flex-1 rounded-md border border-white/10 bg-[#0B0F1A] px-3 py-1.5 text-sm text-[#E6EDF7]" />
                <button type="button" disabled={!!busy} onClick={() => act(t.id, asking, note)} className={asking === 'admin_deny' ? btnWarn : btnGo}>{asking === 'admin_deny' ? 'Deny trade' : 'Approve and complete'}</button>
                <button type="button" onClick={() => { setNoteFor(null); setNote(''); }} className={btnQuiet}>Cancel</button>
              </span>
            )}
          </div>
        )}
      </section>
    );
  };

  return shell(
    <>
      <div className="rounded-xl bg-[#131A2B] p-5">
        <div className="text-[11px] uppercase tracking-[0.25em] text-[#22D3EE]/80">CTFDL{ctx?.season_number ? ` · Season ${ctx.season_number}` : ''}</div>
        <div className="mt-1 flex flex-wrap items-end justify-between gap-3">
          <h1 className="font-display text-4xl leading-none text-[#E6EDF7]">Trades</h1>
          {me?.squad_id && !deadlinePassed && <button type="button" onClick={() => setProposing(true)} className={btnGo}>Propose a trade</button>}
        </div>
        <p className="mt-3 text-sm text-[#8B98B0]">
          A trade is between 2, 3 or 4 squads, each giving at least one player (captains can’t be traded). Once every squad in it has accepted, the other captains have 12 hours to approve or appeal. Two appeals from two different squads send it to the admins, whose decision is final; otherwise it goes through on its own. A player can be traded at most twice a season.
        </p>
        <p className="mt-2 text-xs text-[#8B98B0]">
          {ctx?.deadline ? (deadlinePassed ? 'Trading closed when the playoffs started.' : `Trades must be agreed before the playoffs start (${et(ctx.deadline)}).`) : 'Trades close when the playoffs start.'}
          {' '}No proposing, accepting or voting between 8 and 11 PM ET on Sundays or while a league match is being played.
          {ctx?.blackout && <span className="text-[#F59E0B]"> Right now: {ctx.blackout}</span>}
        </p>
      </div>

      <h2 className="font-display text-2xl text-[#E6EDF7]">Open</h2>
      {open.length === 0 ? <div className="rounded-xl bg-[#131A2B] p-6 text-sm text-[#8B98B0]">No trades in progress.</div> : open.map(card)}
      {history.length > 0 && (
        <>
          <h2 className="font-display text-2xl text-[#E6EDF7]">History</h2>
          {history.map(card)}
        </>
      )}

      {proposing && ctx && me?.squad_id && (
        <ProposeModal ctx={ctx} rosters={rosters} mySquadId={me.squad_id} onClose={() => setProposing(false)} onDone={async () => { setProposing(false); await load(); }} headers={headers} />
      )}
    </>,
  );
}

function ProposeModal({ ctx, rosters, mySquadId, onClose, onDone, headers }: { ctx: TradeContext; rosters: Roster; mySquadId: string; onClose: () => void; onDone: () => Promise<void>; headers: () => Promise<Record<string, string>> }) {
  const [partners, setPartners] = useState<string[]>([]);
  const [moves, setMoves] = useState<Record<string, string>>({}); // player_id → to squad
  const [note, setNote] = useState('');
  const [sending, setSending] = useState(false);
  const inTrade: SeasonSquad[] = [mySquadId, ...partners].map((id) => ctx.squads.find((s) => s.id === id)!).filter(Boolean);
  const others = ctx.squads.filter((s) => s.id !== mySquadId);
  const togglePartner = (id: string) => setPartners((p) => (p.includes(id) ? p.filter((x) => x !== id) : p.length < 3 ? [...p, id] : p));
  const gives = (squadId: string) => Object.entries(moves).some(([pid, to]) => to && (rosters[squadId] || []).some((m) => m.player_id === pid));
  const ready = inTrade.length >= 2 && inTrade.every((s) => gives(s.id));

  const send = async () => {
    setSending(true);
    try {
      const players = Object.entries(moves).filter(([, to]) => to).map(([player_id, to_squad_id]) => ({ player_id, to_squad_id }));
      const r = await fetch('/api/squads/trades', { method: 'POST', headers: { 'Content-Type': 'application/json', ...(await headers()) }, body: JSON.stringify({ squad_ids: inTrade.map((s) => s.id), players, note }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || 'Could not propose the trade');
      toast.success('Trade proposed; the other squads have been told');
      await onDone();
    } catch (e: any) { toast.error(e.message); } finally { setSending(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <div className="flex max-h-[90vh] w-full max-w-3xl flex-col rounded-xl border border-white/10 bg-[#131A2B]" onClick={(e) => e.stopPropagation()}>
        <div className="px-5 pt-5 pb-3">
          <h3 className="font-display text-2xl text-[#E6EDF7]">Propose a trade</h3>
          <p className="text-xs text-[#8B98B0]">Pick the squads, then for each player who moves choose where they go. Every squad in the trade has to give at least one player.</p>
        </div>
        <div className="space-y-4 overflow-y-auto px-5 pb-4">
          <div>
            <div className="mb-1 text-[11px] uppercase tracking-wide text-[#8B98B0]">Trading with</div>
            <div className="flex flex-wrap gap-2">
              {others.map((s) => (
                <button key={s.id} type="button" onClick={() => togglePartner(s.id)} className={`rounded-md px-3 py-1.5 text-sm ${partners.includes(s.id) ? 'bg-[#22D3EE] text-[#0B0F1A]' : 'bg-white/5 text-[#E6EDF7] hover:bg-white/10'}`}>{s.tag ? `[${s.tag}] ` : ''}{s.name}</button>
              ))}
            </div>
          </div>
          {inTrade.length >= 2 && (
            <div className="grid gap-3 md:grid-cols-2">
              {inTrade.map((s) => (
                <div key={s.id} className="rounded-md bg-[#1B2438] p-3">
                  <div className="mb-2 flex items-center justify-between text-sm">
                    <span className="font-display text-lg text-[#E6EDF7]">{s.tag ? `[${s.tag}] ` : ''}{s.name}</span>
                    <span className={`text-xs ${gives(s.id) ? 'text-[#34D399]' : 'text-[#F59E0B]'}`}>{gives(s.id) ? 'gives a player' : 'must give a player'}</span>
                  </div>
                  <ul className="space-y-1">
                    {(rosters[s.id] || []).map((m) => (
                      <li key={m.player_id} className="flex items-center justify-between gap-2 text-sm">
                        <span className={m.role === 'captain' ? 'text-[#8B98B0]' : 'text-[#E6EDF7]'}>{m.alias}{m.role !== 'player' ? <span className="ml-1 text-[10px] uppercase text-[#F59E0B]">{m.role === 'captain' ? 'C' : 'Co-C'}</span> : null}</span>
                        {m.role === 'captain' ? <span className="text-[10px] text-[#8B98B0]">stays</span> : (
                          <select value={moves[m.player_id] || ''} onChange={(e) => setMoves((mv) => ({ ...mv, [m.player_id]: e.target.value }))} className="rounded bg-[#0B0F1A] px-2 py-1 text-xs text-[#E6EDF7] ring-1 ring-white/10">
                            <option value="">stays</option>
                            {inTrade.filter((o) => o.id !== s.id).map((o) => <option key={o.id} value={o.id}>→ {o.tag || o.name}</option>)}
                          </select>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}
          <div>
            <div className="mb-1 text-[11px] uppercase tracking-wide text-[#8B98B0]">Note to the other captains (optional)</div>
            <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} maxLength={1000} className="w-full rounded-md border border-white/10 bg-[#0B0F1A] px-3 py-2 text-sm text-[#E6EDF7]" />
          </div>
        </div>
        <div className="flex justify-end gap-2 border-t border-white/[0.06] px-5 py-3">
          <button type="button" onClick={onClose} className={btnQuiet}>Cancel</button>
          <button type="button" disabled={!ready || sending} onClick={send} className={btnGo}>{sending ? 'Sending…' : 'Propose trade'}</button>
        </div>
      </div>
    </div>
  );
}
