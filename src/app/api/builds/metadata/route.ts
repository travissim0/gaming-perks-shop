import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { verifyAdminAccess, logAdminAction } from '@/utils/adminAuth';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(request: NextRequest) {
  try {
    const authResult = await verifyAdminAccess(request);
    if (!authResult.success) {
      return NextResponse.json({ error: authResult.error }, { status: authResult.statusCode });
    }

    const { user } = authResult;
    const { version, changelog, filename, file_size } = await request.json();

    if (!version || !filename || !file_size) {
      return NextResponse.json({ error: 'Missing required fields: version, filename, file_size' }, { status: 400 });
    }

    // Clean up old files in builds/latest/ that don't match the new filename
    const { data: existingFiles } = await supabaseAdmin.storage
      .from('builds')
      .list('latest');

    if (existingFiles && existingFiles.length > 0) {
      const filesToDelete = existingFiles
        .filter(f => f.name !== filename)
        .map(f => `latest/${f.name}`);

      if (filesToDelete.length > 0) {
        await supabaseAdmin.storage.from('builds').remove(filesToDelete);
      }
    }

    // Build the public download URL
    const { data: urlData } = supabaseAdmin.storage
      .from('builds')
      .getPublicUrl(`latest/${filename}`);

    const download_url = urlData.publicUrl;
    const file_path = `latest/${filename}`;

    // Delete existing build metadata (single-row table pattern)
    await supabaseAdmin.from('builds').delete().neq('id', '00000000-0000-0000-0000-000000000000');

    // Insert new metadata
    const { data: build, error: insertError } = await supabaseAdmin
      .from('builds')
      .insert({
        version,
        changelog: changelog || null,
        filename,
        file_size,
        file_path,
        download_url,
        uploaded_by: user.id,
        uploaded_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (insertError) {
      console.error('Failed to insert build metadata:', insertError);
      return NextResponse.json({ error: 'Failed to save build metadata' }, { status: 500 });
    }

    await logAdminAction(
      user.id,
      'upload_build',
      `Uploaded build ${version} (${filename}, ${file_size} bytes)`
    );

    return NextResponse.json(build);
  } catch (error: any) {
    console.error('Build metadata API error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
