import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import type { SeasonRosterLock } from '@/types/database';

export async function checkRosterLockStatus(seasonId?: string): Promise<{ isLocked: boolean; reason?: string; seasonId?: string }> {
  const supabase = createClientComponentClient();
  
  try {
    let query = supabase
      .from('season_roster_locks')
      .select(`
        is_locked, 
        reason, 
        season_id,
        season:ctfpl_seasons!season_id(
          id,
          status
        )
      `);

    if (seasonId) {
      // Check specific season
      query = query.eq('season_id', seasonId);
    } else {
      // Check active season
      query = query.eq('season.status', 'active');
    }

    const { data, error } = await query.limit(1);

    if (error) {
      console.error('Error checking roster lock status:', error);
      // Default to unlocked if we can't check
      return { isLocked: false };
    }

    if (!data || data.length === 0) {
      // No record exists, default to unlocked
      return { isLocked: false };
    }

    const lock = data[0] as any;
    return { 
      isLocked: lock?.is_locked || false,
      reason: lock?.reason || undefined,
      seasonId: lock?.season_id
    };
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