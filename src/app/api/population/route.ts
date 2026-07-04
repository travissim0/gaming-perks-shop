import { NextRequest, NextResponse } from 'next/server';
import { getServiceSupabase } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

// Public, CORS-enabled live population feed for third-party sites (e.g. uslzone.com)
// to render their own counters. Backed by zone_population_live (the on-host UDP
// reporter). No auth. Counts older than 5 min are treated as stale and dropped.
const FRESH_MS = 5 * 60 * 1000;

const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  // Let CDNs/browsers cache briefly; the reporter updates ~once a minute.
  'Cache-Control': 'public, max-age=30, s-maxage=30',
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

export async function GET(request: NextRequest) {
  try {
    const supabase = getServiceSupabase();
    const since = new Date(Date.now() - FRESH_MS).toISOString();
    const { data, error } = await supabase
      .from('zone_population_live')
      .select('zone_title, player_count, updated_at')
      .gte('updated_at', since);
    if (error) throw new Error(error.message);

    const rows = data || [];
    const zones = rows
      // Exclude test zones, matching the game directory's own /notz filter.
      .filter((z) => !String(z.zone_title).includes('I:TZ'))
      .map((z) => ({ name: z.zone_title, players: typeof z.player_count === 'number' ? z.player_count : 0 }))
      .sort((a, b) => b.players - a.players);
    const totalPlayers = zones.reduce((sum, z) => sum + z.players, 0);
    const updatedAt = rows.length
      ? rows.reduce((max, r) => (r.updated_at > max ? r.updated_at : max), rows[0].updated_at)
      : null;

    // Drop-in shape for consumers of jovan-s.com/zonepop-raw.php (e.g. freeinfantry.com):
    // an array of { Title, PlayerCount }. Just swap the URL, no other code change.
    const format = request.nextUrl.searchParams.get('format');
    if (format === 'zonepop' || format === 'legacy') {
      const legacy = zones.map((z) => ({ Title: z.name, PlayerCount: z.players }));
      return NextResponse.json(legacy, { headers: CORS_HEADERS });
    }

    return NextResponse.json({ totalPlayers, zones, updatedAt }, { headers: CORS_HEADERS });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('population feed error:', message);
    return NextResponse.json(
      { totalPlayers: 0, zones: [], updatedAt: null, error: 'unavailable' },
      { status: 502, headers: CORS_HEADERS }
    );
  }
}
