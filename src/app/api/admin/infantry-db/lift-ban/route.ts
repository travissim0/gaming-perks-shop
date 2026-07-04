import { NextRequest, NextResponse } from 'next/server';
import { requireZoneAdmin, auditInfantryDb } from '@/lib/adminApiAuth';
import { liftBan } from '@/lib/infantryDb';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const auth = await requireZoneAdmin(request);
  if (!auth.ok) return auth.response;

  let body: { banId?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const banId = Number(body.banId);
  if (!Number.isInteger(banId) || banId <= 0) {
    return NextResponse.json({ error: 'banId must be a positive integer' }, { status: 400 });
  }

  try {
    const result = await liftBan(banId);
    await auditInfantryDb(auth.userId!, 'lift_ban', result);
    return NextResponse.json({ success: true, ...result });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('infantry-db lift-ban error:', message);
    const isValidation = /not found|no ban|already expired/i.test(message);
    return NextResponse.json({ error: message }, { status: isValidation ? 400 : 502 });
  }
}
