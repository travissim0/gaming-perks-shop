'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { toast } from 'react-hot-toast';
import { supabase } from '@/lib/supabase';
import type { LeagueInfo, LeagueSeason } from '@/lib/leagues';
import { normalizeRules, weekStart, weekEnd } from '@/lib/scoring';
import type { TeamRef } from '@/lib/schedule';
import type { Fixture } from '@/app/api/league/schedule/route';
import { localDateTimeToIso } from '@/lib/schedule';
import { Chip } from '@/components/ctf/AdminBits';
import { inputCls, labelCls, btnPrimary, btnQuiet, btnDanger } from '@/components/ctf/FormBits';

/**
 * Free-scheduled matches on the schedule page. Captains and co-captains
 * propose an FS match against another squad; the other side accepts or
 * declines. Caps are enforced by the API (and previewed here).
 */
export default function FsProposals({
  league, season, teams, fixtures, mySquads, isStaff, onChanged,
}: {
  league: LeagueInfo;
  season: LeagueSeason;
  teams: TeamRef[];
  fixtures: Fixture[];
  mySquads: Set<string>;
  isStaff: boolean;
  onChanged: () => void;
}) {
  const rules = useMemo(() => normalizeRules(season.scoring_rules), [season]);
  const [leadOf, setLeadOf] = useState<Set<string>>(new Set());
  const [opponent, setOpponent] = useState('');
  const [date, setDate] = useState('');
  const [time, setTime] = useState('20:00');
  const [busy, setBusy] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  // Which of my squads do I lead (captain / co-captain)?
  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { setLeadOf(new Set()); return; }
      const ids = teams.map((t) => t.id).filter((id) => mySquads.has(id));
      if (ids.length === 0) { setLeadOf(new Set()); return; }
      const [{ data: sq }, { data: mem }] = await Promise.all([
        supabase.from('squads').select('id, captain_id').in('id', ids),
        supabase.from('squad_members').select('squad_id, role').in('squad_id', ids).eq('player_id', session.user.id).eq('status', 'active'),
      ]);
      const lead = new Set<string>();
      (sq || []).forEach((s: any) => { if (s.captain_id === session.user.id) lead.add(s.id); });
      (mem || []).forEach((m: any) => { if (m.role === 'captain' || m.role === 'co_captain') lead.add(m.squad_id); });
      setLeadOf(lead);
    })();
  }, [teams, mySquads]);

  if (!rules.fs.enabled) return null;

  const mySquad = teams.find((t) => leadOf.has(t.id)) || null;
  const fs = fixtures.filter((f) => f.stage === 'fs');
  const pendingForMe = fs.filter((f) => f.fs_status === 'pending' && f.squad_b_id && leadOf.has(f.squad_b_id));
  const myPending = fs.filter((f) => f.fs_status === 'pending' && f.squad_a_id && leadOf.has(f.squad_a_id));
  const thisWeek = weekStart(new Date());
  const weekLabel = (ws: string) => {
    const [y, m, d] = ws.split('-').map(Number);
    const a = new Date(y, m - 1, d);
    const [y2, m2, d2] = weekEnd(ws).split('-').map(Number);
    const b = new Date(y2, m2 - 1, d2);
    return `${a.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} – ${b.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`;
  };
  const usedThisWeek = mySquad ? fs.filter((f) => f.fs_status !== 'declined' && f.fs_status !== 'cancelled' && f.fs_week_start === thisWeek && (f.squad_a_id === mySquad.id || f.squad_b_id === mySquad.id)).length : 0;

  const call = async (body: Record<string, unknown>, label: string, key: string) => {
    setBusy(key);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Sign in first');
      const res = await fetch('/api/league/fs', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` }, body: JSON.stringify(body) });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || 'Request failed');
      toast.success(label);
      onChanged();
      return true;
    } catch (e: any) {
      toast.error(e.message);
      return false;
    } finally {
      setBusy(null);
    }
  };

  const propose = async () => {
    if (!mySquad || !opponent || !date || !time) return;
    const ok = await call({ action: 'propose', league: league.slug, season: season.season_number, my_squad_id: mySquad.id, opponent_squad_id: opponent, scheduled_at: localDateTimeToIso(date, time) }, `FS match proposed to ${teams.find((t) => t.id === opponent)?.name || 'them'}`, 'propose');
    if (ok) { setOpponent(''); setDate(''); setOpen(false); }
  };

  const nothingToShow = !mySquad && pendingForMe.length === 0 && myPending.length === 0 && !isStaff;
  if (nothingToShow) return null;

  return (
    <section className="rounded-xl bg-[#131A2B]">
      <div className="px-4 py-3 flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.06]">
        <div>
          <h2 className="font-display text-lg text-[#E6EDF7]">Free scheduled</h2>
          <div className="text-xs text-[#8B98B0]">
            Optional matches two captains agree to. Worth fewer points, but every one counts.
            {' '}Caps: {rules.fs.per_week} per week (Mon–Sun), {rules.fs.per_opponent_week} vs the same squad per week, {rules.fs.per_opponent_season} vs the same squad per season.
            {rules.fs.needs_verification && ' Needs a ref or a recording to count.'}
          </div>
        </div>
        {mySquad && (
          <div className="flex items-center gap-3">
            <span className="text-xs text-[#8B98B0]">{mySquad.tag || mySquad.name} · <span className={usedThisWeek >= rules.fs.per_week ? 'text-[#F87171]' : 'text-[#E6EDF7]'}>{usedThisWeek}</span> of {rules.fs.per_week} this week</span>
            <button type="button" onClick={() => setOpen((o) => !o)} className={btnPrimary}>{open ? 'Close' : 'Propose an FS match'}</button>
          </div>
        )}
      </div>

      {open && mySquad && (
        <div className="px-4 py-3 border-b border-white/[0.06] flex flex-wrap items-end gap-3">
          <label className="block">
            <span className={labelCls}>Opponent</span>
            <select value={opponent} onChange={(e) => setOpponent(e.target.value)} className={inputCls} style={{ colorScheme: 'dark' }}>
              <option value="">Pick a squad</option>
              {teams.filter((t) => t.id !== mySquad.id).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </label>
          <label className="block"><span className={labelCls}>Date</span><input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={inputCls} style={{ colorScheme: 'dark' }} /></label>
          <label className="block"><span className={labelCls}>Time (your zone)</span><input type="time" value={time} onChange={(e) => setTime(e.target.value)} className={inputCls} style={{ colorScheme: 'dark' }} /></label>
          <button type="button" onClick={propose} disabled={!opponent || !date || !time || busy !== null} className={btnPrimary}>{busy === 'propose' ? 'Sending…' : 'Send proposal'}</button>
          <span className="text-[11px] text-[#8B98B0]">You are home and pick the side. Their captain gets an Accept button here.</span>
        </div>
      )}

      {(pendingForMe.length > 0 || myPending.length > 0 || (isStaff && fs.some((f) => f.fs_status === 'pending'))) && (
        <ul className="divide-y divide-white/[0.06]">
          {fs.filter((f) => f.fs_status === 'pending').map((f) => {
            const forMe = !!f.squad_b_id && leadOf.has(f.squad_b_id);
            const mine = !!f.squad_a_id && leadOf.has(f.squad_a_id);
            if (!forMe && !mine && !isStaff) return null;
            const when = new Date(f.scheduled_at);
            return (
              <li key={f.id} className="flex flex-wrap items-center gap-3 px-4 py-2.5 text-sm">
                <span className="rounded bg-[#F59E0B]/15 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-[#F59E0B]">Pending</span>
                <span className="min-w-0 flex-1 text-[#E6EDF7]">
                  {f.squad_b_name} <span className="text-[#8B98B0]">vs</span> {f.squad_a_name} <span className="text-[10px] uppercase tracking-wide text-[#F59E0B]/80">home</span>
                  <span className="ml-2 text-xs text-[#8B98B0]">{when.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })} · {when.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}{f.fs_week_start ? ` · week of ${weekLabel(f.fs_week_start)}` : ''}</span>
                </span>
                {forMe || isStaff ? (
                  <span className="flex gap-2">
                    <button type="button" onClick={() => call({ action: 'decline', id: f.id }, 'Declined', f.id)} disabled={busy !== null} className={btnDanger}>Decline</button>
                    <button type="button" onClick={() => call({ action: 'accept', id: f.id }, 'FS match accepted', f.id)} disabled={busy !== null} className={btnPrimary}>Accept</button>
                  </span>
                ) : mine ? (
                  <span className="flex items-center gap-2">
                    <span className="text-xs text-[#8B98B0]">Waiting on {f.squad_b_name}</span>
                    <button type="button" onClick={() => call({ action: 'cancel', id: f.id }, 'Proposal cancelled', f.id)} disabled={busy !== null} className={btnQuiet}>Cancel</button>
                  </span>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
      {fs.length === 0 && (
        <p className="px-4 py-3 text-xs text-[#8B98B0]">No FS matches yet this season.{mySquad ? ' Propose one above.' : ''} Accepted ones appear in the schedule marked FS. <Link href="/rules" className="text-[#22D3EE]">Rules</Link></p>
      )}
    </section>
  );
}
