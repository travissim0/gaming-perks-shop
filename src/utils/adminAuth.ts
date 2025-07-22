import { NextRequest } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Use service role client for admin operations
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export interface AdminAuthResult {
  success: boolean;
  user?: any;
  error?: string;
  statusCode?: number;
}

/**
 * Centralized admin authorization function
 * Use this in all admin endpoints to ensure consistent security
 */
export async function verifyAdminAccess(request: NextRequest): Promise<AdminAuthResult> {
  try {
    // Check for authorization header
    const authHeader = request.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return {
        success: false,
        error: 'Authorization header required',
        statusCode: 401
      };
    }

    // Extract and verify token
    const token = authHeader.split(' ')[1];
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
    
    if (authError || !user) {
      return {
        success: false,
        error: 'Invalid or expired token',
        statusCode: 401
      };
    }

    // Check admin privileges in database
    const { data: profile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select('is_admin, ctf_role, email, in_game_alias')
      .eq('id', user.id)
      .single();

    if (profileError) {
      console.error('Error checking admin privileges:', profileError);
      return {
        success: false,
        error: 'Failed to verify admin privileges',
        statusCode: 500
      };
    }

    if (!profile?.is_admin) {
      console.warn(`⚠️ Unauthorized admin access attempt by user: ${user.email || user.id}`);
      return {
        success: false,
        error: 'Admin privileges required',
        statusCode: 403
      };
    }

    console.log(`✅ Admin access granted to: ${user.email}`);
    return {
      success: true,
      user: {
        ...user,
        profile
      }
    };

  } catch (error: any) {
    console.error('Admin authorization error:', error);
    return {
      success: false,
      error: 'Authorization failed',
      statusCode: 500
    };
  }
}

/**
 * Verify zone admin access (admins + CTF staff)
 */
export async function verifyZoneAdminAccess(request: NextRequest): Promise<AdminAuthResult> {
  try {
    const authHeader = request.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return {
        success: false,
        error: 'Authorization header required',
        statusCode: 401
      };
    }

    const token = authHeader.split(' ')[1];
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
    
    if (authError || !user) {
      return {
        success: false,
        error: 'Invalid or expired token',
        statusCode: 401
      };
    }

    const { data: profile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select('is_admin, is_zone_admin, ctf_role, email, in_game_alias')
      .eq('id', user.id)
      .single();

    if (profileError) {
      console.error('Error checking zone admin privileges:', profileError);
      return {
        success: false,
        error: 'Failed to verify privileges',
        statusCode: 500
      };
    }

    const hasAccess = profile?.is_admin || 
                     profile?.is_zone_admin ||
                     profile?.ctf_role === 'ctf_admin' || 
                     profile?.ctf_role === 'ctf_head_referee';

    if (!hasAccess) {
      console.warn(`⚠️ Unauthorized zone admin access attempt by user: ${user.email || user.id}`);
      return {
        success: false,
        error: 'Zone admin privileges required',
        statusCode: 403
      };
    }

    console.log(`✅ Zone admin access granted to: ${user.email}`);
    return {
      success: true,
      user: {
        ...user,
        profile
      }
    };

  } catch (error: any) {
    console.error('Zone admin authorization error:', error);
    return {
      success: false,
      error: 'Authorization failed',
      statusCode: 500
    };
  }
}

/**
 * DEPRECATED: Remove hardcoded admin emails
 * This was a security risk - all admin checks should use database
 */
const DEPRECATED_FALLBACK_ADMIN_EMAILS = [
  // These should be removed from all endpoints
  'qwerty5544@aim.com',
  'travis@freeinf.org',
  'admin@freeinf.org'
];

/**
 * Log admin actions for audit trail
 */
export async function logAdminAction(
  adminId: string, 
  action: string, 
  details: string,
  ipAddress?: string
): Promise<void> {
  try {
    await supabaseAdmin
      .from('admin_logs')
      .insert({
        admin_id: adminId,
        action,
        details,
        ip_address: ipAddress ? '[REDACTED]' : null, // Don't store real IPs
        timestamp: new Date().toISOString()
      });
  } catch (error) {
    console.error('Failed to log admin action:', error);
    // Don't throw - logging failure shouldn't break the main operation
  }
}

export default {
  verifyAdminAccess,
  verifyZoneAdminAccess,
  logAdminAction
}; 