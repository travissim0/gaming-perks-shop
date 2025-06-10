import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function POST(request: NextRequest) {
  try {
    const { userId } = await request.json();
    
    if (!userId) {
      return NextResponse.json(
        { error: 'User ID is required' },
        { status: 400 }
      );
    }

    // Update user's last seen timestamp
    const { error } = await supabase
      .from('profiles')
      .update({ 
        last_seen: new Date().toISOString() 
      })
      .eq('id', userId);

    if (error) {
      console.warn('Activity update error:', error.message);
      return NextResponse.json(
        { error: 'Failed to update activity' },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
    
  } catch (error: any) {
    console.error('Activity update error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
} 