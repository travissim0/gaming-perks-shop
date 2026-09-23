'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { List, Maximize, Minus, Plus, Search, Workflow } from 'lucide-react';
import type { PublicFixture, TournamentView } from '@/lib/dueling-tournament/view';

export function playerName(event: TournamentView, slot: PublicFixture['slots'][number]) {
  return slot.state === 'player'
    ? (event.entries.find((entry) => entry.id === slot.entryId)?.alias ?? 'Player')
    : slot.state === 'empty'
      ? 'Bye'
      : 'Awaiting opponent';
}

export function MatchCard({
  event,
  fixture,
  highlight = '',
  admin = false,
}: {
  event: TournamentView;
  fixture: PublicFixture;
  highlight?: string;
  admin?: boolean;
}) {
  const matched =
    Boolean(highlight.trim()) &&
    fixture.slots.some((slot) =>
      playerName(event, slot).toLowerCase().includes(highlight.toLowerCase()),
    );
  const root = admin
    ? `/admin/dueling-tournament/${event.id}?tab=matches&match=`
    : `/dueling-tournament/${event.settings.slug}/matches/`;
  const label =
    fixture.state === 'conditional'
      ? 'If needed'
      : fixture.state === 'skipped'
        ? 'Not required'
        : fixture.state.replaceAll('_', ' ');
  return (
    <Link
      href={`${root}${fixture.id}`}
      className={`dt-match ${matched ? 'dt-match-highlight' : ''}`}
      data-fixture={fixture.id}
      aria-label={`${fixture.id}: ${fixture.slots.map((slot) => playerName(event, slot)).join(' versus ')}, ${label}`}
    >
      <div className="dt-match-top">
        <span>{fixture.id} · BO5</span>
        <span className={fixture.state === 'in_progress' ? 'dt-success-text' : ''}>{label}</span>
      </div>
      {fixture.slots.map((slot, side) => {
        const entry =
          slot.state === 'player' ? event.entries.find((value) => value.id === slot.entryId) : null;
        const won = slot.state === 'player' && fixture.result?.winnerId === slot.entryId;
        const score = fixture.result
          ? side === 0
            ? fixture.result.scoreA
            : fixture.result.scoreB
          : null;
        return (
          <div key={side} className={`dt-match-player ${won ? 'is-winner' : ''}`}>
            <span className="dt-seed">{entry?.seed ?? '·'}</span>
            <span className="dt-match-name">{playerName(event, slot)}</span>
            <strong>{score ?? (won && fixture.result?.kind === 'forfeit' ? 'W' : '–')}</strong>
          </div>
        );
      })}
    </Link>
  );
}

function BracketStage({
  event,
  fixtures,
  scale,
  highlight,
  admin,
}: {
  event: TournamentView;
  fixtures: PublicFixture[];
  scale: number;
  highlight: string;
  admin: boolean;
}) {
  const content = useRef<HTMLDivElement>(null);
  const viewport = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; y: number; left: number; top: number } | null>(null);
  const [geometry, setGeometry] = useState({ width: 0, height: 0, paths: [] as string[] });
  const rounds = [...new Set(fixtures.map((fixture) => fixture.round))];
  const key = fixtures.map((fixture) => `${fixture.id}:${fixture.state}`).join(',');
  useLayoutEffect(() => {
    const element = content.current;
    if (!element) return;
    const measure = () => {
      const parent = element.getBoundingClientRect();
      const paths: string[] = [];
      for (const fixture of fixtures) {
        const target = element.querySelector<HTMLElement>(`[data-fixture="${fixture.id}"]`);
        if (!target) continue;
        for (const source of fixture.sources) {
          if (source.kind === 'seed') continue;
          const origin = element.querySelector<HTMLElement>(`[data-fixture="${source.matchId}"]`);
          if (!origin) continue;
          const a = origin.getBoundingClientRect(),
            b = target.getBoundingClientRect();
          const x1 = (a.right - parent.left) / scale,
            y1 = (a.top + a.height / 2 - parent.top) / scale;
          const x2 = (b.left - parent.left) / scale,
            y2 = (b.top + b.height / 2 - parent.top) / scale;
          paths.push(`M${x1},${y1} C${(x1 + x2) / 2},${y1} ${(x1 + x2) / 2},${y2} ${x2},${y2}`);
        }
      }
      const next = { width: element.scrollWidth, height: element.offsetHeight, paths };
      setGeometry((old) => (JSON.stringify(old) === JSON.stringify(next) ? old : next));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [fixtures, key, scale]);
  return (
    <div
      ref={viewport}
      className="dt-bracket-viewport"
      tabIndex={0}
      aria-label="Scrollable bracket. Use arrow keys to scroll or choose list view."
      onPointerDown={(event) => {
        if (event.pointerType !== 'mouse' || (event.target as HTMLElement).closest('a,button'))
          return;
        const element = viewport.current!;
        drag.current = {
          x: event.clientX,
          y: event.clientY,
          left: element.scrollLeft,
          top: element.scrollTop,
        };
        element.setPointerCapture(event.pointerId);
      }}
      onPointerMove={(event) => {
        const start = drag.current;
        if (start && viewport.current) {
          viewport.current.scrollLeft = start.left - event.clientX + start.x;
          viewport.current.scrollTop = start.top - event.clientY + start.y;
        }
      }}
      onPointerUp={() => {
        drag.current = null;
      }}
      onPointerCancel={() => {
        drag.current = null;
      }}
    >
      <div
        style={{
          width: geometry.width ? geometry.width * scale : undefined,
          height: geometry.height ? geometry.height * scale : undefined,
        }}
      >
        <div
          ref={content}
          className="dt-bracket-columns"
          style={{ transform: `scale(${scale})`, position: 'relative' }}
        >
          <svg
            width={geometry.width}
            height={geometry.height}
            aria-hidden="true"
            style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}
          >
            {geometry.paths.map((path, i) => (
              <path key={i} d={path} stroke="#33475b" strokeWidth="1.2" fill="none" />
            ))}
          </svg>
          {rounds.map((round) => (
            <div
              className="dt-round"
              key={round}
              style={{ position: 'relative', display: 'flex', flexDirection: 'column' }}
            >
              <div className="dt-round-title">
                {round === rounds[rounds.length - 1] && fixtures[0]?.bracket === 'upper'
                  ? 'Upper final'
                  : round === rounds[rounds.length - 1] && fixtures[0]?.bracket === 'lower'
                    ? 'Lower final'
                    : `Round ${round}`}
              </div>
              <div
                style={{
                  display: 'flex',
                  flex: 1,
                  flexDirection: 'column',
                  justifyContent: 'space-around',
                  gap: 12,
                }}
              >
                {fixtures
                  .filter((fixture) => fixture.round === round)
                  .map((fixture) => (
                    <MatchCard
                      key={fixture.id}
                      event={event}
                      fixture={fixture}
                      highlight={highlight}
                      admin={admin}
                    />
                  ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function Bracket({ event, admin = false }: { event: TournamentView; admin?: boolean }) {
  const [mode, setMode] = useState<'bracket' | 'list'>('bracket');
  const [scale, setScale] = useState(1);
  const [search, setSearch] = useState('');
  const area = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (window.matchMedia('(max-width:760px)').matches) setMode('list');
  }, []);
  if (!event.fixtures.length)
    return (
      <div className="dt-empty">
        <Workflow size={30} />
        The bracket will appear after check-in and seeding.
        <br />
        <Link
          className="dt-button dt-button-quiet"
          style={{ marginTop: 18 }}
          href={`/dueling-tournament/${event.settings.slug}/seeding`}
        >
          Watch the seed draw
        </Link>
      </div>
    );
  return (
    <div ref={area}>
      <div className="dt-bracket-toolbar">
        <label className="dt-actions">
          <Search size={15} />
          <span className="dt-visually-hidden">Highlight a player</span>
          <input
            className="dt-input"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Highlight a player…"
          />
        </label>
        <div className="dt-actions">
          <button
            className="dt-button dt-button-quiet"
            onClick={() => setMode(mode === 'list' ? 'bracket' : 'list')}
          >
            {mode === 'list' ? <Workflow size={14} /> : <List size={14} />}
            {mode === 'list' ? 'Bracket view' : 'List view'}
          </button>
          {mode === 'bracket' && (
            <>
              <button
                className="dt-button dt-button-quiet"
                aria-label="Zoom out"
                onClick={() => setScale(Math.max(0.5, scale - 0.1))}
              >
                <Minus size={14} />
              </button>
              <span className="dt-small">{Math.round(scale * 100)}%</span>
              <button
                className="dt-button dt-button-quiet"
                aria-label="Zoom in"
                onClick={() => setScale(Math.min(1.3, scale + 0.1))}
              >
                <Plus size={14} />
              </button>
              <button
                className="dt-button dt-button-quiet"
                onClick={() =>
                  setScale(
                    Math.min(1, Math.max(0.5, ((area.current?.clientWidth ?? 900) - 42) / 1428)),
                  )
                }
              >
                <Maximize size={14} />
                Fit
              </button>
              <button className="dt-button dt-button-quiet" onClick={() => setScale(1)}>
                Reset
              </button>
            </>
          )}
        </div>
      </div>
      {(['upper', 'lower'] as const).map((bracket) => {
        const fixtures = event.fixtures.filter((fixture) => fixture.bracket === bracket);
        return (
          <section key={bracket}>
            <h2 className="dt-bracket-title">
              {bracket === 'upper' ? 'Upper bracket' : 'Lower bracket'}
              <small>
                {bracket === 'upper'
                  ? 'First loss moves to the lower bracket'
                  : 'Second loss means elimination'}
              </small>
            </h2>
            {mode === 'bracket' ? (
              <BracketStage
                event={event}
                fixtures={fixtures}
                scale={scale}
                highlight={search}
                admin={admin}
              />
            ) : (
              <div className="dt-match-list">
                {fixtures.map((fixture) => (
                  <MatchCard
                    key={fixture.id}
                    event={event}
                    fixture={fixture}
                    highlight={search}
                    admin={admin}
                  />
                ))}
              </div>
            )}
          </section>
        );
      })}
      <section>
        <h2 className="dt-bracket-title">
          Championship<small>BO5, with a fresh BO5 reset if the lower winner wins first</small>
        </h2>
        <div className="dt-match-list">
          {event.fixtures
            .filter((fixture) => ['final', 'reset'].includes(fixture.bracket))
            .map((fixture) => (
              <MatchCard
                key={fixture.id}
                event={event}
                fixture={fixture}
                highlight={search}
                admin={admin}
              />
            ))}
        </div>
      </section>
    </div>
  );
}
