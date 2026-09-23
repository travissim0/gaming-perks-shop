import { readFile } from 'node:fs/promises';
import type { Pool } from 'pg';
import { testDatabaseUrl } from './postgres';

export const migrationSql = () =>
  readFile(new URL('../../dueling-tournament-migration.sql', import.meta.url), 'utf8');

export async function installTestDatabase(pool: Pool) {
  testDatabaseUrl();
  await pool.query(await readFile(new URL('./schema.sql', import.meta.url), 'utf8'));
  const installed = await pool.query(
    "select to_regclass('public.dueling_tournament_records') as installed",
  );
  if (!installed.rows[0].installed) await pool.query(await migrationSql());
}
