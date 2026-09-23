'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/AuthContext';
import type { EventSummary } from '@/lib/dueling-tournament/view';
import { detailResponseSchema, listResponseSchema } from '@/lib/dueling-tournament/wire';
import { AdminAccess } from './AdminAccess';
import { eventTime, requestJson } from './client';
import { Loading, Message, TournamentShell } from './Shell';
import { SettingsForm } from './SettingsForm';

function EventList({ director }: { director: boolean }) {
  const { user } = useAuth();
  const router = useRouter();
  const [events, setEvents] = useState<EventSummary[]>([]);
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [offset, setOffset] = useState<number | null>(null);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true;
    setEvents([]);
    setLoading(true);
    void requestJson('', listResponseSchema)
      .then((value) => {
        if (active) {
          setEvents(value.events);
          setOffset(value.nextOffset ?? null);
          setError('');
        }
      })
      .catch((failure) => {
        if (active) setError(failure instanceof Error ? failure.message : 'Could not load events.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [user?.id, retry]);
  return (
    <div className="dt-stack">
      {error && (
        <Message error>
          {error}{' '}
          <button
            className="dt-button dt-button-quiet"
            onClick={() => setRetry((value) => value + 1)}
          >
            Refresh
          </button>
        </Message>
      )}
      {director && (
        <div className="dt-actions">
          <button className="dt-button" onClick={() => setCreating((value) => !value)}>
            {creating ? 'Close new event' : 'Create tournament'}
          </button>
          <span className="dt-small">New events start as private drafts.</span>
        </div>
      )}
      {creating && (
        <section className="dt-panel">
          <div className="dt-panel-header">
            <h2>New tournament</h2>
          </div>
          <div className="dt-panel-body">
            <SettingsForm
              busy={busy}
              label="Create private draft"
              onSave={async (settings) => {
                setBusy(true);
                setError('');
                try {
                  const value = await requestJson('', detailResponseSchema, {
                    method: 'POST',
                    body: JSON.stringify({ operationId: crypto.randomUUID(), settings }),
                  });
                  router.push(`/admin/dueling-tournament/${value.event.id}`);
                  return true;
                } catch (failure) {
                  setError(
                    failure instanceof Error ? failure.message : 'Could not create tournament.',
                  );
                  return false;
                } finally {
                  setBusy(false);
                }
              }}
            />
          </div>
        </section>
      )}
      {loading ? (
        <Loading />
      ) : (
        events.map((event) => (
          <article className="dt-panel dt-event-card" key={event.id}>
            <div>
              <span className="dt-badge">
                {event.published ? 'Public' : 'Private draft'} · {event.phase.replace('_', ' ')}
              </span>
              <h2>{event.title}</h2>
              <p className="dt-muted">
                {eventTime(event.startsAt, true)} · {event.registered}/{event.capacity} players
              </p>
            </div>
            <Link
              className="dt-button dt-button-quiet"
              href={`/admin/dueling-tournament/${event.id}`}
            >
              Manage tournament
            </Link>
          </article>
        ))
      )}
      {!loading && !events.length && !error && (
        <div className="dt-empty">
          {director
            ? 'Create the first event to set its dates, rules, and registration window.'
            : 'No events have been assigned to your account.'}
        </div>
      )}
      {offset !== null && (
        <button
          className="dt-button dt-button-quiet"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              const value = await requestJson(`?offset=${offset}`, listResponseSchema);
              setEvents((old) => [...old, ...value.events]);
              setOffset(value.nextOffset ?? null);
            } catch (failure) {
              setError(failure instanceof Error ? failure.message : 'Could not load more events.');
            } finally {
              setBusy(false);
            }
          }}
        >
          More events
        </button>
      )}
    </div>
  );
}

export function AdminLanding() {
  return (
    <TournamentShell admin>
      <header className="dt-hero">
        <div className="dt-eyebrow">Free Infantry / Tournament administration</div>
        <h1>EVENT CONTROL</h1>
        <p>
          Prepare registration, run the public seed draw, and manage every result from one arena
          desk.
        </p>
      </header>
      <AdminAccess>{(director) => <EventList director={director} />}</AdminAccess>
    </TournamentShell>
  );
}
