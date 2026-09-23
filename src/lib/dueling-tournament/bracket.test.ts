import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  champion,
  correctionImpact,
  placements,
  queue,
  resolveBracket,
  validateResult,
} from './bracket';
import { testTournament } from './testing';

test('4 to 32 entrants: all bye paths, two losses, both finals, exact series totals', () => {
  for (let count = 4; count <= 32; count++) {
    for (let run = 0; run < 100; run++) {
      for (const reset of [false, true]) {
        const event = testTournament(count);
        let random = run + 13;
        const losses = new Map(event.entries.map((entry) => [entry.id, 0]));
        const appearances = new Map(event.entries.map((entry) => [entry.id, 0]));
        let played = 0;
        while (!champion(resolveBracket(event.fixtures, event.seedOrder))) {
          const resolved = resolveBracket(event.fixtures, event.seedOrder);
          for (const fixture of resolved) {
            if (fixture.slots.some((slot) => slot.state === 'pending'))
              assert.ok(['waiting', 'conditional'].includes(fixture.state));
            if (fixture.state === 'ready')
              assert.ok(fixture.slots.every((slot) => slot.state === 'player'));
          }
          const next = resolved.find((fixture) => fixture.state === 'ready');
          assert.ok(next, `No eligible fixture at ${count} players, run ${run}`);
          assert.ok(next.slots[0].state === 'player' && next.slots[1].state === 'player');
          random = (Math.imul(random, 1664525) + 1013904223) >>> 0;
          let side = (random >>> 16) % 2;
          if (next.id === 'GF1') side = reset ? 1 : 0;
          const winner = next.slots[side];
          const loser = next.slots[1 - side];
          assert.ok(winner.state === 'player' && loser.state === 'player');
          assert.notEqual(winner.entryId, loser.entryId);
          assert.ok(losses.get(winner.entryId)! < 2);
          assert.ok(losses.get(loser.entryId)! < 2);
          losses.set(loser.entryId, losses.get(loser.entryId)! + 1);
          for (const slot of next.slots)
            if (slot.state === 'player')
              appearances.set(slot.entryId, appearances.get(slot.entryId)! + 1);
          event.fixtures.find((fixture) => fixture.id === next.id)!.result = {
            kind: 'played',
            winnerId: winner.entryId,
            scoreA: side === 0 ? 3 : 2,
            scoreB: side === 1 ? 3 : 2,
            reason: '',
            recordedAt: '2026-10-04T00:00:00Z',
            actorId: 'referee',
            revision: ++played,
          };
          assert.ok(played <= 2 * count - 1);
        }
        assert.equal(played, 2 * count - (reset ? 1 : 2));
        const result = resolveBracket(event.fixtures, event.seedOrder);
        const winner = champion(result);
        const standings = placements(result, event.entries);
        assert.equal(standings.filter((row) => row.place === 1).length, 1);
        for (const row of standings.filter((row) => row.bracket === 'lower')) {
          assert.ok(row.place !== null);
          assert.ok(
            standings
              .filter(
                (other) =>
                  other.bracket === 'lower' && other.eliminatedRound === row.eliminatedRound,
              )
              .every((other) => other.place === row.place),
          );
        }
        for (const [id, total] of losses) assert.equal(total, id === winner ? (reset ? 1 : 0) : 2);
        assert.ok([...appearances.values()].every((value) => value >= 2));
        const byes = result
          .filter(
            (fixture) =>
              fixture.bracket === 'upper' && fixture.round === 1 && fixture.state === 'bye',
          )
          .map((fixture) => (fixture.winner.state === 'player' ? fixture.winner.entryId : ''))
          .sort();
        assert.deepEqual(
          byes,
          event.entries
            .slice(0, (event.bracketSize ?? 16) - count)
            .map((entry) => entry.id)
            .sort(),
        );
        assert.equal(
          result.find((fixture) => fixture.id === 'GF2')!.state,
          reset ? 'completed' : 'skipped',
        );
      }
    }
  }
});

test('unknown opponents never become byes', () => {
  const event = testTournament(12);
  const bracket = resolveBracket(event.fixtures, event.seedOrder);
  assert.equal(bracket.find((fixture) => fixture.id === 'L1')!.state, 'waiting');
  assert.equal(bracket.find((fixture) => fixture.id === 'U9')!.state, 'waiting');
  assert.equal(bracket.find((fixture) => fixture.id === 'GF2')!.state, 'conditional');
});

test('BO5 rejects impossible scores, nonparticipants and invented forfeit scores', () => {
  const slots = [
    { state: 'player', entryId: 'a' },
    { state: 'player', entryId: 'b' },
  ] as const;
  const valid = { kind: 'played' as const, winnerId: 'a', scoreA: 3, scoreB: 2, reason: '' };
  assert.doesNotThrow(() => validateResult([...slots], valid));
  for (const invalid of [
    { ...valid, scoreB: 3 },
    { ...valid, winnerId: 'c' },
    { ...valid, scoreA: 2 },
    { ...valid, scoreB: 1.5 },
    { ...valid, kind: 'forfeit' as const, reason: 'No show' },
  ]) {
    assert.throws(() => validateResult([...slots], invalid));
  }
});

test('correction impact includes both paths and conditional reset', () => {
  const event = testTournament();
  event.fixtures.find((fixture) => fixture.id === 'U9')!.startedAt = '2026-10-04T00:00:00Z';
  const impact = correctionImpact(event.fixtures, 'U1');
  assert.ok(impact.affected.includes('L1'));
  assert.ok(impact.affected.includes('GF2'));
  assert.deepEqual(impact.blocked, ['U9']);
  assert.deepEqual(correctionImpact(event.fixtures, 'GF1').affected, ['GF2']);
});

test('queue enforces player rest independently of the next round', () => {
  const event = testTournament(12);
  const first = event.fixtures.find((fixture) => fixture.id === 'U2')!;
  first.result = {
    kind: 'played',
    winnerId: 'entry-8',
    scoreA: 3,
    scoreB: 0,
    reason: '',
    recordedAt: '2026-10-04T00:01:00Z',
    actorId: 'referee',
    revision: 1,
  };
  const ready = queue(resolveBracket(event.fixtures, event.seedOrder), 2, '2026-10-04T00:02:00Z');
  assert.equal(ready.find((item) => item.fixture.id === 'U9')!.eligible, false);
  assert.equal(
    ready.find((item) => item.fixture.id === 'U9')!.eligibleAt,
    '2026-10-04T00:03:00.000Z',
  );
});
