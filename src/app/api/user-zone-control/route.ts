import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import {
  GRANTABLE_USER_ACTIONS as USER_ZONE_ACTIONS,
  getZoneOverview,
  getZonePlayerCounts,
  queueZoneCommand,
} from '@/lib/zoneControl';

// GET - Get user's zone permissions and current zone status
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
      playerCount: playerCounts[perm.zone_key] || 0
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

    const { action, zone_key } = await request.json();

    if (!action || !zone_key) {
      return NextResponse.json({ 
        success: false, 
        error: 'Action and zone_key are required' 
      }, { status: 400 });
    }

    if (!USER_ZONE_ACTIONS.includes(action)) {
      return NextResponse.json({
        success: false,
        error: `Invalid action. Must be one of: ${USER_ZONE_ACTIONS.join(', ')}`
      }, { status: 400 });
    }

    // Check if user has permission for this zone and action
    const { data: hasPermission, error: permError } = await supabase
      .rpc('user_has_zone_permission', {
        p_user_id: user.id,
        p_zone_key: zone_key,
        p_permission: action
      });

    if (permError) {
      console.error('Error checking zone permission:', permError);
      return NextResponse.json({ 
        success: false, 
        error: 'Failed to verify permissions' 
      }, { status: 500 });
    }

    if (!hasPermission) {
      return NextResponse.json({ 
        success: false, 
        error: `You do not have permission to ${action} zone ${zone_key}` 
      }, { status: 403 });
    }

    // User has permission - queue the command directly. This used to POST to
    // /api/admin/zone-management, which is why that route could not require an
    // admin token; both now share @/lib/zoneControl instead.
    try {
      const zoneActionData = await queueZoneCommand({
        action,
        zone: zone_key,
        adminId: user.id,
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
