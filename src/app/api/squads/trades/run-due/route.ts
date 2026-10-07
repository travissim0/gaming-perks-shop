import { NextRequest, NextResponse } from 'next/server';
import { callerFrom } from '@/lib/leave-requests-server';
import { runDueTrades, tradesInstalled } from '@/lib/trades-server';

export const dynamic = 'force-dynamic';

/**
 * POST /api/squads/trades/run-due
 * Completes or escalates agreed trades the clock has decided. The Discord bot calls this every few
 * minutes with the shared service key as the bearer token; league staff may call it signed in.
 */
export async function POST(request: NextRequest) {
  const header = request.headers.get('Authorization') || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  let allowed = !!serviceKey && token === serviceKey;
  if (!allowed) {
    const caller = await callerFrom(request);
    allowed = !!caller?.staff;
  }
  if (!allowed) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!(await tradesInstalled())) return NextResponse.json({ pending_sql: true, checked: 0, changed: [] });
  const out = await runDueTrades();
  return NextResponse.json(out);
}
