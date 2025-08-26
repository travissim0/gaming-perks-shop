import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Service client for admin operations
const serviceSupabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Regular client for auth
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export async function POST(request: NextRequest) {
  try {
    // Get the authorization header
    const authHeader = request.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const token = authHeader.split(' ')[1];
    
    // Verify the user with the token
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check if user is admin
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('is_admin, ctf_role')
      .eq('id', user.id)
      .single();

    if (profileError || (!profile?.is_admin && profile?.ctf_role !== 'ctf_admin')) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    const body = await request.json();
    const { teamName, newPassword } = body;

    // Validate required fields
    if (!teamName || !newPassword) {
      return NextResponse.json(
        { error: 'Team name and new password are required' },
        { status: 400 }
      );
    }

    if (newPassword.length < 6) {
      return NextResponse.json(
        { error: 'Password must be at least 6 characters' },
        { status: 400 }
      );
    }

    // Find the team
    const { data: team, error: findError } = await serviceSupabase
      .from('tt_teams')
      .select('id, team_name, owner_id')
      .eq('team_name', teamName)
      .single();

    if (findError || !team) {
      return NextResponse.json(
        { error: `Team "${teamName}" not found` },
        { status: 404 }
      );
    }

    // Update the password (the database trigger will automatically hash it)
    const { error: updateError } = await serviceSupabase
      .from('tt_teams')
      .update({ 
        team_password_hash: newPassword,
        updated_at: new Date().toISOString()
      })
      .eq('id', team.id);

    if (updateError) {
      console.error('Error updating team password:', updateError);
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      message: `Password updated successfully for team "${teamName}"`,
      teamId: team.id
    });

  } catch (error: any) {
    console.error('Error in update-team-password:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
