'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ChevronRight, Swords } from 'lucide-react';
import { useAuth } from '@/lib/AuthContext';
import { listResponseSchema, accessResponseSchema } from '@/lib/dueling-tournament/wire';
import type { EventSummary } from '@/lib/dueling-tournament/view';
import { requestJson } from './client';
import { Loading, Message, TournamentShell } from './Shell';
import { IdleArena } from './EventSections';

const PHASE_ORDER = [
  'final',
  'bracket',
  'seeding',
  'check_in',
  'registration',
  'draft',
  'completed',
  'cancelled',
];

function pickEvent(events: EventSummary[]): EventSummary | null {
  const featured = events.find((event) => event.featured);
  if (featured) return featured;
  return (
    [...events].sort(
      (a, b) =>
        PHASE_ORDER.indexOf(a.phase) - PHASE_ORDER.indexOf(b.phase) ||
        Date.parse(a.startsAt) - Date.parse(b.startsAt),
    )[0] ?? null
  );
}

export function Landing() {
  const { user, loading: authLoading } = useAuth();
  const [events, setEvents] = useState<EventSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [staff, setStaff] = useState(false);
  const generation = useRef(0);
  const load = useCallback(async () => {
    const version = ++generation.current;
    try {
      const value = await requestJson('?offset=0', listResponseSchema);
      if (generation.current !== version) return;
      setEvents(value.events);
      setError('');
    } catch (failure) {
      if (generation.current === version)
        setError(failure instanceof Error ? failure.message : 'Could not load events.');
    } finally {
      if (generation.current === version) setLoading(false);
    }
  }, []);
  const invalidateRequests = useCallback(() => {
    generation.current++;
  }, []);
  useEffect(() => {
    setEvents([]);
    setLoading(true);
    if (!authLoading) void load();
    return () => {
      invalidateRequests();
    };
  }, [authLoading, user?.id, load, invalidateRequests]);
  // One tournament, one page: open the featured event, otherwise the one furthest along.
  const router = useRouter();
  const direct = !loading && !error ? pickEvent(events) : null;
  const directSlug = direct?.slug;
  useEffect(() => {
    if (directSlug) router.replace(`/dueling-tournament/${directSlug}`);
  }, [directSlug, router]);
  const userId = user?.id;
  useEffect(() => {
    let active = true;
    setStaff(false);
    if (userId)
      void requestJson('/access', accessResponseSchema)
        .then((value) => {
          if (active) setStaff(value.director || value.referee);
        })
        .catch(() => {});
    return () => {
      active = false;
    };
  }, [userId]);
  return (
    <TournamentShell>
      <div className="dt-public">
        <section className="dt-hero2">
          <div className="dt-hero2-copy">
            <span className="dt-pill">
              <i />
              Free Infantry · CTF
            </span>
            <h1 className="dt-title">
              <span>Dueling</span> <span className="dt-title-accent">Tournaments</span>
            </h1>
            <p className="dt-desc">
              Enter with your Freeinf account. Follow the seed draw, find your next opponent, and
              track every series to the championship.
            </p>
            <ul className="dt-statline">
              <li>
                <b>Seeded</b> double elimination
              </li>
              <li>
                <b>Best of 5</b> series
              </li>
              <li>
                <b>Upper</b> and lower brackets
              </li>
            </ul>
          </div>
          <IdleArena />
        </section>
        {staff && (
          <div className="dt-actions" style={{ marginTop: 18 }}>
            <Link className="dt-button dt-button-quiet" href="/admin/dueling-tournament">
              Tournament administration <ChevronRight size={14} />
            </Link>
          </div>
        )}
        {error && (
          <Message error>
            {error}{' '}
            <button className="dt-button dt-button-quiet" onClick={() => void load()}>
              Retry
            </button>
          </Message>
        )}
        {loading || direct ? (
          <Loading />
        ) : (
          <div className="dt-stack">
            {!events.length && !error && (
              <section className="dt-panel dt-empty">
                <Swords size={30} />
                <h2 className="dt-section-title">The next tournament is on its way</h2>
                <p>
                  Event details and registration will appear here when the organizer publishes them.
                </p>
              </section>
            )}
          </div>
        )}
      </div>
    </TournamentShell>
  );
}
