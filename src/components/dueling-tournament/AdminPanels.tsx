'use client';

import { HistoryArchive } from './HistoryArchive';

import { useId, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import type { Command } from '@/lib/dueling-tournament/contracts';
import type { TournamentView } from '@/lib/dueling-tournament/view';
import { apiRoot, eventTime } from './client';
import { ConfirmDialog } from './ConfirmDialog';
import { Message } from './Shell';
import { Announcements, ArenaQueue } from './EventPage';
import { ruleSectionTemplate } from '@/lib/dueling-tournament/rule-sections';

export type PanelProps = {
  event: TournamentView;
  busy: boolean;
  mutate: (command: Command) => Promise<boolean>;
};

export function OverviewPanel({ event, busy, mutate }: PanelProps) {
  const [confirmation, setConfirmation] = useState<
    'publish' | 'advance' | 'pause' | 'cancel' | 'finish' | null
  >(null);
  const next = ({ draft: 'registration', registration: 'check_in', check_in: 'seeding' } as const)[
    event.phase as 'draft' | 'registration' | 'check_in'
  ];
  const director = event.me?.director;
  const confirmed = event.entries.filter((entry) =>
    ['registered', 'checked_in'].includes(entry.status),
  ).length;
  const count = event.entries.filter((entry) => entry.status === 'checked_in').length;
  return (
    <div className="dt-stack">
      <div className="dt-stats">
        <div className="dt-stat">
          <strong>
            {confirmed}/{event.settings.capacity}
          </strong>
          <span>Confirmed players</span>
        </div>
        <div className="dt-stat">
          <strong>{event.entries.filter((entry) => entry.status === 'waitlisted').length}</strong>
          <span>Waitlisted</span>
        </div>
        <div className="dt-stat">
          <strong>{count}</strong>
          <span>Checked in</span>
        </div>
        <div className="dt-stat">
          <strong>{event.fixtures.filter((fixture) => fixture.result).length}</strong>
          <span>Official results</span>
        </div>
      </div>
      {director && (
        <section className="dt-panel">
          <div className="dt-panel-header">
            <h2>Event controls</h2>
            <span className="dt-badge">
              {event.published
                ? 'Public'
                : event.phase === 'cancelled'
                  ? 'Private archive'
                  : 'Private draft'}
            </span>
          </div>
          <div className="dt-panel-body dt-form">
            <p className="dt-muted">
              Publish the rules and event, then open each phase when its published time arrives.
              Seeding closes check-in and marks unconfirmed players no-show.
            </p>
            <div className="dt-actions">
              {event.paused && event.phase === 'final' && !event.championId && (
                <button
                  className="dt-button dt-button-danger"
                  disabled={busy}
                  onClick={() => setConfirmation('finish')}
                >
                  Finish without a champion
                </button>
              )}
              {!event.published && event.phase !== 'cancelled' && (
                <button
                  className="dt-button"
                  disabled={busy}
                  onClick={() => setConfirmation('publish')}
                >
                  Publish event
                </button>
              )}
              {event.published && !event.featured && (
                <button
                  className="dt-button dt-button-quiet"
                  disabled={busy}
                  onClick={() => void mutate({ type: 'publish', featured: true })}
                >
                  Feature this event
                </button>
              )}
              {next && (
                <button
                  className="dt-button"
                  disabled={busy || !event.published || !event.rules.publishedAt || event.paused}
                  onClick={() => setConfirmation('advance')}
                >
                  Open {next.replace('_', '-')}
                </button>
              )}
              {event.phase === 'seeding' && (
                <Link className="dt-button" href={`/admin/dueling-tournament/${event.id}/seeding`}>
                  Open seed generator
                </Link>
              )}
              {!['cancelled', 'completed'].includes(event.phase) && (
                <>
                  <button
                    className="dt-button dt-button-quiet"
                    disabled={busy}
                    onClick={() => setConfirmation('pause')}
                  >
                    {event.paused ? 'Resume event' : 'Pause event'}
                  </button>
                  <button
                    className="dt-button dt-button-danger"
                    disabled={busy}
                    onClick={() => setConfirmation('cancel')}
                  >
                    Cancel event
                  </button>
                </>
              )}
            </div>
            <div className="dt-small">
              Registration: {eventTime(event.settings.registrationOpensAt, true)} to{' '}
              {eventTime(event.settings.registrationClosesAt, true)}.<br />
              Check-in: {eventTime(event.settings.checkInOpensAt, true)} to{' '}
              {eventTime(event.settings.checkInClosesAt, true)}.
            </div>
            {event.paused && event.phase !== 'cancelled' && (
              <Message>Staff pause reason: {event.pauseReason}</Message>
            )}
          </div>
        </section>
      )}
      {event.phase !== 'cancelled' && <ArenaQueue event={event} admin />}
      {confirmation && (
        <ConfirmDialog
          busy={busy}
          title={
            {
              publish: 'Publish this tournament?',
              advance: `Open ${next?.replace('_', '-')}?`,
              pause: event.paused ? 'Resume the tournament?' : 'Pause the tournament?',
              cancel: 'Cancel this tournament?',
              finish: 'Finish without a champion?',
            }[confirmation]
          }
          requireReason={
            confirmation === 'pause' || confirmation === 'cancel' || confirmation === 'finish'
          }
          onCancel={() => setConfirmation(null)}
          onConfirm={(reason) => {
            if (confirmation === 'finish')
              return mutate({ type: 'finish_without_champion', reason });
            if (confirmation === 'publish') return mutate({ type: 'publish', featured: true });
            if (confirmation === 'advance' && next)
              return mutate({ type: 'registration_state', state: next });
            if (confirmation === 'pause')
              return mutate({ type: 'pause', paused: !event.paused, reason });
            return mutate({ type: 'cancel', reason });
          }}
        >
          {confirmation === 'finish'
            ? 'Use only when no final winner remains and no playable matches remain. This publishes your reason and preserves all results without awarding a champion.'
            : confirmation === 'publish'
              ? 'Players will be able to view this event. Its settings will be locked. Registration still requires published rules and opening the registration phase.'
              : confirmation === 'advance'
                ? next === 'seeding'
                  ? `This locks participation for seeding. There are ${count} checked-in players. Players who never checked in become no-show. The draw requires 4 to 32 checked-in players.`
                  : 'The published time window must be open. This phase cannot be reversed.'
                : confirmation === 'cancel'
                  ? 'This ends the event and removes it from public view. Staff retain the cancellation reason, results and audit history.'
                  : 'Player and match actions stop while paused. Announcements and eligible corrections remain available.'}
        </ConfirmDialog>
      )}
    </div>
  );
}

export function RulesPanel({ event, busy, mutate }: PanelProps) {
  const locked = event.phase !== 'draft' || !event.me?.director;
  const [text, setText] = useState(event.rules.text || (locked ? '' : ruleSectionTemplate()));
  const [publish, setPublish] = useState(false);
  const [saved, setSaved] = useState(false);
  const rulesId = useId();
  return (
    <section className="dt-panel">
      <div className="dt-panel-header">
        <h2>Rulebook</h2>
        <span className="dt-badge">
          {event.rules.publishedAt ? `Published · v${event.rules.version}` : 'Draft'}
        </span>
      </div>
      <div className="dt-panel-body">
        <form
          className="dt-form"
          onSubmit={async (e) => {
            e.preventDefault();
            if (await mutate({ type: 'rules', text, publish })) setSaved(true);
          }}
        >
          <p className="dt-muted">
            New rulebooks start with DUELER class, referee-controlled starts, seed-assigned corners
            and a 2-minute arrival limit. Review these rules and complete the remaining sections
            before publishing. Registration records acceptance of this version. Rules freeze when
            registration opens.
          </p>
          <p className="dt-muted">
            Start a line with <code>## </code> to begin a section, for example{' '}
            <code>## Check-in and no-shows</code>. The public Rules tab shows each section as a card
            and marks empty or missing standard sections as not published yet.
          </p>
          {!locked && !text.trim() && (
            <div>
              <button
                type="button"
                className="dt-button dt-button-quiet"
                onClick={() => {
                  setText(ruleSectionTemplate());
                  setSaved(false);
                }}
              >
                Insert tournament rules
              </button>
            </div>
          )}
          {saved && <Message>Rulebook saved.</Message>}
          <div className="dt-label">
            <label htmlFor={rulesId}>Tournament rules</label>
            <textarea
              id={rulesId}
              required
              maxLength={30000}
              className="dt-textarea"
              style={{ minHeight: 360 }}
              disabled={locked || busy}
              value={text}
              onChange={(e) => {
                setText(e.target.value);
                setSaved(false);
              }}
            />
          </div>
          {!locked && (
            <>
              <label className="dt-check">
                <input
                  type="checkbox"
                  checked={publish}
                  onChange={(e) => setPublish(e.target.checked)}
                />
                <span>Publish this rulebook for players to read and accept.</span>
              </label>
              <div>
                <button className="dt-button" disabled={busy || !text.trim()}>
                  {publish ? 'Publish rules' : 'Save draft rules'}
                </button>
              </div>
            </>
          )}
        </form>
      </div>
    </section>
  );
}

export function PlayersPanel({ event, busy, mutate }: PanelProps) {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('all');
  const [ruling, setRuling] = useState<{
    entryId: string;
    status: 'no_show' | 'disqualified' | 'restore';
  } | null>(null);
  const entries = event.staff?.entries ?? [];
  const waiting = entries
    .filter((entry) => entry.status === 'waitlisted')
    .sort(
      (a, b) =>
        a.registeredAt.localeCompare(b.registeredAt) ||
        a.registrationSequence - b.registrationSequence,
    );
  const canPromote =
    event.me?.director &&
    ['registration', 'check_in'].includes(event.phase) &&
    !event.draws.some((draw) => !draw.voidReason) &&
    entries.filter((entry) => ['registered', 'checked_in'].includes(entry.status)).length <
      event.settings.capacity;
  return (
    <section className="dt-panel">
      <div className="dt-panel-header">
        <h2>Players and waitlist</h2>
        <div className="dt-actions">
          <label>
            <span className="dt-visually-hidden">Search players</span>
            <input
              className="dt-input"
              placeholder="Search aliases…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </label>
          <label>
            <span className="dt-visually-hidden">Filter player status</span>
            <select
              className="dt-select"
              value={status}
              onChange={(e) => setStatus(e.target.value)}
            >
              {[
                'all',
                'registered',
                'checked_in',
                'waitlisted',
                'no_show',
                'disqualified',
                'withdrawn',
              ].map((value) => (
                <option key={value} value={value}>
                  {value.replace('_', ' ')}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>
      <div className="dt-table-wrap">
        <table className="dt-table">
          <thead>
            <tr>
              <th>Player</th>
              <th>Status</th>
              <th>Seed</th>
              <th>Rules</th>
              <th>Registered</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {entries
              .filter(
                (entry) =>
                  (status === 'all' || entry.status === status) &&
                  entry.alias.toLowerCase().includes(search.toLowerCase()),
              )
              .sort((a, b) => a.registrationSequence - b.registrationSequence)
              .map((entry) => (
                <tr key={entry.id}>
                  <td>{entry.alias}</td>
                  <td>
                    <span className="dt-badge">{entry.status.replace('_', ' ')}</span>
                    {entry.status === 'waitlisted' && (
                      <div className="dt-small">
                        Waitlist #{waiting.findIndex((item) => item.id === entry.id) + 1}
                      </div>
                    )}
                  </td>
                  <td>{entry.seed ?? '–'}</td>
                  <td>v{entry.acceptedRulesVersion}</td>
                  <td>{eventTime(entry.registeredAt, true)}</td>
                  <td>
                    <div className="dt-actions">
                      {entry.id === waiting[0]?.id && (
                        <button
                          className="dt-button dt-button-quiet"
                          disabled={!canPromote || busy}
                          onClick={() => void mutate({ type: 'promote', entryId: entry.id })}
                        >
                          Promote
                        </button>
                      )}
                      {event.me?.director && event.staff?.reversibleEntryIds.includes(entry.id) && (
                        <button
                          className="dt-button dt-button-quiet"
                          disabled={busy}
                          onClick={() => setRuling({ entryId: entry.id, status: 'restore' })}
                        >
                          Restore availability
                        </button>
                      )}
                      {!['withdrawn', 'no_show', 'disqualified'].includes(entry.status) && (
                        <>
                          <button
                            className="dt-button dt-button-quiet"
                            disabled={busy}
                            onClick={() => setRuling({ entryId: entry.id, status: 'no_show' })}
                          >
                            No-show
                          </button>
                          <button
                            className="dt-button dt-button-danger"
                            disabled={busy}
                            onClick={() => setRuling({ entryId: entry.id, status: 'disqualified' })}
                          >
                            DQ
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
      {!entries.length && (
        <div className="dt-empty">
          Players appear here after registering with their Freeinf accounts.
        </div>
      )}
      <div className="dt-panel-body dt-small">
        Promotions follow registration order and require an available place. Players check
        themselves in. A DQ or no-show after the bracket is published requires a forfeit ruling on
        each affected match.
      </div>
      {ruling && (
        <ConfirmDialog
          busy={busy}
          title={`Mark ${entries.find((entry) => entry.id === ruling.entryId)?.alias} ${ruling.status.replace('_', ' ')}?`}
          requireReason
          onCancel={() => setRuling(null)}
          onConfirm={(reason) =>
            ruling.status === 'restore'
              ? mutate({ type: 'restore_entry', entryId: ruling.entryId, reason })
              : mutate({
                  type: 'entry_status',
                  entryId: ruling.entryId,
                  status: ruling.status,
                  reason,
                })
          }
        >
          Record the referee&apos;s ruling. This changes player availability. It does not invent a
          match score or silently change an existing result.
        </ConfirmDialog>
      )}
    </section>
  );
}

export function StaffPanel({ event, busy, mutate }: PanelProps) {
  const [userId, setUserId] = useState('');
  if (!event.me?.director)
    return (
      <Message>
        Your account has referee access for this event. Contact the director about staff
        assignments.
      </Message>
    );
  return (
    <section className="dt-panel">
      <div className="dt-panel-header">
        <h2>Event referees</h2>
      </div>
      <div className="dt-panel-body dt-form">
        <p className="dt-muted">
          Referees can start and hold matches, schedule series, record scores and forfeits, and mark
          availability. Director access is granted by the database owner.
        </p>
        {event.me?.director && (
          <form
            className="dt-form"
            onSubmit={async (e) => {
              e.preventDefault();
              if (await mutate({ type: 'staff', userId: userId.trim(), grant: true }))
                setUserId('');
            }}
          >
            <label className="dt-label">
              Existing Freeinf account ID
              <input
                required
                className="dt-input"
                value={userId}
                onChange={(e) => setUserId(e.target.value)}
                placeholder="Account UUID"
              />
            </label>
            <div>
              <button className="dt-button" disabled={busy}>
                Assign referee
              </button>
            </div>
          </form>
        )}
        {event.staff?.refereeIds.map((id) => (
          <div className="dt-actions" key={id}>
            <code className="dt-proof">{id}</code>
            {event.me?.director && (
              <button
                className="dt-button dt-button-danger"
                disabled={busy}
                onClick={() => void mutate({ type: 'staff', userId: id, grant: false })}
              >
                Remove referee
              </button>
            )}
          </div>
        ))}
        {!event.staff?.refereeIds.length && (
          <p className="dt-small">No referees assigned. The director can operate the match desk.</p>
        )}
      </div>
    </section>
  );
}

export function AnnouncementsPanel({ event, busy, mutate }: PanelProps) {
  const [body, setBody] = useState('');
  return (
    <div className="dt-stack">
      {event.me?.director && (
        <section className="dt-panel">
          <div className="dt-panel-header">
            <h2>Post an event update</h2>
          </div>
          <div className="dt-panel-body">
            <form
              className="dt-form"
              onSubmit={async (e) => {
                e.preventDefault();
                if (await mutate({ type: 'announcement', body })) setBody('');
              }}
            >
              <label className="dt-label">
                Public announcement
                <textarea
                  className="dt-textarea"
                  required
                  maxLength={4000}
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                />
              </label>
              <p className="dt-small">
                This appears on the website. The referee must also call players in{' '}
                {event.settings.callChannel}.
              </p>
              <div>
                <button className="dt-button" disabled={busy || !body.trim()}>
                  Publish announcement
                </button>
              </div>
            </form>
          </div>
        </section>
      )}
      <Announcements event={event} />
    </div>
  );
}

export function HistoryPanel({ event }: { event: TournamentView }) {
  if (!event.me?.director)
    return (
      <Message>
        Detailed event history is available to the tournament director. Official match results and
        rulings remain on the match desk.
      </Message>
    );
  return (
    <div className="dt-stack">
      <section className="dt-panel">
        <div className="dt-panel-header">
          <h2>Event history</h2>
          <span className="dt-small">Revision {event.revision}</span>
        </div>
        <div className="dt-panel-body dt-audit">
          {[...(event.staff?.audit ?? [])].reverse().map((item) => (
            <article className="dt-audit-item" key={item.id}>
              <strong>
                #{item.revision} · {item.action.replaceAll('_', ' ')}
                {item.matchId ? ` · ${item.matchId}` : ''}
              </strong>
              <p className="dt-small">
                {eventTime(item.at, true)} · Account {item.actorId}
              </p>
              {item.reason && <p>{item.reason}</p>}
              {item.previousResult && (
                <p>
                  Previous result: {item.previousResult.kind} · {item.previousResult.scoreA ?? '–'}–
                  {item.previousResult.scoreB ?? '–'} · winner{' '}
                  {event.entries.find((entry) => entry.id === item.previousResult?.winnerId)
                    ?.alias ?? 'none'}
                </p>
              )}
              {Object.keys(item.details).length > 0 && (
                <details>
                  <summary>Details</summary>
                  <pre className="dt-proof" style={{ whiteSpace: 'pre-wrap' }}>
                    {JSON.stringify(item.details, null, 2)}
                  </pre>
                </details>
              )}
            </article>
          ))}
          {!event.staff?.audit.length && (
            <p className="dt-muted">Actions will appear here as the event is prepared.</p>
          )}
        </div>
      </section>
      {event.me?.director && <HistoryArchive id={event.id} kind="audit" />}
    </div>
  );
}

export function ExportsPanel({ event }: { event: TournamentView }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function download(kind: string) {
    setBusy(true);
    setError('');
    try {
      const { data } = await supabase.auth.getSession();
      const response = await fetch(
        `${apiRoot}/${encodeURIComponent(event.id)}/export?kind=${kind}`,
        {
          cache: 'no-store',
          headers: data.session ? { Authorization: `Bearer ${data.session.access_token}` } : {},
        },
      );
      if (!response.ok)
        throw new Error('Could not export this event. Refresh and check your staff access.');
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement('a');
      link.href = url;
      link.download = `${event.settings.slug}-${kind}.${kind === 'event' ? 'json' : 'csv'}`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Export failed.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="dt-panel">
      <div className="dt-panel-header">
        <h2>Event exports</h2>
      </div>
      <div className="dt-panel-body dt-form">
        <p className="dt-muted">
          Download the roster, match schedule, results, or a public event archive. Exports contain
          player aliases and public event data.
        </p>
        {error && <Message error>{error}</Message>}
        <div className="dt-actions">
          {['players', 'matches', 'results', 'event'].map((kind) => (
            <button
              key={kind}
              className="dt-button dt-button-quiet"
              disabled={busy}
              onClick={() => void download(kind)}
            >
              {kind === 'event'
                ? 'Event archive JSON'
                : `${kind[0].toUpperCase()}${kind.slice(1)} CSV`}
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}
