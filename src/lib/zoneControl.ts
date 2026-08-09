import { getServiceSupabase } from '@/lib/supabase';
import { playerCountsByTag } from '@/lib/zoneTitles';

// Shared zone-control core, used by BOTH zone-control API routes:
//   /api/admin/zone-management  - zone admins, any zone
//   /api/user-zone-control      - non-admins, only zones granted in
//                                 user_zone_permissions
// It lives here so the per-user route can queue a command directly instead of
// POSTing to the admin route over HTTP. That self-call was why the admin route
// had to stay unauthenticated, which meant anyone who could reach the URL could
// start/stop/rebuild any zone with an admin_id of their choosing.
//
// The web app still never SSHes: it queues rows in zone_commands, and each
// server's zone-daemon polls for the ones addressed to it (scripts/zone-daemon/).

const STALE_SECONDS = 60; // a server's status row older than this = offline

export const VALID_ACTIONS = [
  'start',
  'stop',
  'restart',
  'rebuild',
  'swap-lvl-lio',
  'sync-files',
  'list-files',
  'tail-log',
] as const;
export type ZoneAction = (typeof VALID_ACTIONS)[number];

// Actions a per-user grant (user_zone_permissions.permissions) can carry, i.e.
// what a non-admin can be handed on /test-zone. 'rebuild' pulls the latest
// server build and restarts the zone, so it is a strictly bigger hammer than
// restart; the column default stays start/stop/restart, so it has to be
// granted deliberately.
//
// 'maps' is the grant name for map rotation. The daemon action is
// 'swap-lvl-lio' (see USER_ACTION_TO_COMMAND) - the grant is named for what the
// person can do, not for the wire format. It is only grantable on zones that
// actually rotate maps (zoneRotatesMaps below).
// 'files' is the grant name for zone file management: uploading files into the
// zone's scripts/ + assets/ subfolders (daemon actions sync-files / list-files /
// tail-log). Like 'maps', the grant is named for the capability, not the wire
// format; the file endpoints in /api/user-zone-control check this grant.
export const GRANTABLE_USER_ACTIONS = ['start', 'stop', 'restart', 'rebuild', 'maps', 'files'] as const;

/** Grant name -> the action the daemon actually executes. */
export const USER_ACTION_TO_COMMAND: Record<string, ZoneAction> = {
  start: 'start',
  stop: 'stop',
  restart: 'restart',
  rebuild: 'rebuild',
  maps: 'swap-lvl-lio',
};

// ---------------------------------------------------------------------------
// Zone file management (the 'files' grant)
// ---------------------------------------------------------------------------

/** Supabase Storage bucket that staged zone-file uploads live in. */
export const ZONE_FILES_BUCKET = 'zone-files';

// What a 'files' grant may write. scripts/ + assets/ only - server.xml (port,
// zoneid, db password) stays out of reach by construction.
const ZONE_FILE_EXTENSIONS = new Set([
  'cs', 'cfg', 'lvl', 'lio', 'rpg', 'itm', 'veh', 'nws', 'txt', 'json', 'wav', 'blo',
]);

/**
 * Validate a zone-relative destination path for a file upload.
 * Returns an error string, or null if the path is acceptable.
 * The daemon re-validates with the same rules before writing.
 */
export function validateZoneFilePath(p: string): string | null {
  if (!p || typeof p !== 'string') return 'Path required';
  if (p.length > 200) return 'Path too long';
  if (!/^(scripts|assets)\//.test(p)) return 'Path must start with scripts/ or assets/';
  if (p.endsWith('/')) return 'Path must name a file, not a folder';
  if (!/^[A-Za-z0-9 _().\/-]+$/.test(p)) return 'Path contains unsupported characters';
  const segments = p.split('/');
  if (segments.some((s) => s === '' || s === '.' || s === '..' || s.startsWith('.'))) {
    return 'Path contains invalid segments';
  }
  const ext = p.split('.').pop()?.toLowerCase() || '';
  if (!ZONE_FILE_EXTENSIONS.has(ext)) {
    return `File type .${ext} not allowed (allowed: ${[...ZONE_FILE_EXTENSIONS].join(', ')})`;
  }
  return null;
}

/** Whether a zone exposes map rotation (the USL zones, see MAP_ENABLED_ZONES). */
export const zoneRotatesMaps = (zoneKey: string) => MAP_ENABLED_ZONES.has(zoneKey);

// Zones that expose the Maps (map-rotation) UI. Only the USL zones actually
// rotate maps for now; add zone keys here if others start using map rotation.
const MAP_ENABLED_ZONES = new Set(['usl', 'usl2']);

// Server key -> human label + zone base dir. The daemon stores its SERVER_KEY
// as the zone_status row id; this map gives the UI a friendly label without
// needing extra DB columns. Keep in sync with scripts/zone-daemon/*.conf.
const SERVER_META: Record<string, { label: string; base_dir: string }> = {
  serverA: { label: 'Server A — SFO droplet (167.71.118.224)', base_dir: '/opt/infantry' },
  serverB: { label: 'Server B — OVH vps (51.81.82.133)', base_dir: '/home/freeinfantry/zones' },
};
export const labelFor = (key: string) => SERVER_META[key]?.label || key;

type ZoneEntry = { name?: string; status?: string; directory?: string };

/**
 * Merge every server's zone_status row into a single per-zone view recording
 * which server(s) each zone lives on and where it is running.
 */
export async function getZoneOverview() {
  const supabase = getServiceSupabase();
  const { data: rows, error } = await supabase
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

  // Enable the Maps (map-rotation) UI only for zones that actually rotate
  // maps — just the USL zones for now (see MAP_ENABLED_ZONES).
  for (const tag of Object.keys(zones)) {
    zones[tag].hasMaps = MAP_ENABLED_ZONES.has(tag);
  }

  return {
    servers: servers.sort((a, b) => a.key.localeCompare(b.key)),
    zones,
    last_update: servers.reduce<string | null>(
      (max, s) => (!max || s.last_update > max ? s.last_update : max),
      null
    ),
  };
}

/** Per-server map inventory for one zone, plus the curated preset previews. */
export async function getZoneMaps(zoneKey: string) {
  const supabase = getServiceSupabase();
  const [mapsRes, presetsRes] = await Promise.all([
    supabase.from('zone_maps').select('*').eq('zone_key', zoneKey),
    supabase
      .from('map_presets')
      .select('id,display_name,cfg_file,lvl_file,lio_file,preview_image_url'),
  ]);
  if (mapsRes.error) throw mapsRes.error;
  return { maps: mapsRes.data || [], presets: presetsRes.data || [] };
}

/** Live player counts keyed by zone tag (population reporter -> zone tag). */
export async function getZonePlayerCounts(): Promise<Record<string, number>> {
  try {
    const supabase = getServiceSupabase();
    const since = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    const { data } = await supabase
      .from('zone_population_live')
      .select('zone_title, player_count')
      .gte('updated_at', since);
    return playerCountsByTag(
      (data || []).map((z: any) => ({ title: z.zone_title, playerCount: z.player_count }))
    );
  } catch {
    return {};
  }
}

/**
 * Resolve which server a command should target when the caller didn't specify
 * one. "Auto-detect": prefer the server where the zone is running; fall back to
 * the only server that has the zone folder. Returns null host if ambiguous.
 */
async function resolveTargetHost(
  zone: string,
  action: string
): Promise<{ host: string | null; candidates: string[] }> {
  const { data: rows } = await getServiceSupabase()
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

export type QueueResult =
  | { ok: true; commandId: string; host: string; message: string }
  | { ok: false; status: number; error: string; candidates?: string[] };

/**
 * Validate and queue one zone command for the daemon on the target server.
 * Callers are responsible for authorization — this only checks that the
 * request itself is well formed.
 */
export async function queueZoneCommand(params: {
  action: string;
  zone: string;
  adminId?: string | null;
  host?: string | null;
  args?: any;
}): Promise<QueueResult> {
  const { action, zone, adminId, args } = params;

  if (!VALID_ACTIONS.includes(action as ZoneAction)) {
    return { ok: false, status: 400, error: 'Invalid action' };
  }
  if (!zone) {
    return { ok: false, status: 400, error: 'Zone required' };
  }
  if (action === 'swap-lvl-lio' && (!args?.lvl || !args?.lio)) {
    return { ok: false, status: 400, error: 'swap-lvl-lio requires args.lvl and args.lio' };
  }

  let targetHost: string | null = params.host || null;
  if (!targetHost) {
    const resolved = await resolveTargetHost(zone, action);
    targetHost = resolved.host;
    if (!targetHost) {
      return {
        ok: false,
        status: 409,
        error: 'Could not determine which server to target. Choose a server explicitly.',
        candidates: resolved.candidates,
      };
    }
  }

  const { data, error } = await getServiceSupabase()
    .from('zone_commands')
    .insert({
      action,
      zone,
      admin_id: adminId || null,
      host: targetHost,
      status: 'pending',
      args: args || null,
    })
    .select()
    .single();

  if (error) {
    return { ok: false, status: 500, error: 'Failed to queue command: ' + error.message };
  }

  return {
    ok: true,
    commandId: data.id,
    host: targetHost,
    message: `${action} command queued for ${zone} on ${targetHost}`,
  };
}
