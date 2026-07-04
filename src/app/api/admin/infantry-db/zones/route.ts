import { NextRequest, NextResponse } from 'next/server';
import { requireZoneAdmin, auditInfantryDb } from '@/lib/adminApiAuth';
import { listZones, setZoneActive } from '@/lib/infantryDb';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const auth = await requireZoneAdmin(request);
  if (!auth.ok) return auth.response;
  try {
    const zones = await listZones();
    return NextResponse.json({ zones });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('infantry-db zones GET error:', message);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireZoneAdmin(request);
  if (!auth.ok) return auth.response;

  let body: { zoneId?: unknown; active?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const zoneId = Number(body.zoneId);
  if (!Number.isInteger(zoneId) || zoneId <= 0) {
    return NextResponse.json({ error: 'zoneId must be a positive integer' }, { status: 400 });
  }
  if (typeof body.active !== 'boolean') {
    return NextResponse.json({ error: 'active must be a boolean' }, { status: 400 });
  }

  try {
    const result = await setZoneActive(zoneId, body.active);
    await auditInfantryDb(auth.userId!, 'zone_active', result);
    return NextResponse.json({ success: true, ...result });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('infantry-db zones POST error:', message);
    const isValidation = /not found|no zone/i.test(message);
    return NextResponse.json({ error: message }, { status: isValidation ? 400 : 502 });
  }
}
