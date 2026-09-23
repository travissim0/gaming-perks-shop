import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Command, Tournament, mutationSchema } from './contracts';
import { applyMutation } from './transition';
import { testDirector, testTournament } from './testing';
import { createDraw, seededOrder, verifyDraw } from './draw';

const execute = (
  event: Tournament,
  command: Command,
  now = '2026-10-04T00:00:00Z',
  actor = testDirector,
  operationId = crypto.randomUUID(),
) => applyMutation(event, { command, expectedRevision: event.revision, operationId }, actor, now);

test('a delayed phase change can reach seeding without reopening expired player check-in', async () => {
  let event = testTournament(12, false);
  event.phase = 'registration';
  event = (await execute(event, { type: 'registration_state', state: 'check_in' })).tournament;
  await assert.rejects(
    execute(event, { type: 'check_in' }, undefined, {
      userId: 'user-1',
      alias: 'Player 1',
      director: false,
    }),
    /outside its published window/,
  );
  event = (await execute(event, { type: 'registration_state', state: 'seeding' })).tournament;
  assert.equal(event.phase, 'seeding');
  assert.equal(event.entries.filter((entry) => entry.status === 'checked_in').length, 12);
});

test('random draw is reproducible and detects altered roster, seed, or order', async () => {
  const entrants = testTournament(12, false).entries.map(({ id, alias }) => ({ id, alias }));
  const draw = await createDraw(entrants, '2026-10-03T23:55:00Z');
  assert.equal(await verifyDraw(draw), true);
  assert.equal(new Set(draw.order).size, 12);
  assert.deepEqual(
    await seededOrder(
      draw.entrants.map((entry) => entry.id),
      draw.randomSeed,
    ),
    draw.order,
  );
  assert.equal(await verifyDraw({ ...draw, order: [...draw.order].reverse() }), false);
  assert.equal(await verifyDraw({ ...draw, randomSeed: '0'.repeat(64) }), false);
  assert.equal(
    await verifyDraw({
      ...draw,
      entrants: draw.entrants.map((entry, i) => (i === 0 ? { ...entry, alias: 'Changed' } : entry)),
    }),
    false,
  );
});

test('draw commits once, reveals separately, and records voids', async () => {
  let event = testTournament(12, false);
  event = (await execute(event, { type: 'draw' })).tournament;
  assert.equal(event.seedOrder.length, 0);
  assert.equal(event.draws[0].revealedAt, null);
  await assert.rejects(execute(event, { type: 'draw' }), /locked the roster/);
  await assert.rejects(execute(event, { type: 'reveal_draw' }), /five seconds/);
  event = (await execute(event, { type: 'reveal_draw' }, '2026-10-04T00:00:05Z')).tournament;
  assert.deepEqual(event.seedOrder, event.draws[0].order);
  assert.equal(event.notices.length, 12);
  await assert.rejects(
    execute(event, { type: 'void_draw', reason: 'Unacceptable redraw' }),
    /cannot be voided/,
  );
  event = (await execute(testTournament(12, false), { type: 'draw' })).tournament;
  event = (await execute(event, { type: 'void_draw', reason: 'Documented roster ruling' }))
    .tournament;
  assert.equal(event.draws[0].voidReason, 'Documented roster ruling');
  assert.equal(event.seedOrder.length, 0);
  assert.match(event.announcements[0].body, /Documented roster ruling/);
});

test('players and revoked referees cannot submit official results or seed a draw', async () => {
  const event = testTournament();
  const player = { userId: 'user-1', alias: 'Player 1', director: false };
  await assert.rejects(execute(event, { type: 'draw' }, undefined, player), /staff access/);
  await assert.rejects(
    execute(event, { type: 'start_match', matchId: 'U1' }, undefined, player),
    /staff access/,
  );
  event.refereeIds = [player.userId];
  const next = (await execute(event, { type: 'start_match', matchId: 'U1' }, undefined, player))
    .tournament;
  next.refereeIds = [];
  await assert.rejects(
    execute(
      next,
      {
        type: 'result',
        matchId: 'U1',
        kind: 'played',
        winnerId: 'entry-1',
        scoreA: 3,
        scoreB: 0,
        reason: '',
      },
      undefined,
      player,
    ),
    /staff access/,
  );
});

test('last place, waitlist priority, promotion, retry identity and caller identity', async () => {
  let event = testTournament(0, false);
  event.phase = 'registration';
  event.settings.capacity = 12;
  const now = '2026-09-27T00:00:00Z';
  for (let i = 1; i <= 13; i++)
    event = (
      await execute(event, { type: 'register', rulesVersion: 1 }, now, {
        userId: `u${i}`,
        alias: `p${i}`,
        director: false,
      })
    ).tournament;
  assert.equal(event.entries.filter((entry) => entry.status === 'registered').length, 12);
  assert.equal(event.entries[12].status, 'waitlisted');
  event = (
    await execute(event, { type: 'withdraw' }, now, { userId: 'u1', alias: 'p1', director: false })
  ).tournament;
  event = (
    await execute(event, { type: 'register', rulesVersion: 1 }, now, {
      userId: 'u14',
      alias: 'p14',
      director: false,
    })
  ).tournament;
  assert.equal(event.entries[13].status, 'waitlisted');
  await assert.rejects(
    execute(event, { type: 'promote', entryId: event.entries[13].id }, now),
    /first player/,
  );
  const operationId = crypto.randomUUID();
  const input = {
    command: { type: 'promote' as const, entryId: event.entries[12].id },
    expectedRevision: event.revision,
    operationId,
  };
  event = (await applyMutation(event, input, testDirector, now)).tournament;
  const replay = await applyMutation(event, input, testDirector, now);
  assert.equal(replay.replayed, true);
  assert.equal(replay.tournament.revision, event.revision);
  assert.equal(event.entries.filter((entry) => entry.status === 'registered').length, 12);
  assert.equal(
    event.notices.filter((notice) => notice.userId === 'u13' && notice.message.includes('promoted'))
      .length,
    1,
  );
  assert.equal(
    mutationSchema.safeParse({
      ...input,
      command: { type: 'register', rulesVersion: 1, userId: 'someone-else' },
    }).success,
    false,
  );
});

test('check-in respects the server clock and a player only reads their own notices', async () => {
  const event = testTournament(12, false);
  event.phase = 'check_in';
  event.entries[0].status = 'registered';
  const actor = { userId: 'user-1', alias: 'Player 1', director: false };
  await assert.rejects(
    execute(event, { type: 'check_in' }, '2026-10-03T23:29:59Z', actor),
    /published window/,
  );
  const checked = (await execute(event, { type: 'check_in' }, '2026-10-03T23:40:00Z', actor))
    .tournament;
  assert.equal(checked.entries[0].status, 'checked_in');
  event.notices.push({
    id: 'private',
    userId: 'user-2',
    message: 'Private',
    createdAt: '2026-10-03T23:40:00Z',
    readAt: null,
  });
  await assert.rejects(
    execute(event, { type: 'notice_read', noticeId: 'private' }, undefined, actor),
    /Notice not found/,
  );
});

test('single arena includes held matches and corrections stop at downstream play', async () => {
  let event = testTournament();
  event = (await execute(event, { type: 'start_match', matchId: 'U1' })).tournament;
  event = (
    await execute(event, {
      type: 'hold_match',
      matchId: 'U1',
      held: true,
      reason: 'Connection review',
    })
  ).tournament;
  await assert.rejects(execute(event, { type: 'start_match', matchId: 'U2' }), /active or held/);
  event = (
    await execute(event, {
      type: 'result',
      matchId: 'U1',
      kind: 'played',
      winnerId: 'entry-1',
      scoreA: 3,
      scoreB: 1,
      reason: '',
    })
  ).tournament;
  event = (
    await execute(event, {
      type: 'result',
      matchId: 'U2',
      kind: 'forfeit',
      winnerId: 'entry-8',
      scoreA: null,
      scoreB: null,
      reason: 'No show',
    })
  ).tournament;
  event = (await execute(event, { type: 'start_match', matchId: 'U9' })).tournament;
  await assert.rejects(
    execute(event, {
      type: 'correct_result',
      matchId: 'U1',
      reason: 'Wrong winner',
      replacement: { kind: 'played', winnerId: 'entry-16', scoreA: 1, scoreB: 3, reason: '' },
    }),
    /downstream play/,
  );
});
