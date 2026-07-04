import { NextRequest, NextResponse } from 'next/server';
import { getServiceSupabase } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

interface ReportedZone {
  title: string;
  ip?: string | null;
  port?: number | null;
  count: number;
}

function slugify(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

// Receives live per-zone player counts from the on-host reporter and upserts the
// current state into zone_population_live. Auth: Bearer CRON_SECRET.
export async function POST(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json({ error: 'CRON_SECRET not configured' }, { status: 500 });
  }
  if (request.headers.get('authorization') !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: { zones?: ReportedZone[] };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  if (!Array.isArray(body.zones)) {
    return NextResponse.json({ error: 'zones must be an array' }, { status: 400 });
  }

  const now = new Date().toISOString();
  const rows = body.zones
    .filter((z) => z && typeof z.title === 'string' && z.title.trim())
    .map((z) => ({
      zone_key: slugify(z.title),
      zone_title: z.title,
      player_count: Number.isFinite(Number(z.count)) ? Math.max(0, Math.trunc(Number(z.count))) : 0,
      ip: z.ip ?? null,
      port: z.port != null ? Number(z.port) : null,
      updated_at: now,
    }));

  if (rows.length === 0) {
    return NextResponse.json({ error: 'No valid zones in report' }, { status: 400 });
  }

  try {
    const supabase = getServiceSupabase();
    const { error } = await supabase.from('zone_population_live').upsert(rows, { onConflict: 'zone_key' });
    if (error) throw new Error(error.message);
    const total = rows.reduce((sum, r) => sum + r.player_count, 0);
    return NextResponse.json({ success: true, updated: rows.length, total });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('report-zone-population error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
