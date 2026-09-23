'use client';

import Link from 'next/link';
import { useTournament, eventTime } from './client';
import { Loading, Message, TournamentShell } from './Shell';
import { playerName } from './Bracket';
import {
  MATCH_ATTENDANCE_RULE,
  MATCH_START_RULE,
  startingCorners,
} from '@/lib/dueling-tournament/match-procedure';

export function MatchPage({ slug, matchId }: { slug: string; matchId: string }) {
  const { event, error, loading, refresh } = useTournament(slug);
  const fixture = event?.fixtures.find((item) => item.id === matchId);
  const corners = event && fixture ? startingCorners(event, fixture) : [null, null];
  return (
    <TournamentShell>
      {loading ? (
        <Loading />
      ) : !event || !fixture ? (
        <Message error>{error || 'This match is not available.'}</Message>
      ) : (
        <>
          <div className="dt-actions" style={{ marginBottom: 20 }}>
            <Link
              className="dt-button dt-button-quiet"
              href={`/dueling-tournament/${slug}?tab=bracket`}
            >
              Back to bracket
            </Link>
            {event.staff && (
              <Link
                className="dt-button dt-button-quiet"
                href={`/admin/dueling-tournament/${event.id}?tab=matches&match=${matchId}`}
              >
                Open match desk
              </Link>
            )}
          </div>
          <header className="dt-hero">
            <div className="dt-eyebrow">{event.settings.title}</div>
            <h1>
              {fixture.id} /{' '}
              {fixture.bracket === 'reset' ? 'Championship reset' : `${fixture.bracket} bracket`}
            </h1>
            <div className="dt-meta">
              <span>Best of five</span>
              <span>{event.settings.arena}</span>
              <span>{fixture.state.replace('_', ' ')}</span>
            </div>
          </header>
          {error && (
            <Message error>
              {error}{' '}
              <button className="dt-button dt-button-quiet" onClick={() => void refresh()}>
                Refresh
              </button>
            </Message>
          )}
          <section className="dt-panel dt-stack">
            <div className="dt-versus">
              {fixture.slots.map((slot, index) => (
                <div key={index}>
                  <span className="dt-small">
                    {slot.state === 'player'
                      ? `Seed ${event.entries.find((entry) => entry.id === slot.entryId)?.seed}`
                      : slot.state === 'empty'
                        ? 'BYE'
                        : 'OPPONENT PENDING'}
                  </span>
                  <h2>{playerName(event, slot)}</h2>
                  {corners[index] && <div className="dt-badge dt-badge-cyan">{corners[index]}</div>}
                  <div className="dt-score">
                    {fixture.result
                      ? ((index ? fixture.result.scoreB : fixture.result.scoreA) ?? '–')
                      : '–'}
                  </div>
                  {fixture.winner.state === 'player' &&
                    slot.state === 'player' &&
                    fixture.winner.entryId === slot.entryId && (
                      <span className="dt-badge dt-badge-green">Winner</span>
                    )}
                </div>
              ))}
            </div>
            <div className="dt-panel-body dt-form">
              <p className="dt-muted">{MATCH_START_RULE}</p>
              <p className="dt-muted">{MATCH_ATTENDANCE_RULE}</p>
              {fixture.result && (
                <p className="dt-muted">
                  Official result: {fixture.result.kind.replaceAll('_', ' ')}. Recorded{' '}
                  {eventTime(fixture.result.recordedAt, true)}.
                </p>
              )}
              {fixture.state === 'conditional' && (
                <Message>
                  This BO5 reset is played only if the lower-bracket winner wins the first final.
                </Message>
              )}
              {fixture.scheduledAt && (
                <p className="dt-muted">
                  Earliest scheduled start: {eventTime(fixture.scheduledAt, true)}.
                </p>
              )}
              {fixture.startedAt && (
                <p className="dt-muted">Started {eventTime(fixture.startedAt)}.</p>
              )}
              <p className="dt-muted">
                Wait for the referee&apos;s call in {event.settings.callChannel}. Contact{' '}
                {event.settings.staffContact} for match rulings or disputes.
              </p>
              <div className="dt-actions">
                {fixture.sources.map((source, index) =>
                  source.kind === 'seed' ? (
                    <span className="dt-badge" key={index}>
                      From seed {source.seed}
                    </span>
                  ) : (
                    <Link
                      className="dt-button dt-button-quiet"
                      key={index}
                      href={`/dueling-tournament/${slug}/matches/${source.matchId}`}
                    >
                      {source.kind === 'winner' ? 'Winner' : 'Loser'} of {source.matchId}
                    </Link>
                  ),
                )}
              </div>
            </div>
          </section>
        </>
      )}
    </TournamentShell>
  );
}
