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
// IS_LOCAL means we need SSH to connect to remote server
// If running on production server, we should execute commands directly
const IS_LOCAL = process.env.NODE_ENV === 'development' || 
                 process.env.ZONE_MANAGEMENT_MODE === 'ssh' ||
                 process.env.ZONE_MANAGEMENT_LOCAL === 'true';
const SERVER_HOST = process.env.INFANTRY_SERVER_HOST || 'linux-1.freeinfantry.com';
const SERVER_USER = process.env.INFANTRY_SERVER_USER || 'root';
const SSH_KEY_PATH = process.env.INFANTRY_SSH_KEY_PATH || `${os.homedir()}/.ssh/id_rsa`;
const SCRIPT_PATH = '/root/Infantry/scripts/zone-manager.sh';

// Debug logging
console.log('Zone Management Configuration:', {
  NODE_ENV: process.env.NODE_ENV,
  ZONE_MANAGEMENT_MODE: process.env.ZONE_MANAGEMENT_MODE,
  ZONE_MANAGEMENT_LOCAL: process.env.ZONE_MANAGEMENT_LOCAL,
  IS_LOCAL,
  hostname: os.hostname(),
  SERVER_HOST
});

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
    let execOptions: any = { 
      timeout: 60000,
      env: { ...process.env } // Inherit all environment variables
    };
    
    if (IS_LOCAL) {
      // Running locally, use SSH to connect to remote server
      console.log('🔗 Local/SSH mode - connecting to', SERVER_HOST);
      // Use `bash -l -c` to ensure a login shell is used, which loads the environment.
      fullCommand = `ssh -i "${SSH_KEY_PATH}" -o StrictHostKeyChecking=no -o ConnectTimeout=10 ${SERVER_USER}@${SERVER_HOST} "bash -l -c '${command}'"`;
    } else {
      // Running on the server, execute script directly (no SSH)
      console.log('🖥️ Server mode - executing script directly');
      fullCommand = `${command}`;
      // If the script relies on being in its own directory, set cwd instead of using an inline cd
      execOptions.cwd = '/root/Infantry/scripts';
    }
    
    console.log('📋 Executing command:', fullCommand);
    
    const { stdout, stderr } = await execAsync(fullCommand, execOptions);
    
    console.log('📤 Command stdout:', stdout);
    console.log('📤 Command stderr:', stderr);
    
    const stderrStr = stderr.toString();
    const stdoutStr = stdout.toString();
    
    // Only treat stderr as error if it contains actual error messages
    if (stderrStr && !stderrStr.includes('Warning:') && 
        !stderrStr.includes('Pseudo-terminal') && 
        !stderrStr.includes('Connection') &&
        !stderrStr.includes('Permanently added') &&
        stderrStr.trim().length > 0) {
      console.error('❌ Command stderr (treated as error):', stderrStr);
      return { success: false, output: '', error: stderrStr };
    }
    
    const output = stdoutStr.trim();
    console.log('✅ Command completed successfully, output length:', output.length);
    
    // Validate that we got JSON output for status-all commands
    if (command.includes('status-all') && output.length > 0) {
      try {
        JSON.parse(output);
        console.log('✅ Valid JSON output confirmed');
      } catch (parseError) {
        console.error('❌ Invalid JSON output:', output.substring(0, 200));
        return { success: false, output: '', error: 'Script returned invalid JSON' };
      }
    }
    
    return { success: true, output };
  } catch (error: any) {
    console.error('💥 Command execution failed:', {
      message: error.message,
      code: error.code,
      signal: error.signal,
      killed: error.killed,
      cmd: error.cmd
    });
    
    let errorMessage = error.message || 'Command execution failed';
    
    // Provide more specific error messages
    if (error.code === 'ENOENT') {
      errorMessage = IS_LOCAL ? 'SSH command not found or SSH key invalid' : 'Script not found on server';
    } else if (error.code === 'ETIMEDOUT') {
      errorMessage = IS_LOCAL ? 'SSH connection timeout' : 'Command execution timeout';
    } else if (error.signal === 'SIGTERM' || error.signal === 'SIGINT') {
      errorMessage = 'Command was terminated (likely timeout or permission issue)';
    }
    
    return { 
      success: false, 
      output: '', 
      error: errorMessage 
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
        const data = JSON.parse(result.output);
        return NextResponse.json({ success: true, data });
      } catch (e) {
        const errorMessage = e instanceof Error ? e.message : String(e);
        return NextResponse.json({ 
          success: false, 
          error: errorMessage 
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