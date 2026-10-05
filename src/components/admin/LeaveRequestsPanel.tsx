'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { toast } from 'react-hot-toast';
import { supabase } from '@/lib/supabase';
import { Panel, Modal, Empty } from '@/components/ctf/AdminBits';
import { btnPrimary, btnQuiet, btnDanger, inputCls, labelCls } from '@/components/ctf/FormBits';
import type { LeaveRequest } from '@/lib/leave-requests-server';

const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }) : '');
const squadOf = (r: LeaveRequest) => `${r.squad_tag ? `[${r.squad_tag}] ` : ''}${r.squad_name || 'a squad that no longer exists'}`;
const VERDICT: Record<string, [string, string]> = {
  approved: ['Approved', 'bg-[#34D399]/15 text-[#34D399]'],
  denied: ['Denied', 'bg-[#F87171]/15 text-[#F87171]'],
  cancelled: ['Withdrawn', 'bg-white/5 text-[#8B98B0]'],
};

/**
 * Staff panel: requests from draft-league players to leave their squad. Staff approve or deny each
 * one with a reason; the decision, who made it and when stay on record below the open requests.
 * Renders nothing until the table exists (create-squad-leave-requests.sql).
 */
export default function LeaveRequestsPanel() {
  const [requests, setRequests] = useState<LeaveRequest[] | null>(null);
  const [deciding, setDeciding] = useState<{ request: LeaveRequest; approve: boolean } | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [showAll, setShowAll] = useState(false);

  const headers = async (): Promise<Record<string, string>> => {
    const { data: { session } } = await supabase.auth.getSession();
    return session ? { Authorization: `Bearer ${session.access_token}` } : {};
  };

  const load = useCallback(async () => {
    try {
      const r = await fetch('/api/squads/leave-requests', { headers: await headers(), cache: 'no-store' });
      const j = r.ok ? await r.json() : null;
      setRequests(j && !j.pending_sql ? j.requests || [] : null);
    } catch (e) {
      console.error('leave requests load failed', e);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const decide = async () => {
    if (!deciding) return;
    setBusy(true);
    try {
      const r = await fetch('/api/squads/leave-requests', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...(await headers()) },
        body: JSON.stringify({ id: deciding.request.id, action: deciding.approve ? 'approve' : 'deny', note }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || 'Could not save the decision');
      toast.success(deciding.approve ? `${deciding.request.player_alias} was taken off ${squadOf(deciding.request)}` : `Request denied: ${deciding.request.player_alias} stays on the roster`);
      setDeciding(null);
      setNote('');
      await load();
    } catch (e: any) {
      toast.error(e.message);
      await load();
    } finally {
      setBusy(false);
    }
  };

  if (!requests) return null;
  const pending = requests.filter((r) => r.status === 'pending');
  const decided = requests.filter((r) => r.status !== 'pending');
  const shown = showAll ? decided : decided.slice(0, 5);

  return (
    <>
      <Panel
        title={<>Leave requests{pending.length > 0 && <span className="ml-2 rounded-full bg-[#F59E0B]/15 px-2 py-0.5 align-middle text-xs font-medium text-[#F59E0B]">{pending.length} waiting</span>}</>}
        hint="Draft-league players ask to leave their squad here. They stay on the roster until a staff member approves; the decision and its reason are kept on record."
        actions={<button type="button" onClick={load} className={btnQuiet}>Refresh</button>}
      >
        {pending.length === 0 ? (
          <Empty>No requests waiting.</Empty>
        ) : (
          <ul className="space-y-2 px-4 pt-3 pb-3">
            {pending.map((r) => (
              <li key={r.id} className="rounded-lg bg-[#1B2438] p-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-sm text-[#E6EDF7]">
                      <Link href={`/stats/player/${encodeURIComponent(r.player_alias || '')}`} className="font-medium hover:text-[#22D3EE]">{r.player_alias || 'Unknown player'}</Link>
                      {' '}wants to leave{' '}
                      {r.squad_id ? <Link href={`/squads/${r.squad_id}`} className="font-medium hover:text-[#22D3EE]">{squadOf(r)}</Link> : <span className="font-medium">{squadOf(r)}</span>}
                    </div>
                    <div className="mt-0.5 text-xs text-[#8B98B0]">
                      Asked {when(r.created_at)}{r.league_slug ? ` · ${r.league_slug.toUpperCase()}${r.season_number ? ` Season ${r.season_number}` : ''}` : ''}
                    </div>
                    <p className="mt-2 whitespace-pre-line text-sm text-[#E6EDF7]">{r.reason || <span className="text-[#8B98B0]">No reason given.</span>}</p>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <button type="button" onClick={() => { setNote(''); setDeciding({ request: r, approve: true }); }} className={btnPrimary}>Approve</button>
                    <button type="button" onClick={() => { setNote(''); setDeciding({ request: r, approve: false }); }} className={btnDanger}>Deny</button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}

        {decided.length > 0 && (
          <div className="mt-3 border-t border-white/[0.06] px-4 pt-3 pb-2">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-[11px] font-medium uppercase tracking-wide text-[#8B98B0]">Decided</span>
              {decided.length > 5 && <button type="button" onClick={() => setShowAll((v) => !v)} className="text-xs text-[#8B98B0] hover:text-[#22D3EE]">{showAll ? 'Show fewer' : `Show all ${decided.length}`}</button>}
            </div>
            <ul className="space-y-1.5">
              {shown.map((r) => {
                const [label, cls] = VERDICT[r.status] || [r.status, 'bg-white/5 text-[#8B98B0]'];
                return (
                  <li key={r.id} className="rounded-md bg-[#1B2438]/60 px-3 py-2 text-sm">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${cls}`}>{label}</span>
                      <span className="text-[#E6EDF7]">{r.player_alias || 'Unknown player'}</span>
                      <span className="text-[#8B98B0]">· {squadOf(r)}</span>
                      <span className="ml-auto text-xs text-[#8B98B0]">
                        {r.status === 'cancelled' ? 'by the player' : `by ${r.decided_by_alias || 'staff'}`} · {when(r.decided_at)}
                      </span>
                    </div>
                    {r.reason && <div className="mt-1 text-xs text-[#8B98B0]">Player: {r.reason}</div>}
                    {r.decision_note && <div className="mt-0.5 text-xs text-[#E6EDF7]">Staff: {r.decision_note}</div>}
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </Panel>

      {deciding && (
        <Modal
          title={deciding.approve ? `Approve: ${deciding.request.player_alias} leaves ${squadOf(deciding.request)}` : `Deny: ${deciding.request.player_alias} stays on ${squadOf(deciding.request)}`}
          hint={deciding.approve
            ? 'The player comes off the roster straight away and is told. Your name, the time and the reason below are saved with the request.'
            : 'The player stays on the roster and is told. Your name, the time and the reason below are saved with the request.'}
          onClose={() => { if (!busy) setDeciding(null); }}
        >
          <label className={labelCls}>Reason for this decision (shown to the player)</label>
          <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={4} maxLength={1000} placeholder="Optional, but it helps when someone looks back at this later" className={inputCls} />
          <div className="mt-4 flex justify-end gap-2">
            <button type="button" onClick={() => setDeciding(null)} disabled={busy} className={btnQuiet}>Cancel</button>
            <button type="button" onClick={decide} disabled={busy} className={deciding.approve ? btnPrimary : 'px-4 py-2 rounded-md text-sm font-medium bg-[#F87171] text-[#0B0F1A] hover:bg-[#FCA5A5] disabled:opacity-50 transition-colors'}>
              {busy ? 'Saving…' : deciding.approve ? 'Approve and remove from squad' : 'Deny request'}
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}
