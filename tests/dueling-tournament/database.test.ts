import assert from 'node:assert/strict';
import { after, before, beforeEach, test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { installTestDatabase, migrationSql } from './install';
import { databasePool, PostgresTestPort } from './postgres';
import { TournamentRepository } from '../../src/lib/dueling-tournament/repository';
import { applyMutation, commandFingerprint } from '../../src/lib/dueling-tournament/transition';
import {
  Actor,
  Command,
  Tournament,
  TournamentError,
} from '../../src/lib/dueling-tournament/contracts';
import { testDirector, testTournament } from '../../src/lib/dueling-tournament/testing';
import { tournamentView, eventCsv } from '../../src/lib/dueling-tournament/view';
import { champion, resolveBracket } from '../../src/lib/dueling-tournament/bracket';
import { createDraw } from '../../src/lib/dueling-tournament/draw';

const owner = databasePool();
const runtime = databasePool('service_role');
const port = new PostgresTestPort(runtime);
const repo = new TournamentRepository(port);
const now = '2026-10-04T00:00:00Z';

before(async () => {
  await installTestDatabase(owner);
});
beforeEach(async () => {
  await owner.query(
    'truncate public.dueling_tournament_registration_cooldowns, public.dueling_tournament_history, public.dueling_tournament_notice_reads, public.dueling_tournament_operations, public.dueling_tournament_records, public.dueling_tournament_directors, public.dueling_tournament_rate_buckets',
  );
  await owner.query('insert into public.dueling_tournament_directors(user_id) values($1)', [
    testDirector.userId,
  ]);
});
after(async () => {
  await runtime.end();
  await owner.end();
});

async function commitProposed(
  event: Tournament,
  proposed: Tournament,
  command: Command,
  actor = testDirector,
) {
  return port.call('dueling_tournament_commit', {
    p_actor_id: actor.userId,
    p_event_id: event.id,
    p_expected_revision: event.revision,
    p_operation_id: proposed.audit.at(-1)!.id,
    p_fingerprint: await commandFingerprint(command),
    p_command_type: command.type,
    p_state: proposed,
  });
}

test('rerunning the exact migration fails atomically and preserves existing rate counters', async () => {
  await port.call('dueling_tournament_rate_check', { p_key: 'request:preserved', p_limit: 1 });
  const before = await owner.query(
    'select * from public.dueling_tournament_rate_buckets order by bucket_key',
  );
  const connection = await owner.connect();
  try {
    await assert.rejects(connection.query(await migrationSql()), /already exist/);
    await connection.query('rollback');
  } finally {
    connection.release();
  }
  const after = await owner.query(
    'select * from public.dueling_tournament_rate_buckets order by bucket_key',
  );
  assert.deepEqual(after.rows, before.rows);
});

test('a reclaimed alias blocks availability restoration without changing results or history', async () => {
  let event = testTournament(12, false);
  event.phase = 'registration';
  await seed(event);
  event = await mutate(event, {
    type: 'entry_status',
    entryId: 'entry-1',
    status: 'no_show',
    reason: 'Absent',
  });
  event = await mutate(
    event,
    { type: 'register', rulesVersion: 1 },
    { userId: 'replacement', alias: 'pLaYeR 1', director: false },
    '2026-09-27T00:00:00Z',
  );
  const command = { type: 'restore_entry' as const, entryId: 'entry-1', reason: 'Player returned' };
  await assert.rejects(mutate(event, command), /Resolve the duplicate alias before restoring/);
  assert.deepEqual(await repo.get(event.id, testDirector), event);
  // Bypass the preflight to retain evidence that the SQL guard also rejects it.
  const source = structuredClone(event);
  source.entries.find((entry) => entry.userId === 'replacement')!.alias = 'Temporary alias';
  const proposed = (
    await applyMutation(
      source,
      { operationId: crypto.randomUUID(), expectedRevision: event.revision, command },
      testDirector,
      now,
    )
  ).tournament;
  proposed.entries.find((entry) => entry.userId === 'replacement')!.alias = 'pLaYeR 1';
  await assert.rejects(
    commitProposed(event, proposed, command),
    /Resolve the duplicate alias before retrying/,
  );
  assert.deepEqual(await repo.get(event.id, testDirector), event);
});

test('populating 20000 public identities does not block a new reader or director write', async () => {
  await owner.query(
    "select public.dueling_tournament_rate_check('request:address-'||i,240) from generate_series(1,20000) i",
  );
  assert.equal(
    await port.call('dueling_tournament_rate_check', { p_key: 'request:new-reader', p_limit: 240 }),
    true,
  );
  const event = testTournament();
  await seed(event);
  assert.equal(
    (
      await mutate(event, {
        type: 'hold_match',
        matchId: 'U1',
        held: true,
        reason: 'Staff remain operational',
      })
    ).fixtures[0].held,
    true,
  );
});

test('unrelated rate admissions do not wait on a global advisory lock', async () => {
  const blocker = await owner.connect();
  const client = await runtime.connect();
  try {
    await blocker.query('begin');
    await blocker.query(
      "select pg_advisory_xact_lock(hashtextextended('dueling-rate-admission',0))",
    );
    await blocker.query("select public.dueling_tournament_rate_check('request:held-reader',240)");
    await client.query("set statement_timeout='1000ms'");
    const result = await client.query(
      "select public.dueling_tournament_rate_check('request:unrelated',240) as allowed",
    );
    assert.equal(result.rows[0].allowed, true);
  } finally {
    await blocker.query('rollback');
    await client.query('reset statement_timeout');
    client.release();
    blocker.release();
  }
});

test('SQL rejects removing prior notices or adding notices to an unrelated command', async () => {
  let event = testTournament();
  event.notices = [
    { id: 'original', userId: 'user-1', message: 'Original', createdAt: now, readAt: null },
  ];
  await seed(event);
  event = await mutate(event, { type: 'announcement', body: 'Record existing notice' });
  const command = { type: 'announcement' as const, body: 'Later announcement' };
  const proposed = (
    await applyMutation(
      event,
      { operationId: crypto.randomUUID(), expectedRevision: event.revision, command },
      testDirector,
      now,
    )
  ).tournament;
  const removed = structuredClone(proposed);
  removed.notices = [];
  await assert.rejects(commitProposed(event, removed, command), /notice/i);
  const added = structuredClone(proposed);
  added.notices.push({
    id: 'injected',
    userId: 'user-1',
    message: 'Injected',
    createdAt: now,
    readAt: null,
  });
  await assert.rejects(commitProposed(event, added, command), /notice/i);
});

test('SQL limits availability rulings to the named entrant', async () => {
  const event = testTournament();
  await seed(event);
  const command = {
    type: 'entry_status' as const,
    entryId: 'entry-1',
    status: 'no_show' as const,
    reason: 'One absent player',
  };
  const proposed = (
    await applyMutation(
      event,
      { operationId: crypto.randomUUID(), expectedRevision: event.revision, command },
      testDirector,
      now,
    )
  ).tournament;
  proposed.entries[1].status = 'disqualified';
  await assert.rejects(commitProposed(event, proposed, command), /selected player|named player/i);
});

test('SQL rejects overwriting a result through the ordinary result command', async () => {
  let event = testTournament();
  await seed(event);
  event = await mutate(event, {
    type: 'result',
    matchId: 'U1',
    kind: 'forfeit',
    winnerId: 'entry-1',
    scoreA: null,
    scoreB: null,
    reason: 'Opponent absent',
  });
  const replacement = {
    kind: 'forfeit' as const,
    winnerId: 'entry-16',
    scoreA: null,
    scoreB: null,
    reason: 'Replaced result',
  };
  const command = {
    type: 'correct_result' as const,
    matchId: 'U1',
    replacement,
    reason: 'Director correction',
  };
  const proposed = (
    await applyMutation(
      event,
      { operationId: crypto.randomUUID(), expectedRevision: event.revision, command },
      testDirector,
      now,
    )
  ).tournament;
  proposed.audit.at(-1)!.action = 'result';
  await assert.rejects(
    commitProposed(event, proposed, { type: 'result', matchId: 'U1', ...replacement }),
    /already.*result|correction/i,
  );
});

test('SQL enforces rejoin cooldown even if the application supplies a later timestamp', async () => {
  const actor = { userId: 'user-1', alias: 'Player 1', director: false };
  let event = testTournament(12, false);
  event.phase = 'registration';
  await seed(event);
  event = await mutate(event, { type: 'withdraw' }, actor, '2026-09-27T00:00:00Z');
  const command = { type: 'register' as const, rulesVersion: 1 };
  const proposed = (
    await applyMutation(
      event,
      { operationId: crypto.randomUUID(), expectedRevision: event.revision, command },
      actor,
      '2026-09-27T00:05:00Z',
    )
  ).tournament;
  await assert.rejects(commitProposed(event, proposed, command, actor), /five minutes/i);
  const before = await owner.query(
    'select rejoin_after from public.dueling_tournament_registration_cooldowns where event_id=$1 and actor_id=$2',
    [event.id, actor.userId],
  );
  await assert.rejects(commitProposed(event, proposed, command, actor), /five minutes/i);
  assert.deepEqual(
    (
      await owner.query(
        'select rejoin_after from public.dueling_tournament_registration_cooldowns where event_id=$1 and actor_id=$2',
        [event.id, actor.userId],
      )
    ).rows,
    before.rows,
  );
  await owner.query(
    "update public.dueling_tournament_registration_cooldowns set rejoin_after=clock_timestamp()-interval '1 second' where event_id=$1 and actor_id=$2",
    [event.id, actor.userId],
  );
  await commitProposed(event, proposed, command, actor);
  assert.equal(
    (await repo.get(event.id, actor)).entries.find((entry) => entry.userId === actor.userId)
      ?.status,
    'registered',
  );
});

async function seed(event: Tournament) {
  await owner.query(
    'insert into public.dueling_tournament_records(id,slug,revision,state) values($1,$2,$3,$4)',
    [event.id, event.settings.slug, event.revision, event],
  );
}
const mutate = (event: Tournament, command: Command, actor: Actor = testDirector, at = now) =>
  repo.mutate(
    event.id,
    { command, operationId: crypto.randomUUID(), expectedRevision: event.revision },
    actor,
    at,
  );

test('full database rehearsals finish every field from 4 to 32 through the reset final', async () => {
  for (let count = 4; count <= 32; count++) {
    await owner.query('truncate public.dueling_tournament_rate_buckets');
    let event = testTournament(count);
    event.id = `rehearsal-${count}`;
    event.settings.slug = event.id;
    event.settings.restMinutes = 0;
    await seed(event);
    let series = 0;
    while (!champion(resolveBracket(event.fixtures, event.seedOrder))) {
      const match = resolveBracket(event.fixtures, event.seedOrder).find(
        (item) => item.state === 'ready',
      );
      assert.ok(match, 'An unfinished event must have an available match.');
      event = await mutate(event, { type: 'start_match', matchId: match.id });
      const winnerIndex = match.id === 'GF1' ? 1 : 0;
      const winner = match.slots[winnerIndex];
      assert.equal(winner.state, 'player');
      if (winner.state !== 'player') throw new Error('Missing opponent.');
      event = await mutate(event, {
        type: 'result',
        matchId: match.id,
        kind: 'played',
        winnerId: winner.entryId,
        scoreA: winnerIndex ? 1 : 3,
        scoreB: winnerIndex ? 3 : 1,
        reason: '',
      });
      series++;
      // Fast-forward only the disposable limiter window, as this rehearsal packs
      // several hours of match operations into seconds. Admission tests stay separate.
      if (series % 30 === 0)
        await owner.query(
          "update public.dueling_tournament_rate_buckets set window_start=clock_timestamp()-interval '2 minutes'",
        );
      assert.ok(series <= 2 * count - 1);
    }
    const durable = await repo.get(event.id, null);
    assert.equal(durable.phase, 'completed');
    assert.equal(series, 2 * count - 1);
    assert.equal(durable.audit.length, Math.min(100, series * 2));
    const history = await owner.query(
      "select count(*)::int as n from public.dueling_tournament_history where event_id=$1 and kind='audit'",
      [event.id],
    );
    assert.equal(history.rows[0].n, series * 2);
    const bytes = Buffer.byteLength(JSON.stringify(durable));
    assert.ok(bytes < 500000, `32-player working snapshot should remain well below 4 MB: ${bytes}`);
    if (count === 32) {
      console.log(
        `32-player completed snapshot: ${bytes} bytes; ${series} series; ${history.rows[0].n} archived audit entries`,
      );
      const full = structuredClone(durable);
      const draw = await createDraw(
        full.entries.map(({ id, alias }) => ({ id, alias })),
        now,
      );
      full.draws = Array.from({ length: 20 }, (_, index) => ({
        ...draw,
        id: `history-draw-${index}`,
        voidReason: 'Prior unrevealed draw voided',
      }));
      full.announcements = Array.from({ length: 50 }, (_, index) => ({
        id: `announcement-${index}`,
        body: 'A'.repeat(4000),
        createdAt: now,
      }));
      full.notices = Array.from({ length: 200 }, (_, index) => ({
        id: `notice-${index}`,
        userId: full.entries[index % 32].userId,
        message: 'N'.repeat(1000),
        createdAt: now,
        readAt: null,
      }));
      assert.equal(full.audit.length, 100);
      assert.equal(full.receipts.length, 64);
      const fullBytes = Buffer.byteLength(JSON.stringify(full));
      assert.ok(
        fullBytes < 1000000,
        `All bounded working-history lists should remain below 1 MB: ${fullBytes}`,
      );
      await owner.query('select public.dueling_tournament_validate($1)', [full]);
      console.log(`32-player snapshot with every history list full: ${fullBytes} bytes`);
    }
    assert.equal(durable.revision, series * 2);
    const results = tournamentView(durable, null, now);
    assert.equal(results.placements.filter((item) => item.place === 1).length, 1);
    assert.equal(results.fixtures.find((item) => item.id === 'GF2')?.state, 'completed');
  }
});

test('simultaneous last-place claims serialize and the loser retries into the waitlist', async () => {
  const event = testTournament(11, false);
  event.phase = 'registration';
  event.settings.capacity = 12;
  await seed(event);
  const actors = [12, 13].map((i) => ({
    userId: `user-${i}`,
    alias: `Player ${i}`,
    director: false,
  }));
  const outputs = await Promise.allSettled(
    actors.map((actor) =>
      mutate(event, { type: 'register', rulesVersion: 1 }, actor, '2026-09-27T00:00:00Z'),
    ),
  );
  assert.equal(outputs.filter((output) => output.status === 'fulfilled').length, 1);
  const rejected = outputs.findIndex((output) => output.status === 'rejected');
  const current = await repo.get(event.id, actors[rejected]);
  const next = await mutate(
    current,
    { type: 'register', rulesVersion: 1 },
    actors[rejected],
    '2026-09-27T00:00:01Z',
  );
  assert.equal(
    next.entries.filter((entry) => ['registered', 'checked_in'].includes(entry.status)).length,
    12,
  );
  assert.equal(next.entries.filter((entry) => entry.status === 'waitlisted').length, 1);
  assert.equal(next.audit.length, 2);
});

test('32-player capacity race admits one last place and waitlists the retry', async () => {
  const event = testTournament(31, false);
  event.phase = 'registration';
  event.settings.capacity = 32;
  await seed(event);
  const actors = [32, 33].map((i) => ({
    userId: `user-${i}`,
    alias: `Player ${i}`,
    director: false,
  }));
  const outputs = await Promise.allSettled(
    actors.map((actor) =>
      mutate(event, { type: 'register', rulesVersion: 1 }, actor, '2026-09-27T00:00:00Z'),
    ),
  );
  assert.equal(outputs.filter((output) => output.status === 'fulfilled').length, 1);
  const rejected = outputs.findIndex((output) => output.status === 'rejected');
  const current = await repo.get(event.id, actors[rejected]);
  const next = await mutate(
    current,
    { type: 'register', rulesVersion: 1 },
    actors[rejected],
    '2026-09-27T00:00:01Z',
  );
  assert.equal(
    next.entries.filter((entry) => ['registered', 'checked_in'].includes(entry.status)).length,
    32,
  );
  assert.equal(next.entries.filter((entry) => entry.status === 'waitlisted').length, 1);
  assert.equal(next.audit.length, 2);
});

test('duplicate operation returns one durable result and one audit entry', async () => {
  const event = testTournament();
  await seed(event);
  const input = {
    operationId: crypto.randomUUID(),
    expectedRevision: event.revision,
    command: { type: 'start_match' as const, matchId: 'U1' },
  };
  const first = await repo.mutate(event.id, input, testDirector, now);
  const retry = await repo.mutate(event.id, input, testDirector, now);
  assert.equal(first.revision, retry.revision);
  assert.equal(retry.audit.length, 1);
  const count = await owner.query(
    'select count(*)::integer as count from public.dueling_tournament_operations',
  );
  assert.equal(count.rows[0].count, 1);
});

test('database rejects an invalid winner and rolls back result, notices and audit', async () => {
  let event = testTournament();
  await seed(event);
  event = await mutate(event, { type: 'start_match', matchId: 'U1' });
  const input = {
    operationId: crypto.randomUUID(),
    expectedRevision: event.revision,
    command: {
      type: 'result' as const,
      matchId: 'U1',
      kind: 'played' as const,
      winnerId: 'entry-1',
      scoreA: 3,
      scoreB: 0,
      reason: '',
    },
  };
  const { tournament: proposed } = await applyMutation(event, input, testDirector, now);
  proposed.fixtures.find((fixture) => fixture.id === 'U1')!.result!.winnerId = 'entry-7';
  await assert.rejects(
    port.call('dueling_tournament_commit', {
      p_actor_id: testDirector.userId,
      p_event_id: event.id,
      p_expected_revision: event.revision,
      p_operation_id: input.operationId,
      p_fingerprint: await commandFingerprint(input.command),
      p_command_type: 'result',
      p_state: proposed,
    }),
    /winner must be an opponent/,
  );
  assert.deepEqual(await repo.get(event.id, testDirector), event);
});

test('revocation between proposal and commit rejects a cached director capability', async () => {
  const event = testTournament();
  await seed(event);
  const input = {
    operationId: crypto.randomUUID(),
    expectedRevision: event.revision,
    command: { type: 'announcement' as const, body: 'Test announcement' },
  };
  const { tournament: proposed } = await applyMutation(event, input, testDirector, now);
  await owner.query('delete from public.dueling_tournament_directors where user_id = $1', [
    testDirector.userId,
  ]);
  await assert.rejects(
    port.call('dueling_tournament_commit', {
      p_actor_id: testDirector.userId,
      p_event_id: event.id,
      p_expected_revision: event.revision,
      p_operation_id: input.operationId,
      p_fingerprint: await commandFingerprint(input.command),
      p_command_type: 'announcement',
      p_state: proposed,
    }),
    (error: unknown) => error instanceof TournamentError && error.status === 403,
  );
  assert.equal((await repo.get(event.id, null)).revision, 0);
});

test('anonymous database clients cannot bypass the API or read raw event state', async () => {
  await seed(testTournament());
  const anonymous = databasePool('dueling_test_anon');
  try {
    await assert.rejects(
      anonymous.query('select * from public.dueling_tournament_records'),
      /permission denied/,
    );
    await assert.rejects(
      anonymous.query('select public.dueling_tournament_get($1,$2)', [
        'local-event',
        testDirector.userId,
      ]),
      /permission denied/,
    );
  } finally {
    await anonymous.end();
  }
});

test('drafts remain private, pre-reveal seeds remain hidden even from admin views, CSV formulas are escaped', async () => {
  let event = testTournament(12, false);
  event.published = false;
  await seed(event);
  await assert.rejects(repo.get(event.id, null), /not found/);
  assert.equal((await repo.list(null)).length, 0);
  assert.equal((await repo.list(testDirector)).length, 1);
  event = await mutate(event, { type: 'draw' });
  assert.equal(tournamentView(event, testDirector, now).draws[0].randomSeed, null);
  assert.deepEqual(tournamentView(event, testDirector, now).draws[0].order, []);
  event.entries[0].alias = '=HYPERLINK("bad")';
  assert.match(eventCsv(event, 'players'), /'=HYPERLINK/);
  assert.ok(!eventCsv(event, 'players').includes('user-1'));
});

test('blocked attempts do not extend or recreate the rate-limit window', async () => {
  await port.call('dueling_tournament_rate_check', { p_key: 'request:rate-test', p_limit: 1 });
  const beforeState = await owner.query(
    "select window_start, hits from public.dueling_tournament_rate_buckets where bucket_key='request:'||(hashtextextended($1,0)&65535)::text",
    ['request:rate-test'],
  );
  assert.equal(
    await port.call('dueling_tournament_rate_check', { p_key: 'request:rate-test', p_limit: 1 }),
    false,
  );
  const afterState = await owner.query(
    "select window_start, hits from public.dueling_tournament_rate_buckets where bucket_key='request:'||(hashtextextended($1,0)&65535)::text",
    ['request:rate-test'],
  );
  assert.deepEqual(afterState.rows, beforeState.rows);
});

test('Supabase default grants cannot expose tournament RPCs to anonymous or authenticated clients', async () => {
  for (const role of ['anon', 'authenticated']) {
    const connection = databasePool(role);
    try {
      await assert.rejects(
        connection.query('select public.dueling_tournament_get($1,$2)', [
          'local-event',
          testDirector.userId,
        ]),
        /permission denied/,
      );
      const grants = await owner.query(
        `select p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname like 'dueling_tournament_%' and has_function_privilege($1,p.oid,'EXECUTE')`,
        [role],
      );
      assert.deepEqual(grants.rows, []);
    } finally {
      await connection.end();
    }
  }
});

test('notice acknowledgements are private, idempotent, and cannot conflict with a referee result', async () => {
  let event = testTournament();
  await seed(event);
  event = await mutate(event, { type: 'start_match', matchId: 'U1' });
  const refRevision = event.revision;
  // Add an unrelated player notice as a durable fixture, with no new event revision.
  const notice = {
    id: 'notice-test',
    userId: 'user-1',
    message: 'Local test',
    createdAt: now,
    readAt: null,
  };
  await owner.query(
    `update public.dueling_tournament_records set state=jsonb_set(state,'{notices}',state->'notices' || $1::jsonb) where id=$2`,
    [JSON.stringify([notice]), event.id],
  );
  const player = { userId: 'user-1', alias: 'Player 1', director: false };
  for (let i = 0; i < 12; i++)
    await repo.mutate(
      event.id,
      {
        operationId: crypto.randomUUID(),
        expectedRevision: 0,
        command: { type: 'notice_read', noticeId: notice.id },
      },
      player,
      now,
    );
  const current = await repo.get(event.id, player);
  assert.equal(current.revision, refRevision);
  assert.ok(current.notices.find((item) => item.id === notice.id)?.readAt);
  await assert.rejects(
    repo.mutate(
      event.id,
      {
        operationId: crypto.randomUUID(),
        expectedRevision: 0,
        command: { type: 'notice_read', noticeId: notice.id },
      },
      { ...player, userId: 'user-2' },
      now,
    ),
    /Notice not found/,
  );
  const scored = await mutate(event, {
    type: 'result',
    matchId: 'U1',
    kind: 'played',
    winnerId: 'entry-1',
    scoreA: 3,
    scoreB: 0,
    reason: '',
  });
  assert.equal(scored.revision, refRevision + 1);
  assert.equal(scored.audit.length, 2);
  const count = await owner.query(
    'select count(*)::integer as n from public.dueling_tournament_notice_reads',
  );
  assert.equal(count.rows[0].n, 1);
});

test('large histories remain durable while future actions and old retries keep working', async () => {
  let event = testTournament();
  event.audit = Array.from({ length: 10001 }, (_, i) => ({
    id: `historic-${i}`,
    actorId: testDirector.userId,
    action: 'announcement',
    at: now,
    revision: i,
    reason: '',
    matchId: null,
    previousResult: null,
    details: {},
  }));
  event.revision = 10001;
  await seed(event);
  const input = {
    operationId: crypto.randomUUID(),
    expectedRevision: event.revision,
    command: {
      type: 'hold_match' as const,
      matchId: 'U1',
      held: true,
      reason: 'History recovery check',
    },
  };
  event = await repo.mutate(event.id, input, testDirector, now);
  assert.equal(event.audit.length, 100);
  const count = await owner.query(
    "select count(*)::integer as n from public.dueling_tournament_history where kind='audit'",
  );
  assert.equal(count.rows[0].n, 10002);
  // Evict the operation from the working receipt cache. Its durable receipt remains.
  await owner.query(
    "update public.dueling_tournament_records set state=jsonb_set(state,'{receipts}','[]'::jsonb) where id=$1",
    [event.id],
  );
  const retry = await repo.mutate(event.id, input, testDirector, now);
  assert.equal(retry.revision, event.revision);
  event = await mutate(retry, { type: 'cancel', reason: 'Local rehearsal complete' });
  assert.equal(event.phase, 'cancelled');
  const first = (await repo.history(event.id, testDirector, 'audit', null)) as {
    cursor: string;
    item: { id: string };
  }[];
  const second = (await repo.history(event.id, testDirector, 'audit', first.at(-1)!.cursor)) as {
    cursor: string;
    item: { id: string };
  }[];
  assert.equal(first.length, 50);
  assert.equal(second.length, 50);
  assert.equal(new Set([...first, ...second].map((row) => row.item.id)).size, 100);
  await assert.rejects(
    repo.history(event.id, { ...testDirector, director: false, userId: 'user-2' }, 'audit', null),
    /Tournament not found/,
  );
});

test('more than twenty voided draws remain public without preventing a new draw', async () => {
  let event = testTournament(12, false);
  await seed(event);
  for (let i = 0; i < 22; i++) {
    event = await mutate(event, { type: 'draw' });
    event = await mutate(event, { type: 'void_draw', reason: `Roster correction ${i + 1}` });
  }
  event = await mutate(event, { type: 'draw' });
  assert.equal(event.draws.length, 20);
  const history = (await repo.history(event.id, null, 'draws', null)) as {
    item: { voidReason: string | null };
  }[];
  assert.equal(history.length, 23);
  assert.equal(history.filter((row) => row.item.voidReason).length, 22);
});

test('a later save cannot rewrite an earlier audit entry', async () => {
  let event = testTournament();
  await seed(event);
  event = await mutate(event, { type: 'announcement', body: 'Original announcement' });
  const input = {
    operationId: crypto.randomUUID(),
    expectedRevision: event.revision,
    command: { type: 'announcement' as const, body: 'Later announcement' },
  };
  const { tournament: proposed } = await applyMutation(event, input, testDirector, now);
  proposed.audit[0].reason = 'Rewritten history';
  await assert.rejects(
    port.call('dueling_tournament_commit', {
      p_actor_id: testDirector.userId,
      p_event_id: event.id,
      p_expected_revision: event.revision,
      p_operation_id: input.operationId,
      p_fingerprint: await commandFingerprint(input.command),
      p_command_type: 'announcement',
      p_state: proposed,
    }),
    /history|audit/i,
  );
});

test('participant commands cannot change staff grants, another player, or bracket data', async () => {
  const event = testTournament(11, false);
  event.phase = 'registration';
  await seed(event);
  const actor = { userId: 'new-player', alias: 'New Player', director: false };
  const input = {
    operationId: crypto.randomUUID(),
    expectedRevision: event.revision,
    command: { type: 'register' as const, rulesVersion: 1 },
  };
  const { tournament: proposed } = await applyMutation(event, input, actor, '2026-09-27T00:00:00Z');
  proposed.refereeIds.push(actor.userId);
  await assert.rejects(
    port.call('dueling_tournament_commit', {
      p_actor_id: actor.userId,
      p_event_id: event.id,
      p_expected_revision: event.revision,
      p_operation_id: input.operationId,
      p_fingerprint: await commandFingerprint(input.command),
      p_command_type: 'register',
      p_state: proposed,
    }),
    /unrelated/,
  );
  proposed.refereeIds = [];
  proposed.entries[0].status = 'disqualified';
  await assert.rejects(
    port.call('dueling_tournament_commit', {
      p_actor_id: actor.userId,
      p_event_id: event.id,
      p_expected_revision: event.revision,
      p_operation_id: input.operationId,
      p_fingerprint: await commandFingerprint(input.command),
      p_command_type: 'register',
      p_state: proposed,
    }),
    /another account/,
  );
});

test('history rows are immutable and draw proof cannot change at reveal', async () => {
  let event = testTournament(12, false);
  await seed(event);
  event = await mutate(event, { type: 'draw' });
  await assert.rejects(
    owner.query(
      "update public.dueling_tournament_history set payload=jsonb_set(payload,'{reason}','\"changed\"'::jsonb) where kind='audit'",
    ),
    /immutable/,
  );
  await assert.rejects(
    owner.query("delete from public.dueling_tournament_history where kind='audit'"),
    /append-only/,
  );
  await assert.rejects(
    owner.query(
      "update public.dueling_tournament_history set payload=jsonb_set(payload,'{randomSeed}',to_jsonb(repeat('a',64))) where kind='draws'",
    ),
    /immutable/,
  );
  event = await mutate(event, { type: 'void_draw', reason: 'Publicly recorded void' });
  assert.ok(tournamentView(event, null, now).draws[0].randomSeed);
});

test('fixed rate slots reuse expired windows and never reject solely because slots exist', async () => {
  await owner.query(
    "insert into public.dueling_tournament_rate_buckets select 'request:'||i, date_trunc('minute',now())-interval '10 minutes',240 from generate_series(0,65535) i",
  );
  assert.equal(
    await port.call('dueling_tournament_rate_check', {
      p_key: 'request:new-address',
      p_limit: 240,
    }),
    true,
  );
  assert.equal(
    (await owner.query('select count(*)::int as n from public.dueling_tournament_rate_buckets'))
      .rows[0].n,
    65536,
  );
  assert.equal(
    await port.call('dueling_tournament_rate_check', { p_key: 'write:director', p_limit: 120 }),
    true,
  );
  assert.equal(
    (await owner.query('select count(*)::int as n from public.dueling_tournament_rate_buckets'))
      .rows[0].n,
    65537,
  );
  await owner.query(
    "update public.dueling_tournament_rate_buckets set window_start=date_trunc('minute',clock_timestamp()),hits=240 where bucket_key like 'request:%'",
  );
  assert.equal(
    await port.call('dueling_tournament_rate_check', {
      p_key: 'request:new-address',
      p_limit: 240,
    }),
    false,
  );
  assert.equal(
    await port.call('dueling_tournament_rate_check', { p_key: 'write:director', p_limit: 120 }),
    true,
  );
});

test('default-policy director ruling and reversible availability persist through real SQL', async () => {
  let event = testTournament();
  await seed(event);
  event = await mutate(event, {
    type: 'hold_match',
    matchId: 'U1',
    held: true,
    reason: 'Both absent',
  });
  event = await mutate(event, {
    type: 'resolve_absence',
    matchId: 'U1',
    outcome: 'eliminate_both',
    reason: 'Director decision after waiting',
  });
  assert.equal(event.fixtures[0].result?.kind, 'double_forfeit');
  event = await mutate(event, {
    type: 'entry_status',
    entryId: 'entry-8',
    status: 'disqualified',
    reason: 'Mistake',
  });
  event = await mutate(event, { type: 'restore_entry', entryId: 'entry-8', reason: 'Correction' });
  assert.equal(event.entries.find((entry) => entry.id === 'entry-8')?.status, 'checked_in');
});

test('a corrupt event record does not suppress healthy event cards', async () => {
  const good = testTournament();
  await seed(good);
  const damaged = testTournament();
  damaged.id = 'damaged-event';
  damaged.settings.slug = 'damaged-event';
  await seed(damaged);
  await owner.query(
    "update public.dueling_tournament_records set state=jsonb_set(state,'{entries}','\"not an array\"'::jsonb) where id=$1",
    [damaged.id],
  );
  const events = await repo.list(null);
  assert.deepEqual(
    events.map((event) => event.id),
    [good.id],
  );
  await assert.rejects(
    repo.get(damaged.id, null),
    (error) => error instanceof TournamentError && error.status === 503,
  );
});

test('default-policy absence rulings in either final retain lower placements without awarding a title', async () => {
  for (const target of ['GF1', 'GF2']) {
    let event = testTournament();
    event.id = `ruling-${target}`;
    event.settings.slug = event.id.toLowerCase();
    await seed(event);
    for (let i = 0; i < 31; i++) {
      const match = resolveBracket(event.fixtures, event.seedOrder).find(
        (item) => item.state === 'ready',
      );
      assert.ok(match);
      if (match.id === target) break;
      const winner = match.slots[match.id === 'GF1' ? 1 : 0];
      assert.equal(winner.state, 'player');
      if (winner.state !== 'player') throw new Error('Missing winner');
      event = await mutate(event, {
        type: 'result',
        matchId: match.id,
        kind: 'forfeit',
        winnerId: winner.entryId,
        scoreA: null,
        scoreB: null,
        reason: 'Local test advancement',
      });
    }
    event = await mutate(event, {
      type: 'hold_match',
      matchId: target,
      held: true,
      reason: 'Finalists absent',
    });
    event = await mutate(event, {
      type: 'resolve_absence',
      matchId: target,
      outcome: 'eliminate_both',
      reason: 'Director removes absent finalists',
    });
    event = await mutate(event, {
      type: 'finish_without_champion',
      reason: 'No eligible finalists remain',
    });
    const view = tournamentView(event, null, now);
    assert.equal(view.phase, 'completed');
    assert.equal(view.championId, null);
    assert.ok(
      view.placements.filter((row) => row.bracket === 'lower').every((row) => row.place !== null),
    );
    assert.ok(!view.placements.some((row) => row.place === 1 || row.place === 2));
  }
});

test('SQL accepts publication at every supported field and rejects inconsistent stored sizes and caps', async () => {
  for (let count = 4; count <= 32; count++) {
    let event = testTournament(count, false);
    event.id = event.settings.slug = `publish-${count}`;
    event.settings.seedingMethod = 'manual';
    await seed(event);
    event = await mutate(event, {
      type: 'seeds',
      entryIds: event.entries.map((entry) => entry.id),
      reason: 'Database size rehearsal',
    });
    event = await mutate(event, { type: 'publish_bracket' });
    assert.equal(event.fixtures.length, 2 * event.bracketSize! - 1);
    const proposed = structuredClone(event);
    proposed.bracketSize = event.bracketSize === 32 ? 16 : 32;
    await assert.rejects(
      owner.query('select public.dueling_tournament_validate($1)', [proposed]),
      /bracket size/,
    );
  }
  const valid = testTournament(32);
  for (const alter of [
    (event: Tournament) => {
      event.settings.capacity = 33;
    },
    (event: Tournament) => {
      event.settings.capacity = 3;
    },
    (event: Tournament) => {
      event.entries[0].seed = 33;
    },
    (event: Tournament) => {
      event.seedOrder.push('extra');
    },
    (event: Tournament) => {
      event.fixtures[0].sources[0] = { kind: 'seed', seed: 33 };
    },
    (event: Tournament) => {
      event.fixtures.push({ ...event.fixtures[0], id: 'extra' });
    },
  ]) {
    const invalid = structuredClone(valid);
    alter(invalid);
    await assert.rejects(owner.query('select public.dueling_tournament_validate($1)', [invalid]));
  }
});

test('32-player publication emits 34 notices; SQL accepts the 40-notice boundary and rejects 41', async () => {
  let event = testTournament(32, false);
  event.settings.seedingMethod = 'manual';
  await seed(event);
  event = await mutate(event, {
    type: 'seeds',
    entryIds: event.entries.map((entry) => entry.id),
    reason: 'Notice boundary rehearsal',
  });
  const command = { type: 'publish_bracket' as const };
  const proposed = (
    await applyMutation(
      event,
      { command, operationId: crypto.randomUUID(), expectedRevision: event.revision },
      testDirector,
      now,
    )
  ).tournament;
  assert.equal(proposed.notices.length - event.notices.length, 34);
  while (proposed.notices.length < event.notices.length + 40)
    proposed.notices.push({
      id: crypto.randomUUID(),
      userId: event.entries[0].userId,
      message: 'Permitted recipient, cap boundary',
      createdAt: now,
      readAt: null,
    });
  const overflow = structuredClone(proposed);
  overflow.notices.push({ ...proposed.notices.at(-1)!, id: crypto.randomUUID() });
  await assert.rejects(commitProposed(event, overflow, command), /Invalid appended notices/);
  await commitProposed(event, proposed, command);
  assert.equal((await repo.get(event.id, testDirector)).notices.length - event.notices.length, 40);
});

test('SQL accepts legacy 16-slot events without adding size metadata on later saves', async () => {
  let event = testTournament(12);
  delete event.bracketSize;
  const original = structuredClone(event.fixtures);
  await seed(event);
  event = await mutate(event, { type: 'announcement', body: 'Legacy compatibility rehearsal' });
  assert.equal(event.bracketSize, undefined);
  assert.deepEqual(event.fixtures, original);
});

test('migration creates exactly its private objects and service_role can execute only entry RPCs', async () => {
  const tables = await owner.query(
    "select relname,relrowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and relkind='r' and relname ~ '^dueling_tournament_' order by relname",
  );
  assert.equal(tables.rows.length, 7);
  assert.ok(tables.rows.every((row) => row.relrowsecurity));
  assert.equal(
    (
      await owner.query(
        "select count(*)::int as n from pg_policies where schemaname='public' and tablename ~ '^dueling_tournament_'",
      )
    ).rows[0].n,
    0,
  );
  const functions = await owner.query(
    "select p.oid::regprocedure::text as signature,p.prosecdef,has_function_privilege('service_role',p.oid,'execute') as allowed from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname ~ '^dueling_tournament_'",
  );
  assert.equal(functions.rows.length, 15);
  assert.equal(functions.rows.filter((row) => row.allowed).length, 9);
  assert.ok(functions.rows.every((row) => row.allowed === row.prosecdef));
  for (const role of ['anon', 'authenticated', 'service_role']) {
    const client = databasePool(role);
    try {
      for (const table of tables.rows)
        await assert.rejects(
          client.query(`select * from public.${table.relname}`),
          /permission denied/,
        );
      if (role !== 'service_role')
        for (const rpc of functions.rows) {
          const count = rpc.signature
            .split('(')[1]
            .replace(')', '')
            .split(',')
            .filter(Boolean).length;
          const name = rpc.signature.split('(')[0];
          await assert.rejects(
            client.query(`select ${name}(${Array(count).fill('null').join(',')})`),
            /permission denied/,
          );
        }
    } finally {
      await client.end();
    }
  }
  await assert.rejects(
    owner.query(
      "insert into dueling_tournament_directors(user_id) values('10000000-0000-4000-8000-999999999999')",
    ),
    /foreign key/,
  );
});

test('legacy cleanup refuses nonempty tables and outside dependencies; empty cleanup is atomic', async () => {
  const sql = await readFile(
    new URL('../../dueling-tournament-drop-legacy.sql', import.meta.url),
    'utf8',
  );
  const client = await owner.connect();
  try {
    await client.query(
      "insert into public.tournaments(id) values('10000000-0000-4000-8000-000000000001')",
    );
    await assert.rejects(client.query(sql), /no longer empty/);
    await client.query('rollback');
    assert.equal(
      (await client.query('select count(*)::int as n from public.tournaments')).rows[0].n,
      1,
    );
    await client.query('delete from public.tournaments');
    await client.query(
      'create view public.local_legacy_dependency as select id from public.tournaments',
    );
    await assert.rejects(client.query(sql), /depend/);
    await client.query('rollback');
    await client.query('drop view public.local_legacy_dependency');
    const marker = '-- Verify cleanup before commit';
    assert.ok(sql.includes(marker));
    const tableNames = ['tournaments', 'tournament_participants', 'tournament_matches'];
    const originalTables = await client.query(
      "select relname,oid from pg_class where relnamespace='public'::regnamespace and relname=any($1) order by relname",
      [tableNames],
    );
    for (const table of tableNames) {
      const fault = `create table public.${table}(id uuid primary key);`;
      await assert.rejects(
        client.query(sql.replace(marker, `${fault}\n${marker}`)),
        /Legacy cleanup verification failed/,
      );
      await client.query('rollback');
      assert.deepEqual(
        (
          await client.query(
            "select relname,oid from pg_class where relnamespace='public'::regnamespace and relname=any($1) order by relname",
            [tableNames],
          )
        ).rows,
        originalTables.rows,
      );
    }
    const results = await client.query(sql);
    assert.ok(Array.isArray(results));
    assert.equal(results.at(-2)?.command, 'COMMIT');
    assert.equal(results.at(-1)?.command, 'SELECT');
    assert.deepEqual(results.at(-1)?.rows, [
      {
        status: 'cleanup_verified',
        tournaments_removed: true,
        participants_removed: true,
        matches_removed: true,
      },
    ]);
    assert.equal(
      (await client.query("select to_regclass('public.tournaments') as table_name")).rows[0]
        .table_name,
      null,
    );
    assert.ok(
      (await client.query("select to_regclass('public.dueling_stats') as table_name")).rows[0]
        .table_name,
    );
    assert.ok(
      (await client.query("select to_regclass('public.dueling_tournament_records') as table_name"))
        .rows[0].table_name,
    );
  } finally {
    client.release();
  }
});

test('cancelling a preview rehearsal removes public visibility while retaining director history', async () => {
  let event = testTournament(4);
  event.featured = true;
  await seed(event);
  event = await mutate(event, { type: 'cancel', reason: 'Preview rehearsal finished' });
  assert.equal(event.published, false);
  assert.equal(event.featured, false);
  assert.equal((await repo.list(null)).length, 0);
  await assert.rejects(repo.get(event.id, null), /not found/);
  assert.equal((await repo.get(event.id, testDirector)).phase, 'cancelled');
  assert.equal(
    ((await repo.history(event.id, testDirector, 'audit', null)) as unknown[]).length,
    1,
  );
});
