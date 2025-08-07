import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

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

    // Fetch current zone status for user's zones
    let zoneStatuses = {};
    try {
      const zoneStatusResponse = await fetch(`${process.env.NEXT_PUBLIC_SITE_URL}/api/admin/zone-status`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      if (zoneStatusResponse.ok) {
        const statusData = await zoneStatusResponse.json();
        zoneStatuses = statusData.zones || {};
      }
    } catch (error) {
      console.warn('Could not fetch zone status:', error);
    }

    // Combine permissions with current status
    const userZones = permissions.map((perm: any) => ({
      zone_key: perm.zone_key,
      zone_name: perm.zone_name,
      permissions: perm.permissions,
      status: zoneStatuses[perm.zone_key]?.status || 'UNKNOWN',
      playerCount: zoneStatuses[perm.zone_key]?.playerCount || 0
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

    if (!['start', 'stop', 'restart'].includes(action)) {
      return NextResponse.json({ 
        success: false, 
        error: 'Invalid action. Must be start, stop, or restart' 
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

    // User has permission, execute the zone action using the existing admin endpoint
    try {
      const zoneActionResponse = await fetch(`${process.env.NEXT_PUBLIC_SITE_URL}/api/admin/zone-management`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          action, 
          zone: zone_key, 
          admin_id: user.id 
        }),
      });

      const zoneActionData = await zoneActionResponse.json();
      
      if (zoneActionData.success) {
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
        }, { status: 500 });
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
