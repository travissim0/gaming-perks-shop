import assert from 'node:assert/strict';
import { test } from 'node:test';
import { applyMutation } from './transition';
import { resolveBracket } from './bracket';
import { Command, Tournament } from './contracts';
import { testDirector } from './testing';
import { currentAuthReturn } from '../auth-return';
import { TournamentError } from './contracts';
import { createTournamentHttp } from './http';
import { TournamentRepository } from './repository';
import { testTournament } from './testing';
import { createDraw } from './draw';
import { publicDraw } from './view';

test('data reads need no admission configuration while staff endpoints still require authentication', async () => {
  const event = testTournament();
  const calls: string[] = [];
  const api = createTournamentHttp({
    repository: () =>
      new TournamentRepository({
        call: async (name) => {
          calls.push(name);
          assert.equal(name, 'dueling_tournament_list');
          return [event];
        },
      }),
    actor: async (request) => {
      const token = request.headers.get('authorization');
      if (!token) return null;
      if (token === 'Bearer valid-local-account') return testDirector;
      throw new TournamentError('unauthorized', 'Invalid session.', 401);
    },
    staffAccount: async () => {},
    now: () => new Date().toISOString(),
  });
  const request = (token?: string) =>
    new Request('http://localhost/api/ctf/dueling-tournaments', {
      headers: { origin: 'http://localhost', ...(token ? { authorization: token } : {}) },
    });
  for (const token of [undefined, 'Bearer valid-local-account']) {
    for (let i = 0; i < 241; i++) {
      const response = await api.list(request(token));
      assert.equal(response.status, 200);
      assert.equal((await response.json()).events[0].id, event.id);
    }
  }
  assert.equal(calls.length, 482);
  for (const token of [undefined, 'Bearer invalid-local-account']) {
    assert.equal((await api.access(request(token))).status, 401);
    assert.equal((await api.export(request(token), event.id)).status, 401);
    assert.equal((await api.create(request(token))).status, 401);
    assert.equal((await api.mutate(request(token), event.id)).status, 401);
  }
  assert.equal(calls.length, 482, 'Rejected actors must not reach the repository');
});

test('a corrupt event is logged and omitted without suppressing healthy events', async () => {
  const event = testTournament();
  const repo = new TournamentRepository({
    call: async () => [event, { ...event, id: 'broken', settings: {} }],
  });
  const listed = await repo.list(null);
  assert.equal(listed.length, 1);
  assert.equal(listed[0].id, event.id);
});

test('a voided draw exposes enough data to verify the abandoned draw', async () => {
  const event = testTournament(12, false);
  const draw = await createDraw(
    event.entries.map(({ id, alias }) => ({ id, alias })),
    new Date().toISOString(),
  );
  draw.voidReason = 'Documented correction before reveal';
  const view = publicDraw(draw);
  assert.equal(view.randomSeed, draw.randomSeed);
  assert.deepEqual(view.order, draw.order);
});

const now = '2026-10-04T00:00:00Z';
const execute = async (event: Tournament, command: Command, actor = testDirector) =>
  (
    await applyMutation(
      event,
      { operationId: crypto.randomUUID(), expectedRevision: event.revision, command },
      actor,
      now,
    )
  ).tournament;

test('the hold policy has a director-only absence ruling that finishes no-show-heavy events', async () => {
  for (let sample = 0; sample < 100; sample++) {
    let event = testTournament(4 + (sample % 29));
    event.settings.restMinutes = 0;
    let steps = 0;
    while (event.phase !== 'completed') {
      assert.ok(steps++ < 64, 'No event may remain stuck');
      const match = resolveBracket(event.fixtures, event.seedOrder).find(
        (item) => item.state === 'ready',
      );
      if (!match) {
        event = await execute(event, {
          type: 'finish_without_champion',
          reason: 'No eligible final winner remains',
        });
        break;
      }
      if ((sample + steps) % 3 !== 0) {
        event = await execute(event, {
          type: 'hold_match',
          matchId: match.id,
          held: true,
          reason: 'Both players absent',
        });
        await assert.rejects(
          execute(
            event,
            {
              type: 'resolve_absence',
              matchId: match.id,
              outcome: 'eliminate_both',
              reason: 'Not allowed',
            },
            { userId: 'user-1', alias: 'Player 1', director: false },
          ),
          /staff access/,
        );
        event = await execute(event, {
          type: 'resolve_absence',
          matchId: match.id,
          outcome: 'eliminate_both',
          reason: 'Admin removes both absent players',
        });
      } else {
        const winner = match.slots[0];
        assert.equal(winner.state, 'player');
        if (winner.state !== 'player') throw new Error('Unresolved');
        event = await execute(event, {
          type: 'result',
          matchId: match.id,
          kind: 'forfeit',
          winnerId: winner.entryId,
          scoreA: null,
          scoreB: null,
          reason: 'Only one player present',
        });
      }
    }
    assert.equal(event.phase, 'completed');
  }
});

test('restoring staff availability preserves scores and is a director-only audited action', async () => {
  let event = testTournament();
  event = await execute(event, {
    type: 'entry_status',
    entryId: 'entry-1',
    status: 'disqualified',
    reason: 'Mistaken identity',
  });
  const fixtures = structuredClone(event.fixtures);
  await assert.rejects(
    execute(
      event,
      { type: 'restore_entry', entryId: 'entry-1', reason: 'Not permitted' },
      { userId: 'user-1', alias: 'Player 1', director: false },
    ),
    /staff access/,
  );
  event = await execute(event, {
    type: 'restore_entry',
    entryId: 'entry-1',
    reason: 'Reviewed and reversed',
  });
  assert.equal(event.entries[0].status, 'checked_in');
  assert.deepEqual(event.fixtures, fixtures);
  assert.equal(event.audit.at(-1)?.action, 'restore_entry');
});

test('restoring an active place rejects an alias taken by another entrant with a helpful message', async () => {
  let event = testTournament(12, false);
  event.phase = 'registration';
  event = await execute(event, {
    type: 'entry_status',
    entryId: 'entry-1',
    status: 'no_show',
    reason: 'Attendance ruling',
  });
  event.entries[1].alias = 'pLaYeR 1';
  const before = structuredClone(event);
  await assert.rejects(
    execute(event, { type: 'restore_entry', entryId: 'entry-1', reason: 'Player returned' }),
    (error: unknown) =>
      error instanceof TournamentError &&
      error.code === 'alias_conflict' &&
      /Resolve the duplicate alias before restoring/.test(error.message),
  );
  assert.deepEqual(event, before);
});

test('ordinary registration completion ignores stale session return destinations', () => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'window');
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: { location: { href: 'https://freeinf.org/auth/complete-registration' } },
  });
  try {
    assert.equal(currentAuthReturn(), '/');
  } finally {
    if (previous) Object.defineProperty(globalThis, 'window', previous);
    else Reflect.deleteProperty(globalThis, 'window');
  }
});
