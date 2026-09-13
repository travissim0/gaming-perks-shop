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
 * list and tickers, Small for the counts) at 2x:
 *  - ticker "bubbles": one line each, never wrapped, grey-bordered boxes on black, right-aligned
 *    to the widest, stacked in the upper-left. They sit beside the player list when both fit
 *    the card and above it otherwise (flex-wrap does the choosing).
 *  - player list: "Players: N" centred in green, a double rule, then every team's name centred
 *    in its colour (Titan green, Collective red, spec magenta, np grey) with the member count
 *    right-aligned, and its players one per row - 14px rows at 1x, the spectator S in purple in
 *    the left gutter, aliases in class colours (grey when spectating, dark grey when dead).
 *
 * Countdowns keep running between polls from the snapshot's age.
 */

const POLL_MS = 60_000;
const TICK_MS = 1_000;
const S = 2 as const;                       // integer UI scale (retail pixels -> CSS pixels)

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

function Bubble({ text, colour, maxWidth }: { text: string; colour: number; maxWidth: number }) {
  const color = TICKER_COLOURS[colour] ?? GREEN;
  const pad = 2 * S;
  const border = 2 * S;
  // One line, always. A bubble wider than the card drops to 1x rather than wrapping.
  const scale = measureCfs(text, FONT_MEDIUM, S) + 2 * (pad + border) <= maxWidth ? S : 1;
  const shown = fitCfs(text, maxWidth - 2 * (pad + border), FONT_MEDIUM, scale);
  return (
    <div style={{ border: `${border}px solid ${BOX}`, background: BLACK, padding: `0 ${pad}px`, whiteSpace: 'nowrap' }} title={text}>
      <CfsText text={shown} color={color} font={FONT_MEDIUM} scale={scale} />
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
        {marker && <CfsText text={marker} color={spec ? PURPLE : YELLOW} scale={S} title={spec ? 'spectating' : 'captain'} />}
      </div>
      <CfsText text={fitCfs(p.alias, maxWidth - GUTTER * S)} color={color} scale={S} title={title} />
    </div>
  );
}

function TeamBlock({ game, team, width }: { game: string; team: LiveTeam; width: number }) {
  const nonPlaying = team.side === 'spec' || team.side === 'np';
  const color = sideColor(team.side);
  const count = String(team.players.length);
  const countW = measureCfs(count, FONT_MEDIUM, S);
  const name = fitCfs(team.name, width - countW - 12 * S);
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
        <CfsText key={i} text={fitCfs(text, maxWidth)} color={color} scale={S} title={text} />
      ))}
    </div>
  );
}

function ArenaCard({ row, driftMs }: { row: LiveArenaRow; driftMs: number }) {
  const [bodyRef, bodyW] = useWidth<HTMLDivElement>(320);
  const [listRef, listW] = useWidth<HTMLDivElement>(200);
  // How far the zone's clocks have moved since this snapshot was taken.
  const advance = row.age_s * 1000 + driftMs;
  const st = row.state;
  const left = st.time_left_ms !== null && st.time_left_ms !== undefined ? st.time_left_ms - advance : null;
  const tickers = row.tickers.filter((t) => !isPersonalTicker(t));
  const drafts = [row.mix, row.mix2].filter(isDraftPhase);
  // The tickers already carry the state ("Not Enough Players", "Time Left: 4:12", the score line), so the
  // status line only adds what no bubble says, and the clock only when no bubble is counting down.
  const norm = (v: string | null | undefined) => (v ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '');
  const labelDuplicated = !!st.label && tickers.some((t) => norm(t.text).includes(norm(st.label)));
  const anyTickerClock = tickers.some((t) => t.remaining_cs * 10 - advance > 0);
  const statusLine = [!labelDuplicated ? st.label : null, left !== null && st.running && !anyTickerClock ? mmss(left) : null].filter(Boolean).join(' ');
  const tagColor = row.game === 'usl' ? CYAN : YELLOW;
  const countText = `${row.players_playing}/${row.players_total}`;
  const pad = 3 * S;

  return (
    <div style={{ background: BLACK, border: `1px solid ${RULE_LIGHT}` }}>
      {/* Header: game tag + zone with the live dot, then arena and playing/total on a second line */}
      <div style={{ padding: `${1 * S}px ${pad}px`, borderBottom: `1px solid ${RULE_LIGHT}` }}>
        <div className="flex items-center" style={{ gap: 3 * S }}>
          <span style={{ background: tagColor, padding: `0 ${1 * S}px` }}>
            <CfsText text={row.game.toUpperCase()} color={BLACK} font={FONT_SMALL} scale={S} />
          </span>
          <CfsText text={fitCfs(shortZone(row.zone), bodyW - 40 * S, FONT_SMALL, S)} color={GREEN} font={FONT_SMALL} scale={S} title={row.zone} />
          <span className="ml-auto relative flex" style={{ width: 4 * S, height: 4 * S }}>
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-60" style={{ background: GREEN }} />
            <span className="relative inline-flex rounded-full h-full w-full" style={{ background: GREEN }} />
          </span>
        </div>
        <div className="flex items-center" style={{ gap: 3 * S, marginTop: 1 * S }}>
          <CfsText text={fitCfs(row.arena, bodyW - 60 * S, FONT_SMALL, S)} color={SPEC} font={FONT_SMALL} scale={S} title={row.arena} />
          <span className="ml-auto">
            <CfsText text={`${countText} playing`} color={YELLOW} font={FONT_SMALL} scale={S} />
          </span>
        </div>
      </div>

      {/* Body: bubbles beside the list when both fit, above it otherwise. */}
      <div ref={bodyRef} className="flex flex-wrap items-start" style={{ padding: pad, gap: `${2 * S}px ${4 * S}px` }}>
        {(tickers.length > 0 || statusLine || drafts.length > 0) && (
          <div className="flex flex-col items-end" style={{ gap: 2 * S, maxWidth: '100%' }}>
            {statusLine && <CfsText text={fitCfs(statusLine, bodyW - 2 * pad)} color={YELLOW} scale={S} title={statusLine} />}
            {tickers.map((t) => {
              const rem = t.remaining_cs * 10 - advance;
              const showClock = t.remaining_cs > 0 && rem > 0;
              if (!t.text && !showClock) return null;
              const text = showClock ? `${t.text}${t.text && !t.text.endsWith(' ') ? ' ' : ''}${mmss(rem)}` : t.text;
              return <Bubble key={t.idx} text={text} colour={t.colour} maxWidth={bodyW - 2 * pad} />;
            })}
            {drafts.map((m, i) => (
              <DraftLines key={i} mix={m} maxWidth={bodyW - 2 * pad} />
            ))}
          </div>
        )}

        <div ref={listRef} className="min-w-0" style={{ flex: '1 1 150px' }}>
          <div className="text-center">
            <CfsText text={`Players: ${row.players_total}`} color={GREEN} font={FONT_SMALL} scale={S} />
          </div>
          <Rule />
          {row.teams.map((team) => (
            <TeamBlock key={team.name} game={row.game} team={team} width={listW} />
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
        setFetchedAt(Date.now());
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
          <ArenaCard key={row.key} row={row} driftMs={driftMs} />
        ))}
      </div>
    </div>
  );
}
