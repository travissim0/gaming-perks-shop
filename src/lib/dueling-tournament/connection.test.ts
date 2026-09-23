import assert from 'node:assert/strict';
import { test } from 'node:test';
import { spawnSync } from 'node:child_process';
import { createTournamentHttp } from './http';
import { TournamentRepository } from './repository';
import { accountIdSchema, commandSchema } from './contracts';

// An isolated process gives the shared singleton fresh configuration and never
// contacts a network service. Missing configuration must fail even after caching.
test('tournament uses the shared service client and never falls back to the public key', () => {
  const result = spawnSync(
    process.execPath,
    [
      '--import',
      'tsx',
      '-e',
      `
    const assert=require('node:assert/strict');
    const {serviceClient}=require('./src/lib/dueling-tournament/service-client.ts');
    const {getServiceSupabase}=require('./src/lib/supabase.ts');
    assert.throws(serviceClient,e=>e.status===503);
    process.env.SUPABASE_SERVICE_ROLE_KEY='local-only-service-key';
    assert.strictEqual(serviceClient(),getServiceSupabase());
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    assert.throws(serviceClient,e=>e.status===503);
    process.env.SUPABASE_SERVICE_ROLE_KEY='   ';
    assert.throws(serviceClient,e=>e.status===503);
  `,
    ],
    {
      cwd: process.cwd(),
      encoding: 'utf8',
      env: {
        ...process.env,
        NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:56500',
        NEXT_PUBLIC_SUPABASE_ANON_KEY: 'local-only-public-key',
        SUPABASE_SERVICE_ROLE_KEY: '',
      },
    },
  );
  assert.equal(result.status, 0, result.stderr);
});

test('invalid verified account IDs and invalid staff IDs are rejected before repository access', async () => {
  const api = createTournamentHttp({
    repository: () =>
      new TournamentRepository({
        call: async () => {
          throw new Error('No RPC expected');
        },
      }),
    actor: async () => ({ userId: 'not-a-uuid', alias: 'Player', director: false }),
    staffAccount: async () => {
      throw new Error('No staff lookup expected');
    },
    now: () => new Date().toISOString(),
  });
  const request = new Request('http://localhost/api');
  assert.equal((await api.access(request)).status, 401);
  for (const id of ['user-1', '', '66efeaff-8a9e-4ef3-95d1-acad7f6d402b-extra']) {
    assert.equal(accountIdSchema.safeParse(id).success, false);
    assert.equal(
      commandSchema.safeParse({ type: 'staff', userId: id, grant: true }).success,
      false,
    );
  }
  assert.equal(
    commandSchema.safeParse({
      type: 'staff',
      userId: '66efeaff-8a9e-4ef3-95d1-acad7f6d402b',
      grant: true,
    }).success,
    true,
  );
});
