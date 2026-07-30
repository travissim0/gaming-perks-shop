import { NextRequest, NextResponse } from 'next/server';
import { requireZoneAdmin } from '@/lib/adminApiAuth';
import { getZoneMaps, getZoneOverview, queueZoneCommand } from '@/lib/zoneControl';

// Zone control for zone admins. The heavy lifting lives in @/lib/zoneControl so
// /api/user-zone-control can queue commands for its per-user grants directly
// instead of calling this route over HTTP.
//
// The web app never SSHes or executes anything: commands go into zone_commands
// and each game server's zone-daemon polls the rows addressed to it.
// See scripts/zone-daemon/ for the daemon + per-server config.

// GET - per-zone view merged across every server, recording which server(s)
// each zone lives on and where it is running.
// GET ?maps=<zoneKey> instead returns the per-server map inventory for a zone.
//
// Read-only and deliberately public: the zone list is public information (it is
// what the game's own zone list shows) and /community/zone-interest renders it
// for signed-out visitors. Only the POST below mutates anything.
export async function GET(request: NextRequest) {
  try {
    const mapsZone = new URL(request.url).searchParams.get('maps');
    if (mapsZone) {
      const { maps, presets } = await getZoneMaps(mapsZone);
      return NextResponse.json({ success: true, maps, presets });
    }

    const overview = await getZoneOverview();
    return NextResponse.json({ success: true, ...overview });
  } catch (error) {
    console.error('Zone status error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to get zone status: ' + (error as Error).message, servers: [], zones: {} },
      { status: 500 }
    );
  }
}

// POST - queue a command for the daemon on the target server to execute.
// Requires a zone admin (profiles.is_zone_admin, or is_admin as the site-admin
// override). The acting admin is taken from the verified token, NOT from the
// request body - an admin_id in the body is ignored.
export async function POST(request: NextRequest) {
  try {
    const auth = await requireZoneAdmin(request);
    if (!auth.ok) return auth.response!;

    const { action, zone, host, args } = await request.json();

    const result = await queueZoneCommand({
      action,
      zone,
      adminId: auth.userId,
      host,
      args,
    });

    if (!result.ok) {
      return NextResponse.json(
        { success: false, error: result.error, ...(result.candidates ? { candidates: result.candidates } : {}) },
        { status: result.status }
      );
    }

    return NextResponse.json({
      success: true,
      command_id: result.commandId,
      host: result.host,
      message: result.message,
    });
  } catch (error) {
    console.error('Zone command error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to queue command: ' + (error as Error).message },
      { status: 500 }
    );
  }
}
