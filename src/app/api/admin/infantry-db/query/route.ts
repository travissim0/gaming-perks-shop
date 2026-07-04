import { NextRequest, NextResponse } from 'next/server';
import { requireZoneAdmin, auditInfantryDb } from '@/lib/adminApiAuth';
import {
  assertReadOnlySql,
  escapeLike,
  getCannedQueries,
  getInfantryDb,
  runReadQuery,
} from '@/lib/infantryDb';

export const dynamic = 'force-dynamic';

const MAX_ROWS = 500;

export async function POST(request: NextRequest) {
  const auth = await requireZoneAdmin(request);
  if (!auth.ok) return auth.response;

  let body: { sql?: unknown; canned?: unknown; param?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  try {
    if (typeof body.canned === 'string') {
      const { schema } = await getInfantryDb();
      const canned = getCannedQueries(schema).find((c) => c.key === body.canned);
      if (!canned) {
        return NextResponse.json({ error: `Unknown canned query: ${body.canned}` }, { status: 400 });
      }
      const params: Record<string, string> = {};
      if (canned.param) {
        const value = typeof body.param === 'string' ? body.param.trim() : '';
        if (!value) {
          return NextResponse.json({ error: `${canned.param.label} is required` }, { status: 400 });
        }
        params.p = `%${escapeLike(value)}%`;
      }
      const result = await runReadQuery(canned.sql, { params, maxRows: MAX_ROWS });
      auditInfantryDb(auth.userId!, 'canned', { key: canned.key, param: body.param ?? null, rows: result.rowCount });
      return NextResponse.json(result);
    }

    if (typeof body.sql === 'string') {
      const safeSql = assertReadOnlySql(body.sql);
      const result = await runReadQuery(safeSql, { maxRows: MAX_ROWS });
      auditInfantryDb(auth.userId!, 'query', { sql: safeSql, rows: result.rowCount, ms: result.ms });
      return NextResponse.json(result);
    }

    return NextResponse.json({ error: 'Provide either "sql" or "canned"' }, { status: 400 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    // Validation failures ("Only SELECT...") come back as 400, DB errors as 502
    const isValidation = /^(Only|Query|Forbidden)/.test(message) || message.startsWith('Query blocked');
    console.error('infantry-db query error:', message);
    return NextResponse.json({ error: message }, { status: isValidation ? 400 : 502 });
  }
}
