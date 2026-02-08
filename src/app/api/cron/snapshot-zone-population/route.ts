import { NextRequest, NextResponse } from 'next/server';
import { getServiceSupabase } from '@/lib/supabase';

interface ApiZone {
  Title: string;
  PlayerCount: number;
}

function slugify(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export async function GET(request: NextRequest) {
  // Verify cron secret
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret) {
    return NextResponse.json({ error: 'CRON_SECRET not configured' }, { status: 500 });
  }

  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    // Fetch live zone population data
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);

    const response = await fetch('https://jovan-s.com/zonepop-raw.php', {
      signal: controller.signal,
      cache: 'no-store',
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`Failed to fetch zone data: ${response.status}`);
    }

    const text = await response.text();
    if (!text || text.trim().length === 0) {
      throw new Error('Empty response from zone API');
    }

    let apiZones: ApiZone[];
    try {
      apiZones = JSON.parse(text);
    } catch {
      throw new Error('Invalid JSON from zone API');
    }

    if (!Array.isArray(apiZones)) {
      throw new Error('Zone API returned non-array data');
    }

    const snapshotId = crypto.randomUUID();

    // Calculate total players across all API zones
    const totalServerPlayers = apiZones.reduce(
      (sum, z) => sum + (typeof z.PlayerCount === 'number' ? z.PlayerCount : 0),
      0
    );

    // Record every zone from the API directly
    const rows = apiZones
      .filter((z) => z.Title && typeof z.Title === 'string')
      .map((z) => ({
        zone_key: slugify(z.Title),
        zone_title: z.Title,
        player_count: typeof z.PlayerCount === 'number' ? z.PlayerCount : 0,
        total_server_players: totalServerPlayers,
        snapshot_id: snapshotId,
      }));

    if (rows.length === 0) {
      throw new Error('No valid zones found in API response');
    }

    // Insert via service client
    const supabase = getServiceSupabase();
    const { error } = await supabase.from('zone_population_history').insert(rows);

    if (error) {
      throw new Error(`Database insert failed: ${error.message}`);
    }

    return NextResponse.json({
      success: true,
      snapshot_id: snapshotId,
      zones_recorded: rows.length,
      total_server_players: totalServerPlayers,
      zones: rows.map((r) => ({ key: r.zone_key, title: r.zone_title, players: r.player_count })),
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error('Cron snapshot error:', error);
    return NextResponse.json(
      { error: error.message || 'Snapshot failed' },
      { status: 500 }
    );
  }
}
