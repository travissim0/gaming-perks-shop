import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

function getServiceSupabase() {
  return createClient(supabaseUrl, supabaseServiceKey);
}

// POST - upload image to feature-media bucket, returns public URL
export async function POST(req: NextRequest) {
  const supabase = getServiceSupabase();

  // Verify admin
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

  const formData = await req.formData();
  const file = formData.get('file') as File;
  const featureId = formData.get('feature_id') as string;

  if (!file || !featureId) {
    return NextResponse.json({ error: 'Missing file or feature_id' }, { status: 400 });
  }

  // Validate file type
  const allowedTypes = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'];
  if (!allowedTypes.includes(file.type)) {
    return NextResponse.json({ error: 'Invalid file type. Allowed: PNG, JPG, GIF, WebP' }, { status: 400 });
  }

  // 10MB limit
  if (file.size > 10 * 1024 * 1024) {
    return NextResponse.json({ error: 'File too large. Max 10MB' }, { status: 400 });
  }

  const ext = file.name.split('.').pop() || 'png';
  const fileName = `${featureId}/${Date.now()}_${Math.random().toString(36).substring(2, 8)}.${ext}`;

  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  const { error: uploadError } = await supabase.storage
    .from('feature-media')
    .upload(fileName, buffer, {
      contentType: file.type,
      upsert: false,
    });

  if (uploadError) {
    return NextResponse.json({ error: uploadError.message }, { status: 500 });
  }

  const { data: urlData } = supabase.storage
    .from('feature-media')
    .getPublicUrl(fileName);

  return NextResponse.json({ url: urlData.publicUrl });
}
