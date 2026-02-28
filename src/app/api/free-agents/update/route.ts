import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';

// Service role client for bypassing RLS
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function PUT(request: NextRequest) {
  try {
    // Verify authorization
    const authHeader = request.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const token = authHeader.split(' ')[1];
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();

    // Validate required fields
    if (!body.preferred_roles || !Array.isArray(body.preferred_roles) || body.preferred_roles.length === 0) {
      return NextResponse.json({ error: 'At least one preferred role is required' }, { status: 400 });
    }

    // Update the free agent record — only update rows belonging to this user
    const { data, error } = await supabaseAdmin
      .from('free_agents')
      .update({
        preferred_roles: body.preferred_roles,
        secondary_roles: body.secondary_roles || [],
        availability: body.availability || '',
        availability_days: body.availability_days || [],
        availability_times: body.availability_times || {},
        skill_level: body.skill_level || 'intermediate',
        class_ratings: body.class_ratings || {},
        classes_to_try: body.classes_to_try || [],
        notes: body.notes || null,
        contact_info: body.contact_info || null,
        timezone: body.timezone || 'America/New_York',
      })
      .eq('player_id', user.id)
      .eq('is_active', true)
      .select();

    if (error) {
      console.error('Error updating free agent:', error);
      return NextResponse.json({ error: 'Failed to update free agent info' }, { status: 500 });
    }

    if (!data || data.length === 0) {
      return NextResponse.json({ error: 'No active free agent record found for this user' }, { status: 404 });
    }

    return NextResponse.json({ success: true, data: data[0] });
  } catch (error: any) {
    console.error('Free agent update API error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
