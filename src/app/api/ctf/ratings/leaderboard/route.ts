import { NextRequest, NextResponse } from 'next/server';
import { getServiceSupabase } from '@/lib/supabase';
import { CTF_RATING, startOfUtcDay } from '@/lib/ctfRatings/elo';
import { loadPool, resolveViewerKey } from '@/lib/ctfRatings/pool';
import { NO_ACCESS_MESSAGE, resolveAccess } from '@/lib/ctfRatings/access';

export const dynamic = 'force-dynamic';

/**
 * GET /api/ctf/ratings/leaderboard
 *
 * The ranked board plus the headline counters, and - for a signed-in caller - their own
 * standing, vote count and how often they side with the community.
 */
export async function GET(request: NextRequest) {
  try {
    const access = await resolveAccess(request);
    if (!access.canView) {
      return NextResponse.json(
        { success: false, error: NO_ACCESS_MESSAGE, forbidden: true, signedIn: !!access.userId },
        { status: 403 },
      );
    }

    const supabase = getServiceSupabase();
    const pool = await loadPool();

    // Rating first, then games as the tiebreak so unrated players sort by track record
    // rather than arbitrarily while the board fills up.
    const ranked = [...pool].sort(
      (a, b) => b.rating - a.rating || b.games - a.games || a.player_name.localeCompare(b.player_name),
    );

    // "Active" is scoped to the last 30 days - both because that is what the number
    // should mean, and so this stays a bounded read as the vote table grows.
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

    const [{ count: totalVotes }, { count: votesToday }, votersRes] = await Promise.all([
      supabase.from('ctf_rating_votes').select('id', { count: 'exact', head: true }),
      supabase
        .from('ctf_rating_votes')
        .select('id', { count: 'exact', head: true })
        .gte('created_at', startOfUtcDay()),
      supabase.from('ctf_rating_votes').select('voter_id').gte('created_at', thirtyDaysAgo),
    ]);

    const activeVoters = new Set((votersRes.data ?? []).map((v: any) => v.voter_id)).size;

    // Caller's own standing, when they are signed in.
    let viewer: any = null;
    const voter = access.userId ? { id: access.userId } : null;
    if (voter) {
      // Counted server-side rather than fetched and tallied, so a prolific voter's
      // history never has to travel just to render one percentage.
      const [myVotesRes, myAgreedRes, myTodayRes, viewerKey] = await Promise.all([
        supabase
          .from('ctf_rating_votes')
          .select('id', { count: 'exact', head: true })
          .eq('voter_id', voter.id),
        supabase
          .from('ctf_rating_votes')
          .select('id', { count: 'exact', head: true })
          .eq('voter_id', voter.id)
          .eq('agreed', true),
        supabase
          .from('ctf_rating_votes')
          .select('id', { count: 'exact', head: true })
          .eq('voter_id', voter.id)
          .gte('created_at', startOfUtcDay()),
        resolveViewerKey(voter.id),
      ]);

      const myVoteCount = myVotesRes.count ?? 0;
      const agreedCount = myAgreedRes.count ?? 0;
      const rankIndex = viewerKey ? ranked.findIndex((p) => p.player_key === viewerKey) : -1;

      viewer = {
        votes: myVoteCount,
        votesToday: myTodayRes.count ?? 0,
        dailyLimit: CTF_RATING.DAILY_VOTE_LIMIT,
        agreement: myVoteCount > 0 ? Math.round((100 * agreedCount) / myVoteCount) : null,
        rank: rankIndex >= 0 ? rankIndex + 1 : null,
        rating: rankIndex >= 0 ? ranked[rankIndex].rating : null,
        canVote: access.canVote,
        isAdmin: access.isAdmin,
        playerName: rankIndex >= 0 ? ranked[rankIndex].player_name : null,
      };
    }

    return NextResponse.json({
      success: true,
      players: ranked,
      totals: {
        rankedPlayers: ranked.length,
        totalVotes: totalVotes ?? 0,
        votesToday: votesToday ?? 0,
        activeVoters,
        minGames: CTF_RATING.MIN_GAMES,
      },
      viewer,
    });
  } catch (error: any) {
    console.error('[ctf-ratings] leaderboard failed:', error);
    return NextResponse.json(
      { success: false, error: error?.message || 'Failed to load leaderboard' },
      { status: 500 },
    );
  }
}
