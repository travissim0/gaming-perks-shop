import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const STATUS_DIR = '/var/www/gaming-perks-shop/zone-status';
const ZONES_FILE = path.join(STATUS_DIR, 'zones.json');
const COMMANDS_DIR = path.join(STATUS_DIR, 'commands');
const RESULTS_DIR = path.join(STATUS_DIR, 'results');

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

// Read zone status from file
function readZoneStatus() {
  try {
    if (!fs.existsSync(ZONES_FILE)) {
      return {
        success: false,
        error: 'Zone status file not found. Is the zone-status-writer.sh daemon running?',
        data: {}
      };
    }

    const data = JSON.parse(fs.readFileSync(ZONES_FILE, 'utf8'));
    
    // Check if data is recent (within last 30 seconds)
    const lastUpdate = new Date(data.timestamp);
    const now = new Date();
    const ageSeconds = (now.getTime() - lastUpdate.getTime()) / 1000;
    
    if (ageSeconds > 30) {
      return {
        success: false,
        error: `Zone status is stale (${Math.round(ageSeconds)}s old). Check zone-status-writer.sh daemon.`,
        data: data.zones || {}
      };
    }
    
    return {
      success: true,
      data: data.zones || {},
      timestamp: data.timestamp,
      age_seconds: Math.round(ageSeconds)
    };
  } catch (error) {
    console.error('Error reading zone status:', error);
    return {
      success: false,
      error: `Failed to read zone status: ${error instanceof Error ? error.message : 'Unknown error'}`,
      data: {}
    };
  }
}

// Write command file for zone action
function writeZoneCommand(action: string, zone: string) {
  const commandId = randomUUID();
  const commandFile = path.join(COMMANDS_DIR, `${commandId}.json`);
  
  try {
    // Ensure commands directory exists
    if (!fs.existsSync(COMMANDS_DIR)) {
      fs.mkdirSync(COMMANDS_DIR, { recursive: true });
    }
    
    const command = {
      id: commandId,
      action,
      zone,
      timestamp: new Date().toISOString(),
      status: 'pending'
    };
    
    fs.writeFileSync(commandFile, JSON.stringify(command, null, 2));
    return { success: true, commandId };
  } catch (error) {
    console.error('Error writing command file:', error);
    return { 
      success: false, 
      error: `Failed to write command: ${error instanceof Error ? error.message : 'Unknown error'}` 
    };
  }
}

// Read command result
function readCommandResult(commandId: string, timeoutMs = 30000) {
  return new Promise((resolve) => {
    const resultFile = path.join(RESULTS_DIR, `${commandId}.json`);
    const startTime = Date.now();
    
    const checkResult = () => {
      try {
        if (fs.existsSync(resultFile)) {
          const result = JSON.parse(fs.readFileSync(resultFile, 'utf8'));
          // Clean up result file
          fs.unlinkSync(resultFile);
          resolve(result);
          return;
        }
        
        // Check for timeout
        if (Date.now() - startTime > timeoutMs) {
          resolve({
            success: false,
            error: 'Command timeout - zone daemon may not be running'
          });
          return;
        }
        
        // Check again in 500ms
        setTimeout(checkResult, 500);
      } catch (error) {
        resolve({
          success: false,
          error: `Error reading result: ${error instanceof Error ? error.message : 'Unknown error'}`
        });
      }
    };
    
    checkResult();
  });
}

// GET - Get zone status
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

    const status = readZoneStatus();
    
    if (!status.success) {
      return NextResponse.json({ 
        success: false, 
        error: status.error,
        fallback_data: status.data,
        troubleshooting: [
          "1. Check if zone-status-writer.sh is running: ps aux | grep zone-status-writer",
          "2. Run setup: ./zone-status-writer.sh setup",
          "3. Start daemon: nohup ./zone-status-writer.sh daemon > /dev/null 2>&1 &",
          "4. Check logs: tail -f /root/Infantry/logs/zone-status-writer.log"
        ]
      }, { status: 503 });
    }

    return NextResponse.json({ 
      success: true, 
      data: status.data,
      timestamp: status.timestamp,
      age_seconds: status.age_seconds
    });

  } catch (error) {
    console.error('Zone status GET error:', error);
    return NextResponse.json({ 
      success: false, 
      error: 'Internal server error' 
    }, { status: 500 });
  }
}

// POST - Execute zone actions via file communication
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

    const body = await request.json();
    const { action, zone } = body;

    if (!action || !zone) {
      return NextResponse.json({ 
        success: false, 
        error: 'Action and zone are required' 
      }, { status: 400 });
    }

    if (!['start', 'stop', 'restart'].includes(action)) {
      return NextResponse.json({ 
        success: false, 
        error: 'Invalid action. Must be start, stop, or restart' 
      }, { status: 400 });
    }

    // Write command file
    const commandResult = writeZoneCommand(action, zone);
    if (!commandResult.success) {
      return NextResponse.json({ 
        success: false, 
        error: commandResult.error 
      }, { status: 500 });
    }

    // Wait for result (with timeout)
    console.log(`⏳ Waiting for zone ${action} command to complete...`);
    const result = await readCommandResult(commandResult.commandId!) as any;

    // Log the admin action
    try {
      await supabase
        .from('admin_logs')
        .insert({
          admin_id: user.id,
          action: `zone_${action}`,
          details: `${action.toUpperCase()} zone: ${zone} (file-based)`,
          timestamp: new Date().toISOString()
        });
    } catch (logError) {
      console.error('Failed to log admin action:', logError);
    }

    if (result.success) {
      return NextResponse.json({ 
        success: true, 
        message: result.message,
        action,
        zone,
        method: 'file-based',
        timestamp: new Date().toISOString()
      });
    } else {
      return NextResponse.json({ 
        success: false, 
        error: result.error || 'Zone action failed',
        troubleshooting: [
          "1. Check if zone-status-writer.sh daemon is running",
          "2. Check daemon logs: tail -f /root/Infantry/logs/zone-status-writer.log",
          "3. Restart daemon if needed: pkill -f zone-status-writer.sh && nohup ./zone-status-writer.sh daemon > /dev/null 2>&1 &"
        ]
      }, { status: 500 });
    }

  } catch (error) {
    console.error('Zone action POST error:', error);
    return NextResponse.json({ 
      success: false, 
      error: 'Internal server error' 
    }, { status: 500 });
  }
} 