import assert from 'node:assert/strict';
import { test } from 'node:test';
import { applyMutation } from './transition';
import { testDirector, testTournament } from './testing';
import { Actor, Command, Tournament } from './contracts';
import {
  isTournamentIntegration,
  pathKey,
} from '../../../tests/dueling-tournament/typecheck-paths';

test('typecheck path matching covers Windows separators and case-insensitive hosts', () => {
  assert.equal(
    pathKey('C:\\Project\\src\\lib\\AuthContext.tsx', false),
    pathKey('c:/project/src/lib/AuthContext.tsx', false),
  );
  for (const path of [
    'src\\lib\\AuthContext.tsx',
    'src\\app\\auth\\login\\page.tsx',
    'src/components/Navbar.tsx',
    'src\\app\\dueling\\page.tsx',
  ])
    assert.equal(isTournamentIntegration(path), true);
  assert.equal(isTournamentIntegration('src\\app\\news\\page.tsx'), false);
});

const execute = async (event: Tournament, command: Command, actor: Actor, now: string) =>
  (
    await applyMutation(
      event,
      { operationId: crypto.randomUUID(), expectedRevision: event.revision, command },
      actor,
      now,
    )
  ).tournament;

test('withdrawal has a per-event five-minute rejoin cooldown that retries cannot reset', async () => {
  const actor = { userId: 'user-1', alias: 'Player 1', director: false };
  let event = testTournament(12, false);
  event.phase = 'registration';
  event = await execute(event, { type: 'withdraw' }, actor, '2026-09-27T00:00:00Z');
  await assert.rejects(
    execute(event, { type: 'register', rulesVersion: 1 }, actor, '2026-09-27T00:04:59Z'),
    /five minutes/,
  );
  const rejoined = await execute(
    event,
    { type: 'register', rulesVersion: 1 },
    actor,
    '2026-09-27T00:05:00Z',
  );
  assert.equal(
    rejoined.entries.find((entry) => entry.userId === actor.userId)?.status,
    'registered',
  );
  const other = testTournament(12, false);
  other.phase = 'registration';
  assert.equal(
    (await execute(other, { type: 'register', rulesVersion: 1 }, actor, '2026-09-27T00:00:01Z'))
      .revision,
    other.revision,
  );
});

test('referees may release operational holds but cannot remove both absent players', async () => {
  let event = testTournament();
  const referee = { userId: 'referee', alias: 'Referee', director: false };
  event.refereeIds = [referee.userId];
  event = await execute(
    event,
    { type: 'hold_match', matchId: 'U1', held: true, reason: 'Waiting for players' },
    testDirector,
    '2026-10-04T00:00:00Z',
  );
  await assert.rejects(
    execute(
      event,
      {
        type: 'resolve_absence',
        matchId: 'U1',
        outcome: 'eliminate_both',
        reason: 'Not permitted',
      },
      referee,
      '2026-10-04T00:00:00Z',
    ),
    /director|staff access/,
  );
  event = await execute(
    event,
    { type: 'hold_match', matchId: 'U1', held: false, reason: 'Both players arrived' },
    referee,
    '2026-10-04T00:00:00Z',
  );
  assert.equal(event.fixtures[0].held, false);
  assert.equal(event.fixtures[0].result, null);
});
