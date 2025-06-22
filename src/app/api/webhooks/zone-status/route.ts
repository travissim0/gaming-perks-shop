import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const WEBHOOK_SECRET = process.env.ZONE_WEBHOOK_SECRET || 'your-secret-key-here';

// In-memory store for zone status and pending commands
let zoneStatusCache: any = {
  zones: {},
  timestamp: null,
  last_update: null
};

let pendingCommands: Array<{
  id: string;
  action: string;
  zone: string;
  timestamp: string;
  admin_id?: string;
}> = [];

// Helper to verify webhook signature
function verifySignature(payload: string, signature: string): boolean {
  try {
    if (!signature.startsWith('sha256=')) {
      return false;
    }
    
    const expectedSignature = crypto
      .createHmac('sha256', WEBHOOK_SECRET)
      .update(payload)
      .digest('base64');
    
    const providedSignature = signature.substring(7); // Remove 'sha256=' prefix
    
    return crypto.timingSafeEqual(
      Buffer.from(expectedSignature, 'base64'),
      Buffer.from(providedSignature, 'base64')
    );
  } catch (error) {
    console.error('Error verifying webhook signature:', error);
    return false;
  }
}

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

// POST - Receive webhook data from zone script
export async function POST(request: NextRequest) {
  try {
    const body = await request.text();
    const signature = request.headers.get('x-zone-signature');
    const source = request.headers.get('x-zone-source');
    
    if (!signature) {
      return NextResponse.json({ error: 'Missing signature' }, { status: 401 });
    }
    
    if (!verifySignature(body, signature)) {
      console.error('Invalid webhook signature');
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
    }
    
    const payload = JSON.parse(body);
    console.log('📡 Received zone webhook from:', source, 'Type:', payload.type || 'status');
    
    // Handle different webhook types
    switch (payload.type) {
      case 'test':
        console.log('🧪 Test webhook received:', payload.message);
        return NextResponse.json({ 
          success: true, 
          message: 'Test webhook received successfully',
          timestamp: new Date().toISOString()
        });
        
      case 'zone_action_result':
        console.log(`✅ Zone action result: ${payload.action} on ${payload.zone} - ${payload.success ? 'Success' : 'Failed'}`);
        
        // Log the action result
        try {
          await supabase
            .from('admin_logs')
            .insert({
              action: `zone_${payload.action}_result`,
              details: `${payload.action.toUpperCase()} ${payload.zone}: ${payload.message} (webhook)`,
              timestamp: payload.timestamp
            });
        } catch (logError) {
          console.error('Failed to log zone action result:', logError);
        }
        
        return NextResponse.json({ 
          success: true, 
          message: 'Action result received',
          commands: [] // No new commands for action results
        });
        
      default:
        // Regular zone status update
        if (payload.zones) {
          zoneStatusCache = {
            zones: payload.zones,
            timestamp: payload.timestamp,
            last_update: new Date().toISOString(),
            hostname: payload.hostname,
            source: payload.source
          };
          
          console.log(`📊 Zone status updated: ${Object.keys(payload.zones).length} zones`);
          
          // Return any pending commands for this check
          const commandsToReturn = [...pendingCommands];
          pendingCommands = []; // Clear pending commands
          
          return NextResponse.json({ 
            success: true, 
            message: 'Zone status received',
            commands: commandsToReturn,
            zones_count: Object.keys(payload.zones).length
          });
        } else {
          return NextResponse.json({ error: 'Invalid payload format' }, { status: 400 });
        }
    }
    
  } catch (error) {
    console.error('Zone webhook error:', error);
    return NextResponse.json({ 
      success: false, 
      error: 'Internal server error' 
    }, { status: 500 });
  }
}

// GET - Get current zone status (for web app) or return pending commands (for script)
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const action = searchParams.get('action');
    const signature = request.headers.get('x-zone-signature');
    const source = request.headers.get('x-zone-source');
    
    // If this is a request for commands from the zone script
    if (action === 'get_commands' && signature && source) {
      if (!verifySignature('ping', signature)) {
        return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
      }
      
      return NextResponse.json({
        commands: pendingCommands,
        timestamp: new Date().toISOString()
      });
    }
    
    // Otherwise, this is a web app request for zone status
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

    // Check if we have recent zone data
    if (!zoneStatusCache.timestamp) {
      return NextResponse.json({ 
        success: false, 
        error: 'No zone data available. Is the zone webhook client running?',
        troubleshooting: [
          "1. Check if zone-webhook-client.sh is running on your server",
          "2. Verify webhook URL and secret are configured correctly",
          "3. Test webhook: ./zone-webhook-client.sh test",
          "4. Check webhook logs: tail -f /root/Infantry/logs/zone-webhook-client.log"
        ],
        data: {}
      }, { status: 503 });
    }
    
    // Check if data is recent (within last 60 seconds for webhooks)
    const lastUpdate = new Date(zoneStatusCache.timestamp);
    const now = new Date();
    const ageSeconds = (now.getTime() - lastUpdate.getTime()) / 1000;
    
    if (ageSeconds > 60) {
      return NextResponse.json({ 
        success: false, 
        error: `Zone data is stale (${Math.round(ageSeconds)}s old). Check webhook client.`,
        fallback_data: zoneStatusCache.zones,
        last_update: zoneStatusCache.last_update,
        data: zoneStatusCache.zones
      }, { status: 503 });
    }
    
    return NextResponse.json({ 
      success: true, 
      data: zoneStatusCache.zones,
      timestamp: zoneStatusCache.timestamp,
      age_seconds: Math.round(ageSeconds),
      source: zoneStatusCache.source,
      hostname: zoneStatusCache.hostname,
      method: 'webhook'
    });

  } catch (error) {
    console.error('Zone status GET error:', error);
    return NextResponse.json({ 
      success: false, 
      error: 'Internal server error' 
    }, { status: 500 });
  }
}

// PUT - Queue zone actions for the script to pick up
export async function PUT(request: NextRequest) {
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

    // Add command to pending queue
    const command = {
      id: crypto.randomUUID(),
      action,
      zone,
      timestamp: new Date().toISOString(),
      admin_id: user.id
    };
    
    pendingCommands.push(command);
    
    console.log(`📋 Queued zone command: ${action} on ${zone} (ID: ${command.id})`);
    
    // Log the admin action
    try {
      await supabase
        .from('admin_logs')
        .insert({
          admin_id: user.id,
          action: `zone_${action}_queued`,
          details: `Queued ${action.toUpperCase()} for zone: ${zone} (webhook)`,
          timestamp: new Date().toISOString()
        });
    } catch (logError) {
      console.error('Failed to log admin action:', logError);
    }

    return NextResponse.json({ 
      success: true, 
      message: `Zone ${action} command queued successfully`,
      command_id: command.id,
      action,
      zone,
      method: 'webhook-queue',
      note: 'Command will be executed when zone client next checks for commands',
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Zone action PUT error:', error);
    return NextResponse.json({ 
      success: false, 
      error: 'Internal server error' 
    }, { status: 500 });
  }
} 