import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { loadMe } from '@/lib/ctfdl-draft-server';

export const dynamic = 'force-dynamic';

/**
 * Who the viewer is in the draft (staff? leading a team?) and their private queue.
 * GET  /api/ctfdl/draft/me?draft=<id>|season=<id>   look up only
 * POST /api/ctfdl/draft/me { draft_id?, season_id? } same answer, and checks a captain / staff member
 *                                                    in as "in the room" (they call it every ~20s)
 *
 * No token: the anonymous viewer. A token that can't be verified is a 401 rather than "anonymous",
 * so a hiccup talking to the sign-in service can't make a captain's room forget who they are.
 */
async function answer(request: NextRequest, draftId: string | null, seasonId: string | null, checkIn: boolean) {
  const header = request.headers.get('Authorization');
  let userId: string | null = null;
  if (header?.startsWith('Bearer ')) {
    const { data: { user }, error } = await supabase.auth.getUser(header.slice(7));
    if (error || !user) return NextResponse.json({ error: 'Could not verify your sign-in' }, { status: 401 });
    userId = user.id;
  }
  const me = await loadMe(draftId, seasonId, userId, checkIn);
  return NextResponse.json(me, { headers: { 'Cache-Control': 'no-store' } });
}

export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams;
  return answer(request, q.get('draft'), q.get('season'), false);
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  return answer(request, body?.draft_id || null, body?.season_id || null, true);
}
