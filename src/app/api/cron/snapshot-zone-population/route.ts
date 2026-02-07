import { NextRequest, NextResponse } from 'next/server';
import { getServiceSupabase } from '@/lib/supabase';

interface ZoneConfig {
  key: string;
  name: string;
  directory: string;
}

interface ApiZone {
  Title: string;
  PlayerCount: number;
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

    // Load zones config
    let zonesConfig: { zones: ZoneConfig[] };
    try {
      const configResponse = await fetch(new URL('/zones-config.json', request.url));
      zonesConfig = await configResponse.json();
    } catch {
      // Fallback: hardcode the zones we know about
      zonesConfig = {
        zones: [
          { key: 'ctf', name: 'CTF - Twin Peaks 2.0', directory: 'CTF - Twin Peaks 2.0' },
          { key: 'tp', name: 'CTF - Twin Peaks Classic', directory: 'CTF - Twin Peaks Classic' },
          { key: 'usl', name: 'League - USL Matches', directory: 'League - USL Matches' },
          { key: 'usl2', name: 'League - USL Secondary', directory: 'League - USL Secondary' },
          { key: 'skMini', name: 'Skirmish - Minimaps', directory: 'Skirmish - Minimaps' },
          { key: 'grav', name: 'Sports - GravBall', directory: 'Sports - GravBall' },
          { key: 'arena', name: 'Arcade - The Arena', directory: 'Arcade - The Arena' },
          { key: 'zz', name: 'Bots - Zombie Zone', directory: 'Bots - Zombie Zone' },
        ],
      };
    }

    const snapshotId = crypto.randomUUID();

    // Calculate total players across all API zones
    const totalServerPlayers = apiZones.reduce(
      (sum, z) => sum + (typeof z.PlayerCount === 'number' ? z.PlayerCount : 0),
      0
    );

    // Map each configured zone to its population
    const rows = zonesConfig.zones.map((config) => {
      // Match by comparing directory field to API Title (case-insensitive)
      const match = apiZones.find(
        (az) => az.Title && az.Title.toLowerCase() === config.directory.toLowerCase()
      );

      return {
        zone_key: config.key,
        zone_title: config.name,
        player_count: match ? match.PlayerCount : 0,
        total_server_players: totalServerPlayers,
        snapshot_id: snapshotId,
      };
    });

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
