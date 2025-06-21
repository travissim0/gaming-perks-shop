import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { exec } from 'child_process';
import { promisify } from 'util';
import os from 'os';

const execAsync = promisify(exec);

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Configuration - check if we're running locally or on the server
const IS_LOCAL = process.env.NODE_ENV === 'development' || os.hostname() !== 'linux-1';
const SERVER_HOST = process.env.INFANTRY_SERVER_HOST || 'linux-1.freeinfantry.com';
const SERVER_USER = process.env.INFANTRY_SERVER_USER || 'root';
const SSH_KEY_PATH = process.env.INFANTRY_SSH_KEY_PATH || `${os.homedir()}/.ssh/id_rsa`;
const SCRIPT_PATH = '/root/Infantry/scripts/zone-manager.sh';

// Function to check if user is admin or zone admin
async function isUserZoneAdmin(userId: string): Promise<boolean> {
  try {
    const { data: profile } = await supabase
      .from('profiles')
      .select('is_admin, is_zone_admin')
      .eq('id', userId)
      .single();
    
    return profile?.is_admin || profile?.is_zone_admin || false;
  } catch (error) {
    console.error('Error checking admin status:', error);
    return false;
  }
}

// Function to execute command (local or remote)
async function executeCommand(command: string): Promise<{ success: boolean; output: string; error?: string }> {
  try {
    let fullCommand: string;
    
    if (IS_LOCAL) {
      // Running locally, use SSH to connect to remote server
      console.log('Local development mode - using SSH to connect to', SERVER_HOST);
      fullCommand = `ssh -i "${SSH_KEY_PATH}" -o StrictHostKeyChecking=no ${SERVER_USER}@${SERVER_HOST} "${command}"`;
    } else {
      // Running on the server, execute directly
      console.log('Server mode - executing command directly');
      fullCommand = command;
    }
    
    console.log('Executing command:', fullCommand);
    
    const { stdout, stderr } = await execAsync(fullCommand, { 
      timeout: 30000,
      cwd: IS_LOCAL ? undefined : '/root/Infantry/scripts'
    });
    
    if (stderr && !stderr.includes('Warning:') && !stderr.includes('Pseudo-terminal')) {
      console.error('Command stderr:', stderr);
      return { success: false, output: '', error: stderr };
    }
    
    console.log('Command output:', stdout.trim());
    return { success: true, output: stdout.trim() };
  } catch (error: any) {
    console.error('Command execution failed:', error);
    return { 
      success: false, 
      output: '', 
      error: error.message || 'Command execution failed' 
    };
  }
}

// GET - Get zone status or list zones
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

    const { searchParams } = new URL(request.url);
    const action = searchParams.get('action') || 'status-all';
    const zone = searchParams.get('zone');

    let command = `${SCRIPT_PATH} ${action}`;
    if (zone && action !== 'status-all' && action !== 'list') {
      command += ` ${zone}`;
    }

    const result = await executeCommand(command);
    
    if (!result.success) {
      return NextResponse.json({ 
        success: false, 
        error: result.error || 'Command execution failed' 
      }, { status: 500 });
    }

    // Parse the output based on action
    if (action === 'status-all') {
      try {
        const zones = JSON.parse(result.output);
        return NextResponse.json({ success: true, zones });
      } catch (parseError) {
        return NextResponse.json({ 
          success: false, 
          error: 'Failed to parse zone status' 
        }, { status: 500 });
      }
    }

    return NextResponse.json({ 
      success: true, 
      message: result.output,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Zone management GET error:', error);
    return NextResponse.json({ 
      success: false, 
      error: 'Internal server error' 
    }, { status: 500 });
  }
}

// POST - Execute zone actions (start, stop, restart)
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

    const command = `${SCRIPT_PATH} ${action} ${zone}`;
    const result = await executeCommand(command);
    
    if (!result.success) {
      return NextResponse.json({ 
        success: false, 
        error: result.error || result.output || 'Command execution failed' 
      }, { status: 500 });
    }

    // Log the admin action
    try {
      await supabase
        .from('admin_logs')
        .insert({
          admin_id: user.id,
          action: `zone_${action}`,
          details: `${action.toUpperCase()} zone: ${zone}`,
          timestamp: new Date().toISOString()
        });
    } catch (logError) {
      console.error('Failed to log admin action:', logError);
      // Don't fail the request if logging fails
    }

    return NextResponse.json({ 
      success: true, 
      message: result.output,
      action,
      zone,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Zone management POST error:', error);
    return NextResponse.json({ 
      success: false, 
      error: 'Internal server error' 
    }, { status: 500 });
  }
} 