import { NextRequest, NextResponse } from 'next/server';
import { supabase, getServiceSupabase } from '@/lib/supabase';
import {
  GRANTABLE_USER_ACTIONS as USER_ZONE_ACTIONS,
  USER_ACTION_TO_COMMAND,
  ZONE_FILES_BUCKET,
  getZoneMaps,
  getZoneOverview,
  getZonePlayerCounts,
  queueZoneCommand,
  validateZoneFilePath,
} from '@/lib/zoneControl';

/** Verify the caller's grant covers this zone + action. */
async function assertGrant(userId: string, zoneKey: string, permission: string) {
  const { data: hasPermission, error } = await supabase.rpc('user_has_zone_permission', {
    p_user_id: userId,
    p_zone_key: zoneKey,
    p_permission: permission,
  });
  if (error) {
    console.error('Error checking zone permission:', error);
    return { ok: false as const, status: 500, error: 'Failed to verify permissions' };
  }
  if (!hasPermission) {
    return {
      ok: false as const,
      status: 403,
      error: `You do not have permission to ${permission} zone ${zoneKey}`,
    };
  }
  return { ok: true as const };
}

// GET                 - the caller's granted zones with live status
// GET ?maps=<zone>    - map inventory for a zone the caller has 'maps' on
// GET ?command=<id>   - status/result of a command this caller queued (polling)
export async function GET(request: NextRequest) {
  try {
    // Check authentication
    const authHeader = request.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const token = authHeader.split(' ')[1];
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
    }

    // Command polling: lets the files UI (and headless API users) read the
    // daemon's result_message for a command THEY queued. Scoped by admin_id so
    // one user can't read another's command results.
    const commandId = new URL(request.url).searchParams.get('command');
    if (commandId) {
      const { data: cmd, error: cmdError } = await getServiceSupabase()
        .from('zone_commands')
        .select('id, action, zone, status, result_message, created_at, completed_at')
        .eq('id', commandId)
        .eq('admin_id', user.id)
        .maybeSingle();
      if (cmdError) {
        return NextResponse.json({ success: false, error: 'Failed to read command' }, { status: 500 });
      }
      if (!cmd) {
        return NextResponse.json({ success: false, error: 'Command not found' }, { status: 404 });
      }
      return NextResponse.json({ success: true, command: cmd });
    }

    // Map inventory for the picker - same data the admin console's Maps modal
    // renders, but only for a zone this account has been granted 'maps' on.
    const mapsZone = new URL(request.url).searchParams.get('maps');
    if (mapsZone) {
      const grant = await assertGrant(user.id, mapsZone, 'maps');
      if (!grant.ok) {
        return NextResponse.json({ success: false, error: grant.error }, { status: grant.status });
      }
      const { maps, presets } = await getZoneMaps(mapsZone);
      return NextResponse.json({ success: true, maps, presets });
    }

    // Get user's zone permissions
    const { data: permissions, error: permError } = await supabase
      .rpc('get_user_zone_permissions', { p_user_id: user.id });

    if (permError) {
      console.error('Error fetching user zone permissions:', permError);
      return NextResponse.json({ error: 'Failed to fetch permissions' }, { status: 500 });
    }

    if (!permissions || permissions.length === 0) {
      return NextResponse.json({ zones: [] });
    }

    // Fetch current zone status for the user's zones. Status is the same
    // daemon-backed view the admin console shows (zone_status, keyed by zone
    // tag); player counts come from the population reporter, keyed by in-game
    // title. (The old /api/admin/zone-status read a JSON file off the web
    // host's own disk - dead since the site moved to Vercel and the zones to
    // their own servers - so every zone here always showed UNKNOWN / 0.)
    let zoneStatuses: Record<string, any> = {};
    let playerCounts: Record<string, number> = {};
    try {
      const [overview, counts] = await Promise.all([getZoneOverview(), getZonePlayerCounts()]);
      zoneStatuses = overview.zones || {};
      playerCounts = counts;
    } catch (error) {
      console.warn('Could not fetch zone status:', error);
    }

    // Combine permissions with current status
    const userZones = permissions.map((perm: any) => ({
      zone_key: perm.zone_key,
      zone_name: perm.zone_name,
      permissions: perm.permissions,
      status: zoneStatuses[perm.zone_key]?.status || 'UNKNOWN',
      playerCount: playerCounts[perm.zone_key] || 0,
      // Which server it runs on - the map picker needs it to choose the right
      // per-server zone_maps row.
      runningOn: zoneStatuses[perm.zone_key]?.runningOn || null
    }));

    return NextResponse.json({ zones: userZones });

  } catch (error) {
    console.error('User zone control GET error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST - Execute zone action if user has permission
export async function POST(request: NextRequest) {
  try {
    // Check authentication
    const authHeader = request.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const token = authHeader.split(' ')[1];
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    
    if (authError || !user) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
    }

    const { action, zone_key, args } = await request.json();

    if (!action || !zone_key) {
      return NextResponse.json({
        success: false,
        error: 'Action and zone_key are required'
      }, { status: 400 });
    }

    // ---- Zone file management (the 'files' grant) -------------------------
    // files-upload-url: stage an upload -> returns a signed Storage URL
    // files-deploy:     queue sync-files so the daemon pulls staged files in
    // files-list:       queue list-files (inventory of scripts/ + assets/)
    // files-log:        queue tail-log   (recent zone log, e.g. compile errors)
    // All results land in zone_commands.result_message; poll GET ?command=<id>.
    if (['files-upload-url', 'files-deploy', 'files-list', 'files-log'].includes(action)) {
      const grant = await assertGrant(user.id, zone_key, 'files');
      if (!grant.ok) {
        return NextResponse.json({ success: false, error: grant.error }, { status: grant.status });
      }

      if (action === 'files-upload-url') {
        const path = args?.path;
        const pathError = validateZoneFilePath(path);
        if (pathError) {
          return NextResponse.json({ success: false, error: pathError }, { status: 400 });
        }
        // Object key: zone-scoped prefix + uuid so uploads never collide; the
        // real destination path travels separately in the deploy args.
        const baseName = path.split('/').pop()!.replace(/[^A-Za-z0-9._-]/g, '_');
        const object = `${zone_key}/incoming/${crypto.randomUUID()}/${baseName}`;
        const { data: signed, error: signError } = await getServiceSupabase()
          .storage.from(ZONE_FILES_BUCKET)
          .createSignedUploadUrl(object);
        if (signError || !signed) {
          console.error('createSignedUploadUrl failed:', signError);
          return NextResponse.json({ success: false, error: 'Failed to create upload URL' }, { status: 500 });
        }
        return NextResponse.json({
          success: true,
          object,
          path,
          uploadUrl: signed.signedUrl,
          token: signed.token,
        });
      }

      let command: 'sync-files' | 'list-files' | 'tail-log';
      let commandArgs: any = undefined;

      if (action === 'files-deploy') {
        const files = args?.files;
        if (!Array.isArray(files) || files.length === 0 || files.length > 20) {
          return NextResponse.json({ success: false, error: 'args.files must list 1-20 files' }, { status: 400 });
        }
        for (const f of files) {
          const pathError = validateZoneFilePath(f?.path);
          if (pathError) {
            return NextResponse.json({ success: false, error: `${f?.path}: ${pathError}` }, { status: 400 });
          }
          if (typeof f?.object !== 'string' || !f.object.startsWith(`${zone_key}/`)) {
            return NextResponse.json({ success: false, error: 'Staged object does not belong to this zone' }, { status: 400 });
          }
        }
        command = 'sync-files';
        commandArgs = { files: files.map((f: any) => ({ path: f.path, object: f.object })) };
      } else {
        command = action === 'files-list' ? 'list-files' : 'tail-log';
      }

      const queued = await queueZoneCommand({
        action: command,
        zone: zone_key,
        adminId: user.id,
        args: commandArgs,
      });
      if (!queued.ok) {
        return NextResponse.json({ success: false, error: queued.error }, { status: queued.status });
      }
      return NextResponse.json({
        success: true,
        commandId: queued.commandId,
        message: queued.message,
      });
    }

    if (!USER_ZONE_ACTIONS.includes(action)) {
      return NextResponse.json({
        success: false,
        error: `Invalid action. Must be one of: ${USER_ZONE_ACTIONS.join(', ')}`
      }, { status: 400 });
    }

    // The grant is named for what the person can do ('maps'); the daemon runs
    // the wire action ('swap-lvl-lio'). Permission is always checked against
    // the grant name.
    const command = USER_ACTION_TO_COMMAND[action];
    if (action === 'maps' && (!args?.lvl || !args?.lio)) {
      return NextResponse.json({
        success: false,
        error: 'Pick a map first (lvl and lio are required)'
      }, { status: 400 });
    }

    const grant = await assertGrant(user.id, zone_key, action);
    if (!grant.ok) {
      return NextResponse.json({ success: false, error: grant.error }, { status: grant.status });
    }

    // User has permission - queue the command directly. This used to POST to
    // /api/admin/zone-management, which is why that route could not require an
    // admin token; both now share @/lib/zoneControl instead.
    try {
      const zoneActionData = await queueZoneCommand({
        action: command,
        zone: zone_key,
        adminId: user.id,
        args: action === 'maps'
          ? { cfg: args.cfg || undefined, lvl: args.lvl, lio: args.lio, zoneName: args.zoneName || undefined }
          : undefined,
      });

      if (zoneActionData.ok) {
        // Log the user action
        try {
          await supabase
            .from('admin_logs')
            .insert({
              admin_id: user.id,
              action: `user_zone_${action}`,
              details: `User zone ${action.toUpperCase()}: ${zone_key} (user-specific permission)`,
              timestamp: new Date().toISOString()
            });
        } catch (logError) {
          console.error('Failed to log user zone action:', logError);
        }

        return NextResponse.json({
          success: true,
          message: `Zone ${zone_key} ${action} successful: ${zoneActionData.message}`,
          action,
          zone: zone_key,
          method: 'user-zone-control',
          timestamp: new Date().toISOString()
        });
      } else {
        return NextResponse.json({
          success: false,
          error: zoneActionData.error || `Failed to ${action} zone`
        }, { status: zoneActionData.status || 500 });
      }

    } catch (error) {
      console.error('Error executing zone action:', error);
      return NextResponse.json({
        success: false,
        error: 'Failed to execute zone action'
      }, { status: 500 });
    }

  } catch (error) {
    console.error('User zone control POST error:', error);
    return NextResponse.json({ 
      success: false, 
      error: 'Internal server error' 
    }, { status: 500 });
  }
}
