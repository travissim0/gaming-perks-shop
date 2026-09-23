'use client';

import Link from 'next/link';
import { useSearchParams, useRouter } from 'next/navigation';
import { authLink, rememberAuthReturn } from '@/lib/auth-return';
import { useTournament } from './client';
import { Loading, Message, TournamentShell } from './Shell';
import { EventHero } from './EventPage';
import { Bracket } from './Bracket';
import { SettingsForm } from './SettingsForm';
import { MatchDesk } from './MatchDesk';
import {
  AnnouncementsPanel,
  ExportsPanel,
  HistoryPanel,
  OverviewPanel,
  PlayersPanel,
  RulesPanel,
  StaffPanel,
} from './AdminPanels';

export function AdminEvent({ id }: { id: string }) {
  const { event, loading, error, busy, mutate, refresh, user } = useTournament(id, true);
  const search = useSearchParams();
  const router = useRouter();
  const tab = search.get('tab') ?? 'overview';
  const tabs = [
    'overview',
    'setup',
    'rules',
    'players',
    'bracket',
    'matches',
    'staff',
    'announcements',
    'history',
    'exports',
  ];
  const root = `/admin/dueling-tournament/${id}`;
  return (
    <TournamentShell admin>
      {loading ? (
        <Loading />
      ) : !user ? (
        <Message>
          Sign in to manage this event.{' '}
          <Link
            className="dt-button"
            href={authLink('/auth/login', root)}
            onClick={() => rememberAuthReturn(root)}
          >
            Sign in
          </Link>
        </Message>
      ) : !event?.staff ? (
        <Message error>
          {error || 'Your account does not have staff access to this tournament.'}
        </Message>
      ) : (
        <>
          <div className="dt-actions" style={{ marginBottom: 16 }}>
            <Link className="dt-button dt-button-quiet" href="/admin/dueling-tournament">
              All events
            </Link>
            <Link
              className="dt-button dt-button-quiet"
              href={`/dueling-tournament/${event.settings.slug}`}
            >
              View public page
            </Link>
            <span className="dt-badge dt-badge-cyan">
              {event.me?.director ? 'Director' : 'Referee'}
            </span>
          </div>
          <EventHero event={event} />
          {error && (
            <Message error>
              {error}{' '}
              <button className="dt-button dt-button-quiet" onClick={() => void refresh()}>
                Refresh current state
              </button>
            </Message>
          )}
          {event.paused && <Message>Event paused. {event.pauseReason}</Message>}
          <nav className="dt-tabs" aria-label="Administration sections">
            {tabs.map((value) => (
              <button
                key={value}
                className="dt-tab"
                aria-current={tab === value ? 'page' : undefined}
                onClick={() => router.push(`${root}?tab=${value}`, { scroll: false })}
              >
                {value[0].toUpperCase() + value.slice(1)}
              </button>
            ))}
            <Link className="dt-tab" href={`${root}/seeding`}>
              Seed generator
            </Link>
          </nav>
          {tab === 'overview' && <OverviewPanel event={event} busy={busy} mutate={mutate} />}
          {tab === 'setup' && (
            <section className="dt-panel">
              <div className="dt-panel-header">
                <h2>Event settings</h2>
              </div>
              <div className="dt-panel-body">
                <SettingsForm
                  initial={event.settings}
                  busy={busy}
                  locked={event.published || !event.me?.director}
                  onSave={(settings) => mutate({ type: 'settings', settings })}
                />
              </div>
            </section>
          )}
          {tab === 'rules' && <RulesPanel event={event} busy={busy} mutate={mutate} />}
          {tab === 'players' && <PlayersPanel event={event} busy={busy} mutate={mutate} />}
          {tab === 'bracket' && <Bracket event={event} admin />}
          {tab === 'matches' && (
            <MatchDesk
              key={search.get('match') ?? ''}
              event={event}
              busy={busy}
              mutate={mutate}
              selected={search.get('match') ?? ''}
            />
          )}
          {tab === 'staff' && <StaffPanel event={event} busy={busy} mutate={mutate} />}
          {tab === 'announcements' && (
            <AnnouncementsPanel event={event} busy={busy} mutate={mutate} />
          )}
          {tab === 'history' && <HistoryPanel event={event} />}
          {tab === 'exports' && <ExportsPanel event={event} />}
        </>
      )}
    </TournamentShell>
  );
}
