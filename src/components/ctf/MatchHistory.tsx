'use client';
import { useEffect, useState } from 'react';
import { toast } from 'react-hot-toast';
import { supabase } from '@/lib/supabase';
import { easternSuffix } from '@/lib/eastern';

/**
 * A match's setup history for staff: side picks and clears, lineup saves (starters before /
 * after), subs, home swaps, with who did each (/api/matches/[id]/history, match_setup_log).
 * Opened from the Match setup card's Manage menu while the match is open, and from the page's
 * Manage match menu at any time, so a dispute can be settled after the result is in.
 */
interface HistoryRow { id: string; at: string; by: string; action: string; squad: string | null; detail: Record<string, any> }
type State = 'loading' | { pending: boolean; rows: HistoryRow[] };

const sideName = (s: string | null) => (s === 'titan' ? 'Titan' : s === 'collective' ? 'Collective' : s || '');

export function describeHistory(r: HistoryRow): string {
  const d = r.detail || {};
  switch (r.action) {
    case 'side_set': return `${d.home || r.squad || 'Home'} side: ${sideName(d.side)}${d.was && d.was !== d.side ? ` (was ${sideName(d.was)})` : ''}${d.via ? ` · via ${d.via}` : ''}`;
    case 'side_cleared': return `Side cleared${d.was ? ` (was ${sideName(d.was)})` : ''}`;
    case 'lineup_saved': {
      const after: string[] = d.after?.starting || [];
      const before: string[] | null = d.before?.starting || null;
      if (!before) return `${d.squad || r.squad} lineup saved: ${after.join(', ') || 'nobody'} (${after.length} starting, ${d.after?.bench ?? 0} bench)`;
      const added = after.filter((a) => !before.includes(a)), removed = before.filter((b) => !after.includes(b));
      const change = added.length || removed.length ? `${added.length ? `in: ${added.join(', ')}` : ''}${added.length && removed.length ? ' · ' : ''}${removed.length ? `out: ${removed.join(', ')}` : ''}` : 'same starters';
      return `${d.squad || r.squad} lineup re-saved: ${change} (${after.length} starting, ${d.after?.bench ?? 0} bench)`;
    }
    case 'sub': return `${r.squad || ''} sub: ${d.in} in for ${d.out}`;
    case 'sub_undone': return `${r.squad || ''} sub undone: ${d.in} back out, ${d.out} back in${d.why ? ` (${d.why})` : ''}`;
    case 'home_swapped': return `Home and away swapped: ${d.home_now} is now home (was ${d.was})`;
    default: return `${r.action} ${JSON.stringify(d)}`;
  }
}

export default function MatchHistory({ matchId, onClose }: { matchId: string; onClose: () => void }) {
  const [state, setState] = useState<State>('loading');
  useEffect(() => {
    let gone = false;
    (async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const r = await fetch(`/api/matches/${encodeURIComponent(matchId)}/history`, { headers: session ? { Authorization: `Bearer ${session.access_token}` } : {}, cache: 'no-store' });
        const j = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(j.error || 'Could not load the history');
        if (!gone) setState({ pending: !!j.pending_sql, rows: j.rows || [] });
      } catch (e: any) {
        toast.error(e.message);
        if (!gone) onClose();
      }
    })();
    return () => { gone = true; };
  }, [matchId, onClose]);

  return (
    <div className="rounded-lg bg-white/[0.03] px-3 py-2 text-xs">
      <div className="mb-1 flex items-center justify-between"><span className="font-medium text-[#E6EDF7]">History · who changed what</span><button type="button" onClick={onClose} className="text-[#8B98B0] hover:text-[#E6EDF7]">Close</button></div>
      {state === 'loading' ? <div className="text-[#8B98B0]">Loading…</div>
        : state.pending ? <div className="text-[#F59E0B]">Run add-match-setup-log.sql in Supabase to start recording changes.</div>
        : state.rows.length === 0 ? <div className="text-[#8B98B0]">No changes recorded. Recording started on Nov 2, 2026; earlier changes aren't here.</div>
        : (
          <ul className="space-y-0.5">
            {state.rows.map((r) => {
              const when = new Date(r.at);
              return <li key={r.id} className="text-[#E6EDF7]"><span className="text-[#8B98B0]">{when.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}{easternSuffix(when)} · {r.by}</span> · {describeHistory(r)}</li>;
            })}
          </ul>
        )}
    </div>
  );
}
