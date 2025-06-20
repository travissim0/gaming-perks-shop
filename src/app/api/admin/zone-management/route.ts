import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Script path - since we're on the same server, we can execute directly
const SCRIPT_PATH = '/root/Infantry/scripts/zone-manager.sh';

// Function to check if user is admin
async function isUserAdmin(userId: string): Promise<boolean> {
  try {
    const { data: profile } = await supabase
      .from('profiles')
      .select('is_admin')
      .eq('id', userId)
      .single();
    
    return profile?.is_admin || false;
  } catch (error) {
    console.error('Error checking admin status:', error);
    return false;
  }
}

// Function to execute local command
async function executeCommand(command: string): Promise<{ success: boolean; output: string; error?: string }> {
  try {
    console.log('Executing command:', command);
    
    const { stdout, stderr } = await execAsync(command, { 
      timeout: 30000,
      cwd: '/root/Infantry/scripts' // Set working directory
    });
    
    if (stderr && !stderr.includes('Warning:')) {
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

    // Check if user is admin
    if (!(await isUserAdmin(user.id))) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
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

    // Check if user is admin
    if (!(await isUserAdmin(user.id))) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
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