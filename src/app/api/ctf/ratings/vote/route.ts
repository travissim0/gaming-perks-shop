import { NextRequest, NextResponse } from 'next/server';
import { getServiceSupabase } from '@/lib/supabase';
import { CTF_RATING, applyVote, startOfUtcDay } from '@/lib/ctfRatings/elo';
import { invalidatePool, loadPool } from '@/lib/ctfRatings/pool';
import { getVoter } from '@/lib/ctfRatings/auth';

export const dynamic = 'force-dynamic';

/**
 * POST /api/ctf/ratings/vote  { winnerKey, loserKey }
 *
 * Records one head-to-head vote and moves both players' Elo.
 */
export async function POST(request: NextRequest) {
  try {
    const voter = await getVoter(request);
    if (!voter) {
      return NextResponse.json(
        { success: false, error: 'Sign in to vote' },
        { status: 401 },
      );
    }

    const body = await request.json().catch(() => ({}));
    const winnerKey = String(body.winnerKey || '').toLowerCase().trim();
    const loserKey = String(body.loserKey || '').toLowerCase().trim();

    if (!winnerKey || !loserKey || winnerKey === loserKey) {
      return NextResponse.json(
        { success: false, error: 'Two different players are required' },
        { status: 400 },
      );
    }

    // Both sides must actually be in the eligible pool - stops a hand-rolled request
    // from rating someone who has never met the games threshold.
    const pool = await loadPool();
    const winner = pool.find((p) => p.player_key === winnerKey);
    const loser = pool.find((p) => p.player_key === loserKey);
    if (!winner || !loser) {
      return NextResponse.json(
        { success: false, error: 'Unknown player in matchup' },
        { status: 400 },
      );
    }

    const supabase = getServiceSupabase();

    const { count } = await supabase
      .from('ctf_rating_votes')
      .select('id', { count: 'exact', head: true })
      .eq('voter_id', voter.id)
      .gte('created_at', startOfUtcDay());

    const votesToday = count ?? 0;
    if (votesToday >= CTF_RATING.DAILY_VOTE_LIMIT) {
      return NextResponse.json(
        {
          success: false,
          error: `Daily limit reached (${CTF_RATING.DAILY_VOTE_LIMIT} votes). Come back tomorrow.`,
          votesToday,
          dailyLimit: CTF_RATING.DAILY_VOTE_LIMIT,
        },
        { status: 429 },
      );
    }

    const next = applyVote(winner.rating, loser.rating);
    const agreed = winner.rating >= loser.rating;
    const now = new Date().toISOString();

    const { error: voteError } = await supabase.from('ctf_rating_votes').insert({
      voter_id: voter.id,
      winner_key: winnerKey,
      loser_key: loserKey,
      winner_rating_before: winner.rating,
      loser_rating_before: loser.rating,
      agreed,
    });
    if (voteError) throw new Error(voteError.message);

    const { error: ratingError } = await supabase.from('ctf_player_ratings').upsert(
      [
        {
          player_key: winnerKey,
          rating: next.winner,
          wins: winner.wins + 1,
          losses: winner.losses,
          updated_at: now,
        },
        {
          player_key: loserKey,
          rating: next.loser,
          wins: loser.wins,
          losses: loser.losses + 1,
          updated_at: now,
        },
      ],
      { onConflict: 'player_key' },
    );
    if (ratingError) throw new Error(ratingError.message);

    invalidatePool();

    return NextResponse.json({
      success: true,
      delta: next.delta,
      winner: { player_key: winnerKey, rating: next.winner },
      loser: { player_key: loserKey, rating: next.loser },
      agreed,
      votesToday: votesToday + 1,
      dailyLimit: CTF_RATING.DAILY_VOTE_LIMIT,
    });
  } catch (error: any) {
    console.error('[ctf-ratings] vote failed:', error);
    return NextResponse.json(
      { success: false, error: error?.message || 'Failed to record vote' },
      { status: 500 },
    );
  }
}
