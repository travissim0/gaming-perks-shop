import { NextResponse } from 'next/server';
import { getCachedSupabase } from '@/lib/supabase';

export async function GET() {
  const supabase = getCachedSupabase();

  try {
    // Fetch all config data in parallel
    const [categoriesRes, mappingsRes, mediaRes] = await Promise.all([
      supabase.from('zone_categories').select('*').order('sort_order'),
      supabase.from('zone_name_mappings').select('*'),
      supabase.from('zone_media').select('*'),
    ]);

    if (categoriesRes.error) throw categoriesRes.error;
    if (mappingsRes.error) throw mappingsRes.error;
    if (mediaRes.error) throw mediaRes.error;

    const categories = categoriesRes.data || [];
    const mappings = mappingsRes.data || [];
    const mediaList = mediaRes.data || [];

    // Discover all zones from population history (last 30 days)
    const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const { data: popData } = await supabase
      .from('zone_population_history')
      .select('zone_key, zone_title, player_count, recorded_at')
      .gte('recorded_at', cutoff)
      .order('recorded_at', { ascending: false })
      .limit(5000);

    const allPopRows = popData || [];

    // Get distinct zone titles and their latest player count
    const latestByTitle = new Map<string, { zone_key: string; zone_title: string; players: number }>();
    allPopRows.forEach((row: any) => {
      if (!latestByTitle.has(row.zone_title)) {
        latestByTitle.set(row.zone_title, {
          zone_key: row.zone_key,
          zone_title: row.zone_title,
          players: row.player_count,
        });
      }
    });

    // Build lookup maps
    const mappingByTitle = new Map<string, string>(); // zone_title → category_id
    mappings.forEach((m: any) => mappingByTitle.set(m.zone_title, m.category_id));

    const mediaByTitle = new Map<string, any>();
    mediaList.forEach((m: any) => mediaByTitle.set(m.zone_title, m));

    // Interest counts per zone_key (existing zone_interests table uses zone_key)
    let interestCounts = new Map<string, number>();
    try {
      const { data: interests } = await supabase.from('zone_interests').select('zone_key');
      (interests || []).forEach((row: any) => {
        interestCounts.set(row.zone_key, (interestCounts.get(row.zone_key) || 0) + 1);
      });
    } catch {
      // zone_interests may not exist
    }

    // Subscriber counts per zone_title
    let subscriberCounts = new Map<string, number>();
    try {
      const { data: subs } = await supabase
        .from('zone_notification_subscriptions')
        .select('zone_title')
        .eq('is_active', true);
      (subs || []).forEach((row: any) => {
        subscriberCounts.set(row.zone_title, (subscriberCounts.get(row.zone_title) || 0) + 1);
      });
    } catch {
      // table may not exist yet
    }

    // Peak hours per zone_key
    let peakHoursMap = new Map<string, any>();
    try {
      const { data: peakData } = await supabase.rpc('get_zone_peak_hours', {
        p_zone_key: null,
        p_days_back: 30,
        p_limit: 50,
      });
      if (peakData) {
        (peakData as any[]).forEach((row: any) => {
          const key = row.zone_key || 'all';
          if (!peakHoursMap.has(key)) {
            peakHoursMap.set(key, row);
          }
        });
      }
    } catch {
      // RPC may not exist
    }

    // Build card for each discovered zone
    const buildCard = (zone_title: string, zone_key: string, current_players: number) => ({
      zone_key,
      zone_title,
      media: mediaByTitle.get(zone_title) || null,
      current_players,
      peak_hour: peakHoursMap.get(zone_key) || null,
      interest_count: interestCounts.get(zone_key) || 0,
      subscriber_count: subscriberCounts.get(zone_title) || 0,
    });

    // Group into categories
    const categoryGroups = categories.map((cat: any) => {
      const zoneEntries = Array.from(latestByTitle.entries())
        .filter(([title]) => mappingByTitle.get(title) === cat.id);

      return {
        ...cat,
        zones: zoneEntries.map(([title, info]) =>
          buildCard(title, info.zone_key, info.players)
        ),
      };
    });

    // Uncategorized = discovered zones with no mapping
    const uncategorized = Array.from(latestByTitle.entries())
      .filter(([title]) => !mappingByTitle.has(title))
      .map(([title, info]) => buildCard(title, info.zone_key, info.players));

    return NextResponse.json(
      { categories: categoryGroups, uncategorized },
      {
        headers: {
          'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600',
        },
      }
    );
  } catch (error: any) {
    console.error('Zone explorer error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to load zone explorer data' },
      { status: 500 }
    );
  }
}
