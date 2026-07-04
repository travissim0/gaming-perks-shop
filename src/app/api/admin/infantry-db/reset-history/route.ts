import { NextRequest, NextResponse } from 'next/server';
import { requireZoneAdmin } from '@/lib/adminApiAuth';
import { getResetHistory } from '@/lib/infantryDb';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const auth = await requireZoneAdmin(request);
  if (!auth.ok) return auth.response;

  const accountId = Number(request.nextUrl.searchParams.get('accountId'));
  if (!Number.isInteger(accountId) || accountId <= 0) {
    return NextResponse.json({ error: 'accountId must be a positive integer' }, { status: 400 });
  }

  try {
    const history = await getResetHistory(accountId);
    return NextResponse.json({ history });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('infantry-db reset-history error:', message);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
