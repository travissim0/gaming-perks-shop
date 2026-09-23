import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Command, Tournament } from './contracts';
import { applyMutation } from './transition';
import { testDirector, testTournament } from './testing';
import { resolveBracket } from './bracket';
import { readerIdentity } from './reader';
import { drawMatchesBracket } from './draw';
import { tournamentView } from './view';

const now = '2026-10-04T00:00:00Z';
const execute = (event: Tournament, command: Command, actor = testDirector) =>
  applyMutation(
    event,
    { command, expectedRevision: event.revision, operationId: crypto.randomUUID() },
    actor,
    now,
  );

test('repeated unchanged staff grants do not advance the event revision', async () => {
  const event = testTournament();
  event.refereeIds = ['10000000-0000-4000-8000-000000000018'];
  const result = await execute(event, {
    type: 'staff',
    userId: '10000000-0000-4000-8000-000000000018',
    grant: true,
  });
  assert.equal(result.tournament.revision, event.revision);
  assert.deepEqual(result.tournament.audit, event.audit);
});

test('self withdrawal cannot change a locked four-player seeding field', async () => {
  const event = testTournament(4, false);
  await assert.rejects(
    execute(event, { type: 'withdraw' }, { userId: 'user-1', alias: 'Player 1', director: false }),
    /closed|locked/,
  );
});

test('twenty voided draws do not permanently lock the next draw', async () => {
  let event = testTournament(12, false);
  for (let attempt = 0; attempt < 21; attempt++) {
    event = (await execute(event, { type: 'draw' })).tournament;
    event = (
      await execute(event, { type: 'void_draw', reason: 'Documented pre-reveal correction' })
    ).tournament;
  }
  event = (await execute(event, { type: 'draw' })).tournament;
  assert.equal(event.draws.length, 22);
});

test('referee projections contain no other participant account identifiers', () => {
  const event = testTournament();
  event.refereeIds = ['10000000-0000-4000-8000-000000000018'];
  const view = tournamentView(
    event,
    { userId: '10000000-0000-4000-8000-000000000018', alias: 'Referee', director: false },
    now,
  );
  assert.ok(view.staff);
  assert.ok(!JSON.stringify(view).includes('user-1'));
});

test('double forfeit is held by default and correctable only without overriding independent rulings', async () => {
  let event = testTournament();
  const double = {
    type: 'result',
    matchId: 'U1',
    kind: 'double_forfeit',
    winnerId: null,
    scoreA: null,
    scoreB: null,
    reason: 'Both absent',
  } as const;
  await assert.rejects(execute(event, double), /Hold this match/);
  event.settings.doubleForfeitPolicy = 'eliminate_both';
  event = (await execute(event, double)).tournament;
  assert.equal(event.entries.find((entry) => entry.id === 'entry-1')?.status, 'no_show');
  const corrected = (
    await execute(event, {
      type: 'correct_result',
      matchId: 'U1',
      reason: 'Wrong ruling',
      replacement: {
        kind: 'forfeit',
        winnerId: 'entry-1',
        scoreA: null,
        scoreB: null,
        reason: 'Opponent absent',
      },
    })
  ).tournament;
  assert.equal(corrected.entries.find((entry) => entry.id === 'entry-1')?.status, 'checked_in');
  assert.equal(corrected.entries.find((entry) => entry.id === 'entry-16')?.status, 'checked_in');
  assert.equal(corrected.audit.at(-1)?.previousResult?.kind, 'double_forfeit');
  event = (
    await execute(event, {
      type: 'entry_status',
      entryId: 'entry-1',
      status: 'disqualified',
      reason: 'Independent equipment ruling',
    })
  ).tournament;
  await assert.rejects(
    execute(event, {
      type: 'correct_result',
      matchId: 'U1',
      reason: 'Wrong result',
      replacement: { kind: 'forfeit', winnerId: 'entry-1', scoreA: null, scoreB: null, reason: '' },
    }),
    /unavailable/,
  );
  const reopened = (
    await execute(event, {
      type: 'reopen_match',
      matchId: 'U1',
      reason: 'Replay with the correct ruling',
    })
  ).tournament;
  assert.equal(reopened.entries.find((entry) => entry.id === 'entry-1')?.status, 'disqualified');
  assert.equal(reopened.entries.find((entry) => entry.id === 'entry-16')?.status, 'checked_in');
  assert.equal(reopened.fixtures.find((match) => match.id === 'U1')?.result, null);
});

test('both final rounds can recover a double forfeit or finish with no invented champion', async () => {
  for (const finalId of ['GF1', 'GF2']) {
    let event = testTournament();
    event.settings.doubleForfeitPolicy = 'eliminate_both';
    for (let i = 0; i < 31; i++) {
      const match = resolveBracket(event.fixtures, event.seedOrder).find(
        (item) => item.state === 'ready',
      );
      assert.ok(match);
      if (match.id === finalId) break;
      const winner = match.slots[match.id === 'GF1' ? 1 : 0];
      assert.equal(winner.state, 'player');
      if (winner.state !== 'player') throw new Error('Unresolved winner');
      event = (
        await execute(event, {
          type: 'result',
          matchId: match.id,
          kind: 'forfeit',
          winnerId: winner.entryId,
          scoreA: null,
          scoreB: null,
          reason: 'Local test ruling',
        })
      ).tournament;
    }
    event = (
      await execute(event, {
        type: 'result',
        matchId: finalId,
        kind: 'double_forfeit',
        winnerId: null,
        scoreA: null,
        scoreB: null,
        reason: 'Both unavailable',
      })
    ).tournament;
    assert.equal(event.paused, true);
    const closed = (
      await execute(event, {
        type: 'finish_without_champion',
        reason: 'No eligible finalists remain',
      })
    ).tournament;
    assert.equal(closed.phase, 'completed');
    const places = tournamentView(closed, null, now).placements;
    assert.ok(places.filter((row) => row.bracket === 'lower').every((row) => row.place !== null));
    assert.ok(!places.some((row) => row.place === 1 || row.place === 2));
    assert.equal(tournamentView(closed, null, now).championId, null);
    const reopened = (
      await execute(event, {
        type: 'reopen_match',
        matchId: finalId,
        reason: 'Resume the final when players return',
      })
    ).tournament;
    assert.equal(reopened.fixtures.find((item) => item.id === finalId)?.result, null);
    assert.equal(reopened.paused, false);
    const manualPause = (
      await execute(event, { type: 'pause', paused: true, reason: 'Director waiting for arena' })
    ).tournament;
    const manualReopen = (
      await execute(manualPause, {
        type: 'reopen_match',
        matchId: finalId,
        reason: 'Replay with explicit event pause',
      })
    ).tournament;
    assert.equal(manualReopen.paused, true);
    assert.equal(manualReopen.pauseReason, 'Director waiting for arena');
    const winner = resolveBracket(manualPause.fixtures, manualPause.seedOrder).find(
      (fixture) => fixture.id === finalId,
    )!.slots[0];
    assert.equal(winner.state, 'player');
    if (winner.state !== 'player') throw new Error('Missing finalist');
    const completed = (
      await execute(manualPause, {
        type: 'correct_result',
        matchId: finalId,
        reason: 'Correct final ruling',
        replacement: {
          kind: 'forfeit',
          winnerId: winner.entryId,
          scoreA: null,
          scoreB: null,
          reason: 'One eligible finalist',
        },
      })
    ).tournament;
    assert.equal(completed.phase, 'completed');
    assert.equal(completed.paused, false, 'A completed event must not remain manually paused');
    assert.equal(
      resolveBracket(reopened.fixtures, reopened.seedOrder).find((item) => item.id === finalId)
        ?.state,
      'held',
    );
  }
});

test('network admission ignores cookies and tokens and separates trusted client addresses', () => {
  const config = { secret: 'a'.repeat(32), vercel: true, localTest: false, supabaseUrl: undefined };
  const request = (ip: string, cookie = '') =>
    new Request('https://freeinf.org/api/ctf/dueling-tournaments', {
      headers: {
        'x-vercel-forwarded-for': ip,
        cookie,
        authorization: 'Bearer arbitrary-' + cookie,
      },
    });
  const first = readerIdentity(request('203.0.113.1'), config);
  assert.equal(first, readerIdentity(request('203.0.113.1', 'changed-cookie'), config));
  assert.notEqual(first, readerIdentity(request('203.0.113.2'), config));
  assert.equal(
    readerIdentity(request('2001:db8::1'), config),
    readerIdentity(request('2001:db8::ffff'), config),
  );
  assert.throws(
    () => readerIdentity(request('203.0.113.1'), { ...config, vercel: false }),
    /unavailable on this host/,
  );
  assert.throws(() => readerIdentity(request('not-an-ip'), config), /unavailable on this host/);
  assert.throws(
    () => readerIdentity(request('203.0.113.1'), { ...config, secret: undefined }),
    /not configured/,
  );
});

test('seed verification detects a published bracket that differs from the revealed draw', () => {
  const event = testTournament();
  const view = tournamentView(event, null, now);
  assert.equal(drawMatchesBracket(event.seedOrder, view.seedOrder, view.fixtures), true);
  assert.equal(
    drawMatchesBracket([...event.seedOrder].reverse(), view.seedOrder, view.fixtures),
    false,
  );
  const changed = structuredClone(view.fixtures);
  changed[0].slots.reverse();
  assert.equal(drawMatchesBracket(event.seedOrder, view.seedOrder, changed), false);
});
