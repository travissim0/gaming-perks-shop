import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function GET() {
  try {
    // Use service role client for server-side operations
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
    
    const serviceClient = createClient(supabaseUrl, supabaseServiceKey);

    // List files in site-avatars folder
    const { data: files, error } = await serviceClient.storage
      .from('avatars')
      .list('site-avatars', { limit: 100 });

    if (error) {
      console.error('Error fetching site avatars:', error);
      return NextResponse.json({ error: 'Failed to fetch avatars' }, { status: 500 });
    }

    if (!files || files.length === 0) {
      return NextResponse.json({ avatars: [] });
    }

    // Filter for image files and generate public URLs
    const imageFiles = files.filter(file => 
      file.name.match(/\.(jpg|jpeg|png|gif|webp)$/i)
    );

    const avatarUrls = imageFiles.map(file => {
      const { data: { publicUrl } } = serviceClient.storage
        .from('avatars')
        .getPublicUrl(`site-avatars/${file.name}`);
      return publicUrl;
    });

    return NextResponse.json({ 
      avatars: avatarUrls,
      count: avatarUrls.length 
    });

  } catch (error) {
    console.error('Server error fetching avatars:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
} 