// Test-only Supabase transport subset. Never imported by production code.
// Real tournament persistence/RPCs use the disposable localhost PostgreSQL database.
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { z } from 'zod';
import { databasePool, PostgresTestPort } from './postgres';
import { testTournament } from '../../src/lib/dueling-tournament/testing';
import { TournamentError, type Tournament } from '../../src/lib/dueling-tournament/contracts';

const owner = databasePool();
const runtime = databasePool('dueling_test_runtime');
const port = new PostgresTestPort(runtime);
const signingKey = randomBytes(32);
const localPassword = 'LocalOnlyTest123!';
const localServiceKey = 'local-dueling-service-key';
const siteOrigin = 'http://127.0.0.1:56501';
const aliases = [
  'Vega',
  'Sable',
  'Nova',
  'Rook',
  'Echo',
  'Flint',
  'Mako',
  'Viper',
  'Onyx',
  'Ghost',
  'Blaze',
  'Iris',
  'Atlas',
  'Ember',
  'Wren',
  'Jett',
];
const idFor = (number: number) => `10000000-0000-4000-8000-${String(number).padStart(12, '0')}`;
type LocalUser = {
  id: string;
  email: string;
  alias: string | null;
  metadata: Record<string, unknown>;
};
const users = new Map<string, LocalUser>();

function authUser(user: LocalUser) {
  return {
    id: user.id,
    aud: 'authenticated',
    role: 'authenticated',
    email: user.email,
    email_confirmed_at: new Date().toISOString(),
    confirmed_at: new Date().toISOString(),
    created_at: '2026-01-01T00:00:00Z',
    app_metadata: { provider: 'email', providers: ['email'] },
    user_metadata: user.metadata,
    identities: [],
  };
}
function token(user: LocalUser) {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(
    JSON.stringify({
      sub: user.id,
      aud: 'authenticated',
      role: 'authenticated',
      exp: Math.floor(Date.now() / 1000) + 3600,
    }),
  ).toString('base64url');
  const signature = createHmac('sha256', signingKey)
    .update(`${header}.${payload}`)
    .digest('base64url');
  return `${header}.${payload}.${signature}`;
}
function session(user: LocalUser) {
  return {
    access_token: token(user),
    refresh_token: token(user),
    token_type: 'bearer',
    expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    user: authUser(user),
  };
}
function authenticate(raw: string | undefined) {
  if (!raw?.startsWith('Bearer ')) return null;
  try {
    const [header, payload, signature] = raw.slice(7).split('.');
    const expected = createHmac('sha256', signingKey).update(`${header}.${payload}`).digest();
    const actual = Buffer.from(signature, 'base64url');
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null;
    const claims = z
      .object({ sub: z.string(), exp: z.number() })
      .parse(JSON.parse(Buffer.from(payload, 'base64url').toString()));
    return claims.exp > Date.now() / 1000 ? (users.get(claims.sub) ?? null) : null;
  } catch {
    return null;
  }
}
async function jsonBody(request: IncomingMessage): Promise<Record<string, unknown>> {
  let size = 0;
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 5000000) throw new Error('Test request too large.');
    chunks.push(chunk);
  }
  return z
    .record(z.string(), z.unknown())
    .parse(JSON.parse(Buffer.concat(chunks).toString() || '{}'));
}
function send(response: ServerResponse, status: number, value: unknown) {
  response.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
  response.end(value === null ? '' : JSON.stringify(value));
}
function profile(user: LocalUser) {
  return {
    id: user.id,
    email: user.email,
    in_game_alias: user.alias,
    avatar_url: null,
    is_admin: false,
    ctf_role: null,
    is_media_manager: false,
    is_zone_admin: false,
    site_admin: false,
    banned: false,
    registration_status: 'completed',
  };
}

async function seedFixtures() {
  await owner.query(await readFile(new URL('./schema.sql', import.meta.url), 'utf8'));
  await owner.query(
    'truncate public.dueling_tournament_registration_cooldowns, public.dueling_tournament_history, public.dueling_tournament_notice_reads, public.dueling_tournament_operations, public.dueling_tournament_records, public.dueling_tournament_directors, public.dueling_tournament_rate_buckets',
  );
  users.clear();
  for (let index = 0; index < 36; index++) {
    const name =
      index === 16
        ? 'Director'
        : index === 17
          ? 'Referee'
          : index === 18
            ? 'NewPlayer'
            : index === 19
              ? null
              : (aliases[index] ?? `Player${index - 3}`);
    users.set(idFor(index + 1), {
      id: idFor(index + 1),
      email: `${index === 19 ? 'incomplete' : name!.toLowerCase()}@local.invalid`,
      alias: name,
      metadata: { in_game_alias: name },
    });
  }
  await owner.query('insert into public.dueling_tournament_directors(user_id) values($1)', [
    idFor(17),
  ]);
  const instant = (minutes: number) => new Date(Date.now() + minutes * 60000).toISOString();
  const create = (slug: string, phase: Tournament['phase'], count: number, bracket: boolean) => {
    const event = testTournament(count, bracket);
    event.id = slug;
    event.settings.slug = slug;
    event.settings.title = `${phase === 'registration' ? 'Open' : phase === 'check_in' ? 'Check-in' : phase === 'seeding' ? 'Seed Reveal' : 'Arena'} Local Championship`;
    event.phase = phase;
    event.settings.restMinutes = 0;
    event.refereeIds = [idFor(18)];
    event.settings.startsAt = instant(phase === 'registration' || phase === 'check_in' ? 120 : -1);
    event.settings.registrationOpensAt = instant(-100);
    event.settings.registrationClosesAt = instant(phase === 'registration' ? 90 : -30);
    event.settings.checkInOpensAt = instant(phase === 'registration' ? 90 : -20);
    event.settings.checkInClosesAt = instant(
      phase === 'registration' ? 110 : phase === 'check_in' ? 20 : -5,
    );
    event.rules.text =
      'Local rehearsal rules. BO5 throughout. Wait for the referee call. Report disconnects to staff. Two losses eliminate a player.';
    event.settings.seedingMethod = 'draw';
    event.settings.seedingCriteria =
      'Public random draw of checked-in players, with a published commitment and reproducible seed order.';
    event.entries.forEach((entry, index) => {
      entry.userId = idFor(index < 16 ? index + 1 : index + 5);
      entry.alias = aliases[index] ?? `Player${index + 1}`;
      if (phase === 'check_in' || phase === 'registration') {
        entry.status = 'registered';
        entry.checkedInAt = null;
        entry.seed = null;
      }
    });
    return event;
  };
  for (const event of [
    create('local-registration', 'registration', 11, false),
    create('local-check-in', 'check_in', 12, false),
    create('local-seeding', 'seeding', 16, false),
    create('local-arena', 'bracket', 16, true),
    create('local-registration-24', 'registration', 24, false),
    create('local-seeding-24', 'seeding', 24, false),
    create('local-arena-24', 'bracket', 24, true),
    create('local-registration-32', 'registration', 32, false),
    create('local-seeding-32', 'seeding', 32, false),
    create('local-arena-32', 'bracket', 32, true),
  ]) {
    if (event.settings.slug === 'local-registration') event.settings.capacity = 12;
    await owner.query(
      'insert into public.dueling_tournament_records(id,slug,revision,state) values($1,$2,$3,$4)',
      [event.id, event.settings.slug, event.revision, event],
    );
  }
}

async function main() {
  await seedFixtures();
  const server = createServer(async (request, response) => {
    const origin = request.headers.origin;
    if (origin && origin !== siteOrigin)
      return send(response, 403, { message: 'Local test origin only.' });
    response.setHeader('Access-Control-Allow-Origin', siteOrigin);
    response.setHeader(
      'Access-Control-Allow-Headers',
      'authorization, apikey, content-type, x-client-info, cache-control, prefer, x-supabase-api-version, range, range-unit',
    );
    response.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, PUT, DELETE, OPTIONS');
    response.setHeader('Access-Control-Expose-Headers', 'content-range');
    if (request.method === 'OPTIONS') return send(response, 204, null);
    const url = new URL(request.url ?? '/', 'http://127.0.0.1:56500');
    try {
      if (
        url.pathname === '/__test/reset' &&
        request.method === 'POST' &&
        request.headers['x-local-test'] === 'dueling-local-only'
      ) {
        await seedFixtures();
        return send(response, 200, { reset: true });
      }
      if (url.pathname === '/__test/health') return send(response, 200, { localTest: true });
      if (url.pathname === '/auth/v1/token') {
        const body = await jsonBody(request);
        const user =
          url.searchParams.get('grant_type') === 'refresh_token'
            ? authenticate(`Bearer ${String(body.refresh_token)}`)
            : [...users.values()].find(
                (value) => value.email === body.email && body.password === localPassword,
              );
        return user
          ? send(response, 200, session(user))
          : send(response, 400, {
              error: 'invalid_grant',
              error_description: 'Invalid local test login.',
            });
      }
      if (url.pathname === '/auth/v1/logout') return send(response, 204, null);
      if (url.pathname === '/auth/v1/user') {
        const user = authenticate(request.headers.authorization);
        if (!user) return send(response, 401, { message: 'Invalid local test session.' });
        if (request.method === 'PUT') {
          const body = await jsonBody(request);
          if (body.data && typeof body.data === 'object')
            user.metadata = { ...user.metadata, ...body.data };
        }
        return send(response, 200, authUser(user));
      }
      const service = request.headers.apikey === localServiceKey;
      if (url.pathname.startsWith('/auth/v1/admin/users/')) {
        if (!service) return send(response, 403, { message: 'Local service access required.' });
        const user = users.get(url.pathname.split('/').at(-1)!);
        return send(
          response,
          user ? 200 : 404,
          user ? authUser(user) : { message: 'User not found.' },
        );
      }
      if (url.pathname.startsWith('/rest/v1/rpc/')) {
        if (
          url.pathname.endsWith('/get_user_zone_permissions') &&
          authenticate(request.headers.authorization)
        )
          return send(response, 200, []);
        if (!service)
          return send(response, 403, { code: '42501', message: 'Service RPC access required.' });
        return send(
          response,
          200,
          await port.call(url.pathname.split('/').at(-1)!, await jsonBody(request)),
        );
      }
      if (url.pathname === '/rest/v1/profiles') {
        const actor = authenticate(request.headers.authorization);
        const requestedId = url.searchParams.get('id')?.replace(/^eq\./, '') ?? actor?.id;
        if (request.method === 'POST' || request.method === 'PATCH') {
          const body = await jsonBody(request);
          const id = typeof body.id === 'string' ? body.id : requestedId;
          const target = users.get(id ?? '');
          if (!target || (!service && actor?.id !== target.id))
            return send(response, 403, { message: 'Local profile access denied.' });
          if ('in_game_alias' in body)
            target.alias = z.string().min(1).max(64).nullable().parse(body.in_game_alias);
          return send(
            response,
            200,
            request.headers.accept?.includes('object') ? profile(target) : [profile(target)],
          );
        }
        const target = users.get(requestedId ?? '');
        const alias = url.searchParams.get('in_game_alias')?.replace(/^eq\./, '');
        const matches = target
          ? [profile(target)]
          : alias
            ? [...users.values()].filter((value) => value.alias === alias).map(profile)
            : [];
        return send(
          response,
          200,
          request.headers.accept?.includes('object') ? (matches[0] ?? null) : matches,
        );
      }
      // Existing navbar/background requests have no records in the test fixture.
      if (url.pathname.startsWith('/rest/v1/')) {
        response.setHeader('Content-Range', '*/0');
        return send(response, 200, request.headers.accept?.includes('object') ? null : []);
      }
      return send(response, 404, { message: 'Unsupported local test transport endpoint.' });
    } catch (error) {
      if (error instanceof TournamentError)
        return send(response, error.status, { code: `PT${error.status}`, message: error.message });
      console.error('local_bridge_failure', {
        kind: error instanceof Error ? error.name : 'Unknown',
      });
      return send(response, 500, { message: 'Local test bridge failed.' });
    }
  });
  server.on('upgrade', (_request, socket) => socket.destroy());
  server.listen(56500, '127.0.0.1', () =>
    console.log('Local-only tournament test transport listening on 127.0.0.1:56500.'),
  );
  async function stop() {
    server.close();
    await runtime.end();
    await owner.end();
    process.exit(0);
  }
  process.once('SIGTERM', () => {
    void stop();
  });
  process.once('SIGINT', () => {
    void stop();
  });
}
void main().catch(() => {
  console.error('Local bridge setup failed.');
  process.exit(1);
});
