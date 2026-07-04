import { NextRequest, NextResponse } from 'next/server';
import { requireZoneAdmin, auditInfantryDb } from '@/lib/adminApiAuth';
import { previewAliasTransfer, transferAlias } from '@/lib/infantryDb';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const auth = await requireZoneAdmin(request);
  if (!auth.ok) return auth.response;

  let body: { aliasId?: unknown; target?: unknown; toAccountId?: unknown; confirm?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const aliasId = Number(body.aliasId);
  if (!Number.isInteger(aliasId) || aliasId <= 0) {
    return NextResponse.json({ error: 'aliasId must be a positive integer' }, { status: 400 });
  }

  try {
    // Execute phase: target already resolved to an account id + confirmed.
    if (body.confirm === true) {
      const toAccountId = Number(body.toAccountId);
      if (!Number.isInteger(toAccountId) || toAccountId <= 0) {
        return NextResponse.json({ error: 'toAccountId must be a positive integer' }, { status: 400 });
      }
      const result = await transferAlias(aliasId, toAccountId);
      await auditInfantryDb(auth.userId!, 'transfer_alias', result);
      return NextResponse.json({ success: true, ...result });
    }

    // Preview phase: resolve the target, no write.
    const target = typeof body.target === 'string' ? body.target : '';
    const preview = await previewAliasTransfer(aliasId, target);
    return NextResponse.json({ preview: true, ...preview });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('infantry-db transfer-alias error:', message);
    const isValidation = /not found|already on|No account|Multiple accounts|required|must be/i.test(message);
    return NextResponse.json({ error: message }, { status: isValidation ? 400 : 502 });
  }
}
