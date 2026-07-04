import { NextRequest, NextResponse } from 'next/server';
import { requireZoneAdmin, auditInfantryDb } from '@/lib/adminApiAuth';
import { updateAccountEmail } from '@/lib/infantryDb';

export const dynamic = 'force-dynamic';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(request: NextRequest) {
  const auth = await requireZoneAdmin(request);
  if (!auth.ok) return auth.response;

  let body: { accountId?: unknown; email?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const accountId = Number(body.accountId);
  const email = typeof body.email === 'string' ? body.email.trim() : '';
  if (!Number.isInteger(accountId) || accountId <= 0) {
    return NextResponse.json({ error: 'accountId must be a positive integer' }, { status: 400 });
  }
  if (!EMAIL_RE.test(email) || email.length > 254) {
    return NextResponse.json({ error: 'A valid email address is required' }, { status: 400 });
  }

  try {
    const result = await updateAccountEmail(accountId, email);
    await auditInfantryDb(auth.userId!, 'update_email', {
      accountId,
      accountName: result.accountName,
      oldEmail: result.oldEmail,
      newEmail: result.newEmail,
    });
    return NextResponse.json({ success: true, ...result });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('infantry-db update-email error:', message);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
