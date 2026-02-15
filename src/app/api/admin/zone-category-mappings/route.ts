import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminAccess } from '@/utils/adminAuth';
import { getServiceSupabase } from '@/lib/supabase';

// GET: Fetch all mappings + all categories + all discovered zone titles
export async function GET(request: NextRequest) {
  const authResult = await verifyAdminAccess(request);
  if (!authResult.success) {
    return NextResponse.json(
      { error: authResult.error },
      { status: authResult.statusCode }
    );
  }

  const supabase = getServiceSupabase();

  const [categoriesRes, mappingsRes] = await Promise.all([
    supabase.from('zone_categories').select('*').order('sort_order'),
    supabase.from('zone_name_mappings').select('*'),
  ]);

  if (categoriesRes.error) {
    return NextResponse.json({ error: categoriesRes.error.message }, { status: 500 });
  }

  // Discover ALL distinct zone titles ever seen in population history (no time cutoff for admin)
  const { data: popData } = await supabase
    .from('zone_population_history')
    .select('zone_title')
    .order('zone_title')
    .limit(10000);

  const seenTitles = new Set<string>();
  const discoveredTitles: string[] = [];
  (popData || []).forEach((row: any) => {
    if (row.zone_title && !seenTitles.has(row.zone_title)) {
      seenTitles.add(row.zone_title);
      discoveredTitles.push(row.zone_title);
    }
  });

  return NextResponse.json({
    categories: categoriesRes.data || [],
    mappings: mappingsRes.data || [],
    discovered_titles: discoveredTitles,
  });
}

// POST: Create or update a zone_title → category_id mapping
export async function POST(request: NextRequest) {
  const authResult = await verifyAdminAccess(request);
  if (!authResult.success) {
    return NextResponse.json(
      { error: authResult.error },
      { status: authResult.statusCode }
    );
  }

  const body = await request.json();
  const { zone_title, category_id } = body;

  if (!zone_title) {
    return NextResponse.json({ error: 'zone_title is required' }, { status: 400 });
  }

  const supabase = getServiceSupabase();

  if (category_id === null || category_id === '') {
    // Remove mapping (unassign from category)
    const { error } = await supabase
      .from('zone_name_mappings')
      .delete()
      .eq('zone_title', zone_title);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ success: true, action: 'removed' });
  }

  // Upsert mapping
  const { data, error } = await supabase
    .from('zone_name_mappings')
    .upsert(
      {
        zone_title,
        category_id,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'zone_title' }
    )
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, action: 'saved', mapping: data });
}
