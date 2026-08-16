import { NextRequest, NextResponse } from 'next/server';
import { listZones } from '@/lib/infantryDb';

export const dynamic = 'force-dynamic';

// Returns the active zones (title + ip + game port) for the population reporter
// to ping. Auth: Bearer CRON_SECRET (same as the other cron endpoints).
//
// LEGACY FALLBACK. The reporter now discovers zones locally from each running
// ZoneServer's server.xml (see scripts/zone-daemon/zone-pop-reporter.py) and only
// calls this if that finds nothing. The game backend moved from MSSQL to SQLite
// (2026-08), which must not be opened over the network, so listZones() will fail
// until an INFANTRY_DB_* replacement exists — hence the empty-list degrade below
// rather than an error the reporter would choke on.
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
    // Degrade instead of 502: callers fall back to their own zone discovery.
    return NextResponse.json({ zones: [], degraded: true, error: message });
  }
}
