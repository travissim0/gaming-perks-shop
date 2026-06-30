import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Service-role client - reads zone_status (written by the per-server daemons)
// and queues commands into zone_commands. The web app never SSHes or executes
// anything itself: each game server runs a zone-daemon that polls this table.
// See scripts/zone-daemon/ for the daemon + per-server config.
const supabaseClient = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const STALE_SECONDS = 60; // a server's status row older than this = offline
const VALID_ACTIONS = ['start', 'stop', 'restart', 'rebuild'];

// Server key -> human label + zone base dir. The daemon stores its SERVER_KEY
// as the zone_status row id; this map gives the UI a friendly label without
// needing extra DB columns. Keep in sync with scripts/zone-daemon/*.conf.
const SERVER_META: Record<string, { label: string; base_dir: string }> = {
  serverA: { label: 'Server A — SFO droplet (167.71.118.224)', base_dir: '/opt/infantry' },
  serverB: { label: 'Server B — OVH vps (51.81.82.133)', base_dir: '/home/freeinfantry/zones' },
};
const labelFor = (key: string) => SERVER_META[key]?.label || key;

type ZoneEntry = { name?: string; status?: string; directory?: string };

// GET - merge every server's status row into a single per-zone view that
// records which server(s) each zone lives on and where it is running.
export async function GET() {
  try {
    const { data: rows, error } = await supabaseClient
      .from('zone_status')
      .select('*')
      .eq('source', 'zone-daemon');

    if (error) throw error;

    const now = Date.now();
    const servers: any[] = [];
    const zones: Record<string, any> = {};

    for (const row of rows || []) {
      const ageSeconds = Math.floor((now - new Date(row.last_update).getTime()) / 1000);
      const online = ageSeconds <= STALE_SECONDS;

      servers.push({
        key: row.id,
        label: labelFor(row.id),
        base_dir: SERVER_META[row.id]?.base_dir || null,
        hostname: row.hostname || null,
        last_update: row.last_update,
        age_seconds: ageSeconds,
        online,
      });

      const zonesData: Record<string, ZoneEntry> = row.zones_data || {};
      for (const [tag, z] of Object.entries(zonesData)) {
        const status = online ? (z.status || 'STOPPED') : 'UNKNOWN';
        if (!zones[tag]) {
          zones[tag] = {
            key: tag,
            name: z.name || tag,
            status: 'STOPPED',
            runningOn: null as string | null,
            availableOn: [] as string[],
            instances: [] as any[],
          };
        }
        const zone = zones[tag];
        if (z.name) zone.name = z.name;
        zone.availableOn.push(row.id);
        zone.instances.push({ server: row.id, label: labelFor(row.id), status, online });
        if (status === 'RUNNING') {
          zone.status = 'RUNNING';
          if (!zone.runningOn) zone.runningOn = row.id;
        }
      }
    }

    return NextResponse.json({
      success: true,
      servers: servers.sort((a, b) => a.key.localeCompare(b.key)),
      zones,
      last_update: servers.reduce<string | null>(
        (max, s) => (!max || s.last_update > max ? s.last_update : max),
        null
      ),
    });
  } catch (error) {
    console.error('Zone status error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to get zone status: ' + (error as Error).message, servers: [], zones: {} },
      { status: 500 }
    );
  }
}

// Resolve which server a command should target when the caller didn't specify
// one. "Auto-detect": prefer the server where the zone is running; fall back to
// the only server that has the zone folder. Returns null if ambiguous.
async function resolveTargetHost(zone: string, action: string): Promise<{ host: string | null; candidates: string[] }> {
  const { data: rows } = await supabaseClient
    .from('zone_status')
    .select('id, zones_data, last_update')
    .eq('source', 'zone-daemon');

  const now = Date.now();
  const running: string[] = [];
  const available: string[] = [];
  for (const row of rows || []) {
    const online = (now - new Date(row.last_update).getTime()) / 1000 <= STALE_SECONDS;
    const z = (row.zones_data || {})[zone];
    if (!z) continue;
    available.push(row.id);
    if (online && z.status === 'RUNNING') running.push(row.id);
  }

  // stop / restart / rebuild act on a live zone -> target where it runs.
  if (action !== 'start') {
    if (running.length === 1) return { host: running[0], candidates: available };
    if (running.length === 0 && available.length === 1) return { host: available[0], candidates: available };
    return { host: null, candidates: running.length ? running : available };
  }
  // start -> target the only place it exists, else where it's already running.
  if (available.length === 1) return { host: available[0], candidates: available };
  if (running.length === 1) return { host: running[0], candidates: available };
  return { host: null, candidates: available };
}

// POST - queue a command for the daemon on the target server to execute.
export async function POST(request: NextRequest) {
  try {
    const { action, zone, admin_id, host } = await request.json();

    if (!VALID_ACTIONS.includes(action)) {
      return NextResponse.json({ success: false, error: 'Invalid action' }, { status: 400 });
    }
    if (!zone) {
      return NextResponse.json({ success: false, error: 'Zone required' }, { status: 400 });
    }

    let targetHost: string | null = host || null;
    if (!targetHost) {
      const resolved = await resolveTargetHost(zone, action);
      targetHost = resolved.host;
      if (!targetHost) {
        return NextResponse.json(
          {
            success: false,
            error: 'Could not determine which server to target. Choose a server explicitly.',
            candidates: resolved.candidates,
          },
          { status: 409 }
        );
      }
    }

    const { data, error } = await supabaseClient
      .from('zone_commands')
      .insert({ action, zone, admin_id: admin_id || null, host: targetHost, status: 'pending' })
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({
      success: true,
      command_id: data.id,
      host: targetHost,
      message: `${action} command queued for ${zone} on ${targetHost}`,
    });
  } catch (error) {
    console.error('Zone command error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to queue command: ' + (error as Error).message },
      { status: 500 }
    );
  }
}
