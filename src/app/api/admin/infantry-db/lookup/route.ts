import { NextRequest, NextResponse } from 'next/server';
import { requireZoneAdmin, auditInfantryDb } from '@/lib/adminApiAuth';
import { lookupAccounts, LookupType } from '@/lib/infantryDb';

export const dynamic = 'force-dynamic';

const VALID_TYPES: LookupType[] = ['auto', 'account', 'alias', 'email'];

export async function GET(request: NextRequest) {
  const auth = await requireZoneAdmin(request);
  if (!auth.ok) return auth.response;

  const q = request.nextUrl.searchParams.get('q')?.trim() ?? '';
  const typeParam = request.nextUrl.searchParams.get('type') ?? 'auto';
  const type = (VALID_TYPES.includes(typeParam as LookupType) ? typeParam : 'auto') as LookupType;

  if (q.length < 2) {
    return NextResponse.json({ error: 'Search term must be at least 2 characters' }, { status: 400 });
  }

  try {
    const accounts = await lookupAccounts(q, type);
    auditInfantryDb(auth.userId!, 'lookup', { q, type, results: accounts.length });
    return NextResponse.json({ accounts });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('infantry-db lookup error:', message);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
