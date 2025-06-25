import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const zoneName = searchParams.get('zone');

    if (!zoneName) {
      return NextResponse.json({ error: 'Zone name is required' }, { status: 400 });
    }

    // Call the database function to get heatmap data
    const { data, error } = await supabase
      .rpc('get_zone_availability_heatmap', { zone_name_param: zoneName });

    if (error) {
      console.error('Error fetching heatmap data:', error);
      return NextResponse.json({ error: 'Failed to fetch heatmap data' }, { status: 500 });
    }

    return NextResponse.json(data || []);
  } catch (error) {
    console.error('Error in heatmap API:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
} 