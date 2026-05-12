import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

function getServiceSupabase() {
  return createClient(supabaseUrl, supabaseServiceKey);
}

// GET - fetch all feature media
export async function GET() {
  const supabase = getServiceSupabase();
  const { data, error } = await supabase
    .from('feature_media')
    .select('*')
    .order('sort_order', { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json(data || []);
}

// POST - add media to a feature (admin only)
export async function POST(req: NextRequest) {
  const supabase = getServiceSupabase();

  // Verify admin from auth header
  const authHeader = req.headers.get('authorization');
  if (!authHeader) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const token = authHeader.replace('Bearer ', '');
  const anonSupabase = createClient(supabaseUrl, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
  const { data: { user }, error: authError } = await anonSupabase.auth.getUser(token);
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Check admin
  const { data: profile } = await supabase
    .from('profiles')
    .select('is_admin')
    .eq('id', user.id)
    .single();

  if (!profile?.is_admin) {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
  }

  const body = await req.json();
  const { feature_id, media_type, src, alt, sort_order } = body;

  if (!feature_id || !media_type || !src) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  }

  const { data, error } = await supabase
    .from('feature_media')
    .insert({
      feature_id,
      media_type,
      src,
      alt: alt || null,
      sort_order: sort_order ?? 0,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json(data);
}

// DELETE - remove media (admin only)
export async function DELETE(req: NextRequest) {
  const supabase = getServiceSupabase();

  const authHeader = req.headers.get('authorization');
  if (!authHeader) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const token = authHeader.replace('Bearer ', '');
  const anonSupabase = createClient(supabaseUrl, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
  const { data: { user }, error: authError } = await anonSupabase.auth.getUser(token);
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('is_admin')
    .eq('id', user.id)
    .single();

  if (!profile?.is_admin) {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  if (!id) {
    return NextResponse.json({ error: 'Missing id' }, { status: 400 });
  }

  // If it's an uploaded image, delete from storage too
  const { data: media } = await supabase
    .from('feature_media')
    .select('src, media_type')
    .eq('id', id)
    .single();

  if (media?.media_type === 'image' && media.src.includes('feature-media/')) {
    const path = media.src.split('feature-media/')[1];
    if (path) {
      await supabase.storage.from('feature-media').remove([path]);
    }
  }

  const { error } = await supabase
    .from('feature_media')
    .delete()
    .eq('id', id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ success: true });
}
