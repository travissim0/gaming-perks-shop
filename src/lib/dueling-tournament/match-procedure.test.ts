import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startingCorners } from './match-procedure';
import { testTournament } from './testing';
import type { PublicFixture } from './view';

test('original seeds decide corners even when the higher seed occupies the second bracket slot', () => {
  const event = testTournament(32);
  const fixture: Pick<PublicFixture, 'slots'> = {
    slots: [
      { state: 'player', entryId: 'entry-7' },
      { state: 'player', entryId: 'entry-2' },
    ],
  };
  assert.deepEqual(startingCorners(event, fixture), ['Bottom-right corner', 'Top-left corner']);
  fixture.slots.reverse();
  assert.deepEqual(startingCorners(event, fixture), ['Top-left corner', 'Bottom-right corner']);
  fixture.slots = [
    { state: 'player', entryId: 'entry-32' },
    { state: 'player', entryId: 'entry-1' },
  ];
  assert.deepEqual(startingCorners(event, fixture), ['Bottom-right corner', 'Top-left corner']);
});

test('byes, unresolved opponents and unavailable seeds do not claim a starting corner', () => {
  const event = testTournament(4);
  const fixture: Pick<PublicFixture, 'slots'> = {
    slots: [{ state: 'player', entryId: 'entry-1' }, { state: 'empty' }],
  };
  assert.deepEqual(startingCorners(event, fixture), [null, null]);
  fixture.slots[1] = { state: 'pending' };
  assert.deepEqual(startingCorners(event, fixture), [null, null]);
  fixture.slots[1] = { state: 'player', entryId: 'missing-entry' };
  assert.deepEqual(startingCorners(event, fixture), [null, null]);
  fixture.slots[1] = { state: 'player', entryId: 'entry-2' };
  event.entries[1].seed = null;
  assert.deepEqual(startingCorners(event, fixture), [null, null]);
  event.entries[1].seed = 1;
  assert.deepEqual(startingCorners(event, fixture), [null, null]);
});
