import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Helper to check if user is zone admin
async function isUserZoneAdmin(userId: string): Promise<boolean> {
  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('is_admin, ctf_role')
      .eq('id', userId)
      .single();

    if (error || !data) return false;
    
    return data.is_admin || 
           data.ctf_role === 'ctf_admin' || 
           data.ctf_role === 'ctf_head_referee';
  } catch (error) {
    console.error('Error checking zone admin status:', error);
    return false;
  }
}

// GET - Get zone status from database
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

    // Check if user is admin or zone admin
    if (!(await isUserZoneAdmin(user.id))) {
      return NextResponse.json({ error: 'Zone admin access required' }, { status: 403 });
    }

    // Get zone status from database
    const { data: zones, error: zonesError } = await supabase
      .from('zone_status')
      .select('*')
      .order('zone_key');

    if (zonesError) {
      console.error('Error fetching zone status:', zonesError);
      return NextResponse.json({ 
        success: false, 
        error: 'Failed to fetch zone status from database',
        troubleshooting: [
          "1. Check if zone-database-client.sh is running: ps aux | grep zone-database-client",
          "2. Start the daemon: nohup ./zone-database-client.sh daemon > /dev/null 2>&1 &",
          "3. Check database connection and environment variables",
          "4. Verify Supabase service role key is correct"
        ]
      }, { status: 503 });
    }

    // Transform data to match expected format
    const zoneData: { [key: string]: any } = {};
    const now = new Date();
    
    for (const zone of zones) {
      const lastChecked = new Date(zone.last_checked_at);
      const ageSeconds = Math.floor((now.getTime() - lastChecked.getTime()) / 1000);
      
      zoneData[zone.zone_key] = {
        name: zone.zone_name,
        status: zone.status,
        last_checked: zone.last_checked_at
      };
    }

    // Check if data is fresh (within last 30 seconds)
    const oldestCheck = zones.reduce((oldest, zone) => {
      const zoneTime = new Date(zone.last_checked_at).getTime();
      return zoneTime < oldest ? zoneTime : oldest;
    }, now.getTime());
    
    const dataAge = Math.floor((now.getTime() - oldestCheck) / 1000);
    const isStale = dataAge > 30;

    if (isStale) {
      return NextResponse.json({ 
        success: false, 
        error: `Zone status is stale (${dataAge}s old). Check zone-database-client.sh daemon.`,
        data: zoneData,
        troubleshooting: [
          "1. Check if zone-database-client.sh is running: ps aux | grep zone-database-client",
          "2. Restart the daemon: ./zone-database-client.sh restart",
          "3. Check logs for errors: tail -f /root/Infantry/logs/zone-database-client.log",
          "4. Verify database connection and credentials"
        ]
      }, { status: 503 });
    }

    return NextResponse.json({ 
      success: true, 
      data: zoneData,
      timestamp: new Date().toISOString(),
      data_age_seconds: dataAge
    });

  } catch (error) {
    console.error('Zone status GET error:', error);
    return NextResponse.json({ 
      success: false, 
      error: 'Internal server error' 
    }, { status: 500 });
  }
}

// POST - Send zone command via database
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

    // Check if user is admin or zone admin
    if (!(await isUserZoneAdmin(user.id))) {
      return NextResponse.json({ error: 'Zone admin access required' }, { status: 403 });
    }

    const { action, zone } = await request.json();

    if (!action || !zone) {
      return NextResponse.json({ 
        success: false, 
        error: 'Missing action or zone parameter' 
      }, { status: 400 });
    }

    if (!['start', 'stop', 'restart'].includes(action)) {
      return NextResponse.json({ 
        success: false, 
        error: 'Invalid action. Must be start, stop, or restart' 
      }, { status: 400 });
    }

    // Insert command into database for zone script to pick up
    const { data: command, error: commandError } = await supabase
      .from('zone_commands')
      .insert({
        zone_key: zone,
        action: action,
        requested_by: user.id,
        status: 'pending'
      })
      .select()
      .single();

    if (commandError) {
      console.error('Error inserting zone command:', commandError);
      return NextResponse.json({ 
        success: false, 
        error: 'Failed to queue zone command' 
      }, { status: 500 });
    }

    console.log(`✅ Zone command queued: ${action} ${zone} (ID: ${command.id})`);

    // Wait for command completion (poll for up to 30 seconds)
    const maxWaitTime = 30 * 1000; // 30 seconds
    const pollInterval = 500; // 500ms
    const startTime = Date.now();

    while (Date.now() - startTime < maxWaitTime) {
      const { data: updatedCommand, error: pollError } = await supabase
        .from('zone_commands')
        .select('status, result_message, processed_at')
        .eq('id', command.id)
        .single();

      if (pollError) {
        console.error('Error polling command status:', pollError);
        break;
      }

      if (updatedCommand.status === 'completed') {
        // Log successful action
        try {
          await supabase.from('admin_logs').insert({
            action: `zone_${action}`,
            details: `${action.toUpperCase()} ${zone}: ${updatedCommand.result_message} (database)`,
            admin_id: user.id,
            timestamp: new Date().toISOString()
          });
        } catch (logError) {
          console.error('Failed to log admin action:', logError);
        }

        return NextResponse.json({
          success: true,
          message: updatedCommand.result_message || `Zone ${action} completed successfully`,
          action,
          zone,
          processed_at: updatedCommand.processed_at
        });
      }

      if (updatedCommand.status === 'failed') {
        return NextResponse.json({
          success: false,
          error: updatedCommand.result_message || `Zone ${action} failed`,
          action,
          zone,
          processed_at: updatedCommand.processed_at
        });
      }

      // Wait before next poll
      await new Promise(resolve => setTimeout(resolve, pollInterval));
    }

    // Command timed out
    return NextResponse.json({
      success: false,
      error: `Zone ${action} command timed out. The zone daemon may not be running.`,
      troubleshooting: [
        "1. Check if zone-database-client.sh is running: ps aux | grep zone-database-client",
        "2. Start the daemon: nohup ./zone-database-client.sh daemon > /dev/null 2>&1 &",
        "3. Check logs: tail -f /root/Infantry/logs/zone-database-client.log",
        "4. Verify database permissions and connection"
      ]
    }, { status: 408 });

  } catch (error) {
    console.error('Zone command POST error:', error);
    return NextResponse.json({ 
      success: false, 
      error: 'Internal server error' 
    }, { status: 500 });
  }
} 