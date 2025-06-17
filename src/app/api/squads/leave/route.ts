import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(request: NextRequest) {
  try {
    const { squadId, playerId } = await request.json();

    if (!squadId || !playerId) {
      return NextResponse.json(
        { error: 'Squad ID and Player ID are required' },
        { status: 400 }
      );
    }

    // First verify the user is actually in the squad
    const { data: memberCheck, error: checkError } = await supabase
      .from('squad_members')
      .select('id, role')
      .eq('squad_id', squadId)
      .eq('player_id', playerId)
      .single();

    if (checkError || !memberCheck) {
      return NextResponse.json(
        { error: 'Player is not a member of this squad' },
        { status: 404 }
      );
    }

    // If they're a captain, check if there are other leaders
    if (memberCheck.role === 'captain') {
      const { data: otherLeaders, error: leadersError } = await supabase
        .from('squad_members')
        .select('id')
        .eq('squad_id', squadId)
        .neq('player_id', playerId)
        .in('role', ['captain', 'co_captain']);

      if (leadersError) {
        console.error('Error checking other leaders:', leadersError);
        return NextResponse.json(
          { error: 'Failed to verify squad leadership' },
          { status: 500 }
        );
      }

      if (!otherLeaders || otherLeaders.length === 0) {
        return NextResponse.json(
          { error: 'Captains cannot leave squad without appointing a successor' },
          { status: 400 }
        );
      }
    }

    // Remove the member from the squad
    const { error: deleteError } = await supabase
      .from('squad_members')
      .delete()
      .eq('squad_id', squadId)
      .eq('player_id', playerId);

    if (deleteError) {
      console.error('Error removing squad member:', deleteError);
      return NextResponse.json(
        { error: 'Failed to leave squad' },
        { status: 500 }
      );
    }

    // Event logging is handled automatically by the database trigger
    // No need to manually log here to avoid duplicates

    return NextResponse.json(
      { success: true, message: 'Successfully left squad' },
      { status: 200 }
    );

  } catch (error: any) {
    console.error('Error in leave squad API:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
} 