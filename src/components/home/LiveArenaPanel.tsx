'use client';

import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { CfsText, fitCfs, measureCfs } from '@/components/live/CfsText';
import { FONT_MEDIUM, FONT_SMALL } from '@/lib/live/cfsFonts';
import { classColor } from '@/components/usl-mix/UslMixShell';
import { getClassColor } from '@/utils/classColors';
import type { LiveArenaRow, LiveMix, LivePlayer, LiveResponse, LiveSide, LiveTeam, LiveTicker } from '@/lib/live/types';

/**
 * Live arenas panel (home page right sidebar): one card per arena with people in it, USL and
 * CTF alike, from the zone scripts' minute-by-minute snapshot (/api/live).
 *
 * Drawn the way the retail client draws it, with the retail bitmap fonts (uiart Medium for the
 * list and tickers, Small for the counts) at the client's own 1x size:
 *  - ticker "bubbles": one line each, never wrapped, grey-bordered boxes on black, right-aligned
 *    to the widest, stacked in the upper-left. They sit beside the player list when both fit
 *    the card and above it otherwise (flex-wrap does the choosing).
 *  - player list: its own bordered panel (the retail notepad). "Players: N" centred in green, a double rule, then every team's name centred
 *    in its colour (Titan green, Collective red, spec magenta, np grey) with the member count
 *    right-aligned, and its players one per row - 14px rows at 1x, the spectator S in purple in
 *    the left gutter, aliases in class colours (grey when spectating, dark grey when dead).
 *
 * Countdowns keep running between polls from the snapshot's age.
 */

const POLL_MS = 20_000;
const TICK_MS = 1_000;
const S = 1 as const;                       // integer UI scale (retail pixels -> CSS pixels); 1 = the client's own size

// Retail palette (uiart).
const GREEN = '#40ff40';
const MAGENTA = '#ff50ff';
const PURPLE = '#c060ff';
const YELLOW = '#ffff40';
const CYAN = '#40ffff';
const RED = '#ff4040';
const WHITE = '#ffffff';
const DEAD = '#707070';
const SPEC = '#9c9c9c';
const NP = '#8c8c8c';
const BOX = '#a4a4a4';                       // ticker box border
const RULE_LIGHT = '#8c8c8c';
const RULE_DARK = '#383838';
const BLACK = '#000000';

/** Ticker colour byte -> text colour, as the client draws them. */
const TICKER_COLOURS: Record<number, string> = { 0: GREEN, 1: GREEN, 2: YELLOW, 3: CYAN, 4: RED, 5: WHITE };

const ROW_GAP = 2;                           // retail LIST_ROW_GAP
const GUTTER = 10;                           // marker column (spectator S / captain *) in retail px

function sideColor(side: LiveSide): string {
  if (side === 'T') return GREEN;
  if (side === 'C') return RED;
  if (side === 'spec') return MAGENTA;
  if (side === 'np') return NP;
  return CYAN;
}

function classColorFor(game: string, cls: string): string {
  if (game === 'usl') return classColor(cls) ?? WHITE;
  return getClassColor(cls);
}

function mmss(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

function shortZone(zone: string): string {
  return zone.replace(/^League\s*-\s*/i, '').replace(/^(USL|CTF)\s*-?\s*/i, '').trim() || zone;
}

function isDraftPhase(m: LiveMix | null | undefined): m is LiveMix {
  return !!m && m.phase !== 'Idle' && m.phase !== 'Running';
}

/** A ticker label that only makes sense with a countdown after it ("Time Left: ", "Victory in ", "Next game: "). */
function looksLikeTimerLabel(text: string): boolean {
  const t = text.trim();
  return /:$/.test(t) || /(in|starts|ends)$/i.test(t);
}

/**
 * What the client would be showing for this ticker right now, or null. The client drops a timed
 * bubble the moment its countdown reaches zero, and never draws a timer label the server sent
 * without a countdown (an expired clock the script has not cleared yet). Static text stays until
 * the script replaces it.
 */
function tickerNow(t: LiveTicker, advance: number): { text: string; clock: string | null } | null {
  const label = t.text.replace(/\s+$/, '');
  if (t.remaining_cs > 0) {
    const rem = t.remaining_cs * 10 - advance;
    if (rem <= 0) return null;
    return { text: label, clock: mmss(rem) };
  }
  if (!label || looksLikeTimerLabel(label)) return null;
  return { text: label, clock: null };
}

/** The viewer's own bubbles (HP / personal score) mean nothing to a site visitor. */
function isPersonalTicker(t: LiveTicker): boolean {
  return /^HP=/i.test(t.text) || /personal score/i.test(t.text);
}

/** Inner width of an element, tracked live so long lines can be fitted like the client clips them. */
function useWidth<T extends HTMLElement>(fallback: number): [React.RefObject<T | null>, number] {
  const ref = useRef<T | null>(null);
  const [w, setW] = useState(fallback);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const read = () => setW(el.clientWidth || fallback);
    read();
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
  }, [fallback]);
  return [ref, w];
}

function Rule() {
  return (
    <div style={{ margin: `${1 * S}px 0` }}>
      <div style={{ height: 1 * S, background: RULE_LIGHT }} />
      <div style={{ height: 1 * S, background: RULE_DARK }} />
    </div>
  );
}

function Bubble({ text, clock, colour, maxWidth }: { text: string; clock: string | null; colour: number; maxWidth: number }) {
  const color = TICKER_COLOURS[colour] ?? GREEN;
  const pad = 5 * S;
  const border = 2 * S;
  // One line, always: a label wider than the card is clipped the way the client clips it, never wrapped.
  const clockW = clock ? measureCfs(' ' + clock, FONT_MEDIUM, S) : 0;
  const shown = fitCfs(text, maxWidth - 2 * (pad + border) - clockW, FONT_MEDIUM, S);
  return (
    <div className="flex items-start" style={{ border: `${border}px solid ${BOX}`, background: BLACK, padding: `${1 * S}px ${pad}px`, whiteSpace: 'nowrap' }} title={clock ? `${text} ${clock}` : text}>
      <CfsText text={shown} color={color} font={FONT_MEDIUM} scale={S} />
      {/* The client draws the ticker's countdown in yellow after the label. */}
      {clock && <CfsText text={(shown && !shown.endsWith(' ') ? ' ' : '') + clock} color={YELLOW} font={FONT_MEDIUM} scale={S} />}
    </div>
  );
}

function PlayerRow({ game, p, nonPlaying, maxWidth }: { game: string; p: LivePlayer; nonPlaying: boolean; maxWidth: number }) {
  const spec = nonPlaying || p.spec;
  const color = spec ? SPEC : p.dead ? DEAD : classColorFor(game, p.class);
  const title = spec ? `${p.alias} - ${p.spec ? 'spectating' : 'not playing'} (${p.class})` : `${p.alias} - ${p.class}${p.dead ? ' (dead)' : ''}`;
  const marker = spec ? 'S' : p.captain ? '*' : '';
  return (
    <div className="flex items-start" style={{ height: (FONT_MEDIUM.cell + ROW_GAP) * S }} title={title}>
      <div style={{ width: GUTTER * S, flex: 'none' }}>
        {spec && <CfsText text="S" color={PURPLE} font={FONT_SMALL} scale={S} style={{ marginTop: 3 * S }} title="spectating" />}
        {!spec && marker && <CfsText text={marker} color={YELLOW} scale={S} title="captain" />}
      </div>
      <CfsText text={fitCfs(p.alias, maxWidth - GUTTER * S, FONT_MEDIUM, S)} color={color} scale={S} title={title} />
    </div>
  );
}

function TeamBlock({ game, team, width }: { game: string; team: LiveTeam; width: number }) {
  const nonPlaying = team.side === 'spec' || team.side === 'np';
  const color = sideColor(team.side);
  const count = String(team.players.length);
  const countW = measureCfs(count, FONT_MEDIUM, S);
  const name = fitCfs(team.name, width - countW - 12 * S, FONT_MEDIUM, S);
  return (
    <div>
      {/* Retail header: team name centred, member count right-aligned, same colour, no bar. */}
      <div className="relative" style={{ height: (FONT_MEDIUM.cell + ROW_GAP) * S }} title={`${team.name} - ${count}`}>
        <div className="absolute inset-x-0 text-center">
          <CfsText text={name} color={color} scale={S} />
        </div>
        <div className="absolute" style={{ right: 2 * S, top: 0 }}>
          <CfsText text={count} color={color} scale={S} />
        </div>
      </div>
      {team.players.map((p) => (
        <PlayerRow key={p.alias} game={game} p={p} nonPlaying={nonPlaying} maxWidth={width} />
      ))}
    </div>
  );
}

function DraftLines({ mix, maxWidth }: { mix: LiveMix; maxWidth: number }) {
  const phase =
    mix.phase === 'CaptainSignup' ? 'captain signup' : mix.phase === 'BaseSelect' ? 'base pick' : mix.phase === 'Picking' ? 'picking' : mix.phase === 'Countdown' ? 'starting' : mix.phase.toLowerCase();
  const caps = (mix.captains ?? []).filter((c): c is string => !!c);
  const lines: Array<[string, string]> = [[`${mix.label} ${mix.team_size > 0 ? `${mix.team_size}v${mix.team_size} ` : ''}${phase}${mix.base ? ` @ ${mix.base}` : ''}`, YELLOW]];
  if (caps.length) lines.push([`Captains: ${caps.join(' vs ')}${mix.turn ? ` - ${mix.turn} to pick` : ''}`, GREEN]);
  if (mix.pool?.length) lines.push([`Pool (${mix.pool.length}): ${mix.pool.join(', ')}`, WHITE]);
  return (
    <div className="flex flex-col items-start" style={{ gap: 1 * S }}>
      {lines.map(([text, color], i) => (
        <CfsText key={i} text={fitCfs(text, maxWidth, FONT_MEDIUM, S)} color={color} scale={S} title={text} />
      ))}
    </div>
  );
}

function ArenaCard({ row, driftMs, serverNowMs }: { row: LiveArenaRow; driftMs: number; serverNowMs: number }) {
  const [tickRef, tickW] = useWidth<HTMLDivElement>(160);
  const [listRef, listW] = useWidth<HTMLDivElement>(200);
  // How far the zone's clocks have moved since this snapshot was taken.
  // Age the snapshot on the SERVER's clock: updated_at (when the zone's post landed) against the server
  // time carried by the response (Date + Age headers, so a CDN copy still counts right). age_s + local
  // drift is the floor in case a header is missing.
  const stampedAt = Date.parse(row.updated_at);
  const advance = Math.max(row.age_s * 1000 + driftMs, Number.isFinite(stampedAt) ? serverNowMs - stampedAt : 0);
  const st = row.state;
  const left = st.time_left_ms !== null && st.time_left_ms !== undefined ? st.time_left_ms - advance : null;
  const tickers = row.tickers.filter((t) => !isPersonalTicker(t));
  // "Flags n/total" is drawn by the client from flag state, never sent as a ticker - rebuild it from the
  // ownership the CTF script reports, per side, so a visitor sees who holds what.
  const flagsLine = (() => {
    if (!row.flags || row.flags.length === 0) return null;
    const sideOf = new Map(row.teams.map((t) => [t.name, t.side] as const));
    let t = 0;
    let c = 0;
    for (const f of row.flags) {
      const side = f.team ? sideOf.get(f.team) : undefined;
      if (side === 'T') t++;
      else if (side === 'C') c++;
    }
    return `Flags T ${t}/${row.flags.length}  C ${c}/${row.flags.length}`;
  })();
  const drafts = [row.mix, row.mix2].filter(isDraftPhase);
  // The tickers already carry the state ("Not Enough Players", "Time Left: 4:12", the score line), so the
  // status line only adds what no bubble says, and the clock only when no bubble is counting down.
  const norm = (v: string | null | undefined) => (v ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '');
  const labelDuplicated = !!st.label && tickers.some((t) => norm(t.text).includes(norm(st.label)));
  const anyTickerClock = tickers.some((t) => t.remaining_cs > 0 && t.remaining_cs * 10 - advance > 0);
  const statusLine = [!labelDuplicated ? st.label : null, left !== null && st.running && !anyTickerClock ? mmss(left) : null].filter(Boolean).join(' ');
  const tagCls = row.game === 'usl' ? 'text-cyan-300 border-cyan-500/40 bg-cyan-500/10' : 'text-amber-300 border-amber-500/40 bg-amber-500/10';
  const countText = `${row.players_playing}/${row.players_total}`;
  const pad = 3 * S;

  return (
    <div className="rounded-md border border-gray-700/60" style={{ background: BLACK }}>
      {/* Header in the site's face (not part of the in-game look): game tag, zone, arena, live dot, playing/total */}
      <div className="flex items-center gap-1.5 px-1.5 py-1 border-b border-gray-700/60 text-[11px] leading-tight">
        <span className={`px-1 rounded border font-bold ${tagCls}`}>{row.game.toUpperCase()}</span>
        <span className="text-gray-200 font-semibold truncate" title={`${row.zone} / ${row.arena}`}>
          {shortZone(row.zone)}
          <span className="text-gray-500 font-normal"> · {row.arena}</span>
        </span>
        <span className="ml-auto flex items-center gap-1 shrink-0">
          <span className="relative flex h-1.5 w-1.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-60" style={{ background: GREEN }} />
            <span className="relative inline-flex rounded-full h-1.5 w-1.5" style={{ background: GREEN }} />
          </span>
          <span className="font-mono text-gray-400">{countText}</span>
        </span>
      </div>

      {/* Body: two columns - the ticker strip in the LEFT half (upper-left, like the viewport), the player
          list panel confined to the RIGHT half. Empty space under the bubbles is fine. */}
      <div className="flex items-start" style={{ padding: pad, gap: 4 * S }}>
        <div ref={tickRef} className="flex flex-col items-start min-w-0" style={{ flex: 'none', width: `calc(50% - ${2 * S}px)`, gap: 2 * S }}>
          {statusLine && <CfsText text={fitCfs(statusLine, tickW, FONT_MEDIUM, S)} color={YELLOW} scale={S} title={statusLine} />}
          {tickers.map((t) => {
            const shown = tickerNow(t, advance);
            if (!shown) return null;
            return <Bubble key={t.idx} text={shown.text} clock={shown.clock} colour={t.colour} maxWidth={tickW} />;
          })}
          {flagsLine && <Bubble text={flagsLine} clock={null} colour={3} maxWidth={tickW} />}
          {drafts.map((m, i) => (
            <DraftLines key={i} mix={m} maxWidth={tickW} />
          ))}
        </div>

        {/* Player list: its own panel, like the retail notepad */}
        <div ref={listRef} className="min-w-0" style={{ flex: '1 1 0', border: `${2 * S}px solid ${RULE_LIGHT}`, boxShadow: `inset 0 0 0 ${1 * S}px ${RULE_DARK}`, background: '#050505', padding: `${2 * S}px ${3 * S}px` }}>
          <div className="text-center">
            <CfsText text={`Players: ${row.players_total}`} color={GREEN} font={FONT_SMALL} scale={S} />
          </div>
          <Rule />
          {row.teams.map((team) => (
            <TeamBlock key={team.name} game={row.game} team={team} width={listW - 6 * S} />
          ))}
          <Rule />
        </div>
      </div>
    </div>
  );
}

export default function LiveArenaPanel({ className = '' }: { className?: string }) {
  const [arenas, setArenas] = useState<LiveArenaRow[]>([]);
  const [fetchedAt, setFetchedAt] = useState<number>(0);
  /** server clock minus this browser's clock, from the last response's Date/Age headers */
  const [serverOffsetMs, setServerOffsetMs] = useState<number>(0);
  const [now, setNow] = useState<number>(() => Date.now());

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const res = await fetch('/api/live', { cache: 'no-store' });
        if (!res.ok) return;
        const body = (await res.json()) as LiveResponse;
        if (cancelled || !body?.success) return;
        setArenas(Array.isArray(body.arenas) ? body.arenas : []);
        const received = Date.now();
        setFetchedAt(received);
        const dateHdr = Date.parse(res.headers.get('date') ?? '');
        const ageHdr = Number(res.headers.get('age') ?? 0);
        const serverAt = Number.isFinite(dateHdr) ? dateHdr + (Number.isFinite(ageHdr) ? ageHdr * 1000 : 0) : Date.parse(body.generated_at);
        if (Number.isFinite(serverAt)) setServerOffsetMs(serverAt - received);
      } catch {
        /* keep the last good snapshot */
      }
    };
    load();
    const poll = setInterval(load, POLL_MS);
    const onVisible = () => {
      if (document.visibilityState === 'visible') load();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      cancelled = true;
      clearInterval(poll);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);

  // 1 Hz re-render so the clocks count down between polls.
  useEffect(() => {
    if (arenas.length === 0) return;
    const t = setInterval(() => setNow(Date.now()), TICK_MS);
    return () => clearInterval(t);
  }, [arenas.length]);

  const live = useMemo(() => arenas.filter((a) => a.players_total > 0), [arenas]);
  if (live.length === 0) return null;

  const driftMs = fetchedAt ? Math.max(0, now - fetchedAt) : 0;
  const totalPlayers = live.reduce((n, a) => n + a.players_total, 0);

  return (
    <div className={`relative overflow-hidden rounded-2xl border border-emerald-500/20 bg-gradient-to-br from-gray-800/70 via-gray-900/80 to-gray-800/50 backdrop-blur-sm shadow-xl shadow-emerald-500/5 ${className}`}>
      <div className="h-1.5 bg-gradient-to-r from-emerald-400 via-cyan-500 to-blue-400" />
      <div className="px-3 py-2 border-b border-emerald-500/10">
        <div className="flex items-center justify-center gap-2">
          <div className="w-1 h-5 bg-gradient-to-b from-emerald-400 via-cyan-400 to-blue-400 rounded-full" />
          <h3 className="text-sm font-bold text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 via-cyan-400 to-blue-400 uppercase tracking-wider">
            Live Arenas
          </h3>
          <span className="text-emerald-300 text-[10px] font-mono bg-emerald-900/30 px-1.5 py-0.5 rounded">{totalPlayers}</span>
        </div>
      </div>
      <div className="p-2 space-y-2">
        {live.map((row) => (
          <ArenaCard key={row.key} row={row} driftMs={driftMs} serverNowMs={now + serverOffsetMs} />
        ))}
      </div>
    </div>
  );
}
