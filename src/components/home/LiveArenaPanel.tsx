'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { SIDE_COLORS, classColor } from '@/components/usl-mix/UslMixShell';
import { getClassColor } from '@/utils/classColors';
import type { LiveArenaRow, LiveMix, LivePlayer, LiveResponse, LiveSide, LiveTeam } from '@/lib/live/types';

/**
 * Live arenas panel (home page right sidebar): one card per arena with people in it, USL and
 * CTF alike, straight from the zone scripts' minute-by-minute snapshot (/api/live).
 *
 * Layout is deliberately dense - a single vertical column per team, tight leading and negative
 * tracking - so a full 9v9 plus its spectators fits the sidebar without scrolling. Teams read
 * in the in-game order: Titan side, Collective side, other playing teams, then np, then spec;
 * the two non-playing teams are dulled, names are coloured by class, captains get a star.
 *
 * Countdowns (game clock, ticker bubbles) keep running between polls from the snapshot's age.
 */

const POLL_MS = 60_000;
const TICK_MS = 1_000;

const NON_PLAYING = '#6b7280';
const OTHER_SIDE = '#8B98B0';

/** Tight but still legible: negative tracking just short of glyph overlap in the UI font. */
const ROW_STYLE: React.CSSProperties = { fontSize: '10.5px', lineHeight: 1.08, letterSpacing: '-0.04em' };
const HEAD_STYLE: React.CSSProperties = { fontSize: '9.5px', lineHeight: 1.15, letterSpacing: '-0.01em' };

function sideColor(side: LiveSide): string {
  if (side === 'T') return SIDE_COLORS.T;
  if (side === 'C') return SIDE_COLORS.C;
  if (side === 'spec' || side === 'np') return NON_PLAYING;
  return OTHER_SIDE;
}

function sideLabel(side: LiveSide): string | null {
  if (side === 'T') return 'Titan';
  if (side === 'C') return 'Collective';
  return null;
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
  const dim = nonPlaying || p.spec;
  const style: React.CSSProperties = dim
    ? { ...ROW_STYLE, color: NON_PLAYING, opacity: 0.65, fontStyle: 'italic' }
    : { ...ROW_STYLE, color: classColorFor(game, p.class), opacity: p.dead ? 0.55 : 1 };
  const title = dim ? `${p.alias} - ${p.spec ? 'spectating' : 'not playing'} (${p.class})` : `${p.class}${p.dead ? ' - dead' : ''}`;
  return (
    <div className="flex items-baseline gap-1 truncate" style={style} title={title}>
      {p.captain && <span className="text-amber-300 not-italic" style={{ opacity: 1 }}>★</span>}
      <span className="truncate">{p.alias}</span>
    </div>
  );
}

function TeamBlock({ game, team }: { game: string; team: LiveTeam }) {
  const nonPlaying = team.side === 'spec' || team.side === 'np';
  const color = sideColor(team.side);
  const label = sideLabel(team.side);
  return (
    <div className="mb-1 last:mb-0">
      <div
        className="flex items-baseline justify-between gap-1 px-1 py-[1px] rounded-sm bg-gray-950/60 border-l-2"
        style={{ borderColor: color }}
      >
        <span className="font-bold uppercase truncate" style={{ ...HEAD_STYLE, color }}>
          {team.name}
          {label && (
            <span className="ml-1 font-semibold normal-case px-1 rounded" style={{ color, background: `${color}22`, border: `1px solid ${color}55` }}>
              {label}
            </span>
          )}
        </span>
        <span className="font-mono text-gray-500 shrink-0" style={HEAD_STYLE}>
          {team.players.length}
        </span>
      </div>
      <div className="px-1 pt-[1px]">
        {team.players.map((p) => (
          <PlayerRow key={p.alias} game={game} p={p} nonPlaying={nonPlaying} />
        ))}
      </div>
    </div>
  );
}

function DraftBlock({ mix }: { mix: LiveMix }) {
  const phase =
    mix.phase === 'CaptainSignup' ? 'captain signup' : mix.phase === 'BaseSelect' ? 'base pick' : mix.phase === 'Picking' ? 'picking' : mix.phase === 'Countdown' ? 'starting' : mix.phase.toLowerCase();
  const caps = (mix.captains ?? []).filter((c): c is string => !!c);
  return (
    <div className="mb-1 px-1 py-[2px] rounded-sm bg-cyan-950/30 border border-cyan-500/20" style={ROW_STYLE}>
      <div className="text-cyan-200 font-semibold">
        {mix.label} {mix.team_size > 0 ? `${mix.team_size}v${mix.team_size}` : ''} · {phase}
        {mix.base ? ` @ ${mix.base}` : ''}
      </div>
      {caps.length > 0 && (
        <div className="text-gray-300">
          captains: {caps.join(' vs ')}
          {mix.turn ? <span className="text-amber-300"> · {mix.turn} to pick</span> : null}
        </div>
      )}
      {mix.pool && mix.pool.length > 0 && (
        <div className="text-gray-400">
          pool ({mix.pool.length}): <span className="text-gray-300">{mix.pool.join(', ')}</span>
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
  const tagColor = row.game === 'usl' ? 'text-cyan-300 border-cyan-500/40 bg-cyan-500/10' : 'text-amber-300 border-amber-500/40 bg-amber-500/10';
  const drafts = [row.mix, row.mix2].filter(isDraftPhase);

  return (
    <div className="rounded-lg border border-gray-700/40 bg-gray-900/50 px-1.5 py-1.5">
      {/* Header: game / zone / arena / count */}
      <div className="flex items-center gap-1.5 mb-1">
        <span className={`px-1 rounded border font-bold ${tagColor}`} style={HEAD_STYLE}>
          {gameTag}
        </span>
        <span className="text-gray-200 font-semibold truncate" style={{ ...HEAD_STYLE, fontSize: '11px' }} title={`${row.zone} / ${row.arena}`}>
          {shortZone(row.zone)}
          <span className="text-gray-500 font-normal"> · {row.arena}</span>
        </span>
        <span className="ml-auto flex items-center gap-1 shrink-0">
          <span className="relative flex h-1.5 w-1.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-60" />
            <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-400" />
          </span>
          <span className="font-mono text-gray-400" style={HEAD_STYLE}>
            {row.players_playing}/{row.players_total}
          </span>
        </span>
      </div>

      {/* Status: label, clock, score */}
      <div className="flex items-baseline gap-1.5 mb-1 px-0.5" style={ROW_STYLE}>
        <span className="text-gray-300 truncate">{st.label ?? st.mode}</span>
        {left !== null && st.running && (
          <span className="font-mono text-emerald-300 shrink-0 ml-auto">{mmss(left)}</span>
        )}
      </div>
      {st.score.length >= 2 && (
        <div className="flex items-baseline justify-center gap-1 mb-1 font-mono" style={ROW_STYLE}>
          <span className="truncate" style={{ color: sideColor(st.score[0].side) }}>{st.score[0].team}</span>
          <span className="text-white font-bold tabular-nums shrink-0">
            {st.score[0].kills} - {st.score[1].kills}
          </span>
          <span className="truncate" style={{ color: sideColor(st.score[1].side) }}>{st.score[1].team}</span>
        </div>
      )}

      {/* Ticker bubbles, as a spectator sees them */}
      {row.tickers.length > 0 && (
        <div className="mb-1 space-y-[2px]">
          {row.tickers.map((t) => {
            const rem = t.remaining_cs * 10 - advance;
            const showClock = t.remaining_cs > 0 && rem > 0;
            if (!t.text && !showClock) return null;
            return (
              <div
                key={t.idx}
                className="px-1.5 py-[1px] rounded-full bg-gray-950/70 border border-gray-600/40 text-gray-200 font-mono truncate"
                style={{ ...ROW_STYLE, letterSpacing: '-0.02em' }}
                title={`ticker ${t.idx}`}
              >
                {t.text}
                {showClock ? <span className="text-emerald-300">{mmss(rem)}</span> : null}
              </div>
            );
          })}
        </div>
      )}

      {drafts.map((m, i) => (
        <DraftBlock key={i} mix={m} />
      ))}

      {row.teams.map((team) => (
        <TeamBlock key={team.name} game={row.game} team={team} />
      ))}
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
