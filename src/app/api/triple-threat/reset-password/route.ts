import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function POST(request: NextRequest) {
  try {
    const { teamId, newPassword } = await request.json();

    if (!teamId || !newPassword) {
      return NextResponse.json(
        { success: false, message: 'Team ID and new password are required' },
        { status: 400 }
      );
    }

    if (newPassword.length < 6) {
      return NextResponse.json(
        { success: false, message: 'Password must be at least 6 characters' },
        { status: 400 }
      );
    }

    // Get current user
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json(
        { success: false, message: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Check if user is the team owner
    const { data: team, error: teamError } = await supabase
      .from('tt_teams')
      .select('owner_id, team_name')
      .eq('id', teamId)
      .eq('is_active', true)
      .single();

    if (teamError || !team) {
      return NextResponse.json(
        { success: false, message: 'Team not found' },
        { status: 404 }
      );
    }

    if (team.owner_id !== user.id) {
      return NextResponse.json(
        { success: false, message: 'Only team owners can reset passwords' },
        { status: 403 }
      );
    }

    // Update password (will be encrypted by database trigger)
    const { error: updateError } = await supabase
      .from('tt_teams')
      .update({ 
        team_password_hash: newPassword,
        updated_at: new Date().toISOString()
      })
      .eq('id', teamId);

    if (updateError) {
      throw updateError;
    }

    return NextResponse.json({
      success: true,
      message: `Password reset successfully for team: ${team.team_name}`
    });

  } catch (error: any) {
    console.error('Error resetting team password:', error);
    return NextResponse.json(
      { success: false, message: 'Failed to reset password: ' + error.message },
      { status: 500 }
    );
  }
}
