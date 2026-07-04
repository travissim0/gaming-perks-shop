import { NextRequest, NextResponse } from 'next/server';
import { requireSiteAdmin } from '@/lib/adminApiAuth';
import { getInfantryDb, getCannedQueries } from '@/lib/infantryDb';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const auth = await requireSiteAdmin(request);
  if (!auth.ok) return auth.response;

  try {
    const { pool, schema } = await getInfantryDb();
    const info = await pool.request().query(
      `SELECT @@VERSION AS version, DB_NAME() AS db,
              (SELECT COUNT(*) FROM [${schema.t.accounts}]) AS accounts,
              (SELECT COUNT(*) FROM [${schema.t.aliases}]) AS aliases`
    );
    const row = info.recordset[0];
    return NextResponse.json({
      connected: true,
      version: String(row.version).split('\n')[0].trim(),
      database: row.db,
      schemaFlavor: schema.flavor,
      tables: schema.t,
      counts: { accounts: Number(row.accounts), aliases: Number(row.aliases) },
      cannedQueries: getCannedQueries(schema).map(({ key, label, description, category, param }) => ({
        key,
        label,
        description,
        category,
        param: param ?? null,
      })),
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('infantry-db status error:', message);
    return NextResponse.json({ connected: false, error: message }, { status: 502 });
  }
}
