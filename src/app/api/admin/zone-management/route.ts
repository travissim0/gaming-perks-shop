import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { exec } from 'child_process';
import { promisify } from 'util';
import os from 'os';
import { supabase } from '@/lib/supabase';

const execAsync = promisify(exec);

const supabaseClient = createClient(
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
const SCRIPT_PATH = '/var/www/gaming-perks-shop/zone-manager.sh';

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
    const { data: profile } = await supabaseClient
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
    let args: string[] = [];
    let execOptions: any = { 
      timeout: 90000, // Increased to 90 seconds
      env: { 
        ...process.env,
        PATH: '/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin'
      }
    };
    
    if (IS_LOCAL) {
      // Running locally, use SSH to connect to remote server
      console.log('🔗 Local/SSH mode - connecting to', SERVER_HOST);
      // Use `bash -l -c` to ensure a login shell is used, which loads the environment.
      fullCommand = `ssh -i "${SSH_KEY_PATH}" -o StrictHostKeyChecking=no -o ConnectTimeout=10 ${SERVER_USER}@${SERVER_HOST} "bash -l -c '${command}'"`;
      args = [];
    } else {
      // Running on the server, execute script directly (no SSH)
      console.log('🖥️ Server mode - executing script directly');
      console.log('📂 Script path:', SCRIPT_PATH);
      console.log('📁 Working directory:', '/var/www/gaming-perks-shop');
      
      // Check if script exists and is executable before running
      const fs = require('fs');
      if (!fs.existsSync(SCRIPT_PATH)) {
        return { success: false, output: '', error: `Script not found at ${SCRIPT_PATH}` };
      }
      
      try {
        fs.accessSync(SCRIPT_PATH, fs.constants.F_OK | fs.constants.X_OK);
      } catch (permError) {
        return { success: false, output: '', error: `Script at ${SCRIPT_PATH} is not executable. Please run: chmod +x ${SCRIPT_PATH}` };
      }
      
      // Use spawn for better process control
      const commandParts = command.split(' ');
      const scriptPath = commandParts[0];
      const scriptArgs = commandParts.slice(1);
      
      console.log('📋 Executing with spawn:', { scriptPath, args: scriptArgs });
      
      return new Promise((resolve) => {
        const { spawn } = require('child_process');
        const child = spawn('bash', [scriptPath, ...scriptArgs], {
          stdio: ['ignore', 'pipe', 'pipe'],
          cwd: '/var/www/gaming-perks-shop',
          env: {
            ...process.env,
            PATH: '/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin'
          },
          detached: false // Don't detach to ensure proper cleanup
        });
        
        let stdout = '';
        let stderr = '';
        let timedOut = false;
        let completed = false;
        
        // Set up timeout with proper cleanup
        const timeout = setTimeout(() => {
          if (!completed) {
            timedOut = true;
            console.log('⏰ Command timed out, terminating process...');
            
            // Try graceful termination first
            child.kill('SIGTERM');
            
            // Force kill after 5 seconds if still running
            setTimeout(() => {
              if (!completed) {
                console.log('🔨 Force killing process...');
                child.kill('SIGKILL');
              }
            }, 5000);
          }
        }, 90000); // 90 second timeout
        
                 child.stdout?.on('data', (data: any) => {
           stdout += data.toString();
         });
         
         child.stderr?.on('data', (data: any) => {
           stderr += data.toString();
         });
         
         child.on('close', (code: number | null, signal: NodeJS.Signals | null) => {
          if (completed) return;
          completed = true;
          clearTimeout(timeout);
          
          console.log(`📤 Process closed with code: ${code}, signal: ${signal}`);
          console.log(`📤 Stdout length: ${stdout.length}, Stderr length: ${stderr.length}`);
          
          if (timedOut) {
            resolve({
              success: false,
              output: '',
              error: 'Command execution timed out after 90 seconds'
            });
            return;
          }
          
          if (code !== 0 && !signal) {
            resolve({
              success: false,
              output: '',
              error: `Script exited with code ${code}: ${stderr.trim() || 'No error message'}`
            });
            return;
          }
          
          if (signal && signal !== 'SIGTERM') {
            resolve({
              success: false,
              output: '',
              error: `Script terminated with signal ${signal}`
            });
            return;
          }
          
          const output = stdout.trim();
          
          // Validate JSON output for status-all commands
          if (command.includes('status-all') && output.length > 0) {
            try {
              JSON.parse(output);
              console.log('✅ Valid JSON output confirmed');
            } catch (parseError) {
              console.error('❌ Invalid JSON output:', output.substring(0, 200));
              resolve({
                success: false,
                output: '',
                error: 'Script returned invalid JSON'
              });
              return;
            }
          }
          
          resolve({ success: true, output });
        });
        
                 child.on('error', (error: Error) => {
           if (completed) return;
           completed = true;
           clearTimeout(timeout);
           
           console.error('💥 Process error:', error);
           resolve({
             success: false,
             output: '',
             error: `Process error: ${error.message}`
           });
         });
         
         // Handle process exit
         child.on('exit', (code: number | null, signal: NodeJS.Signals | null) => {
           console.log(`🚪 Process exited with code: ${code}, signal: ${signal}`);
         });
      });
    }
    
    // Fallback to execAsync for SSH mode
    console.log('📋 Executing command with execAsync:', fullCommand);
    
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
export async function GET() {
  try {
    // Get current zone status
    const { data: status, error } = await supabase
      .from('zone_status')
      .select('*')
      .eq('id', 'current')
      .single();

    if (error && error.code !== 'PGRST116') { // PGRST116 = no rows
      console.error('Zone status query error:', error);
      throw error;
    }

    if (!status) {
      return NextResponse.json({
        success: false,
        error: 'No zone status found. Check if zone-database-client.sh daemon is running.',
        zones: {},
        last_update: null,
        hostname: null
      });
    }

    // Check if status is stale (older than 60 seconds)
    const lastUpdate = new Date(status.last_update);
    const now = new Date();
    const ageSeconds = Math.floor((now.getTime() - lastUpdate.getTime()) / 1000);
    
    if (ageSeconds > 60) {
      return NextResponse.json({
        success: false,
        error: `Zone status is stale (${ageSeconds}s old). Check zone-database-client.sh daemon.`,
        zones: status.zones_data || {},
        last_update: status.last_update,
        hostname: status.hostname,
        age_seconds: ageSeconds
      });
    }

    return NextResponse.json({
      success: true,
      zones: status.zones_data || {},
      last_update: status.last_update,
      hostname: status.hostname,
      age_seconds: ageSeconds
    });
  } catch (error) {
    console.error('Zone status error:', error);
    return NextResponse.json({ 
      success: false, 
      error: 'Failed to get zone status: ' + (error as Error).message 
    }, { status: 500 });
  }
}

// POST - Execute zone actions (start, stop, restart)
export async function POST(request: NextRequest) {
  try {
    const { action, zone, admin_id } = await request.json();

    if (!['start', 'stop', 'restart'].includes(action)) {
      return NextResponse.json({ success: false, error: 'Invalid action' }, { status: 400 });
    }

    if (!zone) {
      return NextResponse.json({ success: false, error: 'Zone name required' }, { status: 400 });
    }

    // Insert command for the daemon to pick up
    const { data, error } = await supabase
      .from('zone_commands')
      .insert({
        action,
        zone,
        admin_id: admin_id || null,
        status: 'pending'
      })
      .select()
      .single();

    if (error) {
      console.error('Zone command insert error:', error);
      throw error;
    }

    return NextResponse.json({
      success: true,
      command_id: data.id,
      message: `${action} command queued for zone ${zone}`
    });
  } catch (error) {
    console.error('Zone command error:', error);
    return NextResponse.json({ 
      success: false, 
      error: 'Failed to queue command: ' + (error as Error).message 
    }, { status: 500 });
  }
} 