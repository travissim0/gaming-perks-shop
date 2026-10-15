'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'react-hot-toast';
import { supabase } from '@/lib/supabase';
import { easternClock, easternSuffix, easternToIso } from '@/lib/eastern';
import type { TimeState, TimeProposal } from '@/lib/match-time-server';

/**
 * Captains agree the kick-off time of a league match (API: /api/matches/[id]/time).
 *
 * The league set the day; one squad's lead proposes a time that day, the other accepts or
 * declines (or counters with a time of their own). Everyone sees the open proposal; only the
 * two squads' leads and staff get buttons. Hidden when there is nothing to show or do.
 */

const card = 'rounded-xl border border-white/10 bg-[#111827] p-4';
const btnGo = 'rounded-md bg-[#22D3EE] px-3 py-1.5 text-sm font-medium text-[#0B0F1A] hover:bg-[#67E8F9] disabled:opacity-50 transition-colors';
const btnWarn = 'rounded-md bg-[#F87171]/15 px-3 py-1.5 text-sm text-[#F87171] hover:bg-[#F87171]/25 disabled:opacity-50 transition-colors';
const btnQuiet = 'rounded-md bg-white/5 px-3 py-1.5 text-sm text-[#E6EDF7] hover:bg-white/10 disabled:opacity-50 transition-colors';
const input = 'rounded-md border border-white/10 bg-[#0B0F1A] px-3 py-1.5 text-sm text-[#E6EDF7] focus:border-[#22D3EE] focus:outline-none';

/** "5:30 PM PDT · 8:30 PM ET": the viewer's clock, then Eastern when that differs. */
function both(iso: string): string {
  const d = new Date(iso);
  let tz = '';
  try { tz = new Intl.DateTimeFormat(undefined, { timeZoneName: 'short' }).formatToParts(d).find((p) => p.type === 'timeZoneName')?.value || ''; } catch { /* ignore */ }
  return `${d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}${tz ? ` ${tz}` : ''}${easternSuffix(d)}`;
}

export default function MatchTime({ matchId, onChanged }: { matchId: string; onChanged?: () => void }) {
  const [state, setState] = useState<TimeState | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [proposing, setProposing] = useState(false);
  const [clock, setClock] = useState('20:00');
  const [note, setNote] = useState('');
  const [forSquad, setForSquad] = useState('');
  const [declining, setDeclining] = useState(false);
  const [showHistory, setShowHistory] = useState(false);

  const headers = useCallback(async (): Promise<Record<string, string>> => {
    const { data: { session } } = await supabase.auth.getSession();
    return session ? { Authorization: `Bearer ${session.access_token}` } : {};
  }, []);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/matches/${matchId}/time`, { headers: await headers(), cache: 'no-store' });
      if (!res.ok) return;
      const s: TimeState = await res.json();
      setState(s);
      setClock((c) => (c === '20:00' && !s.match.time_tbd ? easternClock(s.match.scheduled_at) : c));
    } catch { /* leave as is */ }
  }, [matchId, headers]);

  useEffect(() => { load(); }, [load]);

  const act = async (body: Record<string, unknown>, done: string) => {
    setBusy(String(body.action));
    try {
      const res = await fetch(`/api/matches/${matchId}/time`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(await headers()) }, body: JSON.stringify(body) });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) { toast.error(j.error || 'Something went wrong'); return; }
      setState(j);
      toast.success(done);
      if (j.warning) toast(j.warning, { icon: '⚠️', duration: 9000 });
      setProposing(false); setDeclining(false); setNote('');
      if (body.action === 'accept') onChanged?.();
    } finally {
      setBusy(null);
    }
  };

  const proposedIso = useMemo(() => (state ? easternToIso(state.match.day, clock) : null), [state, clock]);

  if (!state || !state.installed) return null;
  const { match, pending, history, me } = state;
  const canAct = me.can_propose || me.can_decide || me.can_withdraw;
  if (!pending && !canAct && history.length === 0) return null;

  const squadOf = (id: string) => match.squads.find((s) => s.id === id);
  const tagOf = (p: TimeProposal) => p.squad_tag || p.squad_name;
  const other = pending ? squadOf(match.squads.find((s) => s.id !== pending.squad_id)?.id || '') : null;

  return (
    <section className={card}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-display text-lg text-[#E6EDF7]">Match time</h2>
        <span className="text-xs text-[#8B98B0]">
          {match.time_tbd ? 'Time TBD' : <>Set for <span className="text-[#E6EDF7]">{both(match.scheduled_at)}</span></>}
        </span>
      </div>
      <p className="mt-1 text-xs text-[#8B98B0]">
        The league set the day: <span className="text-[#E6EDF7]">{match.day_label}</span> (Eastern). The two captains agree what time that day to play; the other side accepts, declines, or counters with a time of their own.
      </p>

      {pending && (
        <div className="mt-3 rounded-lg border border-[#F59E0B]/30 bg-[#F59E0B]/5 p-3">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
            <span className="rounded bg-[#F59E0B]/15 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-[#F59E0B]">Proposed</span>
            <span className="text-[#E6EDF7]">{both(pending.proposed_at)}</span>
            <span className="text-xs text-[#8B98B0]">by {pending.proposed_by_alias} for {tagOf(pending)}{other ? ` · waiting on ${other.tag || other.name}` : ''}</span>
          </div>
          {pending.note && <p className="mt-1 text-xs text-[#C9D3E3]">“{pending.note}”</p>}
          {(me.can_decide || me.can_withdraw) && !declining && (
            <div className="mt-2 flex flex-wrap gap-2">
              {me.can_decide && <button type="button" disabled={!!busy} onClick={() => act({ action: 'accept' }, 'Time set')} className={btnGo}>{busy === 'accept' ? 'Setting…' : 'Accept'}</button>}
              {me.can_decide && <button type="button" disabled={!!busy} onClick={() => { setNote(''); setDeclining(true); }} className={btnWarn}>Decline</button>}
              {me.can_decide && me.can_propose && !proposing && <button type="button" disabled={!!busy} onClick={() => setProposing(true)} className={btnQuiet}>Counter with another time</button>}
              {me.can_withdraw && !me.can_decide && <button type="button" disabled={!!busy} onClick={() => act({ action: 'withdraw' }, 'Withdrawn')} className={btnQuiet}>{busy === 'withdraw' ? 'Withdrawing…' : 'Withdraw'}</button>}
              {me.can_withdraw && !me.can_decide && me.can_propose && !proposing && <button type="button" disabled={!!busy} onClick={() => setProposing(true)} className={btnQuiet}>Change my proposal</button>}
            </div>
          )}
          {declining && (
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Why (optional)" maxLength={300} className={`${input} min-w-[14rem] flex-1`} />
              <button type="button" disabled={!!busy} onClick={() => act({ action: 'decline', note }, 'Declined')} className={btnWarn}>{busy === 'decline' ? 'Declining…' : 'Decline'}</button>
              <button type="button" disabled={!!busy} onClick={() => setDeclining(false)} className={btnQuiet}>Cancel</button>
            </div>
          )}
        </div>
      )}

      {match.closed && canAct && <p className="mt-2 text-xs text-[#F59E0B]">Time proposals are closed. {match.closed}</p>}

      {!pending && me.can_propose && !proposing && (
        <div className="mt-3">
          <button type="button" onClick={() => setProposing(true)} className={btnGo}>Propose a time</button>
        </div>
      )}

      {proposing && me.can_propose && (
        <div className="mt-3 rounded-lg border border-white/10 bg-[#0B0F1A]/60 p-3">
          <div className="flex flex-wrap items-end gap-3">
            <label className="text-xs text-[#8B98B0]">
              <span className="mb-1 block uppercase tracking-wide">Kick-off (Eastern)</span>
              <input type="time" step={300} value={clock} onChange={(e) => setClock(e.target.value)} className={input} />
            </label>
            {me.staff && !me.squad_id && (
              <label className="text-xs text-[#8B98B0]">
                <span className="mb-1 block uppercase tracking-wide">For</span>
                <select value={forSquad} onChange={(e) => setForSquad(e.target.value)} className={input}>
                  <option value="">Pick a squad</option>
                  {match.squads.map((s) => <option key={s.id} value={s.id}>{s.tag ? `[${s.tag}] ` : ''}{s.name}</option>)}
                </select>
              </label>
            )}
            <label className="min-w-[14rem] flex-1 text-xs text-[#8B98B0]">
              <span className="mb-1 block uppercase tracking-wide">Note (optional)</span>
              <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. a few of ours work until 9" maxLength={300} className={`${input} w-full`} />
            </label>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <span className="text-xs text-[#8B98B0]">
              {proposedIso ? <>That is <span className="text-[#E6EDF7]">{both(proposedIso)}</span> on {match.day_label}</> : 'Pick a time'}
            </span>
            <span className="flex-1" />
            <button type="button" disabled={!!busy || !proposedIso || (me.staff && !me.squad_id && !forSquad)} onClick={() => act({ action: 'propose', at: proposedIso, note, squad_id: me.squad_id || forSquad || undefined }, 'Proposed')} className={btnGo}>{busy === 'propose' ? 'Sending…' : pending ? 'Send counter-proposal' : 'Send proposal'}</button>
            <button type="button" disabled={!!busy} onClick={() => setProposing(false)} className={btnQuiet}>Cancel</button>
          </div>
        </div>
      )}

      {history.length > 0 && (
        <div className="mt-3">
          <button type="button" onClick={() => setShowHistory((v) => !v)} className="text-xs text-[#8B98B0] hover:text-[#22D3EE]">{showHistory ? 'Hide' : 'Show'} earlier proposals ({history.length})</button>
          {showHistory && (
            <ul className="mt-1 space-y-0.5 text-xs text-[#8B98B0]">
              {history.map((h) => (
                <li key={h.id}>
                  <span className={h.status === 'accepted' ? 'text-[#34D399]' : h.status === 'declined' ? 'text-[#F87171]' : ''}>{h.status[0].toUpperCase() + h.status.slice(1)}</span>
                  {' · '}{both(h.proposed_at)} by {h.proposed_by_alias} ({tagOf(h)}){h.decided_by_alias && h.status !== 'withdrawn' ? ` · ${h.status} by ${h.decided_by_alias}` : ''}{h.note ? ` · “${h.note}”` : ''}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}
