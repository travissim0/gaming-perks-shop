import { NextRequest, NextResponse } from 'next/server';
import { requireSiteAdmin, auditInfantryDb } from '@/lib/adminApiAuth';
import { createResetToken } from '@/lib/infantryDb';
import { sendResetEmail } from '@/lib/infantryMailer';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const auth = await requireSiteAdmin(request);
  if (!auth.ok) return auth.response;

  let body: { accountId?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const accountId = Number(body.accountId);
  if (!Number.isInteger(accountId) || accountId <= 0) {
    return NextResponse.json({ error: 'accountId must be a positive integer' }, { status: 400 });
  }

  try {
    // 1. Insert the reset token (append-only) 2. email the link
    const { accountName, email, token, expireDate } = await createResetToken(accountId);
    const link = await sendResetEmail(email, accountName, token);
    await auditInfantryDb(auth.userId!, 'send_reset', { accountId, accountName, email, expireDate, link });
    return NextResponse.json({ success: true, accountName, email, expireDate });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('infantry-db send-reset error:', message);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
