import { Actor, SeedDraw, Tournament } from './contracts';
import { champion, correctionImpact, placements, queue, resolveBracket } from './bracket';
import { canOperate } from './transition';

export function publicDraw(draw: SeedDraw) {
  return {
    id: draw.id,
    algorithm: draw.algorithm,
    entrants: draw.entrants,
    commitment: draw.commitment,
    committedAt: draw.committedAt,
    revealedAt: draw.revealedAt,
    voidReason: draw.voidReason,
    randomSeed: draw.revealedAt || draw.voidReason ? draw.randomSeed : null,
    order: draw.revealedAt || draw.voidReason ? draw.order : [],
  };
}

export function tournamentView(tournament: Tournament, actor: Actor | null, now: string) {
  const staff = actor ? canOperate(tournament, actor) : false;
  const fixtures = resolveBracket(tournament.fixtures, tournament.seedOrder);
  const next = queue(fixtures, tournament.settings.restMinutes, now);
  const seriesAllowance =
    (tournament.settings.estimatedGameSeconds * 5 +
      tournament.settings.estimatedChangeoverMinutes * 60) *
    1000;
  let estimate = Math.max(Date.parse(now), Date.parse(tournament.settings.startsAt));
  if (fixtures.some((fixture) => fixture.startedAt && !fixture.result)) estimate += seriesAllowance;
  const estimatedQueue = next.map((item) => {
    estimate = Math.max(estimate, item.eligibleAt ? Date.parse(item.eligibleAt) : 0);
    const estimatedAt =
      tournament.paused || fixtures.some((fixture) => fixture.state === 'held' && fixture.startedAt)
        ? null
        : new Date(estimate).toISOString();
    estimate += seriesAllowance;
    return {
      matchId: item.fixture.id,
      eligible: item.eligible,
      eligibleAt: item.eligibleAt,
      estimatedAt,
    };
  });
  const ownEntry = actor
    ? (tournament.entries.find((entry) => entry.userId === actor.userId) ?? null)
    : null;
  const publicFixtures = fixtures.map((fixture) => ({
    id: fixture.id,
    bracket: fixture.bracket,
    round: fixture.round,
    sources: fixture.sources,
    slots: fixture.slots,
    state: fixture.state,
    winner: fixture.winner,
    loser: fixture.loser,
    startedAt: fixture.startedAt,
    scheduledAt: fixture.scheduledAt,
    result: fixture.result
      ? {
          kind: fixture.result.kind,
          winnerId: fixture.result.winnerId,
          scoreA: fixture.result.scoreA,
          scoreB: fixture.result.scoreB,
          recordedAt: fixture.result.recordedAt,
          revision: fixture.result.revision,
        }
      : null,
  }));
  const entries = tournament.entries.map((entry) => ({
    id: entry.id,
    alias: entry.alias,
    status: entry.status,
    seed: entry.seed,
  }));
  return {
    id: tournament.id,
    revision: tournament.revision,
    settings: tournament.settings,
    phase: tournament.phase,
    published: tournament.published,
    featured: tournament.featured,
    paused: tournament.paused,
    pauseReason: staff ? tournament.pauseReason : '',
    rules:
      tournament.rules.publishedAt || staff
        ? tournament.rules
        : { text: '', version: 0, publishedAt: null },
    entries,
    fixtures: publicFixtures,
    seedOrder: tournament.seedOrder,
    bracketSize: tournament.fixtures.length ? (tournament.bracketSize ?? 16) : null,
    draws: tournament.draws.map(publicDraw),
    announcements: tournament.announcements,
    completionReason: tournament.completionReason ?? null,
    championId: champion(fixtures),
    placements: placements(fixtures, tournament.entries, Boolean(tournament.completionReason)),
    queue: estimatedQueue,
    updatedAt: tournament.updatedAt,
    serverNow: now,
    me: actor
      ? {
          entry: ownEntry,
          notices: tournament.notices.filter((notice) => notice.userId === actor.userId),
          director: actor.director,
          referee: tournament.refereeIds.includes(actor.userId),
          hasAlias: Boolean(actor.alias),
        }
      : null,
    staff: staff
      ? {
          entries: tournament.entries.map(
            ({
              id,
              alias,
              status,
              registeredAt,
              registrationSequence,
              checkedInAt,
              acceptedRulesVersion,
              seed,
            }) => ({
              id,
              alias,
              status,
              registeredAt,
              registrationSequence,
              checkedInAt,
              acceptedRulesVersion,
              seed,
            }),
          ),
          refereeIds: actor?.director ? tournament.refereeIds : [],
          audit: actor?.director ? tournament.audit : [],
          correctionImpacts: Object.fromEntries(
            tournament.fixtures
              .filter((fixture) => fixture.result)
              .map((fixture) => [fixture.id, correctionImpact(tournament.fixtures, fixture.id)]),
          ),
          holds: Object.fromEntries(
            tournament.fixtures
              .filter((fixture) => fixture.held)
              .map((fixture) => [fixture.id, fixture.holdReason]),
          ),
          reversibleEntryIds: actor?.director
            ? tournament.entries
                .filter((entry) => entry.availabilityBeforeRuling)
                .map((entry) => entry.id)
            : [],
          rulings: Object.fromEntries(
            tournament.fixtures
              .filter((fixture) => fixture.result?.reason)
              .map((fixture) => [fixture.id, fixture.result!.reason]),
          ),
        }
      : null,
  };
}

export type TournamentView = ReturnType<typeof tournamentView>;
export type PublicFixture = TournamentView['fixtures'][number];
export type PublicDraw = TournamentView['draws'][number];

export function eventSummary(tournament: Tournament) {
  return {
    id: tournament.id,
    slug: tournament.settings.slug,
    title: tournament.settings.title,
    startsAt: tournament.settings.startsAt,
    phase: tournament.phase,
    published: tournament.published,
    featured: tournament.featured,
    capacity: tournament.settings.capacity,
    registered: tournament.entries.filter((entry) =>
      ['registered', 'checked_in'].includes(entry.status),
    ).length,
    champion:
      tournament.entries.find(
        (entry) => entry.id === champion(resolveBracket(tournament.fixtures, tournament.seedOrder)),
      )?.alias ?? null,
  };
}
export type EventSummary = ReturnType<typeof eventSummary>;

function csvCell(value: unknown): string {
  const text = value === null || value === undefined ? '' : String(value);
  // Spreadsheet formula injection is possible even when fields are CSV-quoted.
  const safe = /^[\s]*[=+@-]/.test(text) || /^[\t\r\n]/.test(text) ? `'${text}` : text;
  return `"${safe.replaceAll('"', '""')}"`;
}

export function eventCsv(tournament: Tournament, kind: 'players' | 'matches' | 'results'): string {
  let rows: unknown[][];
  const alias = (id: string | null) =>
    tournament.entries.find((entry) => entry.id === id)?.alias ?? '';
  if (kind === 'players') {
    rows = [
      ['Alias', 'Status', 'Seed', 'Registered', 'Checked in'],
      ...tournament.entries.map((entry) => [
        entry.alias,
        entry.status,
        entry.seed,
        entry.registeredAt,
        entry.checkedInAt,
      ]),
    ];
  } else {
    const fixtures = resolveBracket(tournament.fixtures, tournament.seedOrder);
    rows = [
      [
        'Match',
        'Bracket',
        'Round',
        'Player A',
        'Player B',
        'Status',
        'Result type',
        'A wins',
        'B wins',
        'Winner',
        'Scheduled',
        'Recorded',
      ],
      ...fixtures
        .filter((fixture) => kind !== 'results' || fixture.result)
        .map((fixture) => [
          fixture.id,
          fixture.bracket,
          fixture.round,
          ...fixture.slots.map((slot) =>
            slot.state === 'player' ? alias(slot.entryId) : slot.state === 'empty' ? 'Bye' : 'TBD',
          ),
          fixture.state,
          fixture.result?.kind,
          fixture.result?.scoreA,
          fixture.result?.scoreB,
          alias(fixture.result?.winnerId ?? null),
          fixture.scheduledAt,
          fixture.result?.recordedAt,
        ]),
    ];
  }
  return '\uFEFF' + rows.map((row) => row.map(csvCell).join(',')).join('\r\n') + '\r\n';
}

export function eventExport(tournament: Tournament, now: string) {
  const view = tournamentView(tournament, null, now);
  return { format: 'freeinf-dueling-event-v1', exportedAt: now, event: view };
}
