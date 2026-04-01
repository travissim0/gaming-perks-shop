import { NextRequest, NextResponse } from 'next/server';
import { getServiceSupabase } from '@/lib/supabase';
import { verifyAdminAccess } from '@/utils/adminAuth';

export const dynamic = 'force-dynamic';

// GET: Fetch all signups (admin only)
export async function GET(request: NextRequest) {
  const authResult = await verifyAdminAccess(request);
  if ('error' in authResult) {
    return NextResponse.json({ error: authResult.error }, { status: authResult.status });
  }

  try {
    const supabase = getServiceSupabase();
    const { data, error } = await supabase
      .from('launch_signups')
      .select('id, email, in_game_alias, notify_by_email, ip_address, created_at')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Fetch launch signups error:', error);
      return NextResponse.json({ error: 'Failed to fetch signups' }, { status: 500 });
    }

    return NextResponse.json({ signups: data || [] });
  } catch (error) {
    console.error('Admin launch signups error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// DELETE: Remove a signup (admin only)
export async function DELETE(request: NextRequest) {
  const authResult = await verifyAdminAccess(request);
  if ('error' in authResult) {
    return NextResponse.json({ error: authResult.error }, { status: authResult.status });
  }

  try {
    const { id } = await request.json();
    if (!id) {
      return NextResponse.json({ error: 'Missing signup id' }, { status: 400 });
    }

    const supabase = getServiceSupabase();
    const { error } = await supabase
      .from('launch_signups')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('Delete launch signup error:', error);
      return NextResponse.json({ error: 'Failed to delete' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Admin delete signup error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
