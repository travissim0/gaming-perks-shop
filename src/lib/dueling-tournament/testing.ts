import { Actor, Settings, Tournament } from './contracts';
import { bracketSizeFor, createBracket } from './bracket';
import { newTournament } from './transition';

// Test fixtures are imported only by tests, never by pages or API handlers.
export const testDirector: Actor = {
  userId: '66efeaff-8a9e-4ef3-95d1-acad7f6d402b',
  alias: 'Director',
  director: true,
};
export const testSettings: Settings = {
  title: 'Local Dueling Test',
  slug: 'local-dueling-test',
  description: 'Isolated test event.',
  startsAt: '2026-10-04T00:00:00Z',
  timezone: 'America/New_York',
  registrationOpensAt: '2026-09-26T00:00:00Z',
  registrationClosesAt: '2026-10-03T23:30:00Z',
  checkInOpensAt: '2026-10-03T23:30:00Z',
  checkInClosesAt: '2026-10-03T23:50:00Z',
  capacity: 16,
  arena: 'Dueling arena',
  callChannel: 'In-game referee calls',
  staffContact: 'Event referee',
  restMinutes: 0,
  estimatedGameSeconds: 30,
  estimatedChangeoverMinutes: 2,
  seedingMethod: 'draw',
  doubleForfeitPolicy: 'hold',
  seedingCriteria: 'Public reproducible random draw after check-in.',
};

export function testTournament(count = 16, withBracket = true): Tournament {
  const event = newTournament(
    'local-event',
    { ...testSettings, capacity: Math.max(16, count) },
    testDirector,
    '2026-09-22T12:00:00Z',
  );
  event.published = true;
  event.rules = { text: 'Local test rules.', version: 1, publishedAt: event.createdAt };
  event.phase = withBracket ? 'bracket' : 'seeding';
  event.entries = Array.from({ length: count }, (_, i) => ({
    id: `entry-${i + 1}`,
    userId: `user-${i + 1}`,
    alias: `Player ${i + 1}`,
    status: 'checked_in' as const,
    registeredAt: '2026-09-26T12:00:00Z',
    registrationSequence: i + 1,
    checkedInAt: '2026-10-03T23:40:00Z',
    acceptedRulesVersion: 1,
    seed: withBracket ? i + 1 : null,
  }));
  event.seedOrder = withBracket ? event.entries.map((entry) => entry.id) : [];
  if (withBracket) event.bracketSize = bracketSizeFor(count);
  event.fixtures = withBracket ? createBracket(event.bracketSize!) : [];
  return event;
}
