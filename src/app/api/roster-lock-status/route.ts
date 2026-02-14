import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

/**
 * Server-side roster lock status. Used by the All Squads page.
 * Uses active CTFPL season if one exists; otherwise uses the active league season
 * (e.g. CTFDL 5) so the banner matches admin.
 */
export async function GET() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  try {
    // 1) Prefer active CTFPL season (same as admin "active" season)
    const { data: activeCtfplSeasons, error: ctfplErr } = await supabase
      .from('ctfpl_seasons')
      .select('id, season_number, season_name')
      .eq('status', 'active')
      .order('season_number', { ascending: false })
      .limit(1);

    if (!ctfplErr && activeCtfplSeasons?.length) {
      const season = activeCtfplSeasons[0];
      const { data: lockRow, error: lockErr } = await supabase
        .from('season_roster_locks')
        .select('is_locked, reason, season_id')
        .eq('season_id', season.id)
        .eq('is_current', true)
        .maybeSingle();

      if (!lockErr) {
        const num = season.season_number;
        const name = season.season_name ?? null;
        const lockedLabel = num != null ? `CTFPL Season ${num}${name ? ` (${name})` : ''}` : 'CTFPL';
        return NextResponse.json({
          isLocked: !!lockRow?.is_locked,
          reason: lockRow?.reason ?? undefined,
          seasonId: lockRow?.season_id,
          lockedLabel,
          seasonNumber: num,
          seasonName: name,
        });
      }
    }

    // 2) No active CTFPL season: use active league season (e.g. CTFDL 5)
    const { data: activeLeagueSeasons, error: leagueErr } = await supabase
      .from('league_seasons')
      .select(`
        id,
        season_number,
        season_name,
        league:leagues(name)
      `)
      .eq('status', 'active')
      .order('season_number', { ascending: false })
      .limit(5);

    if (leagueErr || !activeLeagueSeasons?.length) {
      return NextResponse.json({ isLocked: false, lockedLabel: 'No active season', noActiveSeason: true });
    }

    const leagueSeason = activeLeagueSeasons[0] as { id: string; season_number: number; season_name: string | null; league: { name: string } | null };
    const leagueName = leagueSeason.league?.name ?? 'League';
    const num = leagueSeason.season_number;
    const name = leagueSeason.season_name ?? null;
    const lockedLabel = num != null ? `${leagueName} Season ${num}${name ? ` (${name})` : ''}` : leagueName;

    const { data: lockRow, error: lockErr } = await supabase
      .from('league_season_roster_locks')
      .select('is_locked, reason, league_season_id')
      .eq('league_season_id', leagueSeason.id)
      .eq('is_current', true)
      .maybeSingle();

    if (lockErr) {
      return NextResponse.json({
        isLocked: false,
        lockedLabel,
        seasonNumber: num,
        seasonName: name,
      });
    }

    return NextResponse.json({
      isLocked: !!lockRow?.is_locked,
      reason: lockRow?.reason ?? undefined,
      seasonId: lockRow?.league_season_id,
      lockedLabel,
      seasonNumber: num,
      seasonName: name,
    });
  } catch (e) {
    console.error('roster-lock-status:', e);
    return NextResponse.json({ isLocked: false, lockedLabel: 'No active season', noActiveSeason: true });
  }
}
