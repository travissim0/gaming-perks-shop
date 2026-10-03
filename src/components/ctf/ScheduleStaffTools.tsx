'use client';

import { useEffect, useMemo, useState } from 'react';
import { toast } from 'react-hot-toast';
import { supabase } from '@/lib/supabase';
import type { LeagueInfo, LeagueSeason, StandingRow } from '@/lib/leagues';
import { roundRobin, seedBracket, playoffRoundLabel, localDateTimeToIso, playByIso, type TeamRef } from '@/lib/schedule';
import { leagueDate } from '@/lib/scoring';
import type { Fixture } from '@/app/api/league/schedule/route';

type Tab = 'add' | 'season' | 'playoffs';

const inputCls =
  'w-full bg-[#0B0F1A] border border-white/10 rounded-md px-3 py-2 text-sm text-[#E6EDF7] focus:border-[#22D3EE] focus:outline-none';
const labelCls = 'block text-[11px] uppercase tracking-wide text-[#8B98B0] mb-1';
const btnPrimary = 'px-3.5 py-2 rounded-md text-sm font-medium bg-[#22D3EE] text-[#0B0F1A] hover:bg-[#67E8F9] disabled:opacity-50 transition-colors';
const btnQuiet = 'px-3 py-2 rounded-md text-sm bg-white/5 text-[#E6EDF7] hover:bg-white/10 transition-colors';

const todayIso = () => new Date().toISOString().slice(0, 10);

/** "Time TBD" tick box: the captains haven't agreed a time, so only a play-by date is picked. */
function TbdToggle({ checked, onChange, label = 'Time TBD' }: { checked: boolean; onChange: (v: boolean) => void; label?: string }) {
  return (
    <label className="inline-flex items-center gap-1.5 text-xs text-[#E6EDF7] cursor-pointer select-none" title="The captains haven’t agreed a time yet. Lineups stay open and no arena opens until a time is set.">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="accent-[#22D3EE]" />
      {label}
    </label>
  );
}

async function api(method: 'POST' | 'PATCH' | 'DELETE', body?: unknown, query = '') {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Not signed in');
  const res = await fetch(`/api/league/schedule${query}`, {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || `Request failed (${res.status})`);
  return json;
}

export { api as scheduleApi };

/**
 * Staff tools for the schedule page: add one match, generate a round-robin
 * regular season, or seed/advance single-elimination playoffs.
 */
export default function ScheduleStaffTools({
  league,
  season,
  teams,
  fixtures,
  standings,
  onChanged,
}: {
  league: LeagueInfo;
  season: LeagueSeason;
  teams: TeamRef[];
  fixtures: Fixture[];
  standings: StandingRow[];
  onChanged: () => void;
}) {
  const [open, setOpen] = useState(true);
  const [tab, setTab] = useState<Tab>(fixtures.length === 0 ? 'season' : 'add');
  const [busy, setBusy] = useState(false);

  const regular = fixtures.filter((f) => f.stage === 'regular');
  const playoffs = fixtures.filter((f) => f.stage === 'playoff');
  const lastWeek = fixtures.reduce((n, f) => Math.max(n, f.week || 0), 0);

  // ── Add one ─────────────────────────────────────────────────────────
  const [addWeek, setAddWeek] = useState(String(lastWeek || 1));
  const [addA, setAddA] = useState('');
  const [addB, setAddB] = useState('');
  const [addDate, setAddDate] = useState(todayIso());
  const [addTime, setAddTime] = useState('20:00');
  const [addTbd, setAddTbd] = useState(false);
  const [addStage, setAddStage] = useState<'regular' | 'playoff'>('regular');

  const submitAdd = async () => {
    setBusy(true);
    try {
      await api('POST', {
        league: league.slug,
        season: season.season_number,
        week: Number(addWeek),
        stage: addStage,
        playoff_round: addStage === 'playoff' ? (playoffs.reduce((n, f) => Math.max(n, f.playoff_round || 0), 0) || 1) : undefined,
        squad_a_id: addA,
        squad_b_id: addB,
        scheduled_at: addTbd ? playByIso(addDate) : localDateTimeToIso(addDate, addTime),
        ...(addTbd ? { time_tbd: true } : {}),
      });
      toast.success(addTbd ? 'Match added · time TBD' : 'Match added');
      setAddA(''); setAddB('');
      onChanged();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setBusy(false);
    }
  };

  // ── Regular season generator ────────────────────────────────────────
  const [weeks, setWeeks] = useState(String(Math.max(1, teams.length - 1)));
  const [firstDate, setFirstDate] = useState(season.start_date || todayIso());
  const [matchTime, setMatchTime] = useState('20:00');
  const [seasonTbd, setSeasonTbd] = useState(false);
  const preview = useMemo(() => {
    const w = Number(weeks);
    if (!w || teams.length < 2) return { pairings: [], byes: new Map() };
    return roundRobin(teams, Math.min(w, 52));
  }, [teams, weeks]);

  // Breaks: match days to skip (holidays). Every week after a break shifts by seven days.
  const [breaks, setBreaks] = useState<{ date: string; label: string }[]>([]);
  const [breakDate, setBreakDate] = useState('');
  const [breakLabel, setBreakLabel] = useState('');
  const addBreak = () => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(breakDate)) return;
    if (breaks.some((b) => b.date === breakDate)) { setBreakDate(''); setBreakLabel(''); return; }
    setBreaks((b) => [...b, { date: breakDate, label: breakLabel.trim() }].sort((x, y) => x.date.localeCompare(y.date)));
    setBreakDate(''); setBreakLabel('');
  };
  const plusDays = (ymd: string, n: number) => {
    const [y, m, d] = ymd.split('-').map(Number);
    const t = new Date(y, m - 1, d + n);
    return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`;
  };
  /** Calendar slots in order: each week's match day, with any breaks that fall on a match day between them. */
  const slots = useMemo(() => {
    const out: ({ kind: 'week'; week: number; date: string } | { kind: 'break'; date: string; label: string })[] = [];
    if (!/^\d{4}-\d{2}-\d{2}$/.test(firstDate)) return out;
    const total = Math.min(Number(weeks) || 0, 52);
    const skip = new Map(breaks.map((b) => [b.date, b.label]));
    let week = 1;
    for (let k = 0; week <= total && k < total + breaks.length + 1; k++) {
      const date = plusDays(firstDate, k * 7);
      if (skip.has(date)) { out.push({ kind: 'break', date, label: skip.get(date) || 'Break' }); continue; }
      out.push({ kind: 'week', week, date });
      week++;
    }
    return out;
  }, [firstDate, weeks, breaks]);
  const weekDate = (w: number) => slots.find((s) => s.kind === 'week' && s.week === w)?.date || plusDays(firstDate, (w - 1) * 7);
  const fmtDay = (ymd: string) => { const [y, m, d] = ymd.split('-').map(Number); return new Date(y, m - 1, d).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' }); };

  /**
   * The /league strip and the FS cutoff read the season's milestone dates. When
   * a date is still blank, the generator fills it in from what it just created.
   */
  const setSeasonDateIfBlank = async (field: 'start_date' | 'playoffs_start_on', ymd: string) => {
    if (season[field] || !/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return;
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      await fetch('/api/league/season', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ action: 'season_dates', league_slug: league.slug, season_id: season.id, [field]: ymd }),
      });
      toast.success(field === 'start_date' ? `Season start set to ${ymd}` : `Playoffs start set to ${ymd} · FS closes then`);
    } catch { /* not fatal — staff can set it in CTF management */ }
  };

  const submitSeason = async () => {
    if (preview.pairings.length === 0) return;
    if (regular.length > 0 && !confirm(`${regular.length} regular-season fixtures already exist. Add ${preview.pairings.length} more on top of them?`)) return;
    setBusy(true);
    try {
      const res = await api('POST', {
        league: league.slug,
        season: season.season_number,
        fixtures: preview.pairings.map((p) => ({
          week: p.week,
          stage: 'regular',
          squad_a_id: p.a.id,
          squad_b_id: p.b.id,
          // Breaks push later weeks back, so each week takes its own calendar date.
          scheduled_at: seasonTbd ? playByIso(weekDate(p.week)) : localDateTimeToIso(weekDate(p.week), matchTime),
          ...(seasonTbd ? { time_tbd: true } : {}),
        })),
      });
      toast.success(`Created ${res.count} fixtures`);
      await setSeasonDateIfBlank('start_date', firstDate);
      onChanged();
      setTab('add');
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setBusy(false);
    }
  };

  // ── Playoffs ────────────────────────────────────────────────────────
  const [field, setField] = useState('4');
  const [poDate, setPoDate] = useState(todayIso());
  const [poTime, setPoTime] = useState('20:00');
  const currentRound = playoffs.reduce((n, f) => Math.max(n, f.playoff_round || 0), 0);
  const roundFixtures = playoffs.filter((f) => f.playoff_round === currentRound);
  const roundDone = roundFixtures.length > 0 && roundFixtures.every((f) => f.result);
  const winners: TeamRef[] = roundDone
    ? roundFixtures.map((f) => {
        const aWon = /win/i.test(f.result!.a_result || '') || f.result!.a_score > f.result!.b_score;
        return aWon
          ? { id: f.squad_a_id!, name: f.squad_a_name || '?', tag: f.squad_a_tag }
          : { id: f.squad_b_id!, name: f.squad_b_name || '?', tag: f.squad_b_tag };
      })
    : [];
  const seeded: TeamRef[] = standings
    .filter((s) => teams.some((t) => t.id === s.squad_id))
    .map((s) => ({ id: s.squad_id, name: s.squad_name, tag: s.squad_tag }));
  const fieldSize = Math.min(Number(field), seeded.length);
  const canSeed = currentRound === 0 && fieldSize >= 2 && (fieldSize & (fieldSize - 1)) === 0;
  // Seed number by squad (1 = top of the standings). Higher seed is home in every round.
  const seedOf = (id: string) => { const i = seeded.findIndex((s) => s.id === id); return i < 0 ? 999 : i + 1; };
  const round1Pairs: [TeamRef, TeamRef][] = canSeed ? seedBracket(seeded.slice(0, fieldSize)) : [];
  const nextPairs: [TeamRef, TeamRef][] = [];
  for (let i = 0; i + 1 < winners.length; i += 2) {
    const [x, y] = [winners[i], winners[i + 1]];
    nextPairs.push(seedOf(x.id) <= seedOf(y.id) ? [x, y] : [y, x]);
  }
  const PairList = ({ pairs }: { pairs: [TeamRef, TeamRef][] }) => (
    <ul className="text-sm text-[#E6EDF7] grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-0.5">
      {pairs.map(([a, b], i) => (
        <li key={i}>
          <span className="text-[#8B98B0] tabular-nums">{seedOf(b.id)}.</span> {b.name}
          <span className="text-[#8B98B0]"> vs </span>
          <span className="text-[#8B98B0] tabular-nums">{seedOf(a.id)}.</span> {a.name} <span className="text-[10px] uppercase tracking-wide text-[#F59E0B]/80">home</span>
        </li>
      ))}
    </ul>
  );

  const submitPlayoffs = async (pairs: [TeamRef, TeamRef][], round: number, label: string | string[]) => {
    setBusy(true);
    try {
      const when = localDateTimeToIso(poDate, poTime);
      const res = await api('POST', {
        league: league.slug,
        season: season.season_number,
        fixtures: pairs.map(([a, b], i) => ({
          week: lastWeek + 1,
          stage: 'playoff',
          playoff_round: round,
          label: Array.isArray(label) ? label[i] : label,
          squad_a_id: a.id,
          squad_b_id: b.id,
          scheduled_at: when,
        })),
      });
      toast.success(`Created ${res.count} playoff ${res.count === 1 ? 'match' : 'matches'} · ${Array.isArray(label) ? label.join(' & ') : label}`);
      if (round === 1) await setSeasonDateIfBlank('playoffs_start_on', poDate);
      onChanged();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setBusy(false);
    }
  };

  // ── Page playoff (4 teams) ──────────────────────────────────────────
  // Game A: 1 v 2 and Game B: 3 v 4 on the same night. Game C: loser of A v winner of B, same
  // night, for the last spot. Championship: winner of A v winner of C, a week later. The top two
  // seeds get two shots at the final; the bottom two must win twice in one night. The higher seed
  // is home in every game. Each game is a fixture whose title carries its label.
  const [poFormat, setPoFormat] = useState<'page' | 'bracket'>(teams.length === 4 ? 'page' : 'bracket');
  const gameLabel = (f: Fixture) => f.title.split(' · ')[1] || '';
  const teamRef = (f: Fixture, side: 'a' | 'b'): TeamRef =>
    side === 'a' ? { id: f.squad_a_id!, name: f.squad_a_name || '?', tag: f.squad_a_tag } : { id: f.squad_b_id!, name: f.squad_b_name || '?', tag: f.squad_b_tag };
  const aWonIt = (f: Fixture) => !!f.result && (/win/i.test(f.result.a_result || '') || f.result.a_score > f.result.b_score);
  const winnerOf = (f: Fixture) => teamRef(f, aWonIt(f) ? 'a' : 'b');
  const loserOf = (f: Fixture) => teamRef(f, aWonIt(f) ? 'b' : 'a');
  const bySeed = (x: TeamRef, y: TeamRef): [TeamRef, TeamRef] => (seedOf(x.id) <= seedOf(y.id) ? [x, y] : [y, x]);
  const page = {
    A: playoffs.find((f) => gameLabel(f) === 'Game A'),
    B: playoffs.find((f) => gameLabel(f) === 'Game B'),
    C: playoffs.find((f) => gameLabel(f) === 'Game C'),
    F: playoffs.find((f) => gameLabel(f) === 'Championship'),
  };
  const pageStep: 'seed' | 'gameC' | 'final' | 'waitAB' | 'waitC' | 'waitF' | 'done' =
    !page.A || !page.B ? 'seed'
      : !page.A.result || !page.B.result ? 'waitAB'
        : !page.C ? 'gameC'
          : !page.C.result ? 'waitC'
            : !page.F ? 'final'
              : !page.F.result ? 'waitF' : 'done';
  const pageSeedPairs: [TeamRef, TeamRef][] = seeded.length >= 4 ? [[seeded[0], seeded[1]], [seeded[2], seeded[3]]] : [];
  const pageCPair: [TeamRef, TeamRef] | null = pageStep === 'gameC' ? bySeed(loserOf(page.A!), winnerOf(page.B!)) : null;
  const pageFPair: [TeamRef, TeamRef] | null = pageStep === 'final' ? bySeed(winnerOf(page.A!), winnerOf(page.C!)) : null;
  // Once playoff fixtures exist, their labels say which format is in use.
  const playoffFormat: 'page' | 'bracket' = currentRound > 0 ? (page.A ? 'page' : 'bracket') : poFormat;
  // Game C defaults to the same night as A and B; the Championship to a week later.
  useEffect(() => {
    if (pageStep === 'gameC' && page.A) {
      const d = new Date(page.A.scheduled_at);
      setPoDate(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`);
    }
    if (pageStep === 'final' && page.C) {
      const d = new Date(page.C.scheduled_at); d.setDate(d.getDate() + 7);
      setPoDate(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageStep]);

  const TeamSelect = ({ value, onChange, exclude }: { value: string; onChange: (v: string) => void; exclude?: string }) => (
    <select value={value} onChange={(e) => onChange(e.target.value)} className={inputCls} style={{ colorScheme: 'dark' }}>
      <option value="">Pick a team…</option>
      {teams.filter((t) => t.id !== exclude).map((t) => (
        <option key={t.id} value={t.id}>{t.tag ? `[${t.tag}] ` : ''}{t.name}</option>
      ))}
    </select>
  );

  return (
    <section className="rounded-xl bg-[#131A2B] ring-1 ring-[#F59E0B]/30 overflow-hidden">
      <button type="button" onClick={() => setOpen((v) => !v)} className="w-full px-4 py-3 flex items-center justify-between text-left">
        <span className="font-display text-lg text-[#E6EDF7]">
          Staff · schedule tools <span className="text-xs font-body text-[#8B98B0] ml-2">{teams.length} teams · {fixtures.length} fixtures</span>
        </span>
        <span className="text-xs text-[#8B98B0]">{open ? 'Hide' : 'Show'}</span>
      </button>

      {open && (
        <div className="px-4 pb-4">
          <div className="flex gap-1 mb-4">
            {([['add', 'Add a match'], ['season', 'Generate regular season'], ['playoffs', 'Playoffs']] as [Tab, string][]).map(([k, label]) => (
              <button
                key={k}
                type="button"
                onClick={() => setTab(k)}
                className={`px-3 py-1.5 rounded-md text-sm transition-colors ${tab === k ? 'bg-[#F59E0B]/15 text-[#F59E0B]' : 'text-[#8B98B0] hover:text-[#E6EDF7] hover:bg-white/5'}`}
              >
                {label}
              </button>
            ))}
          </div>

          {teams.length < 2 && (
            <p className="text-sm text-[#8B98B0] mb-3">
              {league.format === 'draft'
                ? 'Add squads to the draft first — the schedule is built from the drafted teams.'
                : 'At least two active squads are needed before scheduling.'}
            </p>
          )}

          {tab === 'add' && (
            <div className="grid grid-cols-2 md:grid-cols-6 gap-3 items-end">
              <div>
                <label className={labelCls}>Stage</label>
                <select value={addStage} onChange={(e) => setAddStage(e.target.value as any)} className={inputCls} style={{ colorScheme: 'dark' }}>
                  <option value="regular">Regular season</option>
                  <option value="playoff">Playoffs</option>
                </select>
              </div>
              <div>
                <label className={labelCls}>Week</label>
                <input type="number" min={1} max={52} value={addWeek} onChange={(e) => setAddWeek(e.target.value)} className={inputCls} />
              </div>
              {/* Away first, home second: the order every CTF page and arena name uses. */}
              <div className="col-span-2 md:col-span-1">
                <label className={labelCls}>Away team</label>
                <TeamSelect value={addB} onChange={setAddB} exclude={addA} />
              </div>
              <div className="col-span-2 md:col-span-1">
                <label className={labelCls}>Home team <span className="normal-case tracking-normal text-[#8B98B0]/70">picks the side</span></label>
                <TeamSelect value={addA} onChange={setAddA} exclude={addB} />
              </div>
              <div>
                <label className={labelCls}>{addTbd ? 'Play by' : 'Date'}</label>
                <input type="date" value={addDate} onChange={(e) => setAddDate(e.target.value)} className={inputCls} style={{ colorScheme: 'dark' }} />
              </div>
              <div>
                <label className={labelCls}>Time (your zone)</label>
                {addTbd ? (
                  <div className={`${inputCls} text-[#8B98B0]`}>TBD</div>
                ) : (
                  <input type="time" value={addTime} onChange={(e) => setAddTime(e.target.value)} className={inputCls} style={{ colorScheme: 'dark' }} />
                )}
              </div>
              <div className="col-span-2 md:col-span-6 flex items-center justify-end gap-4">
                <TbdToggle checked={addTbd} onChange={setAddTbd} />
                <button type="button" onClick={submitAdd} disabled={busy || !addA || !addB || !addDate || (!addTbd && !addTime)} className={btnPrimary}>
                  {busy ? 'Adding…' : 'Add match'}
                </button>
              </div>
            </div>
          )}

          {tab === 'season' && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 items-end">
                <div>
                  <label className={labelCls}>Weeks</label>
                  <input type="number" min={1} max={52} value={weeks} onChange={(e) => setWeeks(e.target.value)} className={inputCls} />
                  <div className="text-[11px] text-[#8B98B0] mt-1">
                    {teams.length - 1} weeks = everyone plays everyone once{teams.length % 2 === 1 ? ' (one bye per week)' : ''}. Matches read away vs home, like the arena names; a second cycle flips home and away.
                  </div>
                </div>
                <div>
                  <label className={labelCls}>{seasonTbd ? 'Week 1 play-by date' : 'Week 1 date'}</label>
                  <input type="date" value={firstDate} onChange={(e) => setFirstDate(e.target.value)} className={inputCls} style={{ colorScheme: 'dark' }} />
                </div>
                <div>
                  <label className={labelCls}>Match time (your zone)</label>
                  {seasonTbd ? (
                    <div className={`${inputCls} text-[#8B98B0]`}>TBD</div>
                  ) : (
                    <input type="time" value={matchTime} onChange={(e) => setMatchTime(e.target.value)} className={inputCls} style={{ colorScheme: 'dark' }} />
                  )}
                  <div className="mt-1"><TbdToggle checked={seasonTbd} onChange={setSeasonTbd} label="Times TBD (captains agree each one)" /></div>
                </div>
                <div className="flex justify-end">
                  <button type="button" onClick={submitSeason} disabled={busy || preview.pairings.length === 0 || !firstDate} className={btnPrimary}>
                    {busy ? 'Creating…' : `Create ${preview.pairings.length} fixtures`}
                  </button>
                </div>
              </div>
              {/* Breaks */}
              <div className="rounded-lg bg-[#0B0F1A]/40 p-3">
                <div className={labelCls}>Breaks <span className="normal-case tracking-normal text-[#8B98B0]/70">match days to skip, e.g. Thanksgiving</span></div>
                <div className="flex flex-wrap items-end gap-2">
                  <input type="date" value={breakDate} onChange={(e) => setBreakDate(e.target.value)} className={`${inputCls} w-44`} style={{ colorScheme: 'dark' }} />
                  <input type="text" value={breakLabel} onChange={(e) => setBreakLabel(e.target.value)} placeholder="Label (optional)" className={`${inputCls} w-48`} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addBreak(); } }} />
                  <button type="button" onClick={addBreak} disabled={!breakDate} className={btnQuiet}>Add break</button>
                  {breaks.map((b) => (
                    <span key={b.date} className="inline-flex items-center gap-1.5 rounded-md bg-[#F59E0B]/15 px-2 py-1 text-xs text-[#F59E0B]">
                      {fmtDay(b.date)}{b.label ? ` · ${b.label}` : ''}
                      <button type="button" onClick={() => setBreaks((list) => list.filter((x) => x.date !== b.date))} className="text-[#F59E0B]/70 hover:text-[#F59E0B]" aria-label="Remove break">✕</button>
                    </span>
                  ))}
                </div>
                {breaks.some((b) => !slots.some((s) => s.kind === 'break' && s.date === b.date)) && (
                  <p className="mt-1 text-[11px] text-[#F59E0B]">A break only takes effect when it falls on a match day (the same weekday as week 1, within the season).</p>
                )}
              </div>

              {preview.pairings.length > 0 && (
                <div className="rounded-lg bg-[#0B0F1A]/60 p-3 max-h-72 overflow-y-auto text-sm">
                  {slots.map((s) =>
                    s.kind === 'break' ? (
                      <div key={`b${s.date}`} className="mb-2 rounded-md bg-[#F59E0B]/10 px-2 py-1 text-[11px] uppercase tracking-wide text-[#F59E0B]">
                        Break <span className="ml-2 normal-case tracking-normal">{fmtDay(s.date)}{s.label ? ` · ${s.label}` : ''} · no matches</span>
                      </div>
                    ) : (
                      <div key={`w${s.week}`} className="mb-2 last:mb-0">
                        <div className="text-[11px] uppercase tracking-wide text-[#8B98B0] mb-1">
                          Week {s.week}
                          <span className="ml-2 normal-case tracking-normal">{fmtDay(s.date)}</span>
                          {preview.byes.get(s.week) && <span className="ml-2 normal-case tracking-normal">· bye: {preview.byes.get(s.week)!.name}</span>}
                        </div>
                        <ul className="grid grid-cols-1 sm:grid-cols-2 gap-x-4">
                          {preview.pairings.filter((p) => p.week === s.week).map((p, i) => (
                            <li key={i} className="text-[#E6EDF7]">
                              {p.b.name} <span className="text-[#8B98B0]">vs</span> {p.a.name} <span className="text-[10px] uppercase tracking-wide text-[#F59E0B]/80">home</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    ),
                  )}
                </div>
              )}
              <p className="text-[11px] text-[#8B98B0]">
                {seasonTbd
                  ? 'Every match is created without a time, to be played by that week’s date. Set each time with the edit button on its row once the captains agree.'
                  : 'Every match lands on the same weekday and time, one week apart, skipping any breaks. Move individual matches afterwards with the edit button on each row.'}
              </p>
            </div>
          )}

          {tab === 'playoffs' && (
            <div className="space-y-3">
              {currentRound === 0 && (
                <div className="flex flex-wrap items-center gap-2">
                  <label className={`${labelCls} mb-0`}>Format</label>
                  <select value={poFormat} onChange={(e) => setPoFormat(e.target.value as 'page' | 'bracket')} className={`${inputCls} w-auto`} style={{ colorScheme: 'dark' }}>
                    <option value="page">Page playoff · 4 teams, top two seeds get two shots at the final</option>
                    <option value="bracket">Single elimination bracket</option>
                  </select>
                </div>
              )}
              {playoffFormat === 'page' ? (
                <>
                  {pageStep === 'seed' && (
                    <>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 items-end">
                        <div>
                          <label className={labelCls}>Games A and B date</label>
                          <input type="date" value={poDate} onChange={(e) => setPoDate(e.target.value)} className={inputCls} style={{ colorScheme: 'dark' }} />
                        </div>
                        <div>
                          <label className={labelCls}>Time (your zone)</label>
                          <input type="time" value={poTime} onChange={(e) => setPoTime(e.target.value)} className={inputCls} style={{ colorScheme: 'dark' }} />
                        </div>
                        <div className="md:col-span-2 flex justify-end">
                          <button type="button" disabled={busy || pageSeedPairs.length === 0} onClick={() => submitPlayoffs(pageSeedPairs, 1, ['Game A', 'Game B'])} className={btnPrimary}>
                            {busy ? 'Creating…' : 'Seed Games A and B'}
                          </button>
                        </div>
                      </div>
                      {pageSeedPairs.length === 0 ? (
                        <p className="text-sm text-[#8B98B0]">Seeding uses the standings (RS points). All four teams need a regular-season result first{seeded.length ? ` · ${seeded.length} of 4 in the standings so far` : ''}.</p>
                      ) : (
                        <>
                          <div className="text-[11px] uppercase tracking-wide text-[#8B98B0]">Game A · top two seeds &nbsp;·&nbsp; Game B · bottom two</div>
                          <PairList pairs={pageSeedPairs} />
                          <p className="text-[11px] text-[#8B98B0]">Winner of A goes to the Championship; loser of A gets a second life in Game C against the winner of B, the same night. The higher seed is home and picks the side in every game.</p>
                        </>
                      )}
                    </>
                  )}
                  {pageStep === 'waitAB' && <p className="text-sm text-[#8B98B0]">Games A and B are on the schedule · {[page.A, page.B].filter((f) => f?.result).length}/2 results in. Game C unlocks once both are reported.</p>}
                  {pageStep === 'gameC' && pageCPair && (
                    <>
                      <div className="text-sm text-[#E6EDF7]">Game C · last spot in the final · loser of A vs winner of B</div>
                      <PairList pairs={[pageCPair]} />
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 items-end">
                        <div>
                          <label className={labelCls}>Game C date</label>
                          <input type="date" value={poDate} onChange={(e) => setPoDate(e.target.value)} className={inputCls} style={{ colorScheme: 'dark' }} />
                        </div>
                        <div>
                          <label className={labelCls}>Time (your zone)</label>
                          <input type="time" value={poTime} onChange={(e) => setPoTime(e.target.value)} className={inputCls} style={{ colorScheme: 'dark' }} />
                        </div>
                        <div className="md:col-span-2 flex justify-end">
                          <button type="button" disabled={busy} onClick={() => submitPlayoffs([pageCPair], 2, 'Game C')} className={btnPrimary}>{busy ? 'Creating…' : 'Create Game C'}</button>
                        </div>
                      </div>
                      <p className="text-[11px] text-[#8B98B0]">Same night as A and B by the format; start it at least 30 minutes after both are final.</p>
                    </>
                  )}
                  {pageStep === 'waitC' && <p className="text-sm text-[#8B98B0]">Game C is on the schedule. The Championship unlocks once its result is reported.</p>}
                  {pageStep === 'final' && pageFPair && (
                    <>
                      <div className="text-sm text-[#E6EDF7]">Championship · winner of A vs winner of C</div>
                      <PairList pairs={[pageFPair]} />
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 items-end">
                        <div>
                          <label className={labelCls}>Championship date</label>
                          <input type="date" value={poDate} onChange={(e) => setPoDate(e.target.value)} className={inputCls} style={{ colorScheme: 'dark' }} />
                        </div>
                        <div>
                          <label className={labelCls}>Time (your zone)</label>
                          <input type="time" value={poTime} onChange={(e) => setPoTime(e.target.value)} className={inputCls} style={{ colorScheme: 'dark' }} />
                        </div>
                        <div className="md:col-span-2 flex justify-end">
                          <button type="button" disabled={busy} onClick={() => submitPlayoffs([pageFPair], 3, 'Championship')} className={btnPrimary}>{busy ? 'Creating…' : 'Create Championship'}</button>
                        </div>
                      </div>
                    </>
                  )}
                  {pageStep === 'waitF' && <p className="text-sm text-[#8B98B0]">Championship is on the schedule. One game, one champion.</p>}
                  {pageStep === 'done' && <p className="text-sm text-[#F59E0B]">Championship played. Champion: {winnerOf(page.F!).name}. Record it on the season in the admin season tools.</p>}
                </>
              ) : currentRound === 0 ? (
                <>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 items-end">
                    <div>
                      <label className={labelCls}>Teams that qualify</label>
                      <select value={field} onChange={(e) => setField(e.target.value)} className={inputCls} style={{ colorScheme: 'dark' }}>
                        {[2, 4, 8, 16].filter((n) => n <= Math.max(2, seeded.length)).map((n) => <option key={n} value={n}>Top {n}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className={labelCls}>Round 1 date</label>
                      <input type="date" value={poDate} onChange={(e) => setPoDate(e.target.value)} className={inputCls} style={{ colorScheme: 'dark' }} />
                    </div>
                    <div>
                      <label className={labelCls}>Time (your zone)</label>
                      <input type="time" value={poTime} onChange={(e) => setPoTime(e.target.value)} className={inputCls} style={{ colorScheme: 'dark' }} />
                    </div>
                    <div className="flex justify-end">
                      <button
                        type="button"
                        disabled={busy || !canSeed}
                        onClick={() => submitPlayoffs(round1Pairs, 1, playoffRoundLabel(fieldSize))}
                        className={btnPrimary}
                      >
                        {busy ? 'Creating…' : `Seed ${playoffRoundLabel(fieldSize).toLowerCase()}`}
                      </button>
                    </div>
                  </div>
                  {seeded.length === 0 ? (
                    <p className="text-sm text-[#8B98B0]">Seeding uses the standings. Report regular-season results first.</p>
                  ) : canSeed ? (
                    <>
                      <PairList pairs={round1Pairs} />
                      <p className="text-[11px] text-[#8B98B0]">Seeds come from the standings. The higher seed is home and picks the side, in every round.</p>
                    </>
                  ) : (
                    <p className="text-sm text-[#8B98B0]">Pick a field of 2, 4, 8 or 16 teams.</p>
                  )}
                </>
              ) : (
                <>
                  <div className="text-sm text-[#E6EDF7]">
                    {playoffRoundLabel(roundFixtures.length * 2)} · {roundFixtures.filter((f) => f.result).length}/{roundFixtures.length} results in
                  </div>
                  {roundFixtures.length === 1 && roundDone ? (
                    <p className="text-sm text-[#F59E0B]">Final played. Champion: {winners[0]?.name}. Record it on the season in Supabase or the admin season tools.</p>
                  ) : roundDone ? (
                    <>
                    <PairList pairs={nextPairs} />
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 items-end">
                      <div>
                        <label className={labelCls}>Next round date</label>
                        <input type="date" value={poDate} onChange={(e) => setPoDate(e.target.value)} className={inputCls} style={{ colorScheme: 'dark' }} />
                      </div>
                      <div>
                        <label className={labelCls}>Time (your zone)</label>
                        <input type="time" value={poTime} onChange={(e) => setPoTime(e.target.value)} className={inputCls} style={{ colorScheme: 'dark' }} />
                      </div>
                      <div className="md:col-span-2 flex justify-end">
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => submitPlayoffs(nextPairs, currentRound + 1, playoffRoundLabel(winners.length))}
                          className={btnPrimary}
                        >
                          Create {playoffRoundLabel(winners.length).toLowerCase()}
                        </button>
                      </div>
                    </div>
                    <p className="text-[11px] text-[#8B98B0]">The higher seed is home and picks the side.</p>
                    </>
                  ) : (
                    <p className="text-sm text-[#8B98B0]">The next round unlocks once every result in this round is reported.</p>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      )}
    </section>
  );
}

/** Small inline editor for one fixture (staff). */
export function FixtureEditor({ fixture, teams, onDone }: { fixture: Fixture; teams: TeamRef[]; onDone: () => void }) {
  const local = new Date(fixture.scheduled_at);
  const pad = (n: number) => String(n).padStart(2, '0');
  // A TBD fixture's play-by day is a league-calendar date, not the viewer's.
  const [date, setDate] = useState(fixture.time_tbd ? leagueDate(local) : `${local.getFullYear()}-${pad(local.getMonth() + 1)}-${pad(local.getDate())}`);
  // A TBD fixture's stored time is only its play-by placeholder; offer the usual slot instead.
  const [time, setTime] = useState(fixture.time_tbd ? '20:00' : `${pad(local.getHours())}:${pad(local.getMinutes())}`);
  const [tbd, setTbd] = useState(!!fixture.time_tbd);
  const [week, setWeek] = useState(String(fixture.week || 1));
  const [a, setA] = useState(fixture.squad_a_id || '');
  const [b, setB] = useState(fixture.squad_b_id || '');
  const [busy, setBusy] = useState(false);

  const save = async () => {
    setBusy(true);
    try {
      await api('PATCH', {
        id: fixture.id, week: Number(week), squad_a_id: a, squad_b_id: b,
        scheduled_at: tbd ? playByIso(date) : localDateTimeToIso(date, time),
        // Only sent when it matters, so plain edits still save before add-match-time-tbd.sql has run.
        ...(tbd || fixture.time_tbd ? { time_tbd: tbd } : {}),
      });
      toast.success(fixture.time_tbd && !tbd ? 'Match time set' : 'Match updated');
      onDone();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setBusy(false);
    }
  };
  const remove = async () => {
    if (!confirm('Remove this match from the schedule?')) return;
    setBusy(true);
    try {
      await api('DELETE', undefined, `?id=${encodeURIComponent(fixture.id)}`);
      toast.success('Match removed');
      onDone();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid grid-cols-2 md:grid-cols-6 gap-2 items-end rounded-md bg-[#0B0F1A]/60 p-3 mt-2">
      <div>
        <label className={labelCls}>Week</label>
        <input type="number" min={1} max={52} value={week} onChange={(e) => setWeek(e.target.value)} className={inputCls} />
      </div>
      <div className="col-span-2 md:col-span-1">
        <label className={labelCls}>Away team</label>
        <select value={b} onChange={(e) => setB(e.target.value)} className={inputCls} style={{ colorScheme: 'dark' }}>
          {teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
      </div>
      <div className="col-span-2 md:col-span-1">
        <label className={labelCls}>Home team <button type="button" onClick={() => { setA(b); setB(a); }} className="ml-1 normal-case tracking-normal text-[#22D3EE] hover:text-[#67E8F9]" title="Make the other team home">swap</button></label>
        <select value={a} onChange={(e) => setA(e.target.value)} className={inputCls} style={{ colorScheme: 'dark' }}>
          {teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
      </div>
      <div>
        <label className={labelCls}>{tbd ? 'Play by' : 'Date'}</label>
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={inputCls} style={{ colorScheme: 'dark' }} />
      </div>
      <div>
        <label className={labelCls}>Time</label>
        {tbd ? (
          <div className={`${inputCls} text-[#8B98B0]`}>TBD</div>
        ) : (
          <input type="time" value={time} onChange={(e) => setTime(e.target.value)} className={inputCls} style={{ colorScheme: 'dark' }} />
        )}
      </div>
      <div className="col-span-2 md:col-span-6 flex items-center justify-end gap-2">
        <span className="mr-2"><TbdToggle checked={tbd} onChange={setTbd} /></span>
        <button type="button" onClick={remove} disabled={busy || !!fixture.result} className="px-3 py-2 rounded-md text-sm text-[#F87171] hover:bg-[#F87171]/10 disabled:opacity-40" title={fixture.result ? 'Has a result — unlink it first' : ''}>
          Remove
        </button>
        <button type="button" onClick={onDone} className={btnQuiet}>Cancel</button>
        <button type="button" onClick={save} disabled={busy || a === b} className={btnPrimary}>{busy ? 'Saving…' : 'Save'}</button>
      </div>
    </div>
  );
}
