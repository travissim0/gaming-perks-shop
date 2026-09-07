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

const label = (leagueName: string, num?: number | null, name?: string | null) =>
  num != null ? `${leagueName} Season ${num}${name ? ` (${name})` : ''}` : leagueName;

/**
 * Checks if roster is locked for invites. Returns locked if EITHER:
 * - the active CTFPL season is locked (season_roster_locks), OR
 * - ANY other league's active season is locked (league_season_roster_locks).
 *
 * Both worlds are always checked — an unlocked CTFPL season must not hide a
 * locked CTFDL/OVDL season (that was the old early-return bug).
 * Used to block new squad invites across all leagues.
 */
export async function checkRosterLockStatus(seasonId?: string): Promise<RosterLockStatus> {
  const supabase = createClientComponentClient();

  try {
    // Legacy path: a specific CTFPL season was requested — check only that lock.
    if (seasonId) {
      const { data: lockRow } = await supabase
        .from('season_roster_locks')
        .select('is_locked, reason, season_id, season:ctfpl_seasons!season_id(season_number, season_name)')
        .eq('season_id', seasonId)
        .eq('is_current', true)
        .maybeSingle();
      const row = lockRow as any;
      const num = row?.season?.season_number;
      const name = row?.season?.season_name ?? null;
      return {
        isLocked: !!row?.is_locked,
        reason: row?.reason ?? undefined,
        seasonId,
        lockedLabel: label('CTFPL', num, name),
        seasonNumber: num,
        seasonName: name,
      };
    }

    // 1) CTFPL: active season + its lock
    let ctfplUnlocked: RosterLockStatus | null = null;
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
      const base = {
        seasonId: s.id,
        lockedLabel: label('CTFPL', s.season_number, s.season_name),
        seasonNumber: s.season_number,
        seasonName: s.season_name ?? null,
      };
      if (lockRow?.is_locked) {
        return { isLocked: true, reason: lockRow.reason ?? undefined, ...base };
      }
      ctfplUnlocked = { isLocked: false, ...base };
    }

    // 2) Generic leagues: is ANY active season locked? (checked regardless of CTFPL)
    const { data: activeLeagueSeasons } = await supabase
      .from('league_seasons')
      .select('id, season_number, season_name, league:leagues(name)')
      .eq('status', 'active');

    const activeIds = (activeLeagueSeasons || []).map((s: { id: string }) => s.id);
    if (activeIds.length) {
      const { data: leagueLocks } = await supabase
        .from('league_season_roster_locks')
        .select('reason, league_season_id')
        .in('league_season_id', activeIds)
        .eq('is_locked', true)
        .eq('is_current', true)
        .limit(1);

      if (leagueLocks?.length) {
        const lock = leagueLocks[0] as any;
        const season = (activeLeagueSeasons || []).find((s: any) => s.id === lock.league_season_id) as any;
        const leagueName = season?.league?.name ?? 'League';
        return {
          isLocked: true,
          reason: lock.reason ?? undefined,
          seasonId: lock.league_season_id,
          lockedLabel: label(leagueName, season?.season_number, season?.season_name),
          seasonNumber: season?.season_number,
          seasonName: season?.season_name ?? null,
        };
      }
    }

    // 3) Nothing locked. Label with CTFPL's active season if there is one,
    //    else the first active generic season.
    if (ctfplUnlocked) return ctfplUnlocked;
    const first = (activeLeagueSeasons || [])[0] as any;
    if (first) {
      return {
        isLocked: false,
        seasonId: first.id,
        lockedLabel: label(first.league?.name ?? 'League', first.season_number, first.season_name),
        seasonNumber: first.season_number,
        seasonName: first.season_name ?? null,
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
