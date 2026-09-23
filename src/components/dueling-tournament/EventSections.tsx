'use client';

import { bracketSizeFor, createBracket } from '@/lib/dueling-tournament/bracket';
import type { BracketSize } from '@/lib/dueling-tournament/contracts';

import type { ReactNode } from 'react';
import Link from 'next/link';
import type { TournamentView } from '@/lib/dueling-tournament/view';
import { RULE_SECTIONS, parseRuleSections } from '@/lib/dueling-tournament/rule-sections';
import { Countdown, PixelText, Sprite, classFor } from './ArenaArt';

type Slot = TournamentView['fixtures'][number]['slots'][number];

export type Stage = 'draft' | 'signup' | 'checkin' | 'draw' | 'live' | 'done' | 'cancelled';

export const STAGE_COLOR: Record<Stage, string> = {
  draft: '#8b98b0',
  signup: '#22d3ee',
  checkin: '#34d399',
  draw: '#22d3ee',
  live: '#f87171',
  done: '#f59e0b',
  cancelled: '#8b98b0',
};

const CYAN = '#22d3ee';
const MUTED = '#8b98b0';
const DIM = '#5f6b82';

export function eventStage(event: TournamentView, now: number): Stage {
  if (event.phase === 'cancelled') return 'cancelled';
  if (event.phase === 'completed') return 'done';
  if (event.phase === 'bracket' || event.phase === 'final') return 'live';
  if (event.phase === 'seeding') return 'draw';
  if (event.phase === 'draft') return 'draft';
  if (now > Date.parse(event.settings.checkInClosesAt)) return 'draw';
  if (now >= Date.parse(event.settings.checkInOpensAt)) return 'checkin';
  return 'signup';
}

export function stageLabel(event: TournamentView, now: number): string {
  if (event.paused && event.phase !== 'cancelled') return 'Paused';
  const stage = eventStage(event, now);
  if (stage === 'signup' || stage === 'draft') {
    if (now < Date.parse(event.settings.registrationOpensAt)) return 'Sign-ups open soon';
    return now < Date.parse(event.settings.registrationClosesAt)
      ? 'Sign-ups open'
      : 'Sign-ups closed';
  }
  return {
    draft: 'Draft',
    checkin: 'Check-in open',
    draw: 'Seed draw',
    live: 'Live now',
    done: 'Finished',
    cancelled: 'Cancelled',
  }[stage];
}

export function clock(value: string) {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value));
}

export function day(value: string) {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  }).format(new Date(value));
}

export function ordinal(place: number) {
  const tens = place % 100;
  const suffix =
    tens >= 11 && tens <= 13 ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' }[place % 10] ?? 'th');
  return `${place}${suffix}`;
}

function entryFor(event: TournamentView, slot: Slot) {
  return slot.state === 'player' ? event.entries.find((entry) => entry.id === slot.entryId) : null;
}

function counts(event: TournamentView) {
  const inField = event.entries.filter((entry) =>
    ['registered', 'checked_in'].includes(entry.status),
  ).length;
  return {
    inField,
    checkedIn: event.entries.filter((entry) => entry.status === 'checked_in').length,
    waitlisted: event.entries.filter((entry) => entry.status === 'waitlisted').length,
  };
}

export function EventTitle({ title }: { title: string }) {
  const words = title.trim().split(/\s+/);
  const last = words.length > 1 ? words.pop() : null;
  return (
    <h1 className="dt-title">
      <span>{words.join(' ')}</span>
      {last && (
        <>
          {' '}
          <span className="dt-title-accent">{last}</span>
        </>
      )}
    </h1>
  );
}

function Blocks({ total, fill }: { total: number; fill: [string, number][] }) {
  const cells: string[] = [];
  for (const [kind, amount] of fill) for (let i = 0; i < amount; i++) cells.push(kind);
  while (cells.length < total) cells.push('');
  return (
    <div
      className="dt-blocks"
      aria-hidden="true"
      style={{ gridTemplateColumns: `repeat(${total}, minmax(0, 1fr))` }}
    >
      {cells.slice(0, total).map((kind, index) => (
        <i key={index} className={kind} />
      ))}
    </div>
  );
}

function Duel({ grey = false }: { grey?: boolean }) {
  const tone = grey ? 'grey' : undefined;
  return (
    <>
      <Sprite cls="infantry" facing="east" scale={3.3} tone={tone} className="dt-floor-east" />
      <span className="dt-floor-badge">
        <PixelText text="VS" size="medium" color="#c3cddd" />
      </span>
      <Sprite cls="heavy-weapons" facing="west" scale={3.3} tone={tone} className="dt-floor-west" />
    </>
  );
}

/** The arena with nobody on it yet, for pages without an event. */
export function IdleArena() {
  return (
    <div className="dt-arena">
      <div className="dt-arena-top">
        <PixelText text="DUELING ARENA" color={MUTED} />
        <PixelText text="1V1 / BEST OF 5" color={DIM} />
      </div>
      <div className="dt-floor">
        <Duel />
      </div>
    </div>
  );
}

/** The hero "arena window": a game-floor scene plus the one thing that matters right now. */
export function ArenaWindow({ event, now }: { event: TournamentView; now: number }) {
  const stage = eventStage(event, now);
  const settings = event.settings;
  const { inField, checkedIn, waitlisted } = counts(event);
  const capacity = settings.capacity;
  const active = event.fixtures.find((fixture) => fixture.startedAt && !fixture.result) ?? null;
  const queued = event.queue
    .map((item) => ({
      item,
      fixture: event.fixtures.find((fixture) => fixture.id === item.matchId),
    }))
    .filter(
      (
        row,
      ): row is {
        item: TournamentView['queue'][number];
        fixture: TournamentView['fixtures'][number];
      } => Boolean(row.fixture) && row.fixture!.id !== active?.id,
    );
  const shown = active ?? queued[0]?.fixture ?? null;
  const upcoming = active ? queued.slice(0, 2) : queued.slice(1, 3);
  const champion = event.entries.find((entry) => entry.id === event.championId) ?? null;
  const second = event.placements.find((row) => row.place === 2);
  const third = event.placements.find((row) => row.place === 3);
  const root = `/dueling-tournament/${settings.slug}`;

  let right: [string, string];
  if (event.paused && stage !== 'cancelled') right = ['PAUSED', MUTED];
  else if (stage === 'checkin') right = ['CHECK-IN OPEN', '#34d399'];
  else if (stage === 'draw') right = ['SEED DRAW', CYAN];
  else if (stage === 'live')
    right = active
      ? [`${active.state === 'held' ? 'ON HOLD' : 'LIVE'} / ${active.id}`, '#f87171']
      : shown
        ? [`NEXT / ${shown.id}`, CYAN]
        : ['BETWEEN MATCHES', MUTED];
  else if (stage === 'done') right = [champion ? 'CHAMPION' : 'FINAL STANDINGS', '#f59e0b'];
  else if (stage === 'cancelled') right = ['CANCELLED', MUTED];
  else right = ['1V1 / BEST OF 5', DIM];

  const featured =
    stage === 'live' && shown ? shown.slots.map((slot) => entryFor(event, slot)) : null;

  return (
    <div className="dt-arena">
      <div className="dt-arena-top">
        <PixelText text="DUELING ARENA" color={MUTED} />
        <PixelText text={right[0]} color={right[1]} />
      </div>
      <div className="dt-floor">
        {featured && featured[0] && featured[1] ? (
          <>
            <Sprite
              cls={classFor(featured[0].alias)}
              facing="east"
              scale={2.9}
              className="dt-floor-east dt-floor-raised"
            />
            <span className="dt-floor-badge dt-floor-badge-top">
              <PixelText
                text={active ? (active.state === 'held' ? 'ON HOLD' : 'BO5') : 'NEXT UP'}
                size="medium"
                color={active && active.state !== 'held' ? '#f87171' : '#c3cddd'}
              />
            </span>
            <Sprite
              cls={classFor(featured[1].alias)}
              facing="west"
              scale={2.9}
              className="dt-floor-west dt-floor-raised"
            />
            <div className="dt-floor-name dt-floor-name-l">
              {featured[0].alias}
              <small>{featured[0].seed ? `Seed ${featured[0].seed}` : 'Unseeded'}</small>
            </div>
            <div className="dt-floor-name dt-floor-name-r">
              {featured[1].alias}
              <small>{featured[1].seed ? `Seed ${featured[1].seed}` : 'Unseeded'}</small>
            </div>
          </>
        ) : stage === 'done' && champion ? (
          <>
            <Sprite
              cls={classFor(champion.alias)}
              facing="south"
              scale={3.6}
              tone="gold"
              className="dt-floor-center"
            />
            {second && (
              <div className="dt-floor-side dt-floor-side-l">
                {second.alias}
                <small>2ND</small>
              </div>
            )}
            {third && (
              <div className="dt-floor-side dt-floor-side-r">
                {third.alias}
                <small>3RD</small>
              </div>
            )}
            <div className="dt-floor-champ">{champion.alias}</div>
          </>
        ) : (
          <>
            <Duel grey={stage === 'cancelled' || (stage === 'done' && !champion)} />
            {stage === 'done' && !champion && (
              <div className="dt-floor-champ is-muted">Title not awarded</div>
            )}
          </>
        )}
      </div>
      <div className="dt-arena-foot">
        {stage === 'draft' || stage === 'signup' ? (
          <>
            <div className="dt-arena-row">
              <div>
                {now < Date.parse(settings.registrationOpensAt) ? (
                  <>
                    <PixelText text="SIGN-UPS OPEN IN" color={MUTED} />
                    <Countdown until={settings.registrationOpensAt} now={now} />
                  </>
                ) : now < Date.parse(settings.registrationClosesAt) ? (
                  <>
                    <PixelText text="SIGN-UPS CLOSE IN" color={MUTED} />
                    <Countdown until={settings.registrationClosesAt} now={now} />
                  </>
                ) : (
                  <>
                    <PixelText text="CHECK-IN OPENS IN" color={MUTED} />
                    <Countdown until={settings.checkInOpensAt} now={now} />
                  </>
                )}
              </div>
              <div className="dt-arena-right">
                <PixelText text="SPOTS" color={MUTED} />
                <span className="dt-countdown">
                  {inField}
                  <i>/{capacity}</i>
                </span>
              </div>
            </div>
            <Blocks total={capacity} fill={[['on', inField]]} />
            <div className="dt-arena-note">
              <span>
                <b>{Math.max(0, capacity - inField)}</b>{' '}
                {capacity - inField === 1 ? 'spot' : 'spots'} left
              </span>
              <span>
                {waitlisted
                  ? `${waitlisted} on the waitlist`
                  : inField >= capacity
                    ? 'New sign-ups join the waitlist'
                    : 'Waitlist opens when full'}
              </span>
            </div>
          </>
        ) : stage === 'checkin' ? (
          <>
            <div className="dt-arena-row">
              <div>
                <PixelText text="CHECK-IN CLOSES IN" color="#34d399" />
                <Countdown until={settings.checkInClosesAt} now={now} />
              </div>
              <div className="dt-arena-right">
                <PixelText text="CHECKED IN" color={MUTED} />
                <span className="dt-countdown">
                  {checkedIn}
                  <i>/{inField}</i>
                </span>
              </div>
            </div>
            <Blocks
              total={capacity}
              fill={[
                ['in', checkedIn],
                ['reg', inField - checkedIn],
              ]}
            />
            <div className="dt-arena-note">
              <span>
                {inField - checkedIn ? (
                  <>
                    <b>{inField - checkedIn}</b> still to check in
                  </>
                ) : (
                  'Everyone is checked in'
                )}
              </span>
              <span>Seeds are drawn after check-in</span>
            </div>
          </>
        ) : stage === 'draw' ? (
          <div className="dt-arena-row">
            <div>
              <PixelText text="SEED DRAW" color={CYAN} />
              <p className="dt-arena-text">
                {settings.seedingMethod === 'draw'
                  ? 'The seed order is drawn live, in public, after check-in.'
                  : 'The director publishes the seed order after check-in.'}
              </p>
            </div>
            <Link className="dt-button dt-button-quiet" href={`${root}/seeding`}>
              Watch the seed reveal
            </Link>
          </div>
        ) : stage === 'live' ? (
          upcoming.length ? (
            <div className="dt-arena-queue">
              {upcoming.map(({ item, fixture }, index) => (
                <div key={fixture.id}>
                  <PixelText
                    text={index === 0 ? 'ON DECK' : 'UP NEXT'}
                    color={index === 0 ? '#f59e0b' : MUTED}
                  />
                  <b>
                    {fixture.slots
                      .map(
                        (slot) =>
                          entryFor(event, slot)?.alias ?? (slot.state === 'empty' ? 'Bye' : 'TBD'),
                      )
                      .join(' vs ')}
                  </b>
                  <em>{item.estimatedAt ? `about ${clock(item.estimatedAt)} ET` : fixture.id}</em>
                </div>
              ))}
            </div>
          ) : (
            <p className="dt-arena-text">No more matches are queued yet.</p>
          )
        ) : stage === 'done' ? (
          <div className="dt-arena-row">
            <p className="dt-arena-text">
              {champion
                ? `${champion.alias} won the tournament.`
                : event.completionReason || 'The event ended without a champion.'}
            </p>
            <Link className="dt-button dt-button-quiet" href={`${root}?tab=bracket`}>
              Final bracket
            </Link>
          </div>
        ) : (
          <p className="dt-arena-text">This tournament was cancelled.</p>
        )}
      </div>
    </div>
  );
}

export function DetailsBand({ event }: { event: TournamentView }) {
  const settings = event.settings;
  return (
    <dl className="dt-band">
      <div>
        <dt>Date</dt>
        <dd>{day(settings.startsAt)}</dd>
      </div>
      <div>
        <dt>Check-in</dt>
        <dd>Before the start</dd>
      </div>
      <div>
        <dt>First match</dt>
        <dd>{clock(settings.startsAt)} ET</dd>
      </div>
      <div>
        <dt>Final</dt>
        <dd>Reset if needed</dd>
      </div>
      <div>
        <dt>Arena</dt>
        <dd>{settings.arena}</dd>
      </div>
      <div>
        <dt>Staff</dt>
        <dd>{settings.staffContact}</dd>
      </div>
    </dl>
  );
}

/** Progress strip for a signed-in entrant. Not a landmark: the hero holds the actions. */
export function RunSteps({ event, now }: { event: TournamentView; now: number }) {
  const entry = event.me?.entry;
  if (!entry || entry.status === 'withdrawn') return null;
  const stage = eventStage(event, now);
  const settings = event.settings;
  const mine = (fixture: TournamentView['fixtures'][number]) =>
    fixture.slots.some((slot) => slot.state === 'player' && slot.entryId === entry.id);
  const placement = event.placements.find((row) => row.entryId === entry.id);
  let body: ReactNode;
  if (stage === 'live' || stage === 'done') {
    const next = event.fixtures.find(
      (fixture) => ['ready', 'in_progress', 'held'].includes(fixture.state) && mine(fixture),
    );
    const opponent = next?.slots
      .map((slot) => entryFor(event, slot))
      .find((player) => player && player.id !== entry.id);
    const estimate = next
      ? event.queue.find((item) => item.matchId === next.id)?.estimatedAt
      : null;
    const losses = placement?.losses ?? 0;
    body = (
      <div className="dt-run-line">
        {next ? (
          <>
            Your next match:{' '}
            <b>
              {next.id} vs {opponent?.alias ?? 'TBD'}
            </b>
          </>
        ) : event.championId === entry.id ? (
          <b>You won the tournament</b>
        ) : placement?.place ? (
          <>
            You finished <b>{ordinal(placement.place)}</b>
          </>
        ) : losses >= 2 ? (
          <b>Your run is over</b>
        ) : (
          'Waiting for your next opponent'
        )}
        <span>
          {next && estimate ? `About ${clock(estimate)} ET. ` : ''}
          {next ? `Wait for the referee's call in ${settings.callChannel}. ` : ''}
          Seed {entry.seed ?? 'not set'}, {losses} {losses === 1 ? 'series loss' : 'series losses'}.
        </span>
      </div>
    );
  } else {
    const inField = ['registered', 'checked_in'].includes(entry.status);
    const steps = [
      {
        label: 'Registered',
        note: entry.status === 'waitlisted' ? 'On the waitlist' : 'Spot confirmed',
        done: inField,
      },
      { label: 'Rules accepted', note: `Version ${event.rules.version}`, done: inField },
      {
        label: 'Check in',
        note: 'Before the start',
        done: entry.status === 'checked_in',
        now: stage === 'checkin' && entry.status === 'registered',
      },
      { label: 'Seed draw', note: 'After check-in', done: event.seedOrder.length > 0 },
      { label: 'First match', note: `From ${clock(settings.startsAt)}`, done: false },
    ];
    body = (
      <ol className="dt-steps">
        {steps.map((step) => (
          <li key={step.label} className={step.done ? 'is-done' : step.now ? 'is-now' : ''}>
            {step.label}
            <small>{step.note}</small>
          </li>
        ))}
      </ol>
    );
  }
  return (
    <div className="dt-run">
      <span className="dt-portrait">
        <Sprite
          cls={classFor(entry.alias)}
          tone={event.championId === entry.id ? 'gold' : undefined}
        />
      </span>
      {body}
    </div>
  );
}

function SectionHead({ kicker, title, note }: { kicker: string; title: string; note?: string }) {
  return (
    <div className="dt-sec-head">
      <div>
        <PixelText text={kicker} size="medium" color={CYAN} />
        <h2 className="dt-sec-title">{title}</h2>
      </div>
      {note && <p>{note}</p>}
    </div>
  );
}

export function HowItWorks({ event }: { event: TournamentView }) {
  const draw = event.settings.seedingMethod === 'draw';
  const steps = [
    {
      tone: 'up',
      sprite: <Sprite cls="jump-trooper" facing="north" scale={2.1} />,
      title: 'Everyone starts upper',
      text: `${draw ? 'Seeds come from a live random draw after check-in.' : 'The director sets the seeds after check-in.'} The top seeds get byes to fill the bracket.`,
    },
    {
      tone: 'lose',
      sprite: <Sprite cls="infiltrator" facing="south" scale={2.1} />,
      title: 'Lose once, drop down',
      text: 'Your first series loss sends you to the lower bracket. You are still in it.',
    },
    {
      tone: 'out',
      sprite: <Sprite cls="field-medic" facing="south" scale={2.1} tone="grey" />,
      title: "Lose twice, you're out",
      text: 'A second series loss ends your run. Players knocked out in the same round share a place.',
    },
    {
      tone: 'win',
      sprite: <Sprite cls="squad-leader" facing="south" scale={2.1} tone="gold" />,
      title: 'Grand final',
      text: 'Upper winner against lower winner. If the lower winner takes it, a reset final decides the title.',
    },
  ];
  return (
    <section className="dt-block" id="how">
      <SectionHead
        kicker="HOW IT WORKS"
        title="Lose twice and you're out"
        note="Double elimination. Your first series loss drops you to the lower bracket. Your second ends your night."
      />
      <div className="dt-how">
        {steps.map((step, index) => (
          <article key={step.title} className={`dt-step dt-step-${step.tone}`}>
            <div className="dt-step-scene">{step.sprite}</div>
            <div className="dt-step-body">
              <span className="dt-step-n">0{index + 1}</span>
              <h3>{step.title}</h3>
              <p>{step.text}</p>
            </div>
          </article>
        ))}
      </div>
      <div className="dt-bo5">
        <span>
          <b>BEST OF 5</b> every series, first to 3 game wins
        </span>
        <span className="dt-pips" aria-hidden="true">
          <i className="on" />
          <i className="on" />
          <i className="on" />
          <i />
          <i />
        </span>
        <span className="dt-muted">
          One arena, one match at a time.{' '}
          {event.settings.doubleForfeitPolicy === 'eliminate_both'
            ? 'A double forfeit removes both players.'
            : 'If both players are missing, the director rules on the match.'}
        </span>
      </div>
    </section>
  );
}

export function Schedule({ event, now }: { event: TournamentView; now: number }) {
  const settings = event.settings;
  const stage = eventStage(event, now);
  // Only the start time is promised. Everything else runs in order on the night.
  const stages = [
    { title: 'Sign-ups', when: 'Before the event', note: 'With your Freeinf account' },
    { title: 'Check-in', when: 'Before the start', note: 'Confirm you are here' },
    {
      title: 'Seed draw',
      when: 'After check-in',
      note: settings.seedingMethod === 'draw' ? 'Live and public' : 'Set by the director',
    },
    { title: 'First match', when: `${clock(settings.startsAt)} ET`, note: 'One arena, best of 5' },
    { title: 'Grand final', when: 'End of the night', note: 'Reset final if needed' },
  ];
  const current =
    stage === 'done'
      ? stages.length
      : stage === 'cancelled'
        ? -1
        : { draft: 0, signup: 0, checkin: 1, draw: 2, live: event.phase === 'final' ? 4 : 3 }[
            stage
          ];
  return (
    <section className="dt-block">
      <SectionHead
        kicker="SCHEDULE"
        title={new Intl.DateTimeFormat('en-US', {
          timeZone: 'America/New_York',
          weekday: 'long',
          month: 'long',
          day: 'numeric',
        }).format(new Date(settings.startsAt))}
        note={`Starts at ${clock(settings.startsAt)} ET. Check-in and the seed draw happen just before, then matches run one at a time.`}
      />
      <div className="dt-timeline">
        <span
          className="dt-timeline-fill"
          aria-hidden="true"
          style={{
            width: `${(Math.max(0, Math.min(current, stages.length - 1)) / (stages.length - 1)) * 80}%`,
          }}
        />
        <ol>
          {stages.map((item, index) => (
            <li
              key={item.title}
              className={index < current ? 'is-done' : index === current ? 'is-now' : ''}
            >
              <span className="dt-tl-dot" />
              <div>
                <strong>{item.title}</strong>
                <span>{item.when}</span>
                <small>{item.note}</small>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

type TileState = { tag: string; tone: string; corner?: string; out?: boolean };

function tileState(event: TournamentView, entry: TournamentView['entries'][number]): TileState {
  const placement = event.placements.find((row) => row.entryId === entry.id);
  if (event.phase === 'completed' && placement?.place) {
    const place = placement.place;
    return {
      tag: place === 1 ? 'Champion' : place <= 4 ? 'Top 4' : place <= 8 ? 'Top 8' : 'Lower bracket',
      tone: place === 1 ? 'gold' : 'muted',
      corner: ordinal(place),
      out: place > 8,
    };
  }
  if (entry.status === 'no_show' || entry.status === 'disqualified')
    return {
      tag: entry.status === 'no_show' ? 'No-show' : 'Disqualified',
      tone: 'muted',
      out: true,
    };
  if (['bracket', 'final', 'completed'].includes(event.phase) && entry.seed) {
    const playing = event.fixtures.some(
      (fixture) =>
        fixture.startedAt &&
        !fixture.result &&
        fixture.slots.some((slot) => slot.state === 'player' && slot.entryId === entry.id),
    );
    const losses = placement?.losses ?? 0;
    if (playing) return { tag: 'Playing', tone: 'red' };
    if (losses >= 2) return { tag: 'Out', tone: 'muted', out: true };
    return losses === 1
      ? { tag: 'Lower bracket', tone: 'amber' }
      : { tag: 'Upper bracket', tone: 'cyan' };
  }
  if (entry.status === 'checked_in') return { tag: 'Checked in', tone: 'green' };
  if (entry.status === 'waitlisted') return { tag: 'Waitlisted', tone: 'muted' };
  if (entry.status === 'withdrawn') return { tag: 'Withdrawn', tone: 'muted' };
  return { tag: 'Registered', tone: 'cyan' };
}

export function PlayersGrid({ event, search }: { event: TournamentView; search: string }) {
  const query = search.trim().toLowerCase();
  const players = event.entries
    .map((entry, index) => ({ entry, index }))
    .filter(
      ({ entry }) => entry.status !== 'withdrawn' && entry.alias.toLowerCase().includes(query),
    )
    .sort((a, b) => (a.entry.seed ?? 99) - (b.entry.seed ?? 99) || a.index - b.index);
  const { inField } = counts(event);
  const open =
    !query && ['draft', 'registration', 'check_in'].includes(event.phase)
      ? Math.max(0, event.settings.capacity - inField)
      : 0;
  const me = event.me?.entry?.id;
  return (
    <div className="dt-tiles">
      {players.map(({ entry }) => {
        const state = tileState(event, entry);
        return (
          <div
            key={entry.id}
            className={`dt-tile ${entry.id === me ? 'is-me' : ''} ${state.out ? 'is-out' : ''}`}
          >
            <span className="dt-portrait">
              <Sprite
                cls={classFor(entry.alias)}
                tone={state.tone === 'gold' ? 'gold' : state.out ? 'grey' : undefined}
              />
            </span>
            <div>
              <div className="dt-tile-name">{entry.alias}</div>
              <span className={`dt-tag dt-tag-${state.tone}`}>{state.tag}</span>
            </div>
            <span className={`dt-tile-corner ${state.corner === '1st' ? 'is-gold' : ''}`}>
              {state.corner ?? (entry.seed ? `#${entry.seed}` : '')}
            </span>
          </div>
        );
      })}
      {Array.from({ length: open }, (_, index) => (
        <div key={`open-${index}`} className="dt-tile is-open">
          <span className="dt-portrait">+</span>
          <div>
            <div className="dt-tile-name">Open spot</div>
            <span className="dt-tag dt-tag-muted">Waiting for a player</span>
          </div>
        </div>
      ))}
      {!players.length && !open && <p className="dt-muted">No players match that search.</p>}
    </div>
  );
}

type RuleCard = { title: string; body: string; published: boolean };

export function RulesSections({ event }: { event: TournamentView }) {
  const { rules, settings } = event;
  const director: RuleCard[] = [];
  if (!rules.publishedAt) {
    for (const title of RULE_SECTIONS) director.push({ title, body: '', published: false });
  } else {
    const parsed = parseRuleSections(rules.text);
    if (parsed.intro)
      director.push({
        title: parsed.sections.length ? 'Overview' : 'Rulebook',
        body: parsed.intro,
        published: true,
      });
    for (const section of parsed.sections)
      director.push({
        title: section.title,
        body: section.body,
        published: Boolean(section.body),
      });
    for (const title of parsed.missing) director.push({ title, body: '', published: false });
  }
  const cards: RuleCard[] = [
    {
      title: 'Format',
      published: true,
      body: `Seeded double elimination for up to ${settings.capacity} players. Every series is best of 5. Two series losses and you're out. If the lower bracket winner wins the grand final, a reset final decides the title.`,
    },
    ...director,
    {
      title: 'Seeding',
      published: true,
      body:
        settings.seedingMethod === 'draw'
          ? 'A public random draw after check-in. The page posts a fingerprint before the reveal, so anyone can check the order was not changed.'
          : `The director sets the seed order after check-in${settings.seedingCriteria ? `: ${settings.seedingCriteria}` : '.'}`,
    },
    {
      title: 'Withdrawal and rejoining',
      published: true,
      body: 'Withdrawing releases your place immediately. You must wait five minutes before registering again, and another player may take the place during that time. Rejoining follows the current capacity and waitlist order; your original priority is not reserved. A withdrawal during the last five minutes of registration, or after registration closes, is final because the signup window will have ended before you can rejoin.',
    },
  ];
  return (
    <section className="dt-block">
      <SectionHead
        kicker={rules.publishedAt ? `RULEBOOK V${rules.version}` : 'RULEBOOK'}
        title="Tournament rules"
        note={
          rules.publishedAt
            ? `Version ${rules.version}. Changes after you register are announced on this page.`
            : 'The organizer is preparing the rules. Registration requires accepting the published rulebook.'
        }
      />
      <div className="dt-rulecards">
        {cards.map((card, index) => (
          <article key={`${card.title}-${index}`} className="dt-rulecard">
            <span className="dt-rule-n">{index + 1}</span>
            <div>
              <div className="dt-rule-head">
                <h3>{card.title}</h3>
                <span className={`dt-chip ${card.published ? 'is-ok' : 'is-tba'}`}>
                  {card.published ? 'Published' : 'Not yet'}
                </span>
              </div>
              <p className={card.published ? '' : 'is-tba'}>{card.body || 'Not published yet.'}</p>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

export function PlayersSection({ event }: { event: TournamentView }) {
  const { inField } = counts(event);
  const seeded = event.entries.filter((entry) => entry.seed !== null).length;
  const note = ['bracket', 'final', 'completed'].includes(event.phase)
    ? `${seeded} seeded. Who is still in, where they are, and who is on the arena right now.`
    : `${inField} of ${event.settings.capacity} spots taken. The bracket order is drawn after check-in.`;
  return (
    <section className="dt-block" id="players">
      <SectionHead kicker="PLAYERS" title="The field" note={note} />
      <PlayersGrid event={event} search="" />
    </section>
  );
}

function PredrawSkeleton({ size }: { size: BracketSize }) {
  const fixtures = createBracket(size).filter((fixture) => fixture.bracket === 'upper');
  const rounds = Array.from({ length: Math.log2(size) }, (_, index) =>
    fixtures.filter((fixture) => fixture.round === index + 1),
  );
  const cols = rounds.map((_, index) => 24 + index * 220);
  const width = 150;
  const height = 24;
  const centers: number[][] = [];
  const parts: ReactNode[] = [];
  rounds.forEach((matches, column) => {
    const count = matches.length;
    centers[column] = [];
    for (let index = 0; index < count; index++) {
      const y =
        column === 0
          ? 24 + index * 40
          : (centers[column - 1][index * 2] + centers[column - 1][index * 2 + 1]) / 2;
      centers[column].push(y);
      parts.push(
        <rect
          key={`r${column}-${index}`}
          x={cols[column]}
          y={y - height / 2}
          width={width}
          height={height}
          rx={3}
          fill="#121a2a"
          stroke="#2c3957"
        />,
      );
      if (column === 0)
        parts.push(
          <text
            key={`t${index}`}
            x={cols[0] + 12}
            y={y + 4.5}
            fill="#5f6b82"
            fontSize={12}
            fontWeight={600}
          >
            Seed{' '}
            {matches[index].sources
              .map((source) => (source.kind === 'seed' ? source.seed : ''))
              .join(' v ')}
          </text>,
        );
      else {
        const a = centers[column - 1][index * 2];
        const b = centers[column - 1][index * 2 + 1];
        const x0 = cols[column - 1] + width;
        const xm = (x0 + cols[column]) / 2;
        parts.push(
          <path
            key={`p${column}-${index}`}
            d={`M${x0} ${a}H${xm}V${b}H${x0}M${xm} ${y}H${cols[column]}`}
            fill="none"
            stroke="#2c3957"
          />,
        );
      }
    }
  });
  const last = cols.length - 1;
  const final = centers[last][0];
  const trophyX = cols[last] + width + 46;
  return (
    <svg
      data-testid="predraw-skeleton"
      data-size={size}
      viewBox={`0 0 ${trophyX + 120} ${(size / 2) * 40 + 10}`}
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      {parts}
      <path d={`M${cols[last] + width} ${final}H${trophyX}`} stroke="#5c4412" />
      <rect
        x={trophyX}
        y={final - 22}
        width={96}
        height={44}
        rx={4}
        fill="#1f1a10"
        stroke="#8a6414"
      />
    </svg>
  );
}

type Fixture = TournamentView['fixtures'][number];

function fixtureStatus(event: TournamentView, fixture: Fixture): [string, string] {
  if (fixture.state === 'completed') return ['Final', ''];
  if (fixture.state === 'in_progress') return ['Live', 'is-live'];
  if (fixture.state === 'held') return ['On hold', 'is-deck'];
  if (fixture.state === 'bye') return ['Bye', ''];
  if (fixture.state === 'skipped') return ['Not needed', ''];
  const place = event.queue.findIndex((item) => item.matchId === fixture.id);
  const playing = event.fixtures.some((item) => item.startedAt && !item.result);
  if (place === 0) return [playing ? 'On deck' : 'Up next', 'is-deck'];
  if (place > 0) return ['Queued', ''];
  return fixture.state === 'ready' ? ['Ready', 'is-ready'] : ['Waiting', ''];
}

function MatchTile({ event, fixture }: { event: TournamentView; fixture: Fixture }) {
  const [label, tone] = fixtureStatus(event, fixture);
  const root = `/dueling-tournament/${event.settings.slug}`;
  return (
    <Link className={`dt-m ${tone}`} href={`${root}/matches/${fixture.id}`}>
      <span className="dt-m-head">
        <span>{fixture.id}</span>
        <span>{label}</span>
      </span>
      {fixture.slots.map((slot, index) => {
        const entry = entryFor(event, slot);
        const result = fixture.result;
        const won = Boolean(result && entry && result.winnerId === entry.id);
        const lost = Boolean(result && entry && result.winnerId && result.winnerId !== entry.id);
        const score = result
          ? result.kind === 'played'
            ? index === 0
              ? result.scoreA
              : result.scoreB
            : won
              ? 'W'
              : 'FF'
          : '';
        return (
          <span key={index} className={`dt-m-row ${won ? 'is-win' : ''} ${lost ? 'is-loss' : ''}`}>
            <span className="dt-m-seed">{entry?.seed ?? ''}</span>
            <span className={`dt-m-name ${entry ? '' : 'is-tbd'}`}>
              {entry?.alias ?? (slot.state === 'empty' ? 'Bye' : 'Awaiting opponent')}
            </span>
            <span className="dt-m-score">{score}</span>
          </span>
        );
      })}
    </Link>
  );
}

export function BracketSection({ event }: { event: TournamentView }) {
  const settings = event.settings;
  const root = `/dueling-tournament/${settings.slug}`;
  if (!event.fixtures.length) {
    return (
      <section className="dt-block" id="bracket">
        <SectionHead
          kicker="BRACKET"
          title="Drawn after check-in"
          note={
            settings.seedingMethod === 'draw'
              ? 'The page posts a fingerprint before the reveal, so anyone can check the order was not changed.'
              : 'The director publishes the seed order after check-in.'
          }
        />
        <div
          className="dt-predraw"
          style={bracketSizeFor(settings.capacity) === 32 ? { height: 580 } : undefined}
        >
          <PredrawSkeleton size={bracketSizeFor(settings.capacity)} />
          <div className="dt-predraw-card">
            <PixelText text="SEED DRAW" size="medium" color={CYAN} />
            <b>
              {day(settings.startsAt)}, before the {clock(settings.startsAt)} ET start
            </b>
            <p>
              Right after check-in closes. The bracket size follows the checked-in field, with up to{' '}
              {bracketSizeFor(settings.capacity)} slots. The top seeds get byes to fill the bracket.
            </p>
            <Link className="dt-button dt-button-quiet" href={`${root}/seeding`}>
              Watch the seed reveal
            </Link>
          </div>
        </div>
      </section>
    );
  }
  const playable = event.fixtures.filter((fixture) => !['bye', 'skipped'].includes(fixture.state));
  const finished = playable.filter((fixture) => fixture.state === 'completed').length;
  const open = event.fixtures.filter((fixture) =>
    ['ready', 'in_progress', 'held', 'waiting'].includes(fixture.state),
  );
  const groups: { label: string; lower: boolean; fixtures: Fixture[] }[] = [];
  if (event.phase === 'completed') {
    const finals = event.fixtures.filter(
      (fixture) => ['final', 'reset'].includes(fixture.bracket) && fixture.state === 'completed',
    );
    if (finals.length) groups.push({ label: 'Championship', lower: false, fixtures: finals });
  } else {
    for (const bracket of ['upper', 'lower'] as const) {
      const rounds = open.filter((fixture) => fixture.bracket === bracket).map((f) => f.round);
      if (!rounds.length) continue;
      const round = Math.min(...rounds);
      groups.push({
        label: `${bracket === 'upper' ? 'Upper' : 'Lower'} · round ${round}`,
        lower: bracket === 'lower',
        fixtures: event.fixtures.filter(
          (fixture) =>
            fixture.bracket === bracket && fixture.round === round && fixture.state !== 'skipped',
        ),
      });
    }
    const finals = event.fixtures.filter(
      (fixture) =>
        ['final', 'reset'].includes(fixture.bracket) &&
        ['ready', 'in_progress', 'held', 'completed'].includes(fixture.state),
    );
    if (finals.length) groups.push({ label: 'Championship', lower: false, fixtures: finals });
  }
  return (
    <section className="dt-block" id="bracket">
      <SectionHead
        kicker="BRACKET"
        title={event.phase === 'completed' ? 'Final bracket' : 'Matches in play'}
        note="Finished, live and queued series. Open the full bracket to follow every path."
      />
      {groups.map((group) => (
        <div key={group.label}>
          <div className={`dt-round-label ${group.lower ? 'is-lower' : ''}`}>{group.label}</div>
          <div className="dt-matches">
            {group.fixtures.map((fixture) => (
              <MatchTile key={fixture.id} event={event} fixture={fixture} />
            ))}
          </div>
        </div>
      ))}
      <div className="dt-linkrow">
        <span>
          {finished} of {playable.length} series finished
        </span>
        <Link className="dt-button dt-button-quiet" href={`${root}?tab=bracket`}>
          Full bracket
        </Link>
      </div>
    </section>
  );
}

export function ResultsSection({ event }: { event: TournamentView }) {
  const champion = event.entries.find((entry) => entry.id === event.championId);
  return (
    <section className="dt-block" id="results">
      <SectionHead
        kicker="RESULTS"
        title={champion ? champion.alias : 'Title not awarded'}
        note={
          champion
            ? 'Tournament champion. Players knocked out in the same round share a place.'
            : event.completionReason || 'The event ended without a champion.'
        }
      />
      <div className="dt-panel">
        <div className="dt-table-wrap">
          <table className="dt-table">
            <thead>
              <tr>
                <th>Place</th>
                <th>Player</th>
                <th>Seed</th>
                <th>Series losses</th>
              </tr>
            </thead>
            <tbody>
              {event.placements.map((row) => (
                <tr key={row.entryId}>
                  <td>{row.place ? ordinal(row.place) : '–'}</td>
                  <td>{row.alias}</td>
                  <td>{row.seed}</td>
                  <td>{row.losses}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
