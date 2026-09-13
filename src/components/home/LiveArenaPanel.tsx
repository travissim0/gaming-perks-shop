'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { VT323 } from 'next/font/google';
import { classColor } from '@/components/usl-mix/UslMixShell';
import { getClassColor } from '@/utils/classColors';
import type { LiveArenaRow, LiveMix, LivePlayer, LiveResponse, LiveSide, LiveTeam } from '@/lib/live/types';

/**
 * Live arenas panel (home page right sidebar): one card per arena with people in it, USL and
 * CTF alike, straight from the zone scripts' minute-by-minute snapshot (/api/live).
 *
 * Styled after the in-game UI rather than the site: black ground, the pixel face, the ticker
 * "bubbles" as grey-bordered boxes in the left third of the card, and the player list in the
 * right two-thirds behind a grey divider - "Players: N", a rule, then each team's name centred in
 * its colour (Titan green, Collective red, spec magenta, np grey) with its players in a single
 * column below it. Spectators carry the purple S the game shows; captains a star.
 *
 * Countdowns (game clock, ticker bubbles) keep running between polls from the snapshot's age.
 */

const pixel = VT323({ subsets: ['latin'], weight: '400', display: 'swap' });

const POLL_MS = 60_000;
const TICK_MS = 1_000;

// In-game palette.
const GREEN = '#3cff3c';
const YELLOW = '#ffff3c';
const CYAN = '#40f0f0';
const RED = '#ff5050';
const MAGENTA = '#ff44ff';
const PURPLE = '#b060ff';
const GREY = '#9a9f9a';
const RULE = '#8a8f8a';
const BLACK = '#000000';

/** Ticker colour byte -> text colour, as the client draws them. */
const TICKER_COLOURS: Record<number, string> = { 0: GREEN, 1: GREEN, 2: YELLOW, 3: CYAN, 4: RED, 5: '#ffffff' };

const TEXT: React.CSSProperties = { fontSize: '16px', lineHeight: 1.0 };
const SMALL: React.CSSProperties = { fontSize: '14px', lineHeight: 1.0 };

function sideColor(side: LiveSide): string {
  if (side === 'T') return GREEN;
  if (side === 'C') return RED;
  if (side === 'spec') return MAGENTA;
  if (side === 'np') return GREY;
  return CYAN;
}

function classColorFor(game: string, cls: string): string {
  if (game === 'usl') return classColor(cls) ?? '#d1d5db';
  return getClassColor(cls);
}

function mmss(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

function shortZone(zone: string): string {
  return zone.replace(/^League\s*-\s*/i, '').replace(/^USL\s+/i, '').trim() || zone;
}

function isDraftPhase(m: LiveMix | null | undefined): m is LiveMix {
  return !!m && m.phase !== 'Idle' && m.phase !== 'Running';
}

function PlayerRow({ game, p, nonPlaying }: { game: string; p: LivePlayer; nonPlaying: boolean }) {
  const spec = nonPlaying || p.spec;
  const color = spec ? GREY : classColorFor(game, p.class);
  const title = spec ? `${p.alias} - ${p.spec ? 'spectating' : 'not playing'} (${p.class})` : `${p.class}${p.dead ? ' - dead' : ''}`;
  return (
    <div className="flex items-baseline whitespace-nowrap" style={{ ...TEXT, opacity: p.dead && !spec ? 0.55 : 1 }} title={title}>
      {/* Fixed-width marker column so aliases line up: purple S for spectators, star for captains. */}
      <span className="inline-block w-[10px] shrink-0 text-center" style={{ color: spec ? PURPLE : YELLOW }}>
        {spec ? 'S' : p.captain ? '★' : ''}
      </span>
      <span className="truncate" style={{ color }}>{p.alias}</span>
    </div>
  );
}

function TeamBlock({ game, team }: { game: string; team: LiveTeam }) {
  const nonPlaying = team.side === 'spec' || team.side === 'np';
  const color = sideColor(team.side);
  return (
    <div className="mb-1 last:mb-0">
      <div className="text-center truncate px-1" style={{ ...TEXT, fontSize: '17px', color }} title={`${team.name} - ${team.players.length}`}>
        {team.name}
      </div>
      {team.players.map((p) => (
        <PlayerRow key={p.alias} game={game} p={p} nonPlaying={nonPlaying} />
      ))}
    </div>
  );
}

function TickerBox({ text, clock, colour }: { text: string; clock: string | null; colour: number }) {
  const color = TICKER_COLOURS[colour] ?? GREEN;
  return (
    <div className="px-1 py-[1px] text-center break-words" style={{ ...TEXT, fontSize: '15px', color, background: BLACK, border: `2px solid ${RULE}` }}>
      {text}
      {clock ? <span style={{ color: CYAN }}>{text ? ' ' : ''}{clock}</span> : null}
    </div>
  );
}

function DraftBlock({ mix }: { mix: LiveMix }) {
  const phase =
    mix.phase === 'CaptainSignup' ? 'captain signup' : mix.phase === 'BaseSelect' ? 'base pick' : mix.phase === 'Picking' ? 'picking' : mix.phase === 'Countdown' ? 'starting' : mix.phase.toLowerCase();
  const caps = (mix.captains ?? []).filter((c): c is string => !!c);
  return (
    <div className="px-1 py-[2px] break-words" style={{ ...SMALL, color: GREEN, border: `2px solid ${RULE}`, background: BLACK }}>
      <div style={{ color: YELLOW }}>
        {mix.label} {mix.team_size > 0 ? `${mix.team_size}v${mix.team_size}` : ''} {phase}
        {mix.base ? ` @ ${mix.base}` : ''}
      </div>
      {caps.length > 0 && (
        <div>
          capts: {caps.join(' vs ')}
          {mix.turn ? <span style={{ color: CYAN }}> {mix.turn} to pick</span> : null}
        </div>
      )}
      {mix.pool && mix.pool.length > 0 && (
        <div style={{ color: GREY }}>
          pool {mix.pool.length}: <span style={{ color: '#d1d5db' }}>{mix.pool.join(', ')}</span>
        </div>
      )}
    </div>
  );
}

function ArenaCard({ row, driftMs }: { row: LiveArenaRow; driftMs: number }) {
  // How far the zone's clocks have moved since this snapshot was taken.
  const advance = row.age_s * 1000 + driftMs;
  const st = row.state;
  const left = st.time_left_ms !== null && st.time_left_ms !== undefined ? st.time_left_ms - advance : null;
  const gameTag = row.game.toUpperCase();
  const tagColor = row.game === 'usl' ? CYAN : YELLOW;
  const drafts = [row.mix, row.mix2].filter(isDraftPhase);

  return (
    <div className={pixel.className} style={{ background: BLACK, border: `2px solid ${RULE}` }}>
      {/* Header: game / zone / arena / count */}
      <div className="flex items-baseline gap-2 px-1.5 py-[2px]" style={{ ...TEXT, borderBottom: `2px solid ${RULE}` }}>
        <span className="px-1" style={{ color: BLACK, background: tagColor }}>{gameTag}</span>
        <span className="truncate" style={{ color: GREEN }} title={`${row.zone} / ${row.arena}`}>
          {shortZone(row.zone)}
          <span style={{ color: GREY }}> {row.arena}</span>
        </span>
        <span className="ml-auto flex items-center gap-1 shrink-0">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-60" style={{ background: GREEN }} />
            <span className="relative inline-flex rounded-full h-2 w-2" style={{ background: GREEN }} />
          </span>
          <span style={{ color: YELLOW }}>{row.players_playing}/{row.players_total}</span>
        </span>
      </div>

      <div className="grid grid-cols-3">
        {/* Left third: game state + ticker bubbles */}
        <div className="col-span-1 p-1 space-y-1 min-w-0">
          <div className="break-words" style={{ ...SMALL, color: YELLOW }}>
            {st.label ?? st.mode}
            {left !== null && st.running ? <span style={{ color: CYAN }}> {mmss(left)}</span> : null}
          </div>
          {st.score.length >= 2 && (
            <div className="break-words" style={SMALL}>
              <span style={{ color: sideColor(st.score[0].side) }}>{st.score[0].team}</span>
              <span style={{ color: '#ffffff' }}> {st.score[0].kills}-{st.score[1].kills} </span>
              <span style={{ color: sideColor(st.score[1].side) }}>{st.score[1].team}</span>
            </div>
          )}
          {row.tickers.map((t) => {
            const rem = t.remaining_cs * 10 - advance;
            const showClock = t.remaining_cs > 0 && rem > 0;
            if (!t.text && !showClock) return null;
            return <TickerBox key={t.idx} text={t.text} clock={showClock ? mmss(rem) : null} colour={t.colour} />;
          })}
          {drafts.map((m, i) => (
            <DraftBlock key={i} mix={m} />
          ))}
        </div>

        {/* Right two-thirds: the player list, as the F-key list draws it */}
        <div className="col-span-2 p-1 min-w-0" style={{ borderLeft: `2px solid ${RULE}` }}>
          <div className="text-center" style={{ ...TEXT, color: GREEN }}>
            Players: {row.players_total}
          </div>
          <div className="mb-1" style={{ borderTop: `2px solid ${RULE}` }} />
          {row.teams.map((team) => (
            <TeamBlock key={team.name} game={row.game} team={team} />
          ))}
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
