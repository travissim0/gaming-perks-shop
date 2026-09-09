import { NextRequest, NextResponse } from 'next/server';
import { getServiceSupabase } from '@/lib/supabase';
import { CTF_RATING, pickMatchup, startOfUtcDay } from '@/lib/ctfRatings/elo';
import { loadPool } from '@/lib/ctfRatings/pool';
import { getVoter } from '@/lib/ctfRatings/auth';

export const dynamic = 'force-dynamic';

/**
 * GET /api/ctf/ratings/matchup
 *   ?exclude=keyA|keyB,keyC|keyD   pairs already shown this session (skip button)
 *
 * Returns a pair to vote on plus the caller's remaining votes for the day.
 */
export async function GET(request: NextRequest) {
  try {
    const pool = await loadPool();

    if (pool.length < 2) {
      return NextResponse.json({
        success: true,
        matchup: null,
        message: `Need at least two players with ${CTF_RATING.MIN_GAMES}+ recorded games.`,
        poolSize: pool.length,
      });
    }

    const excludeParam = request.nextUrl.searchParams.get('exclude') || '';
    const exclude = new Set(excludeParam.split(',').filter(Boolean));

    const matchup = pickMatchup(pool, exclude);
    if (!matchup) {
      return NextResponse.json({ success: true, matchup: null, poolSize: pool.length });
    }

    // Voting status for the signed-in caller (anonymous callers still get a matchup,
    // they just cannot submit a vote).
    let votesToday = 0;
    let signedIn = false;
    const voter = await getVoter(request);
    if (voter) {
      signedIn = true;
      const supabase = getServiceSupabase();
      const { count } = await supabase
        .from('ctf_rating_votes')
        .select('id', { count: 'exact', head: true })
        .eq('voter_id', voter.id)
        .gte('created_at', startOfUtcDay());
      votesToday = count ?? 0;
    }

    return NextResponse.json({
      success: true,
      matchup: { a: matchup[0], b: matchup[1] },
      poolSize: pool.length,
      signedIn,
      votesToday,
      dailyLimit: CTF_RATING.DAILY_VOTE_LIMIT,
    });
  } catch (error: any) {
    console.error('[ctf-ratings] matchup failed:', error);
    return NextResponse.json(
      { success: false, error: error?.message || 'Failed to build a matchup' },
      { status: 500 },
    );
  }
}
