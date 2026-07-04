import { NextRequest, NextResponse } from 'next/server';
import { listZones } from '@/lib/infantryDb';

export const dynamic = 'force-dynamic';

// Returns the active zones (title + ip + game port) for the population reporter
// to ping. Auth: Bearer CRON_SECRET (same as the other cron endpoints).
export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json({ error: 'CRON_SECRET not configured' }, { status: 500 });
  }
  if (request.headers.get('authorization') !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const zones = (await listZones())
      .filter((z) => z.active && z.ip && z.port)
      .map((z) => ({ title: z.name, ip: z.ip, port: z.port }));
    return NextResponse.json({ zones });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('zone-targets error:', message);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
