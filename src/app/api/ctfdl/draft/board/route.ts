import { NextRequest, NextResponse } from 'next/server';
import { loadBoardShared } from '@/lib/ctfdl-draft-server';

export const dynamic = 'force-dynamic';

/**
 * GET /api/ctfdl/draft/board?draft=<id>|season=<league_season_id>[&fresh=1]
 * The whole board (teams, picks, the pool), with nothing about the viewer in it. It is the same for
 * everyone, so it is shared for a few seconds: the room loads it once, then follows /state.
 * `fresh=1` skips the shared copy (used right after a staff action, when a stale board would confuse).
 * Sent without a sign-in token on purpose: that is what lets the CDN hand one copy to everybody.
 */
export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams;
  const fresh = q.get('fresh') === '1';
  const board = await loadBoardShared(q.get('draft'), q.get('season'), fresh);
  return NextResponse.json(board, { headers: { 'Cache-Control': fresh ? 'no-store' : 'public, max-age=0, s-maxage=5' } });
}
