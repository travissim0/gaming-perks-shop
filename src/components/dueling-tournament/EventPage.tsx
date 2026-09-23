'use client';

import { HistoryArchive } from './HistoryArchive';

import { useState, type CSSProperties } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { CalendarDays, ChevronRight, MapPin, Swords, Trophy, Users } from 'lucide-react';
import type { Command } from '@/lib/dueling-tournament/contracts';
import type { TournamentView } from '@/lib/dueling-tournament/view';
import { authLink, rememberAuthReturn } from '@/lib/auth-return';
import { Bracket, MatchCard, playerName } from './Bracket';
import { Loading, Message, TournamentShell } from './Shell';
import { eventTime, useTournament } from './client';
import { useServerClock } from './ArenaArt';
import {
  ArenaWindow,
  BracketSection,
  DetailsBand,
  EventTitle,
  HowItWorks,
  PlayersGrid,
  PlayersSection,
  ResultsSection,
  RulesSections,
  RunSteps,
  STAGE_COLOR,
  Schedule,
  clock,
  day,
  eventStage,
  stageLabel,
} from './EventSections';

export function EventHero({ event }: { event: TournamentView }) {
  const count = event.entries.filter((entry) =>
    ['registered', 'checked_in'].includes(entry.status),
  ).length;
  return (
    <>
      <header className="dt-hero">
        <div className="dt-hero-row">
          <div>
            <div className="dt-eyebrow">
              <Swords size={15} /> CTF / 1V1 / DOUBLE ELIMINATION{' '}
              <span className="dt-badge dt-badge-cyan">
                <span className="dt-status-dot" />
                {event.paused ? 'Paused' : event.phase.replace('_', ' ')}
              </span>
            </div>
            <h1>{event.settings.title}</h1>
            <p>
              {event.settings.description ||
                'A seeded double-elimination tournament. Every series is best of five, from the opening round to the championship.'}
            </p>
          </div>
          <div className="dt-hero-mark">
            <Swords size={40} strokeWidth={1.2} />
          </div>
        </div>
        <div className="dt-meta">
          <span>
            <CalendarDays size={15} />
            {eventTime(event.settings.startsAt, true)}
          </span>
          <span>
            <Users size={15} />
            {count} / {event.settings.capacity} players
          </span>
          <span>
            <MapPin size={15} />
            {event.settings.arena}
          </span>
          <span>
            <Trophy size={15} />
            BO5 · Reset final
          </span>
        </div>
      </header>
      <div className="dt-progress" aria-label="Tournament progress">
        {['registration', 'check_in', 'seeding', 'bracket', 'final', 'completed'].map(
          (phase, i) => (
            <span key={phase} className={event.phase === phase ? 'is-current' : ''}>
              {i > 0 && <ChevronRight size={12} />}
              {phase === 'completed' ? 'Results' : phase.replace('_', ' ')}
            </span>
          ),
        )}
      </div>
    </>
  );
}

function PersonalCard({
  event,
  user,
  mutate,
  busy,
}: {
  event: TournamentView;
  user: boolean;
  mutate: (command: Command) => Promise<boolean>;
  busy: boolean;
}) {
  const [accepted, setAccepted] = useState(false);
  const entry = event.me?.entry;
  const root = `/dueling-tournament/${event.settings.slug}`;
  const now = Date.parse(event.serverNow);
  const rejoinCoolingDown = Boolean(
    entry?.reregisterAfter && now < Date.parse(entry.reregisterAfter),
  );
  const canRejoinAfterWithdrawal =
    now + 5 * 60 * 1000 < Date.parse(event.settings.registrationClosesAt);
  const registrationOpen =
    !event.paused &&
    ['registration', 'check_in'].includes(event.phase) &&
    now >= Date.parse(event.settings.registrationOpensAt) &&
    now < Date.parse(event.settings.registrationClosesAt);
  const signupAhead =
    ['draft', 'registration'].includes(event.phase) &&
    now < Date.parse(event.settings.registrationOpensAt);
  const acceptingEntries = registrationOpen || signupAhead;
  const placing = entry ? event.placements.find((row) => row.entryId === entry.id) : null;
  const checkInOpen =
    !event.paused &&
    ['registration', 'check_in'].includes(event.phase) &&
    now >= Date.parse(event.settings.checkInOpensAt) &&
    now <= Date.parse(event.settings.checkInClosesAt);
  const next = entry
    ? event.fixtures.find(
        (fixture) =>
          ['ready', 'in_progress', 'held'].includes(fixture.state) &&
          fixture.slots.some((slot) => slot.state === 'player' && slot.entryId === entry.id),
      )
    : null;
  return (
    <section className="dt-you" aria-label="Your tournament">
      <p className="dt-you-line">
        {entry ? (
          <>
            <b>{entry.alias}</b>
            {` · ${entry.status.replace('_', ' ')}${entry.seed ? ` · Seed ${entry.seed}` : ''}${next ? ` · Next match: ${next.id}` : placing?.losses === 2 ? ' · Eliminated' : event.championId === entry.id ? ' · Champion' : ''}`}
          </>
        ) : registrationOpen ? (
          `Sign-ups close ${day(event.settings.registrationClosesAt)}.`
        ) : signupAhead ? (
          `Sign-ups open ${day(event.settings.registrationOpensAt)}.`
        ) : (
          'Sign-ups are closed. Follow the bracket, results and event updates here.'
        )}
      </p>
      {entry?.status === 'registered' && (
        <p className="dt-you-note">
          Check in on this page before the {clock(event.settings.startsAt)} ET start.
        </p>
      )}
      {entry?.status === 'waitlisted' && (
        <p className="dt-you-note">
          A director will confirm any promotion here. Keep checking your notices.
        </p>
      )}
      <div className="dt-you-actions">
        {!user ? (
          <>
            <Link
              className="dt-button"
              href={authLink('/auth/login', root)}
              onClick={() => rememberAuthReturn(root)}
            >
              {acceptingEntries ? 'Sign in to register' : 'Sign in to follow your matches'}{' '}
              <ChevronRight size={15} />
            </Link>
            <Link className="dt-button dt-button-quiet" href={`${root}?tab=overview#how`}>
              How it works
            </Link>
          </>
        ) : !event.me?.hasAlias ? (
          <Link
            className="dt-button"
            href={authLink('/auth/complete-profile', root)}
            onClick={() => rememberAuthReturn(root)}
          >
            Complete your Freeinf profile
          </Link>
        ) : !entry || entry.status === 'withdrawn' ? (
          !acceptingEntries ? (
            <p className="dt-muted">Registration has closed for this event.</p>
          ) : (
            <div className="dt-you-register">
              <label className="dt-check">
                <input
                  type="checkbox"
                  checked={accepted}
                  onChange={(e) => setAccepted(e.target.checked)}
                  disabled={!registrationOpen || !event.rules.publishedAt}
                />
                <span>
                  I have read and accept the{' '}
                  <Link href={`${root}?tab=rules`} style={{ color: '#22d3ee' }}>
                    tournament rules
                  </Link>
                  .
                </span>
              </label>
              <button
                className="dt-button"
                disabled={!registrationOpen || !accepted || busy || rejoinCoolingDown}
                onClick={() => void mutate({ type: 'register', rulesVersion: event.rules.version })}
              >
                {busy ? 'Submitting…' : 'Register for tournament'}
              </button>
              {rejoinCoolingDown && (
                <p className="dt-muted">
                  After withdrawing, wait five minutes before registering again. You can rejoin from{' '}
                  {eventTime(entry!.reregisterAfter!, true)} if registration is still open.
                </p>
              )}
            </div>
          )
        ) : (
          <div className="dt-actions">
            {entry.status === 'registered' && (
              <button
                className="dt-button"
                disabled={!checkInOpen || busy}
                onClick={() => void mutate({ type: 'check_in' })}
              >
                Check in
              </button>
            )}
            {next && (
              <Link className="dt-button" href={`${root}/matches/${next.id}`}>
                View your match
              </Link>
            )}
            {['registration', 'check_in'].includes(event.phase) &&
              Date.parse(event.serverNow) < Date.parse(event.settings.checkInClosesAt) &&
              !event.fixtures.length &&
              !event.draws.some((draw) => !draw.voidReason) &&
              ['registered', 'checked_in', 'waitlisted'].includes(entry.status) && (
                <button
                  className="dt-button dt-button-quiet"
                  disabled={busy}
                  onClick={() => {
                    if (
                      window.confirm(
                        'Withdraw and release your place immediately? Another player may take it. ' +
                          (canRejoinAfterWithdrawal
                            ? 'You must wait five minutes before rejoining, and your original place and waitlist priority are not reserved.'
                            : 'Registration will close before the five-minute wait ends, so you will not be able to rejoin this event.'),
                      )
                    )
                      void mutate({ type: 'withdraw' });
                  }}
                >
                  Withdraw
                </button>
              )}
          </div>
        )}
      </div>
    </section>
  );
}

export function ArenaQueue({ event, admin = false }: { event: TournamentView; admin?: boolean }) {
  const active = event.fixtures.filter((fixture) => fixture.startedAt && !fixture.result);
  const upcoming = event.queue
    .map((item) => event.fixtures.find((fixture) => fixture.id === item.matchId)!)
    .filter(Boolean);
  const fixtures = [...active, ...upcoming].slice(0, 6);
  return (
    <section className="dt-panel">
      <div className="dt-panel-header">
        <h2>Arena queue</h2>
        <span className="dt-badge dt-badge-cyan">One match at a time</span>
      </div>
      {!fixtures.length ? (
        <div className="dt-empty">
          {event.phase === 'completed'
            ? 'All matches are complete.'
            : 'The queue appears when the bracket is published.'}
        </div>
      ) : (
        fixtures.map((fixture, index) => {
          const position = active.includes(fixture)
            ? fixture.state === 'held'
              ? 'On hold'
              : 'Playing'
            : index === active.length
              ? 'On deck'
              : 'Upcoming';
          const eligibility = event.queue.find((item) => item.matchId === fixture.id);
          return (
            <div className="dt-queue-row" key={fixture.id}>
              <span className="dt-queue-index">{fixture.id}</span>
              <div className="dt-queue-main">
                <Link
                  href={
                    admin
                      ? `/admin/dueling-tournament/${event.id}?tab=matches&match=${fixture.id}`
                      : `/dueling-tournament/${event.settings.slug}/matches/${fixture.id}`
                  }
                >
                  {fixture.slots.map((slot) => playerName(event, slot)).join(' vs ')}
                </Link>
                <p>
                  {position} · {fixture.bracket} bracket
                  {eligibility && !eligibility.eligible
                    ? ` · Rest / scheduled until ${eventTime(eligibility.eligibleAt)}`
                    : ''}
                  {eligibility?.estimatedAt
                    ? ` · Estimated ${eventTime(eligibility.estimatedAt)}`
                    : ''}
                </p>
              </div>
              <span
                className={`dt-badge ${position === 'Playing' ? 'dt-badge-green' : 'dt-badge-cyan'}`}
              >
                {position}
              </span>
            </div>
          );
        })
      )}
      <div className="dt-panel-body dt-small">
        Wait for the referee&apos;s call in {event.settings.callChannel}. A website notice does not
        start a no-show timer. Estimates allow five {event.settings.estimatedGameSeconds}-second
        games and {event.settings.estimatedChangeoverMinutes} minutes of changeover per series; they
        are not referee call times.
      </div>
    </section>
  );
}

export function EventPage({
  slug,
  initialTab = 'overview',
}: {
  slug: string;
  initialTab?: string;
}) {
  const { event, loading, error, refresh, mutate, busy, user, lastFetched } = useTournament(slug);
  const searchParams = useSearchParams();
  const router = useRouter();
  const tab = searchParams.get('tab') ?? initialTab;
  const [search, setSearch] = useState('');
  const now = useServerClock(event?.serverNow ?? '', lastFetched);
  const selectTab = (value: string) =>
    router.push(`/dueling-tournament/${slug}?tab=${value}`, { scroll: false });
  return (
    <TournamentShell>
      {loading ? (
        <Loading />
      ) : !event ? (
        <>
          <header className="dt-hero">
            <div className="dt-eyebrow">Free Infantry / Dueling</div>
            <h1>Tournament</h1>
          </header>
          <Message error>{error || 'This tournament could not be found.'}</Message>
          <button className="dt-button dt-button-quiet" onClick={() => void refresh()}>
            Retry
          </button>
        </>
      ) : (
        <div
          className="dt-public"
          style={{ '--dt-phase': STAGE_COLOR[eventStage(event, now)] } as CSSProperties}
        >
          <section className="dt-hero2">
            <div className="dt-hero2-copy">
              <span className="dt-pill">
                <i />
                {stageLabel(event, now)}
              </span>
              <EventTitle title={event.settings.title} />
              <p className="dt-when">
                {day(event.settings.startsAt)} <em>/</em> {clock(event.settings.startsAt)} ET
              </p>
              <ul className="dt-statline">
                <li>
                  <b>{event.settings.capacity}</b> players
                </li>
                <li>
                  <b>Best of 5</b> series
                </li>
                <li>
                  <b>Double</b> elimination
                </li>
                <li>
                  {event.settings.seedingMethod === 'draw' ? (
                    <>
                      Seeds drawn <b>live</b>
                    </>
                  ) : (
                    <>
                      Seeded by the <b>director</b>
                    </>
                  )}
                </li>
              </ul>
              {event.settings.description && (
                <p className="dt-desc">{event.settings.description}</p>
              )}
              <PersonalCard event={event} user={Boolean(user)} mutate={mutate} busy={busy} />
            </div>
            <ArenaWindow event={event} now={now} />
          </section>
          <DetailsBand event={event} />
          <RunSteps event={event} now={now} />
          {error && (
            <Message error>
              {error}{' '}
              <button className="dt-button dt-button-quiet" onClick={() => void refresh()}>
                Refresh
              </button>
            </Message>
          )}
          {event.completionReason && (
            <Message>Event ended without a champion: {event.completionReason}</Message>
          )}
          {event.paused && (
            <Message>
              The tournament is {event.phase === 'cancelled' ? 'cancelled' : 'paused'}. Follow the
              event announcements and contact {event.settings.staffContact}.
            </Message>
          )}
          <nav className="dt-tabs" aria-label="Tournament sections">
            {['overview', 'players', 'bracket', 'matches', 'rules', 'notices'].map((value) => (
              <button
                key={value}
                className="dt-tab"
                aria-current={tab === value ? 'page' : undefined}
                onClick={() => selectTab(value)}
              >
                {value[0].toUpperCase() + value.slice(1)}
                {value === 'notices' && event.me?.notices.some((notice) => !notice.readAt) && (
                  <span className="dt-status-dot" />
                )}
              </button>
            ))}
            <Link className="dt-tab" href={`/dueling-tournament/${slug}/seeding`}>
              Seed reveal
            </Link>
            {event.staff && (
              <Link className="dt-tab" href={`/admin/dueling-tournament/${event.id}`}>
                Manage event
              </Link>
            )}
          </nav>
          {tab === 'overview' && (
            <div className="dt-onepage">
              {event.announcements.length > 0 && (
                <section className="dt-block">
                  <Announcements event={event} />
                </section>
              )}
              {event.phase === 'completed' && <ResultsSection event={event} />}
              <HowItWorks event={event} />
              <Schedule event={event} now={now} />
              <PlayersSection event={event} />
              <BracketSection event={event} />
              <RulesSections event={event} />
            </div>
          )}
          {tab === 'players' && (
            <section className="dt-panel">
              <div className="dt-panel-header">
                <h2>Players</h2>
                <label>
                  <span className="dt-visually-hidden">Search players</span>
                  <input
                    className="dt-input"
                    placeholder="Search aliases…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </label>
              </div>
              <div className="dt-panel-body">
                <PlayersGrid event={event} search={search} />
              </div>
            </section>
          )}
          {tab === 'bracket' && <Bracket event={event} />}
          {tab === 'matches' && (
            <div className="dt-stack">
              <ArenaQueue event={event} />
              <section className="dt-panel">
                <div className="dt-panel-header">
                  <h2>All series</h2>
                </div>
                <div className="dt-panel-body dt-match-list">
                  {event.fixtures.map((fixture) => (
                    <MatchCard key={fixture.id} event={event} fixture={fixture} />
                  ))}
                  {!event.fixtures.length && (
                    <p className="dt-muted">Matches appear after the draw is published.</p>
                  )}
                </div>
              </section>
            </div>
          )}
          {tab === 'rules' && <RulesSections event={event} />}
          {tab === 'notices' && (
            <div className="dt-stack">
              <Announcements event={event} />
              <HistoryArchive id={event.id} kind="announcements" />
              <section className="dt-panel">
                <div className="dt-panel-header">
                  <h2>Your notices</h2>
                </div>
                {event.me?.notices.length ? (
                  [...event.me.notices].reverse().map((notice) => (
                    <div
                      key={notice.id}
                      className={`dt-notice ${notice.readAt ? '' : 'is-unread'}`}
                    >
                      <div>
                        <p>{notice.message}</p>
                        <time>{eventTime(notice.createdAt, true)}</time>
                      </div>
                      {!notice.readAt && (
                        <button
                          className="dt-button dt-button-quiet"
                          disabled={busy}
                          onClick={() => void mutate({ type: 'notice_read', noticeId: notice.id })}
                        >
                          Mark read
                        </button>
                      )}
                    </div>
                  ))
                ) : (
                  <div className="dt-empty">
                    {user ? 'No personal notices yet.' : 'Sign in to see your tournament notices.'}
                  </div>
                )}
              </section>
              {user && (
                <HistoryArchive
                  id={event.id}
                  kind="notices"
                  acknowledge={(noticeId) => mutate({ type: 'notice_read', noticeId })}
                />
              )}
            </div>
          )}
          <div className="dt-small" style={{ marginTop: 20 }}>
            Updated{' '}
            {lastFetched
              ? eventTime(new Date(lastFetched).toISOString())
              : eventTime(event.updatedAt)}{' '}
            · Times shown in Eastern time.
          </div>
        </div>
      )}
    </TournamentShell>
  );
}

export function Announcements({ event }: { event: TournamentView }) {
  return (
    <section className="dt-panel">
      <div className="dt-panel-header">
        <h2>Announcements</h2>
      </div>
      {event.announcements.length ? (
        [...event.announcements].reverse().map((item) => (
          <article className="dt-notice" key={item.id}>
            <div>
              <p style={{ whiteSpace: 'pre-wrap' }}>{item.body}</p>
              <time>{eventTime(item.createdAt, true)}</time>
            </div>
          </article>
        ))
      ) : (
        <div className="dt-empty">No event updates yet.</div>
      )}
    </section>
  );
}
