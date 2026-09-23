import { Pool } from 'pg';
import { RpcPort } from '../../src/lib/dueling-tournament/repository';
import { TournamentError } from '../../src/lib/dueling-tournament/contracts';

export function testDatabaseUrl(): string {
  const raw = process.env.DUELING_TOURNAMENT_TEST_DATABASE_URL;
  if (!raw)
    throw new Error(
      'DUELING_TOURNAMENT_TEST_DATABASE_URL is required. Database tests never silently skip.',
    );
  const url = new URL(raw);
  if (
    !['postgres:', 'postgresql:'].includes(url.protocol) ||
    !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) ||
    !/^\/infantry_dueling_test(?:_[a-z0-9]+)?$/.test(url.pathname) ||
    url.search
  ) {
    throw new Error(
      'Tests require a direct localhost connection to a named infantry_dueling_test database.',
    );
  }
  return raw;
}

export function databasePool(role?: string) {
  const url = new URL(testDatabaseUrl());
  if (role) {
    url.username = role;
    url.password = '';
  }
  return new Pool({ connectionString: url.toString(), max: 6 });
}

const argumentsByProcedure: Record<string, string[]> = {
  dueling_tournament_ack: ['p_event_id', 'p_actor_id', 'p_notice_id'],
  dueling_tournament_receipt: ['p_actor_id', 'p_operation_id'],
  dueling_tournament_history_page: ['p_event_id', 'p_actor_id', 'p_kind', 'p_before'],
  dueling_tournament_capabilities: ['p_actor_id'],
  dueling_tournament_list: ['p_actor_id', 'p_offset'],
  dueling_tournament_get: ['p_locator', 'p_actor_id'],
  dueling_tournament_create: ['p_actor_id', 'p_operation_id', 'p_fingerprint', 'p_state'],
  dueling_tournament_commit: [
    'p_actor_id',
    'p_event_id',
    'p_expected_revision',
    'p_operation_id',
    'p_fingerprint',
    'p_command_type',
    'p_state',
  ],
  dueling_tournament_rate_check: ['p_key', 'p_limit'],
};

export class PostgresTestPort implements RpcPort {
  constructor(public readonly pool: Pool) {}

  async call(name: string, args: Record<string, unknown>): Promise<unknown> {
    const keys = argumentsByProcedure[name];
    if (!keys) throw new Error('Unknown test procedure.');
    const parameters = keys.map((_, index) => `$${index + 1}`).join(', ');
    try {
      const result = await this.pool.query<{ result: unknown }>(
        `select public.${name}(${parameters}) as result`,
        keys.map((key) => args[key]),
      );
      return result.rows[0]?.result ?? null;
    } catch (error) {
      if (
        error &&
        typeof error === 'object' &&
        'code' in error &&
        typeof error.code === 'string' &&
        /^PT4\d\d$/.test(error.code)
      ) {
        throw new TournamentError(
          error.code,
          error instanceof Error ? error.message : 'Tournament operation rejected.',
          Number(error.code.slice(2)),
        );
      }
      throw error;
    }
  }
}
