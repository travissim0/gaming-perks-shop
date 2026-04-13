import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { verifyZoneAdminAccess } from '@/utils/adminAuth';

export const dynamic = 'force-dynamic';

const supabaseService = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const ZONE_POP_API = 'https://jovan-s.com/zonepop-raw.php';
const PLAYER_THRESHOLD_DEFAULT = 16;

// Sanitize filenames to prevent command injection on the daemon side
function sanitizeFilename(input: string): string {
  return input.replace(/[^a-zA-Z0-9._-]/g, '');
}

// Fetch player count for USL zone from zone pop API
async function getUSLPlayerCount(): Promise<number> {
  try {
    const response = await fetch(ZONE_POP_API);
    if (!response.ok) {
      throw new Error(`Zone pop API returned ${response.status}`);
    }
    const zones = await response.json();

    if (!Array.isArray(zones)) {
      throw new Error('Zone pop API returned unexpected format');
    }

    const uslZone = zones.find((z: any) =>
      z.Title && z.Title.toUpperCase().includes('USL')
    );

    return uslZone ? parseInt(uslZone.PlayerCount, 10) || 0 : 0;
  } catch (error: any) {
    console.error('Failed to fetch USL player count:', error.message);
    return -1; // -1 indicates fetch failure
  }
}

// Insert a command into the queue for the Linux daemon to pick up
async function queueRotationCommand(
  command: string,
  args: Record<string, string>,
  adminUser: any,
  playerCount: number,
  forceRotated: boolean
): Promise<{ success: boolean; commandId?: string; error?: string }> {
  const { data, error } = await supabaseService
    .from('map_rotation_commands')
    .insert({
      command,
      args,
      status: 'pending',
      requested_by: adminUser.id,
      requested_by_alias: adminUser.profile?.in_game_alias || adminUser.email,
      player_count_at_request: playerCount,
      force_rotated: forceRotated,
    })
    .select()
    .single();

  if (error) {
    console.error('Failed to queue rotation command:', error);
    return { success: false, error: error.message };
  }

  return { success: true, commandId: data.id };
}

// GET handler
export async function GET(request: NextRequest) {
  const authResult = await verifyZoneAdminAccess(request);
  if (!authResult.success) {
    return NextResponse.json(
      { success: false, error: authResult.error },
      { status: authResult.statusCode || 401 }
    );
  }

  const { searchParams } = new URL(request.url);
  const action = searchParams.get('action');

  if (!action) {
    return NextResponse.json(
      { success: false, error: 'Missing action parameter' },
      { status: 400 }
    );
  }

  try {
    switch (action) {
      // Status, list-cfgs, list-lvls, list-lios are now read from the DB
      // (the daemon on the Linux server keeps these updated)
      case 'status': {
        const { data, error } = await supabaseService
          .from('map_rotation_status')
          .select('*')
          .eq('zone_key', 'usl')
          .single();

        if (error) {
          return NextResponse.json({
            success: false,
            error: 'No status available. Check if the rotation daemon is running on the Linux server.'
          }, { status: 404 });
        }

        // Check staleness (> 60 seconds)
        const lastUpdate = new Date(data.updated_at);
        const ageSeconds = Math.floor((Date.now() - lastUpdate.getTime()) / 1000);

        return NextResponse.json({
          success: true,
          data: {
            running: data.running,
            cfg: data.current_cfg,
            lvl: data.current_lvl,
            lio: data.current_lio,
            zoneName: data.zone_name,
            stale: ageSeconds > 60,
            age_seconds: ageSeconds,
          }
        });
      }

      case 'list-cfgs': {
        const { data, error } = await supabaseService
          .from('map_rotation_available_files')
          .select('*')
          .eq('zone_key', 'usl')
          .eq('file_type', 'cfg')
          .order('filename', { ascending: true });

        if (error) {
          return NextResponse.json({ success: false, error: error.message }, { status: 500 });
        }

        // Transform to match the expected format
        const cfgs = (data || []).map((row: any) => ({
          cfg: row.filename,
          lvl: row.lvl_file || '',
          lio: row.lio_file || '',
        }));

        return NextResponse.json({ success: true, data: cfgs });
      }

      case 'list-lvls': {
        const { data, error } = await supabaseService
          .from('map_rotation_available_files')
          .select('filename')
          .eq('zone_key', 'usl')
          .eq('file_type', 'lvl')
          .order('filename', { ascending: true });

        if (error) {
          return NextResponse.json({ success: false, error: error.message }, { status: 500 });
        }

        const lvls = (data || []).map((row: any) => row.filename);
        return NextResponse.json({ success: true, data: lvls });
      }

      case 'list-lios': {
        const { data, error } = await supabaseService
          .from('map_rotation_available_files')
          .select('filename')
          .eq('zone_key', 'usl')
          .eq('file_type', 'lio')
          .order('filename', { ascending: true });

        if (error) {
          return NextResponse.json({ success: false, error: error.message }, { status: 500 });
        }

        const lios = (data || []).map((row: any) => row.filename);
        return NextResponse.json({ success: true, data: lios });
      }

      case 'history': {
        const { data, error } = await supabaseService
          .from('map_rotation_history')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(50);

        if (error) {
          return NextResponse.json({ success: false, error: error.message }, { status: 500 });
        }
        return NextResponse.json({ success: true, data });
      }

      case 'pool': {
        const { data, error } = await supabaseService
          .from('map_rotation_pool')
          .select('*')
          .order('display_name', { ascending: true });

        if (error) {
          return NextResponse.json({ success: false, error: error.message }, { status: 500 });
        }
        return NextResponse.json({ success: true, data });
      }

      case 'schedule': {
        const { data, error } = await supabaseService
          .from('map_rotation_schedule')
          .select('*')
          .eq('zone_key', 'usl');

        if (error) {
          return NextResponse.json({ success: false, error: error.message }, { status: 500 });
        }
        return NextResponse.json({ success: true, data });
      }

      case 'check-players': {
        const playerCount = await getUSLPlayerCount();
        if (playerCount === -1) {
          return NextResponse.json(
            { success: false, error: 'Failed to fetch player count from zone pop API' },
            { status: 502 }
          );
        }
        return NextResponse.json({ success: true, data: { playerCount } });
      }

      case 'presets': {
        const { data, error } = await supabaseService
          .from('map_presets')
          .select('*')
          .order('display_name', { ascending: true });

        if (error) {
          return NextResponse.json({ success: false, error: error.message }, { status: 500 });
        }
        return NextResponse.json({ success: true, data });
      }

      case 'commands': {
        // Get recent commands and their status (so admin can see pending/completed)
        const { data, error } = await supabaseService
          .from('map_rotation_commands')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(20);

        if (error) {
          return NextResponse.json({ success: false, error: error.message }, { status: 500 });
        }
        return NextResponse.json({ success: true, data });
      }

      default:
        return NextResponse.json(
          { success: false, error: `Unknown action: ${action}` },
          { status: 400 }
        );
    }
  } catch (error: any) {
    console.error('Map Rotation GET error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error: ' + error.message },
      { status: 500 }
    );
  }
}

// POST handler
export async function POST(request: NextRequest) {
  const authResult = await verifyZoneAdminAccess(request);
  if (!authResult.success) {
    return NextResponse.json(
      { success: false, error: authResult.error },
      { status: authResult.statusCode || 401 }
    );
  }

  const adminUser = authResult.user;

  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { success: false, error: 'Invalid JSON body' },
      { status: 400 }
    );
  }

  const { action } = body;

  if (!action) {
    return NextResponse.json(
      { success: false, error: 'Missing action in request body' },
      { status: 400 }
    );
  }

  try {
    switch (action) {
      case 'swap-cfg': {
        const { cfg, zone_name } = body;
        if (!cfg) {
          return NextResponse.json({ success: false, error: 'Missing cfg parameter' }, { status: 400 });
        }

        const safeCfg = sanitizeFilename(cfg);

        // Check player count
        const playerCount = await getUSLPlayerCount();
        if (playerCount === -1) {
          return NextResponse.json(
            { success: false, error: 'Could not verify player count - zone pop API unavailable' },
            { status: 502 }
          );
        }

        // Fetch schedule for threshold and time window
        const { data: schedules } = await supabaseService
          .from('map_rotation_schedule')
          .select('*')
          .eq('enabled', true)
          .limit(1);

        const schedule = schedules?.[0];
        const threshold = schedule?.player_threshold ?? PLAYER_THRESHOLD_DEFAULT;

        if (playerCount >= threshold) {
          return NextResponse.json(
            { success: false, error: `Too many players online (${playerCount}/${threshold}). Wait for fewer players or use force-rotate.` },
            { status: 409 }
          );
        }

        // Check time window if schedule exists and is enabled
        if (schedule?.rotation_window_start && schedule?.rotation_window_end) {
          const now = new Date();
          const currentTime = `${String(now.getUTCHours()).padStart(2, '0')}:${String(now.getUTCMinutes()).padStart(2, '0')}`;
          const windowStart = schedule.rotation_window_start;
          const windowEnd = schedule.rotation_window_end;

          const inWindow = windowStart <= windowEnd
            ? (currentTime >= windowStart && currentTime <= windowEnd)
            : (currentTime >= windowStart || currentTime <= windowEnd);

          if (!inWindow) {
            return NextResponse.json(
              { success: false, error: `Outside rotation window (${windowStart} - ${windowEnd} UTC). Use force-rotate to override.` },
              { status: 409 }
            );
          }
        }

        // Queue command for the daemon
        const cmdArgs: Record<string, string> = { cfg: safeCfg };
        if (zone_name) cmdArgs.zone_name = zone_name;

        const result = await queueRotationCommand(
          'swap-cfg',
          cmdArgs,
          adminUser,
          playerCount,
          false
        );

        if (!result.success) {
          return NextResponse.json({ success: false, error: result.error }, { status: 500 });
        }

        return NextResponse.json({
          success: true,
          message: `Rotation command queued: swap to ${safeCfg}`,
          command_id: result.commandId,
        });
      }

      case 'swap-lvl': {
        const { lvl, lio, cfg, zone_name } = body;
        if (!lvl || !lio) {
          return NextResponse.json({ success: false, error: 'Missing lvl or lio parameter' }, { status: 400 });
        }

        const safeLvl = sanitizeFilename(lvl);
        const safeLio = sanitizeFilename(lio);
        const safeCfg = cfg ? sanitizeFilename(cfg) : '';

        // Check player count
        const playerCount = await getUSLPlayerCount();
        if (playerCount === -1) {
          return NextResponse.json(
            { success: false, error: 'Could not verify player count - zone pop API unavailable' },
            { status: 502 }
          );
        }

        // Fetch schedule for threshold and time window
        const { data: schedules } = await supabaseService
          .from('map_rotation_schedule')
          .select('*')
          .eq('enabled', true)
          .limit(1);

        const schedule = schedules?.[0];
        const threshold = schedule?.player_threshold ?? PLAYER_THRESHOLD_DEFAULT;

        if (playerCount >= threshold) {
          return NextResponse.json(
            { success: false, error: `Too many players online (${playerCount}/${threshold}). Wait for fewer players or use force-rotate.` },
            { status: 409 }
          );
        }

        if (schedule?.rotation_window_start && schedule?.rotation_window_end) {
          const now = new Date();
          const currentTime = `${String(now.getUTCHours()).padStart(2, '0')}:${String(now.getUTCMinutes()).padStart(2, '0')}`;
          const windowStart = schedule.rotation_window_start;
          const windowEnd = schedule.rotation_window_end;

          const inWindow = windowStart <= windowEnd
            ? (currentTime >= windowStart && currentTime <= windowEnd)
            : (currentTime >= windowStart || currentTime <= windowEnd);

          if (!inWindow) {
            return NextResponse.json(
              { success: false, error: `Outside rotation window (${windowStart} - ${windowEnd} UTC). Use force-rotate to override.` },
              { status: 409 }
            );
          }
        }

        const args: Record<string, string> = { lvl: safeLvl, lio: safeLio };
        if (safeCfg) args.cfg = safeCfg;
        if (zone_name) args.zone_name = zone_name;

        const result = await queueRotationCommand('swap-lvl', args, adminUser, playerCount, false);

        if (!result.success) {
          return NextResponse.json({ success: false, error: result.error }, { status: 500 });
        }

        return NextResponse.json({
          success: true,
          message: `Rotation command queued: swap LVL/LIO to ${safeLvl}/${safeLio}`,
          command_id: result.commandId,
        });
      }

      case 'force-rotate': {
        const { cfg, lvl, lio, zone_name } = body;

        if (!cfg && !lvl) {
          return NextResponse.json(
            { success: false, error: 'Must provide cfg or lvl/lio for force rotation' },
            { status: 400 }
          );
        }

        const playerCount = await getUSLPlayerCount();

        let command: string;
        const args: Record<string, string> = {};

        if (lvl && lio) {
          command = 'swap-lvl';
          args.lvl = sanitizeFilename(lvl);
          args.lio = sanitizeFilename(lio);
          if (cfg) args.cfg = sanitizeFilename(cfg);
        } else {
          command = 'swap-cfg';
          args.cfg = sanitizeFilename(cfg);
        }
        if (zone_name) args.zone_name = zone_name;

        const result = await queueRotationCommand(
          command,
          args,
          adminUser,
          playerCount !== -1 ? playerCount : 0,
          true
        );

        if (!result.success) {
          return NextResponse.json({ success: false, error: result.error }, { status: 500 });
        }

        return NextResponse.json({
          success: true,
          message: 'Force rotation command queued',
          command_id: result.commandId,
        });
      }

      case 'add-to-pool': {
        const { cfg, display_name, enabled } = body;
        if (!cfg || !display_name) {
          return NextResponse.json(
            { success: false, error: 'Missing cfg or display_name parameter' },
            { status: 400 }
          );
        }

        const safeCfg = sanitizeFilename(cfg);

        const { data, error } = await supabaseService
          .from('map_rotation_pool')
          .insert({
            cfg_file: safeCfg,
            display_name,
            enabled: enabled ?? true,
            added_by: adminUser.id,
          })
          .select()
          .single();

        if (error) {
          return NextResponse.json({ success: false, error: error.message }, { status: 500 });
        }

        return NextResponse.json({ success: true, data });
      }

      case 'remove-from-pool': {
        const { id } = body;
        if (!id) {
          return NextResponse.json({ success: false, error: 'Missing id parameter' }, { status: 400 });
        }

        const { error } = await supabaseService
          .from('map_rotation_pool')
          .delete()
          .eq('id', id);

        if (error) {
          return NextResponse.json({ success: false, error: error.message }, { status: 500 });
        }

        return NextResponse.json({ success: true, message: 'Removed from pool' });
      }

      case 'save-preset': {
        const { display_name, lvl_file, lio_file, cfg_file, zone_name: presetZoneName, preview_image_url } = body;
        if (!display_name || !lvl_file || !lio_file) {
          return NextResponse.json(
            { success: false, error: 'Missing display_name, lvl_file, or lio_file' },
            { status: 400 }
          );
        }

        const insertData: any = {
          display_name,
          lvl_file: sanitizeFilename(lvl_file),
          lio_file: sanitizeFilename(lio_file),
          zone_name: presetZoneName || display_name,
          created_by: adminUser.id,
        };
        if (cfg_file) insertData.cfg_file = sanitizeFilename(cfg_file);
        if (preview_image_url) insertData.preview_image_url = preview_image_url;

        const { data, error } = await supabaseService
          .from('map_presets')
          .insert(insertData)
          .select()
          .single();

        if (error) {
          console.error('Save preset error:', error);
          return NextResponse.json({ success: false, error: error.message }, { status: 500 });
        }
        return NextResponse.json({ success: true, data });
      }

      case 'update-preset': {
        const { id, preview_image_url: imgUrl, display_name: dn, zone_name: zn, cfg_file: cf, lvl_file: lf, lio_file: liof } = body;
        if (!id) {
          return NextResponse.json({ success: false, error: 'Missing id' }, { status: 400 });
        }

        const updateData: any = {};
        if (imgUrl !== undefined) updateData.preview_image_url = imgUrl;
        if (dn) updateData.display_name = dn;
        if (zn) updateData.zone_name = zn;
        if (cf !== undefined) updateData.cfg_file = cf ? sanitizeFilename(cf) : null;
        if (lf) updateData.lvl_file = sanitizeFilename(lf);
        if (liof) updateData.lio_file = sanitizeFilename(liof);

        const { data, error } = await supabaseService
          .from('map_presets')
          .update(updateData)
          .eq('id', id)
          .select()
          .single();

        if (error) {
          return NextResponse.json({ success: false, error: error.message }, { status: 500 });
        }
        return NextResponse.json({ success: true, data });
      }

      case 'delete-preset': {
        const { id } = body;
        if (!id) {
          return NextResponse.json({ success: false, error: 'Missing id' }, { status: 400 });
        }

        const { error } = await supabaseService
          .from('map_presets')
          .delete()
          .eq('id', id);

        if (error) {
          return NextResponse.json({ success: false, error: error.message }, { status: 500 });
        }
        return NextResponse.json({ success: true, message: 'Preset deleted' });
      }

      case 'update-schedule': {
        const { rotation_window_start, rotation_window_end, player_threshold, enabled } = body;

        if (!rotation_window_start || !rotation_window_end || player_threshold === undefined) {
          return NextResponse.json(
            { success: false, error: 'Missing required schedule fields (rotation_window_start, rotation_window_end, player_threshold)' },
            { status: 400 }
          );
        }

        const { data: existing } = await supabaseService
          .from('map_rotation_schedule')
          .select('id')
          .eq('zone_key', 'usl')
          .limit(1)
          .single();

        let data, error;
        if (existing) {
          ({ data, error } = await supabaseService
            .from('map_rotation_schedule')
            .update({
              rotation_window_start,
              rotation_window_end,
              player_threshold,
              enabled: enabled ?? true,
              updated_at: new Date().toISOString(),
            })
            .eq('id', existing.id)
            .select()
            .single());
        } else {
          ({ data, error } = await supabaseService
            .from('map_rotation_schedule')
            .insert({
              zone_key: 'usl',
              rotation_window_start,
              rotation_window_end,
              player_threshold,
              enabled: enabled ?? true,
            })
            .select()
            .single());
        }

        if (error) {
          return NextResponse.json({ success: false, error: error.message }, { status: 500 });
        }

        return NextResponse.json({ success: true, data });
      }

      default:
        return NextResponse.json(
          { success: false, error: `Unknown action: ${action}` },
          { status: 400 }
        );
    }
  } catch (error: any) {
    console.error('Map Rotation POST error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error: ' + error.message },
      { status: 500 }
    );
  }
}
