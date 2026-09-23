import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { Pool } from 'pg';
import { databasePool, testDatabaseUrl } from './postgres';
import { migrationSql } from './install';

// A separate, name-guarded disposable database proves a failure at the final
// director insert rolls back DDL and grants, not only the early rerun guard.
test('exact migration rolls back a missing profile, preserves neighboring objects, and rejects a second install', async () => {
  const admin = databasePool();
  const name = `infantry_dueling_test_migration${process.pid}`;
  const url = new URL(testDatabaseUrl());
  let pool: Pool | undefined;
  try {
    await admin.query(`create database ${name}`);
    url.pathname = `/${name}`;
    pool = new Pool({ connectionString: url.toString(), max: 1 });
    await pool.query(await readFile(new URL('./schema.sql', import.meta.url), 'utf8'));
    await pool.query(
      "insert into public.dueling_stats(id) values('10000000-0000-4000-8000-000000000123')",
    );
    // Column types, ACLs, RLS, indexes and data are unchanged. PostgreSQL itself
    // adds internal FK triggers on profiles because directors references its id.
    const neighbors = async () =>
      (
        await pool!.query(`select c.relname,c.oid,c.relacl::text,c.relrowsecurity,
      (select jsonb_agg(jsonb_build_array(a.attname,a.atttypid::regtype::text) order by a.attnum) from pg_attribute a where a.attrelid=c.oid and a.attnum>0 and not a.attisdropped) as columns,
      (select jsonb_agg(i.indexdef order by i.indexname) from pg_indexes i where i.schemaname='public' and i.tablename=c.relname) as indexes
      from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r' and c.relname !~ '^dueling_tournament_' order by c.relname`)
      ).rows;
    const before = await neighbors();
    await pool.query("delete from public.profiles where id='66efeaff-8a9e-4ef3-95d1-acad7f6d402b'");
    await assert.rejects(pool.query(await migrationSql()), /foreign key/);
    await pool.query('rollback');
    assert.equal(
      (
        await pool.query(
          "select count(*)::int as n from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname ~ '^dueling_tournament_'",
        )
      ).rows[0].n,
      0,
    );
    assert.equal(
      (
        await pool.query(
          "select count(*)::int as n from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname ~ '^dueling_tournament_'",
        )
      ).rows[0].n,
      0,
    );
    assert.deepEqual(await neighbors(), before);
    await pool.query(
      "insert into public.profiles(id,in_game_alias) values('66efeaff-8a9e-4ef3-95d1-acad7f6d402b','Local Director')",
    );
    // Faults inserted immediately before verification must roll back the whole
    // installation. These copies never change the authoritative SQL file.
    const sql = await migrationSql();
    const marker = '-- Verify installation before commit;';
    assert.ok(sql.includes(marker));
    const faults: [string, RegExp][] = [
      ['drop table public.dueling_tournament_notice_reads;', /seven RLS tables/],
      [
        'alter table public.dueling_tournament_records disable row level security;',
        /seven RLS tables/,
      ],
      [
        'create policy unexpected_policy on public.dueling_tournament_records using (true);',
        /zero policies/,
      ],
      [
        "create function public.dueling_tournament_unexpected() returns boolean language sql as 'select true';",
        /fifteen functions/,
      ],
      ...['anon', 'authenticated', 'public'].map((role): [string, RegExp] => [
        `grant execute on function public.dueling_tournament_capabilities(text) to ${role};`,
        /anonymous or authenticated function access/,
      ]),
      [
        'grant execute on function public.dueling_tournament_validate(jsonb) to service_role;',
        /nine server RPC grants/,
      ],
      [
        'revoke execute on function public.dueling_tournament_get(text,text) from service_role;',
        /nine server RPC grants/,
      ],
      [
        "delete from public.dueling_tournament_directors where user_id='66efeaff-8a9e-4ef3-95d1-acad7f6d402b';",
        /director grant is missing/,
      ],
    ];
    for (const [fault, message] of faults) {
      await assert.rejects(pool.query(sql.replace(marker, `${fault}\n${marker}`)), message);
      await pool.query('rollback');
      assert.equal(
        (
          await pool.query(
            "select count(*)::int as n from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname ~ '^dueling_tournament_'",
          )
        ).rows[0].n,
        0,
      );
      assert.equal(
        (
          await pool.query(
            "select count(*)::int as n from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname ~ '^dueling_tournament_'",
          )
        ).rows[0].n,
        0,
      );
      assert.deepEqual(await neighbors(), before);
    }
    const results = await pool.query(await migrationSql());
    assert.ok(Array.isArray(results));
    assert.equal(results.at(-2)?.command, 'COMMIT');
    assert.equal(results.at(-1)?.command, 'SELECT');
    assert.deepEqual(results.at(-1)?.rows, [
      {
        status: 'migration_verified',
        tables_verified: 7,
        rls_tables_verified: 7,
        policy_count: 0,
        functions_verified: 15,
        anon_executable_functions: 0,
        authenticated_executable_functions: 0,
        service_executable_functions: 9,
        director_granted: true,
      },
    ]);
    assert.deepEqual(await neighbors(), before);
    assert.equal(
      (await pool.query('select count(*)::int as n from public.dueling_stats')).rows[0].n,
      1,
    );
    const tables = await pool.query(
      "select relname,oid from pg_class where relname ~ '^dueling_tournament_' order by relname",
    );
    await assert.rejects(pool.query(await migrationSql()), /already exist/);
    await pool.query('rollback');
    assert.deepEqual(
      (
        await pool.query(
          "select relname,oid from pg_class where relname ~ '^dueling_tournament_' order by relname",
        )
      ).rows,
      tables.rows,
    );
    assert.equal(
      (await pool.query('select user_id::text from public.dueling_tournament_directors')).rows[0]
        .user_id,
      '66efeaff-8a9e-4ef3-95d1-acad7f6d402b',
    );
  } finally {
    await pool?.end();
    await admin.query(`drop database if exists ${name}`);
    await admin.end();
  }
});
