import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

/**
 * Server-side roster lock status. Used by the All Squads page banner.
 *
 * Locked if the active CTFPL season is locked OR any generic league's active
 * season (CTFDL, OVDL, ...) is locked — both are always checked. When nothing
 * is locked, the banner is labeled with the FEATURED league's active season
 * (from the league registry), falling back to CTFPL, then any active season.
 */
export async function GET() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  const label = (leagueName: string, num?: number | null, name?: string | null) =>
    num != null ? `${leagueName} Season ${num}${name ? ` (${name})` : ''}` : leagueName;

  try {
    // ---- CTFPL active season + lock ---------------------------------------
    let ctfplStatus: Record<string, unknown> | null = null;
    const { data: ctfplSeasons } = await supabase
      .from('ctfpl_seasons')
      .select('id, season_number, season_name')
      .eq('status', 'active')
      .order('season_number', { ascending: false })
      .limit(1);

    if (ctfplSeasons?.length) {
      const s = ctfplSeasons[0];
      const { data: lockRow } = await supabase
        .from('season_roster_locks')
        .select('is_locked, reason, season_id')
        .eq('season_id', s.id)
        .eq('is_current', true)
        .maybeSingle();
      ctfplStatus = {
        isLocked: !!lockRow?.is_locked,
        reason: lockRow?.reason ?? undefined,
        seasonId: s.id,
        lockedLabel: label('CTFPL', s.season_number, s.season_name),
        seasonNumber: s.season_number,
        seasonName: s.season_name ?? null,
        leagueSlug: 'ctfpl',
      };
      if (ctfplStatus.isLocked) return NextResponse.json(ctfplStatus);
    }

    // ---- Generic leagues: active seasons + locks ---------------------------
    const { data: activeLeagueSeasons } = await supabase
      .from('league_seasons')
      .select('id, season_number, season_name, league:leagues(name, slug)')
      .eq('status', 'active');

    const generic = (activeLeagueSeasons || []) as any[];
    const genericStatuses: Record<string, unknown>[] = [];

    if (generic.length) {
      const { data: locks } = await supabase
        .from('league_season_roster_locks')
        .select('is_locked, reason, league_season_id')
        .in('league_season_id', generic.map((s) => s.id))
        .eq('is_current', true);

      for (const s of generic) {
        const lock = (locks || []).find((l: any) => l.league_season_id === s.id) as any;
        const status = {
          isLocked: !!lock?.is_locked,
          reason: lock?.reason ?? undefined,
          seasonId: s.id,
          lockedLabel: label(s.league?.name ?? 'League', s.season_number, s.season_name),
          seasonNumber: s.season_number,
          seasonName: s.season_name ?? null,
          leagueSlug: s.league?.slug ?? null,
        };
        if (status.isLocked) return NextResponse.json(status);
        genericStatuses.push(status);
      }
    }

    // ---- Nothing locked: label with the featured league if it has an active season
    let featuredSlug: string | null = null;
    try {
      const { data: featured } = await supabase
        .from('leagues')
        .select('slug')
        .eq('is_featured', true)
        .maybeSingle();
      featuredSlug = featured?.slug ?? null;
    } catch {
      /* registry columns not applied yet — ignore */
    }

    const all = [...(ctfplStatus ? [ctfplStatus] : []), ...genericStatuses];
    const pick =
      all.find((s) => s.leagueSlug === featuredSlug) ||
      all.find((s) => s.leagueSlug === 'ctfpl') ||
      all[0];

    if (!pick) {
      return NextResponse.json({ isLocked: false, lockedLabel: 'No active season', noActiveSeason: true });
    }
    return NextResponse.json(pick);
  } catch (e) {
    console.error('roster-lock-status:', e);
    return NextResponse.json({ isLocked: false, lockedLabel: 'No active season', noActiveSeason: true });
  }
}
