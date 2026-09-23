'use client';

import { HistoryArchive } from './HistoryArchive';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { CheckCircle2, Expand, Shuffle, ShieldCheck } from 'lucide-react';
import type { Command } from '@/lib/dueling-tournament/contracts';
import type { PublicDraw, TournamentView } from '@/lib/dueling-tournament/view';
import { drawMatchesBracket, verifyDraw } from '@/lib/dueling-tournament/draw';
import { eventTime, useTournament } from './client';
import { Loading, Message, TournamentShell } from './Shell';
import { ConfirmDialog } from './ConfirmDialog';
import { Bracket } from './Bracket';
import { bracketSizeFor, createBracket, resolveBracket } from '@/lib/dueling-tournament/bracket';

function DrawProof({ draw, event }: { draw: PublicDraw; event: TournamentView }) {
  const [verified, setVerified] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  function download() {
    const url = URL.createObjectURL(
      new Blob(
        [
          JSON.stringify(
            {
              draw,
              publishedSeedOrder: event.seedOrder,
              publishedFirstRound: event.fixtures.filter((item) =>
                item.sources.every((source) => source.kind === 'seed'),
              ),
            },
            null,
            2,
          ),
        ],
        { type: 'application/json' },
      ),
    );
    const link = document.createElement('a');
    link.href = url;
    link.download = `freeinf-seeding-${draw.id}.json`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return (
    <section className="dt-panel">
      <div className="dt-panel-header">
        <h2>
          <ShieldCheck size={18} style={{ display: 'inline', color: '#22d3ee' }} /> Draw
          verification
        </h2>
        <span className="dt-badge">
          {draw.voidReason ? 'Voided' : draw.revealedAt ? 'Revealed' : 'Committed'}
        </span>
      </div>
      <div className="dt-panel-body dt-form">
        <p className="dt-muted">
          The roster and draw were locked at {eventTime(draw.committedAt, true)}. This published
          fingerprint lets you check that the revealed order matches that commitment. It does not
          prove that the organizer used an independently chosen random value.
        </p>
        <div>
          <div className="dt-label" style={{ marginBottom: 8 }}>
            Published commitment
          </div>
          <div className="dt-proof" data-testid="draw-commitment">
            {draw.commitment}
          </div>
        </div>
        {draw.randomSeed && (
          <>
            <div>
              <div className="dt-label" style={{ marginBottom: 8 }}>
                Revealed random value
              </div>
              <div className="dt-proof">{draw.randomSeed}</div>
            </div>
            <div className="dt-actions">
              <button
                className="dt-button dt-button-quiet"
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  setError('');
                  try {
                    setVerified(
                      (await verifyDraw({ ...draw, randomSeed: draw.randomSeed! })) &&
                        (Boolean(draw.voidReason) ||
                          !event.fixtures.length ||
                          drawMatchesBracket(draw.order, event.seedOrder, event.fixtures)),
                    );
                  } catch {
                    setError(
                      'This browser could not verify the proof. Download it and try another supported browser.',
                    );
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                <ShieldCheck size={15} />
                Verify this draw
              </button>
              <button className="dt-button dt-button-quiet" onClick={download}>
                Download proof
              </button>
              {verified !== null && (
                <span className={verified ? 'dt-success-text' : 'dt-danger-text'} role="status">
                  {verified
                    ? event.fixtures.length && !draw.voidReason
                      ? 'Verified: commitment, seed order, and published bracket match.'
                      : 'Verified: commitment and seed order match. No published bracket was checked.'
                    : 'Verification failed. Contact the director.'}
                </span>
              )}
            </div>
          </>
        )}
        {error && <Message error>{error}</Message>}
        <details>
          <summary className="dt-muted" style={{ cursor: 'pointer' }}>
            How the random draw works
          </summary>
          <div className="dt-form" style={{ marginTop: 12 }}>
            <p className="dt-muted">
              Each draw generates a new random value for its locked roster. Voiding before reveal
              publishes that abandoned value and order so it can also be verified. The draw uses
              Fisher–Yates with SHA-256 and rejection sampling. Revealing publishes that value and
              the resulting order so the browser can reproduce it. The animation displays the saved
              result.
            </p>
            <p className="dt-small">
              The proof verifies the published commitment and resulting order. It does not prove an
              external source of randomness. Every voided draw remains in the public history.
            </p>
            <code className="dt-proof">{draw.algorithm}</code>
            <div className="dt-muted">
              Locked roster: {draw.entrants.map((entry) => entry.alias).join(', ')}
            </div>
          </div>
        </details>
      </div>
    </section>
  );
}

function ManualSeeds({
  event,
  busy,
  mutate,
}: {
  event: TournamentView;
  busy: boolean;
  mutate: (command: Command) => Promise<boolean>;
}) {
  const [order, setOrder] = useState(
    event.seedOrder.length
      ? event.seedOrder
      : event.entries.filter((entry) => entry.status === 'checked_in').map((entry) => entry.id),
  );
  const [reason, setReason] = useState('');
  function move(index: number, direction: number) {
    setOrder((current) => {
      const next = [...current];
      [next[index], next[index + direction]] = [next[index + direction], next[index]];
      return next;
    });
  }
  return (
    <section className="dt-panel">
      <div className="dt-panel-header">
        <h2>Director-set seeds</h2>
      </div>
      <div className="dt-panel-body dt-form">
        <p className="dt-muted">{event.settings.seedingCriteria}</p>
        {order.map((id, index) => (
          <div className="dt-actions" key={id}>
            <span className="dt-seed" style={{ width: 24 }}>
              {index + 1}
            </span>
            <span style={{ flex: 1 }}>{event.entries.find((entry) => entry.id === id)?.alias}</span>
            <button
              className="dt-button dt-button-quiet"
              disabled={busy || index === 0}
              onClick={() => move(index, -1)}
              aria-label={`Move ${event.entries.find((entry) => entry.id === id)?.alias} up`}
            >
              ↑
            </button>
            <button
              className="dt-button dt-button-quiet"
              disabled={busy || index === order.length - 1}
              onClick={() => move(index, 1)}
              aria-label={`Move ${event.entries.find((entry) => entry.id === id)?.alias} down`}
            >
              ↓
            </button>
          </div>
        ))}
        <label className="dt-label">
          Seeding explanation / change reason
          <textarea
            required
            className="dt-textarea"
            maxLength={2000}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </label>
        <div>
          <button
            className="dt-button"
            disabled={busy || !reason.trim() || order.length < 4 || order.length > 32}
            onClick={() => void mutate({ type: 'seeds', entryIds: order, reason })}
          >
            Save seed order
          </button>
        </div>
      </div>
    </section>
  );
}

export function SeedingPage({ locator, admin = false }: { locator: string; admin?: boolean }) {
  const { event, loading, error, refresh, busy, mutate } = useTournament(locator, true);
  const stage = useRef<HTMLDivElement>(null);
  const [clock, setClock] = useState(Date.now());
  const [replayAt, setReplayAt] = useState<number | null>(null);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [confirm, setConfirm] = useState<'draw' | 'void' | 'bracket' | null>(null);
  const [screenError, setScreenError] = useState('');
  const [offset, setOffset] = useState(0);
  useEffect(() => {
    if (event?.serverNow) setOffset(Date.parse(event.serverNow) - Date.now());
  }, [event?.serverNow]);
  useEffect(() => {
    const timer = setInterval(() => setClock(Date.now()), 250);
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const change = () => setReducedMotion(media.matches);
    change();
    media.addEventListener('change', change);
    return () => {
      clearInterval(timer);
      media.removeEventListener('change', change);
    };
  }, []);
  const draw = event?.draws.findLast((item) => !item.voidReason);
  const now = clock + offset;
  const elapsed = draw?.revealedAt ? now - (replayAt ?? Date.parse(draw.revealedAt)) : 0;
  const visibleCount = draw?.revealedAt
    ? reducedMotion
      ? draw.order.length
      : Math.min(draw.order.length, Math.max(0, Math.floor(elapsed / 900) + 1))
    : 0;
  const currentId = draw?.order[Math.max(0, visibleCount - 1)];
  const currentAlias = draw?.entrants.find((entry) => entry.id === currentId)?.alias;
  const canReveal = draw && !draw.revealedAt && now >= Date.parse(draw.committedAt) + 5000;
  const director = Boolean(admin && event?.me?.director);
  const activeSeeding = event?.phase === 'seeding';
  const roster = event?.entries.filter((entry) => entry.status === 'checked_in') ?? [];
  const fieldCount = event?.seedOrder.length || draw?.entrants.length || roster.length;
  const size = event?.bracketSize ?? bracketSizeFor(fieldCount);
  return (
    <TournamentShell admin={admin}>
      {loading ? (
        <Loading />
      ) : !event || (admin && !event.staff) ? (
        <Message error>{error || 'Tournament staff access is required.'}</Message>
      ) : (
        <>
          <div className="dt-actions" style={{ marginBottom: 18 }}>
            <Link
              className="dt-button dt-button-quiet"
              href={
                admin
                  ? `/admin/dueling-tournament/${event.id}`
                  : `/dueling-tournament/${event.settings.slug}`
              }
            >
              Back to event
            </Link>
            {admin && (
              <Link
                className="dt-button dt-button-quiet"
                href={`/dueling-tournament/${event.settings.slug}/seeding`}
              >
                Open public showcase
              </Link>
            )}
          </div>
          <header className="dt-hero">
            <div className="dt-eyebrow">
              <Shuffle size={16} />
              {admin ? 'Admin seed generator' : 'The official seed reveal'}
            </div>
            <h1>{event.settings.title}</h1>
            <p>{event.settings.seedingCriteria}</p>
            <div className="dt-meta">
              <span>{fieldCount} players</span>
              <span>{size} bracket slots</span>
              <span>{size - fieldCount} first-round byes</span>
            </div>
          </header>
          {error && (
            <Message error>
              {error}{' '}
              <button className="dt-button dt-button-quiet" onClick={() => void refresh()}>
                Refresh current state
              </button>
            </Message>
          )}
          {screenError && <Message error>{screenError}</Message>}
          <div className="dt-stack">
            {director && activeSeeding && event.settings.seedingMethod === 'draw' && (
              <section className="dt-panel">
                <div className="dt-panel-header">
                  <h2>Run the draw</h2>
                </div>
                <div className="dt-panel-body dt-form">
                  <p className="dt-muted">
                    Lock the checked-in roster, share the public showcase, and reveal the saved
                    draw. The commitment is visible for at least five seconds before reveal.
                  </p>
                  <div className="dt-actions">
                    {!draw && (
                      <button
                        className="dt-button"
                        disabled={busy || event.paused || roster.length < 4 || roster.length > 32}
                        onClick={() => setConfirm('draw')}
                      >
                        <Shuffle size={15} />
                        Lock roster and generate draw
                      </button>
                    )}
                    {draw && !draw.revealedAt && (
                      <button
                        className="dt-button"
                        disabled={busy || event.paused || !canReveal}
                        onClick={() => {
                          setReplayAt(null);
                          void mutate({ type: 'reveal_draw' });
                        }}
                      >
                        {canReveal
                          ? 'Reveal seeds to everyone'
                          : 'Commitment published. Reveal available shortly…'}
                      </button>
                    )}
                    {draw && !draw.revealedAt && (
                      <button
                        className="dt-button dt-button-danger"
                        disabled={busy}
                        onClick={() => setConfirm('void')}
                      >
                        Void draw with public reason
                      </button>
                    )}
                  </div>
                </div>
              </section>
            )}
            {director && activeSeeding && event.settings.seedingMethod === 'manual' && (
              <ManualSeeds
                key={roster.map((entry) => entry.id).join(',')}
                event={event}
                busy={busy}
                mutate={mutate}
              />
            )}
            <div className="dt-draw-stage" ref={stage} data-testid="seed-showcase">
              <div
                className="dt-actions"
                style={{ justifyContent: 'space-between', marginBottom: 25 }}
              >
                <span className="dt-badge dt-badge-cyan">
                  {event.settings.seedingMethod === 'manual'
                    ? 'Director-set seeding'
                    : draw?.revealedAt
                      ? visibleCount === draw.order.length
                        ? 'Draw complete'
                        : 'Seed reveal'
                      : draw
                        ? 'Roster locked · Awaiting reveal'
                        : 'Waiting for the draw'}
                </span>
                <button
                  className="dt-button dt-button-quiet"
                  onClick={() => {
                    setScreenError('');
                    if (stage.current?.requestFullscreen)
                      void stage.current
                        .requestFullscreen()
                        .catch(() =>
                          setScreenError(
                            'Fullscreen is unavailable. The showcase still works in this window.',
                          ),
                        );
                    else setScreenError('Fullscreen is unavailable in this browser.');
                  }}
                >
                  <Expand size={14} />
                  Showcase fullscreen
                </button>
              </div>
              {draw?.revealedAt ? (
                <>
                  <div className="dt-eyebrow" style={{ justifyContent: 'center' }}>
                    SEED
                  </div>
                  <div className="dt-draw-number">{visibleCount || '…'}</div>
                  <div className="dt-draw-name" aria-live="polite">
                    {currentAlias ?? 'The reveal is beginning'}
                  </div>
                  <p className="dt-small">
                    {visibleCount === draw.order.length
                      ? 'Every player has a place. The bracket is next.'
                      : 'Revealing the official saved draw…'}
                  </p>
                </>
              ) : (
                <>
                  <Shuffle size={42} style={{ color: '#22d3ee', margin: '20px auto' }} />
                  <h2 className="dt-draw-name">
                    {event.settings.seedingMethod === 'manual'
                      ? 'The seed order'
                      : draw
                        ? 'The draw is locked in'
                        : 'Your path starts here'}
                  </h2>
                  <p className="dt-muted">
                    {event.settings.seedingMethod === 'manual'
                      ? 'The director publishes seeds according to the event criteria.'
                      : draw
                        ? 'The public commitment is recorded. Waiting for the director to reveal the seeds.'
                        : 'The director will generate seeds from the final checked-in roster.'}
                  </p>
                </>
              )}
              <div className="dt-draw-seeds">
                {Array.from(
                  {
                    length:
                      draw?.entrants.length || event.seedOrder.length || Math.max(4, roster.length),
                  },
                  (_, index) => {
                    const id =
                      event.settings.seedingMethod === 'manual'
                        ? event.seedOrder[index]
                        : draw && index < visibleCount
                          ? draw.order[index]
                          : null;
                    const name = id ? event.entries.find((entry) => entry.id === id)?.alias : null;
                    return (
                      <div key={index} className={`dt-draw-tile ${name ? 'is-revealed' : ''}`}>
                        <span className="dt-seed">{String(index + 1).padStart(2, '0')}</span>
                        <div>
                          <p>{name || 'Awaiting seed'}</p>
                          {name &&
                            index < size - (draw?.order.length || event.seedOrder.length) && (
                              <span className="dt-small">First-round bye</span>
                            )}
                        </div>
                        {name && (
                          <CheckCircle2
                            size={13}
                            style={{ color: '#22d3ee', marginLeft: 'auto', flexShrink: 0 }}
                          />
                        )}
                      </div>
                    );
                  },
                )}
              </div>
              {draw?.revealedAt && (
                <div className="dt-actions" style={{ justifyContent: 'center', marginTop: 20 }}>
                  <button className="dt-button dt-button-quiet" onClick={() => setReplayAt(now)}>
                    Replay reveal
                  </button>
                  <Link
                    className="dt-button dt-button-quiet"
                    href={`/dueling-tournament/${event.settings.slug}?tab=bracket`}
                  >
                    View bracket
                  </Link>
                  <span className="dt-small">Replay displays this same draw.</span>
                </div>
              )}
            </div>
            {director && activeSeeding && event.seedOrder.length >= 4 && (
              <div className="dt-actions">
                <button
                  className="dt-button"
                  disabled={busy || event.paused}
                  onClick={() => setConfirm('bracket')}
                >
                  Publish tournament bracket
                </button>
                <span className="dt-small">Use the current seed order to open the match desk.</span>
              </div>
            )}
            {draw && (
              <DrawProof
                key={`${draw.id}-${draw.revealedAt}-${event.revision}`}
                draw={draw}
                event={event}
              />
            )}
            {director && activeSeeding && event.seedOrder.length >= 4 && (
              <details className="dt-panel">
                <summary className="dt-panel-header" style={{ cursor: 'pointer' }}>
                  Preview bracket before publication
                </summary>
                <div className="dt-panel-body">
                  <Bracket
                    event={{
                      ...event,
                      fixtures: resolveBracket(createBracket(size), event.seedOrder),
                    }}
                    admin
                  />
                </div>
              </details>
            )}
            <HistoryArchive id={event.id} kind="draws" />
            {event.draws.some((item) => item.voidReason) && (
              <section className="dt-panel">
                <div className="dt-panel-header">
                  <h2>Draw history</h2>
                </div>
                <div className="dt-panel-body dt-form">
                  {event.draws
                    .filter((item) => item.voidReason)
                    .map((item) => (
                      <article key={item.id}>
                        <span className="dt-badge dt-badge-red">Voided draw</span>
                        <p className="dt-muted">
                          {eventTime(item.committedAt, true)} · {item.voidReason}
                        </p>
                        <DrawProof draw={item} event={event} />
                      </article>
                    ))}
                </div>
              </section>
            )}
          </div>
          {confirm && (
            <ConfirmDialog
              busy={busy}
              title={
                {
                  draw: 'Lock the roster and generate seeds?',
                  void: 'Void this draw?',
                  bracket: 'Publish the bracket?',
                }[confirm]
              }
              requireReason={confirm === 'void'}
              onCancel={() => setConfirm(null)}
              onConfirm={(reason) =>
                mutate(
                  confirm === 'draw'
                    ? { type: 'draw' }
                    : confirm === 'void'
                      ? { type: 'void_draw', reason }
                      : { type: 'publish_bracket' },
                )
              }
            >
              {confirm === 'draw'
                ? `${roster.length} checked-in players will be locked into this draw. The generated order is saved before it is revealed. A replacement is only allowed before reveal, with a public reason. Revealed draws cannot be voided.`
                : confirm === 'void'
                  ? 'The commitment and your reason remain in the public history. This cannot hide an earlier draw.'
                  : 'Publish the upper and lower brackets using the current seeds. Match results will advance players automatically.'}
            </ConfirmDialog>
          )}
        </>
      )}
    </TournamentShell>
  );
}
