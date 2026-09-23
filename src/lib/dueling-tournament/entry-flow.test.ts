import assert from 'node:assert/strict';
import { test } from 'node:test';
import { authLink, safeAuthReturn } from '../auth-return';
import { easternInput, easternToIso } from './time';
import { createTournamentHttp, sameOrigin } from './http';
import { TournamentRepository, type RpcPort } from './repository';
import { TournamentError } from './contracts';
import { testTournament } from './testing';

test('login returns only to permitted local tournament paths', () => {
  assert.equal(
    safeAuthReturn('/dueling-tournament/october-2026?tab=rules'),
    '/dueling-tournament/october-2026?tab=rules',
  );
  assert.equal(
    safeAuthReturn('/admin/dueling-tournament/123/seeding'),
    '/admin/dueling-tournament/123/seeding',
  );
  for (const value of [
    'https://evil.invalid',
    '//evil.invalid',
    '/\\evil.invalid',
    '/%2f%2fevil.invalid',
    '/dueling-tournament/%2e%2e/admin/users',
    '/admin/users',
    '/dueling-tournament/%5cevil',
    '/dueling-tournament/hello\nworld',
  ])
    assert.equal(safeAuthReturn(value), '/');
  assert.equal(authLink('/auth/login', '//evil.invalid'), '/auth/login');
});

test('event form honors Eastern time and rejects DST gaps and overlaps', () => {
  assert.equal(easternToIso('2026-10-03T20:00'), '2026-10-04T00:00:00.000Z');
  assert.equal(easternInput('2026-10-04T00:00:00Z'), '2026-10-03T20:00');
  assert.equal(easternToIso('2026-12-03T20:00'), '2026-12-04T01:00:00.000Z');
  assert.throws(() => easternToIso('2026-03-08T02:30'), /skipped or repeated/);
  assert.throws(() => easternToIso('2026-11-01T01:30'), /skipped or repeated/);
  assert.throws(() => easternToIso('2026-02-30T20:00'));
});

test('origin check accepts Next-normalized loopback URLs but rejects foreign browser origins', () => {
  assert.doesNotThrow(() =>
    sameOrigin(
      new Request('http://localhost:56501/api', {
        headers: {
          host: '127.0.0.1:56501',
          origin: 'http://127.0.0.1:56501',
          'sec-fetch-site': 'same-origin',
        },
      }),
    ),
  );
  assert.throws(() =>
    sameOrigin(
      new Request('https://freeinf.org/api', {
        headers: {
          host: 'freeinf.org',
          origin: 'https://evil.invalid',
          'sec-fetch-site': 'cross-site',
        },
      }),
    ),
  );
});

test('HTTP boundary rejects identity spoofing, foreign origins and oversized chunked content', async () => {
  let writes = 0;
  const port: RpcPort = {
    async call(name) {
      if (name === 'dueling_tournament_receipt') return null;
      if (name === 'dueling_tournament_get') return testTournament();
      if (name === 'dueling_tournament_capabilities') return { director: false, referee: false };
      writes++;
      throw new Error('Unexpected write');
    },
  };
  const repo = new TournamentRepository(port);
  const http = createTournamentHttp({
    repository: () => repo,
    actor: async (request, required) => {
      if (!request.headers.get('authorization')) {
        if (required) throw new TournamentError('unauthorized', 'Sign in.', 401);
        return null;
      }
      return { userId: '10000000-0000-4000-8000-000000000001', alias: 'Player 1', director: false };
    },
    staffAccount: async () => {},
    now: () => '2026-09-27T00:00:00Z',
  });
  const url = 'http://localhost/api/ctf/dueling-tournaments/event';
  const request = (body: unknown, extras: HeadersInit = {}) =>
    new Request(url, {
      method: 'POST',
      headers: {
        origin: 'http://localhost',
        'content-type': 'application/json',
        authorization: 'Bearer local-test-only',
        ...extras,
      },
      body: JSON.stringify(body),
    });
  const input = {
    operationId: crypto.randomUUID(),
    expectedRevision: 0,
    command: { type: 'register', rulesVersion: 1, userId: 'victim' },
  };
  assert.equal((await http.mutate(request(input), 'event')).status, 422);
  assert.equal(
    (await http.mutate(request(input, { origin: 'https://foreign.invalid' }), 'event')).status,
    403,
  );
  assert.equal((await http.mutate(request(input, { authorization: '' }), 'event')).status, 401);
  assert.equal(
    (await http.mutate(request({ ...input, command: { type: 'draw' } }), 'event')).status,
    403,
  );
  assert.equal((await http.mutate(request({ value: 'x'.repeat(70000) }), 'event')).status, 413);
  assert.equal(writes, 0);
  const detail = await http.detail(new Request(url), 'event');
  assert.equal(detail.status, 200);
  assert.equal(detail.headers.get('Cache-Control'), 'no-store, private');
  const body = await detail.json();
  assert.equal(body.event.me, null);
  assert.equal(body.event.staff, null);
});
