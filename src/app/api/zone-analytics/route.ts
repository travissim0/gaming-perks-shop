import { NextRequest, NextResponse } from 'next/server';
import { getCachedSupabase } from '@/lib/supabase';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const type = searchParams.get('type');
  const zone = searchParams.get('zone') || null;
  const days = parseInt(searchParams.get('days') || '30', 10);

  const supabase = getCachedSupabase();

  try {
    switch (type) {
      case 'heatmap': {
        const { data, error } = await supabase.rpc('get_zone_population_heatmap', {
          p_zone_key: zone,
          p_days_back: days,
        });
        if (error) throw error;
        return NextResponse.json(data, {
          headers: { 'Cache-Control': 'public, s-maxage=1800, stale-while-revalidate=3600' },
        });
      }

      case 'peak-hours': {
        const { data, error } = await supabase.rpc('get_zone_peak_hours', {
          p_zone_key: zone,
          p_days_back: days,
          p_limit: 5,
        });
        if (error) throw error;
        return NextResponse.json(data, {
          headers: { 'Cache-Control': 'public, s-maxage=1800, stale-while-revalidate=3600' },
        });
      }

      case 'daily-trend': {
        const { data, error } = await supabase.rpc('get_population_daily_trend', {
          p_zone_key: zone,
          p_days_back: days,
        });
        if (error) throw error;
        return NextResponse.json(data, {
          headers: { 'Cache-Control': 'public, s-maxage=1800, stale-while-revalidate=3600' },
        });
      }

      case 'summary': {
        // Get total snapshots count
        const { count: totalSnapshots } = await supabase
          .from('zone_population_history')
          .select('*', { count: 'exact', head: true })
          .gte('recorded_at', new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString());

        // Get avg server population per snapshot
        const { data: avgData } = await supabase
          .from('zone_population_history')
          .select('snapshot_id, total_server_players')
          .gte('recorded_at', new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString());

        // Deduplicate by snapshot_id to get one total_server_players per snapshot
        const snapshotMap = new Map<string, number>();
        (avgData || []).forEach((row: any) => {
          if (!snapshotMap.has(row.snapshot_id)) {
            snapshotMap.set(row.snapshot_id, row.total_server_players);
          }
        });
        const snapshotTotals = Array.from(snapshotMap.values());
        const avgServerPop =
          snapshotTotals.length > 0
            ? Math.round((snapshotTotals.reduce((a, b) => a + b, 0) / snapshotTotals.length) * 10) / 10
            : 0;

        // Get most popular zone
        const { data: popData } = await supabase
          .from('zone_population_history')
          .select('zone_key, zone_title, player_count')
          .gte('recorded_at', new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString());

        const zoneAvgs: Record<string, { total: number; count: number; title: string }> = {};
        (popData || []).forEach((row: any) => {
          if (!zoneAvgs[row.zone_key]) {
            zoneAvgs[row.zone_key] = { total: 0, count: 0, title: row.zone_title };
          }
          zoneAvgs[row.zone_key].total += row.player_count;
          zoneAvgs[row.zone_key].count += 1;
        });

        let mostPopularZone = { key: '', title: 'N/A', avg: 0 };
        Object.entries(zoneAvgs).forEach(([key, val]) => {
          const avg = val.total / val.count;
          if (avg > mostPopularZone.avg) {
            mostPopularZone = { key, title: val.title, avg: Math.round(avg * 10) / 10 };
          }
        });

        // Peak hour (highest avg across all zones combined)
        const { data: peakData } = await supabase.rpc('get_zone_peak_hours', {
          p_zone_key: null,
          p_days_back: days,
          p_limit: 1,
        });

        const peakHour = peakData && peakData.length > 0 ? peakData[0] : null;

        return NextResponse.json(
          {
            total_snapshots: snapshotMap.size,
            avg_server_pop: avgServerPop,
            most_popular_zone: mostPopularZone,
            peak_hour: peakHour,
          },
          {
            headers: { 'Cache-Control': 'public, s-maxage=1800, stale-while-revalidate=3600' },
          }
        );
      }

      case 'zone-hourly': {
        // Per-zone hourly breakdown for line chart
        const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
        const { data: rawData, error } = await supabase
          .from('zone_population_history')
          .select('zone_key, zone_title, player_count, recorded_at')
          .gte('recorded_at', cutoff)
          .order('recorded_at', { ascending: true });

        if (error) throw error;

        // Group by zone_key -> hour -> avg player count
        // Use ET timezone offset for hour extraction
        const zoneHourMap: Record<string, { title: string; hours: Record<number, { total: number; count: number }> }> = {};

        (rawData || []).forEach((row: any) => {
          if (!zoneHourMap[row.zone_key]) {
            zoneHourMap[row.zone_key] = { title: row.zone_title, hours: {} };
          }
          // Convert to ET hour
          const utcDate = new Date(row.recorded_at);
          const etHour = parseInt(
            utcDate.toLocaleString('en-US', { timeZone: 'America/New_York', hour: 'numeric', hour12: false })
          );
          const h = isNaN(etHour) ? utcDate.getUTCHours() : etHour;

          if (!zoneHourMap[row.zone_key].hours[h]) {
            zoneHourMap[row.zone_key].hours[h] = { total: 0, count: 0 };
          }
          zoneHourMap[row.zone_key].hours[h].total += row.player_count;
          zoneHourMap[row.zone_key].hours[h].count += 1;
        });

        // Build response: array of zones with their hourly data
        const zoneHourly = Object.entries(zoneHourMap).map(([key, val]) => ({
          zone_key: key,
          zone_title: val.title,
          hours: Array.from({ length: 24 }, (_, h) => ({
            hour: h,
            avg_players: val.hours[h]
              ? Math.round((val.hours[h].total / val.hours[h].count) * 10) / 10
              : 0,
          })),
        }));

        return NextResponse.json(zoneHourly, {
          headers: { 'Cache-Control': 'no-cache, no-store, must-revalidate' },
        });
      }

      case 'zones': {
        // Return distinct zones from recorded data
        const { data, error } = await supabase
          .from('zone_population_history')
          .select('zone_key, zone_title')
          .gte('recorded_at', new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString());

        if (error) throw error;

        // Deduplicate by zone_key, keeping the most recent title
        const zoneMap = new Map<string, string>();
        (data || []).forEach((row: any) => {
          zoneMap.set(row.zone_key, row.zone_title);
        });

        const zones = Array.from(zoneMap.entries())
          .map(([key, name]) => ({ key, name }))
          .sort((a, b) => a.name.localeCompare(b.name));

        return NextResponse.json(zones, {
          headers: { 'Cache-Control': 'no-cache, no-store, must-revalidate' },
        });
      }

      default:
        return NextResponse.json({ error: 'Invalid type parameter' }, { status: 400 });
    }
  } catch (error: any) {
    console.error('Zone analytics error:', error);
    return NextResponse.json({ error: error.message || 'Analytics query failed' }, { status: 500 });
  }
}
