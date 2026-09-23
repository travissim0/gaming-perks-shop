import assert from 'node:assert/strict';
import { test } from 'node:test';
import { bracketSizeFor, createBracket, resolveBracket } from './bracket';
import {
  bracketSizeSchema,
  commandSchema,
  settingsSchema,
  tournamentSchema,
  type Command,
} from './contracts';
import { createDraw, drawMatchesBracket, verifyDraw } from './draw';
import { applyMutation } from './transition';
import { testDirector, testSettings, testTournament } from './testing';
import { tournamentView } from './view';
import { workloadMinutes } from './time';
import { legacyBracket } from '../../../tests/dueling-tournament/legacy-bracket';

const now = '2026-10-04T00:00:00Z';
const mutate = async (event: ReturnType<typeof testTournament>, command: Command) =>
  (
    await applyMutation(
      event,
      { command, operationId: crypto.randomUUID(), expectedRevision: event.revision },
      testDirector,
      now,
    )
  ).tournament;

test('16-slot generator exactly preserves the frozen legacy bracket', () => {
  assert.deepEqual(createBracket(16), legacyBracket());
});

test('all bracket sizes have ordered feeders and one loser destination with crossed drop-ins', () => {
  for (const size of [4, 8, 16, 32] as const) {
    const fixtures = createBracket(size);
    assert.equal(fixtures.filter((match) => match.bracket === 'upper').length, size - 1);
    assert.equal(fixtures.filter((match) => match.bracket === 'lower').length, size - 2);
    assert.equal(fixtures.length, 2 * size - 1);
    for (const [index, match] of fixtures.entries()) {
      for (const source of match.sources) {
        if (source.kind !== 'seed')
          assert.ok(fixtures.slice(0, index).some((item) => item.id === source.matchId));
      }
      if (match.bracket === 'upper')
        assert.equal(
          fixtures
            .flatMap((item) => item.sources)
            .filter((source) => source.kind === 'loser' && source.matchId === match.id).length,
          1,
        );
      if (match.bracket === 'lower' && match.round % 2 === 0) {
        const drop = match.sources[1];
        assert.equal(drop.kind, 'loser');
        if (drop.kind !== 'loser') continue;
        const upper = fixtures.find((item) => item.id === drop.matchId)!;
        // The last drop-in has only the upper-final loser, so a rematch is unavoidable.
        if (upper.round === Math.log2(size)) continue;
        const ancestors = (id: string): Set<string> => {
          const source = fixtures.find((item) => item.id === id)!;
          return new Set([
            id,
            ...source.sources.flatMap((item) =>
              item.kind === 'seed' ? [] : [...ancestors(item.matchId)],
            ),
          ]);
        };
        const lower = match.sources[0];
        assert.ok(lower.kind !== 'seed');
        const previous = ancestors(lower.matchId);
        for (const source of upper.sources)
          if (source.kind !== 'seed') assert.equal(previous.has(source.matchId), false);
      }
    }
  }
});

test('five and seventeen entrants propagate double-empty lower byes, never pending byes', () => {
  for (const count of [5, 17]) {
    const event = testTournament(count);
    const fixtures = resolveBracket(event.fixtures, event.seedOrder);
    const empty = fixtures.filter(
      (item) => item.bracket === 'lower' && item.slots.every((slot) => slot.state === 'empty'),
    );
    assert.ok(empty.length > 0);
    for (const match of empty) {
      assert.equal(match.state, 'bye');
      assert.deepEqual(match.winner, { state: 'empty' });
      assert.deepEqual(match.loser, { state: 'empty' });
    }
    for (const match of fixtures.filter((item) =>
      item.slots.some((slot) => slot.state === 'pending'),
    ))
      assert.ok(['waiting', 'conditional'].includes(match.state));
  }
});

test('every field draws, verifies, and publishes the smallest fitting bracket', async () => {
  for (let count = 4; count <= 32; count++) {
    let event = testTournament(count, false);
    event = await mutate(event, { type: 'draw' });
    event = (
      await applyMutation(
        event,
        {
          command: { type: 'reveal_draw' },
          operationId: crypto.randomUUID(),
          expectedRevision: event.revision,
        },
        testDirector,
        '2026-10-04T00:00:06Z',
      )
    ).tournament;
    event = await mutate(event, { type: 'publish_bracket' });
    assert.equal(event.bracketSize, bracketSizeFor(count));
    assert.equal(event.fixtures.length, 2 * bracketSizeFor(count) - 1);
    assert.equal(await verifyDraw(event.draws[0]), true);
    const view = tournamentView(event, null, now);
    assert.equal(drawMatchesBracket(event.draws[0].order, event.seedOrder, view.fixtures), true);
    const changed = structuredClone(view.fixtures);
    [changed[0].sources[0], changed[1].sources[0]] = [changed[1].sources[0], changed[0].sources[0]];
    assert.equal(drawMatchesBracket(event.draws[0].order, event.seedOrder, changed), false);
  }
});

test('legacy records preserve stored fixtures and do not acquire a bracketSize on ordinary saves', async () => {
  let event = testTournament(12);
  delete event.bracketSize;
  event.settings.seedingMethod = 'manual';
  const fixtures = structuredClone(event.fixtures);
  event = await mutate(tournamentSchema.parse(event), {
    type: 'announcement',
    body: 'Legacy event',
  });
  assert.equal(event.bracketSize, undefined);
  assert.deepEqual(event.fixtures, fixtures);
  assert.equal(tournamentView(event, null, now).bracketSize, 16);
  event = await mutate(event, {
    type: 'seeds',
    entryIds: [...event.seedOrder].reverse(),
    reason: 'Manual correction',
  });
  assert.deepEqual(event.fixtures, fixtures);
  assert.equal(event.bracketSize, undefined);
});

test('capacity and seed boundaries reject invalid fields, and workload matches the published plan', async () => {
  for (const count of [4, 5, 17, 24, 32])
    assert.equal(settingsSchema.parse({ ...testSettings, capacity: count }).capacity, count);
  for (const capacity of [3, 33, 4.5])
    assert.equal(settingsSchema.safeParse({ ...testSettings, capacity }).success, false);
  assert.equal(bracketSizeSchema.safeParse(24).success, false);
  for (const count of [3, 33]) {
    const entries = Array.from({ length: count }, (_, i) => ({ id: String(i), alias: String(i) }));
    await assert.rejects(createDraw(entries, now));
    assert.equal(
      commandSchema.safeParse({
        type: 'seeds',
        entryIds: entries.map((entry) => entry.id),
        reason: 'Test',
      }).success,
      false,
    );
  }
  for (const [count, expected] of [
    [16, [139, 170, 201]],
    [24, [195, 242, 289]],
    [32, [251, 314, 377]],
  ] as const) {
    assert.deepEqual(
      [1, 2, 3].map((changeover) => workloadMinutes(count, changeover)),
      expected,
    );
  }
});
