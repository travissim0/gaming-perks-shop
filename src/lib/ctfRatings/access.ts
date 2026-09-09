/**
 * Who may see and vote on Community Ratings.
 *
 * While the board is still filling up, both viewing and voting are held to the rater
 * pool: a half-formed leaderboard ranking real people invites argument long before the
 * numbers deserve any. Opening it up later is a one-line change here - no migration,
 * no dropped table.
 */

import type { NextRequest } from 'next/server';
import { getServiceSupabase } from '@/lib/supabase';
import { getVoter } from './auth';

/**
 * Flip to true to let anyone read the leaderboard and matchups. Voting stays with
 * raters regardless - this only governs viewing.
 */
export const CTF_RATINGS_PUBLIC_VIEW = false;

export interface RaterAccess {
  userId: string | null;
  /** may read the board */
  canView: boolean;
  /** may cast votes */
  canVote: boolean;
  /** holds a grant or an admin role, as opposed to viewing because it went public */
  isRater: boolean;
  isAdmin: boolean;
}

/**
 * Admins qualify without a grant row - a site admin or CTF admin should never have to
 * grant themselves access to a page they administer.
 */
export async function resolveAccess(request: NextRequest): Promise<RaterAccess> {
  const voter = await getVoter(request);

  if (!voter) {
    return {
      userId: null,
      canView: CTF_RATINGS_PUBLIC_VIEW,
      canVote: false,
      isRater: false,
      isAdmin: false,
    };
  }

  const supabase = getServiceSupabase();

  const [profileRes, grantRes] = await Promise.all([
    supabase
      .from('profiles')
      .select('is_admin, site_admin, ctf_role')
      .eq('id', voter.id)
      .maybeSingle(),
    supabase.from('ctf_rater_grants').select('user_id').eq('user_id', voter.id).maybeSingle(),
  ]);

  const profile = profileRes.data as any;
  const isAdmin =
    profile?.is_admin === true ||
    profile?.site_admin === true ||
    profile?.ctf_role === 'ctf_admin';

  const isRater = isAdmin || !!grantRes.data;

  return {
    userId: voter.id,
    canView: isRater || CTF_RATINGS_PUBLIC_VIEW,
    canVote: isRater,
    isRater,
    isAdmin,
  };
}

/** Shared refusal so every route says the same thing. */
export const NO_ACCESS_MESSAGE =
  'Community Ratings is limited to CTF raters while the board fills up.';
