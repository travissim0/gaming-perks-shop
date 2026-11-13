'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import { winnerOf, playByLabel } from '@/lib/schedule';
import { bothTimes } from '@/lib/eastern';
import type { StandingRow } from '@/lib/leagues';
import type { Fixture } from '@/app/api/league/schedule/route';

/**
 * The Page playoff at a glance (4 teams): Game A (1 v 2), Game B (3 v 4), Game C (loser of A v
 * winner of B, same night) and the Championship (winner of A v winner of C, one game).
 *
 * Games C and the Championship only become fixtures once the results before them are in, so the
 * fixture list alone shows two games on the first night and no sign of the rest. This card always
 * shows all four, with "Loser of Game A" style slots until a result fills them.
 *
 * Shown once Game A or Game B exists (the staff tool names them in the fixture title); nothing for
 * a season with no playoffs yet or a plain single-elimination bracket. Pass `fixtures` when the
 * page already has them; otherwise the card loads the season's schedule itself.
 */

type Slot = { id: string | null; name: string; tag: string | null; seed: number | null; placeholder?: boolean };
type Row = {
  key: 'A' | 'B' | 'C' | 'F';
  label: string;
  note: string;
  fixture: Fixture | undefined;
  /** Away first, home second, as everywhere on the site. */
  away: Slot;
  home: Slot;
  /** Where the game stands when it is not on the schedule yet. */
  pending: string;
};

const labelOf = (f: Fixture) => f.title.split(' · ')[1] || '';
const dayLabel = (iso: string) => new Date(iso).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
const dateOnly = (ymd: string) => {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
};

export default function PlayoffCard({
  leagueSlug,
  seasonNumber,
  fixtures: given,
  standings,
  championshipDate,
  scheduleHref,
}: {
  leagueSlug?: string;
  seasonNumber?: number;
  /** The season's fixtures, when the page has them already. */
  fixtures?: Fixture[];
  standings: StandingRow[];
  /** The season's last day (YYYY-MM-DD), shown as the planned Championship date until that game is scheduled. */
  championshipDate?: string | null;
  /** Adds a "Full schedule" link in the header (the league page). */
  scheduleHref?: string;
}) {
  const [loaded, setLoaded] = useState<Fixture[] | null>(null);
  useEffect(() => {
    if (given || !leagueSlug || !seasonNumber) return;
    let cancelled = false;
    fetch(`/api/league/schedule?league=${encodeURIComponent(leagueSlug)}&season=${seasonNumber}`, { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => { if (!cancelled) setLoaded(Array.isArray(j?.fixtures) ? j.fixtures : []); })
      .catch(() => { if (!cancelled) setLoaded([]); });
    return () => { cancelled = true; };
  }, [given, leagueSlug, seasonNumber]);

  const fixtures = given || loaded || [];
  const playoffs = fixtures.filter((f) => f.stage === 'playoff' && f.status !== 'cancelled');
  const game = (label: string) => playoffs.find((f) => labelOf(f) === label);
  const A = game('Game A'), B = game('Game B'), C = game('Game C'), F = game('Championship');
  if (!A && !B) return null;

  const seedOf = (id: string | null) => { const i = id ? standings.findIndex((s) => s.squad_id === id) : -1; return i < 0 ? null : i + 1; };
  const side = (f: Fixture, s: 'a' | 'b'): Slot => {
    const id = s === 'a' ? f.squad_a_id : f.squad_b_id;
    return { id, name: (s === 'a' ? f.squad_a_name : f.squad_b_name) || '?', tag: s === 'a' ? f.squad_a_tag : f.squad_b_tag, seed: seedOf(id) };
  };
  const open = (name: string): Slot => ({ id: null, name, tag: null, seed: null, placeholder: true });
  const won = (f: Fixture | undefined): Slot | null => { const w = f ? winnerOf(f.result) : null; return f && w ? side(f, w) : null; };
  const lost = (f: Fixture | undefined): Slot | null => { const w = f ? winnerOf(f.result) : null; return f && w ? side(f, w === 'a' ? 'b' : 'a') : null; };
  // [away, home] for a game not on the schedule yet. The higher seed is home in every game; while a
  // slot is still open, the first one passed is the side that will be (loser of A outranks winner of B).
  const order = (x: Slot, y: Slot): [Slot, Slot] => (x.seed != null && y.seed != null && y.seed < x.seed ? [x, y] : [y, x]);

  const fromFixture = (f: Fixture): [Slot, Slot] => [side(f, 'b'), side(f, 'a')];
  const cSlots: [Slot, Slot] = C ? fromFixture(C) : order(lost(A) || open('Loser of Game A'), won(B) || open('Winner of Game B'));
  const fSlots: [Slot, Slot] = F ? fromFixture(F) : order(won(A) || open('Winner of Game A'), won(C) || open('Winner of Game C'));
  const abSlots = (f: Fixture | undefined, hi: number, lo: number): [Slot, Slot] => {
    if (f) return fromFixture(f);
    const s = (n: number): Slot => { const r = standings[n - 1]; return r ? { id: r.squad_id, name: r.squad_name, tag: r.squad_tag, seed: n } : open(`Seed ${n}`); };
    return [s(lo), s(hi)];
  };

  const rows: Row[] = [
    { key: 'A', label: 'Game A', note: 'Winner goes straight to the Championship', fixture: A, away: abSlots(A, 1, 2)[0], home: abSlots(A, 1, 2)[1], pending: 'Not scheduled yet' },
    { key: 'B', label: 'Game B', note: 'Loser is out in 4th', fixture: B, away: abSlots(B, 3, 4)[0], home: abSlots(B, 3, 4)[1], pending: 'Not scheduled yet' },
    { key: 'C', label: 'Game C', note: 'For the last Championship spot · loser finishes 3rd', fixture: C, away: cSlots[0], home: cSlots[1], pending: 'Same night, once Games A and B are final' },
    { key: 'F', label: 'Championship', note: 'One game for the title', fixture: F, away: fSlots[0], home: fSlots[1], pending: championshipDate ? `Planned for ${dateOnly(championshipDate)}` : 'After Game C' },
  ];
  const champion = won(F);

  const when = (r: Row) => {
    const f = r.fixture;
    if (!f) return <span className="text-[#8B98B0]">{r.pending}</span>;
    if (f.result) return <span className="text-[#8B98B0]">Final · {dayLabel(f.result.played_at)}</span>;
    if (f.status === 'in_progress') return <span className="inline-flex items-center gap-1.5 text-[#34D399]"><span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse" />Live now</span>;
    if (f.time_tbd) return <span className="text-[#E6EDF7]">Time TBD · {playByLabel(f.scheduled_at)}{r.key === 'C' ? ' · after Games A and B' : ''}</span>;
    return <span className="text-[#E6EDF7]">{dayLabel(f.scheduled_at)} · {bothTimes(f.scheduled_at)}</span>;
  };

  const team = (s: Slot, r: Row, isHome: boolean) => {
    const w = r.fixture ? winnerOf(r.fixture.result) : null;
    const isWinner = !!w && !!s.id && s.id === (w === 'a' ? r.fixture!.squad_a_id : r.fixture!.squad_b_id);
    const decided = !!w;
    // Who is home is only settled once both sides are known: a higher seed may still come through Game C.
    const homeKnown = !!r.fixture || (!r.away.placeholder && !r.home.placeholder);
    return (
      <span className={`inline-flex min-w-0 items-center gap-1.5 ${s.placeholder ? 'text-[#8B98B0] italic' : decided && !isWinner ? 'text-[#8B98B0]' : 'text-[#E6EDF7]'}`}>
        {s.seed != null && <span className="shrink-0 text-[11px] tabular-nums text-[#8B98B0]">#{s.seed}</span>}
        <span className={`truncate ${isWinner ? 'font-medium' : ''}`}>{s.name}</span>
        {isHome && homeKnown && !s.placeholder && <span className="shrink-0 text-[10px] uppercase tracking-wide text-[#F59E0B]/80">home</span>}
        {isWinner && <span className="shrink-0 rounded bg-[#34D399]/15 px-1 text-[10px] font-medium uppercase tracking-wide text-[#34D399]">Won</span>}
      </span>
    );
  };

  return (
    <section className="rounded-xl overflow-hidden bg-[#131A2B] ring-1 ring-[#F59E0B]/25">
      <div className="px-4 py-2.5 flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <h3 className="font-display text-lg text-[#E6EDF7]">Playoffs</h3>
        <div className="flex items-center gap-3">
          {champion
            ? <span className="rounded bg-[#F59E0B]/15 px-2 py-0.5 text-xs font-medium text-[#F59E0B]">Champion · {champion.name}</span>
            : <span className="text-[11px] text-[#8B98B0]">Top two seeds get two shots at the final · higher seed is home</span>}
          {scheduleHref && (
            <Link href={scheduleHref} className="inline-flex items-center gap-1 text-xs text-[#8B98B0] hover:text-[#22D3EE] transition-colors">
              Full schedule <ChevronRight className="w-3.5 h-3.5" aria-hidden="true" />
            </Link>
          )}
        </div>
      </div>
      <ul className="p-3 pt-0 grid grid-cols-1 md:grid-cols-2 gap-2">
        {rows.map((r) => {
          const body = (
            <>
              <div className="flex items-center justify-between gap-2">
                <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide ${r.key === 'F' ? 'bg-[#F59E0B]/15 text-[#F59E0B]' : 'bg-[#22D3EE]/15 text-[#22D3EE]'}`}>{r.label}</span>
                <span className="text-[11px] text-right">{when(r)}</span>
              </div>
              <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm">
                {team(r.away, r, false)}
                <span className="text-[#8B98B0]">vs</span>
                {team(r.home, r, true)}
              </div>
              <div className="mt-1 text-[11px] text-[#8B98B0]">{r.note}</div>
            </>
          );
          return (
            <li key={r.key}>
              {r.fixture
                ? <Link href={`/matches/${r.fixture.id}`} className="block h-full rounded-md bg-[#1B2438] px-3 py-2 hover:bg-[#222d45] transition-colors">{body}</Link>
                : <div className="h-full rounded-md bg-[#1B2438]/60 px-3 py-2">{body}</div>}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
