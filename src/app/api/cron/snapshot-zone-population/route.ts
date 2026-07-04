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
    // Snapshot the live counts (from the on-host reporter, stored in
    // zone_population_live) into the history table for the trend charts.
    const supabase = getServiceSupabase();
    const since = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    const { data: live, error: liveError } = await supabase
      .from('zone_population_live')
      .select('zone_title, player_count, updated_at')
      .gte('updated_at', since);
    if (liveError) {
      throw new Error(`Failed to read live population: ${liveError.message}`);
    }

    const apiZones: ApiZone[] = (live || []).map((z) => ({
      Title: z.zone_title,
      PlayerCount: typeof z.player_count === 'number' ? z.player_count : 0,
    }));

    const snapshotId = crypto.randomUUID();

    const totalServerPlayers = apiZones.reduce(
      (sum, z) => sum + (typeof z.PlayerCount === 'number' ? z.PlayerCount : 0),
      0
    );

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
      // No fresh live data (reporter down) — record nothing rather than false zeros.
      return NextResponse.json({ success: true, zones_recorded: 0, note: 'no fresh live data' });
    }

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
