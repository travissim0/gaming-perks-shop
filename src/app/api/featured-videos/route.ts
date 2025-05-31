import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function GET(request: NextRequest) {
  try {
    console.log('🎬 Featured videos API called');

    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get('limit') || '6');

    // Call the get_featured_videos function
    const { data, error } = await supabase
      .rpc('get_featured_videos', { limit_count: limit });

    if (error) {
      console.error('❌ Supabase error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    console.log('✅ Featured videos fetched:', data?.length || 0);
    
    return NextResponse.json({
      videos: data || [],
      count: data?.length || 0
    });

  } catch (error) {
    console.error('❌ Featured videos API error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
} 