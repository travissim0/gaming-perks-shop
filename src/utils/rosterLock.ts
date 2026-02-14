import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';

export type RosterLockStatus = {
  isLocked: boolean;
  reason?: string;
  seasonId?: string;
  /** e.g. "CTFPL Season 5" or "CTFDL Season 1" for display */
  lockedLabel?: string;
  seasonNumber?: number;
  seasonName?: string | null;
};

/**
 * Checks if roster is locked for invites. Returns locked if EITHER:
 * - CTFPL active season is locked (season_roster_locks), OR
 * - Any other league's active season is locked (league_season_roster_locks).
 * Used to block new squad invites across all leagues.
 */
export async function checkRosterLockStatus(seasonId?: string): Promise<RosterLockStatus> {
  const supabase = createClientComponentClient();

  try {
    // 1) CTFPL: resolve the season to check, then read that season's lock (so admin and public agree)
    let ctfplSeasonId: string | null = seasonId ?? null;
    let ctfplSeasonInfo: { season_number?: number; season_name?: string | null } | null = null;

    if (!ctfplSeasonId) {
      // Get the single active CTFPL season (same source of truth as admin "active" season)
      const { data: activeSeasons, error: activeErr } = await supabase
        .from('ctfpl_seasons')
        .select('id, season_number, season_name')
        .eq('status', 'active')
        .order('season_number', { ascending: false })
        .limit(1);
      if (!activeErr && activeSeasons?.length) {
        const s = activeSeasons[0];
        ctfplSeasonId = s.id;
        ctfplSeasonInfo = { season_number: s.season_number, season_name: s.season_name ?? null };
      }
    }

    if (ctfplSeasonId) {
      const { data: lockRow, error: ctfplError } = await supabase
        .from('season_roster_locks')
        .select(`
          is_locked,
          reason,
          season_id,
          season:ctfpl_seasons!season_id(
            id,
            season_number,
            season_name
          )
        `)
        .eq('season_id', ctfplSeasonId)
        .eq('is_current', true)
        .maybeSingle();

      if (!ctfplError && lockRow) {
        const row = lockRow as any;
        const season = row.season;
        const num = season?.season_number ?? ctfplSeasonInfo?.season_number;
        const name = season?.season_name ?? ctfplSeasonInfo?.season_name;
        if (row.is_locked) {
          return {
            isLocked: true,
            reason: row.reason ?? undefined,
            seasonId: row.season_id,
            lockedLabel: num != null ? `CTFPL Season ${num}${name ? ` (${name})` : ''}` : 'CTFPL',
            seasonNumber: num,
            seasonName: name ?? null,
          };
        }
      }

      // CTFPL active season is unlocked (we have the season and it's not locked, or no lock row = unlocked)
      const num = ctfplSeasonInfo?.season_number ?? (lockRow as any)?.season?.season_number;
      const name = ctfplSeasonInfo?.season_name ?? (lockRow as any)?.season?.season_name;
      const lockedLabel = num != null ? `CTFPL Season ${num}${name ? ` (${name})` : ''}` : 'CTFPL';
      return { isLocked: false, lockedLabel, seasonNumber: num, seasonName: name ?? null };
    }

    // If checking a specific season (CTFPL) and we didn't find it above
    if (seasonId) {
      return { isLocked: false };
    }

    // 2) Other leagues: any active season with roster lock? (only when no CTFPL active season)
    const { data: activeLeagueSeasons, error: activeErr } = await supabase
      .from('league_seasons')
      .select('id')
      .eq('status', 'active');

    if (activeErr || !activeLeagueSeasons?.length) {
      return { isLocked: false };
    }

    const activeIds = activeLeagueSeasons.map((s: { id: string }) => s.id);
    const { data: leagueLocks, error: lockErr } = await supabase
      .from('league_season_roster_locks')
      .select(`
        reason,
        season:league_seasons(
          season_number,
          season_name,
          league:leagues(name)
        )
      `)
      .in('league_season_id', activeIds)
      .eq('is_locked', true)
      .eq('is_current', true)
      .limit(1);

    if (!lockErr && leagueLocks && leagueLocks.length > 0) {
      const row = leagueLocks[0] as any;
      const season = row.season;
      const leagueName = season?.league?.name ?? 'League';
      const num = season?.season_number;
      const name = season?.season_name;
      const label = num != null
        ? `${leagueName} Season ${num}${name ? ` (${name})` : ''}`
        : leagueName;
      return {
        isLocked: true,
        reason: row.reason ?? undefined,
        lockedLabel: label,
        seasonNumber: num,
        seasonName: name ?? null,
      };
    }

    return { isLocked: false };
  } catch (error) {
    console.error('Error checking roster lock status:', error);
    return { isLocked: false };
  }
}

export function getRosterLockErrorMessage(): string {
  return 'Squad invitations are currently disabled during roster lock period. Please try again after the tournament roster freeze is lifted.';
}

export async function validateRosterLockForInvite(seasonId?: string): Promise<void> {
  const status = await checkRosterLockStatus(seasonId);
  if (status.isLocked) {
    throw new Error(getRosterLockErrorMessage());
  }
}
