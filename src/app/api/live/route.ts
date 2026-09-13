import { NextRequest } from 'next/server';
import { corsPreflight } from '@/lib/uslMix/cors';
import { buildLiveResponse } from '@/lib/live/query';

/**
 * GET /api/live - every arena (USL and CTF) that reported within the last ~2.5 minutes:
 * player list grouped by team with classes and spectator status, the game clock / score,
 * and the ticker lines as a spectator sees them. Public, CORS *, cached 20s.
 *
 *   ?game=usl|ctf   one game only (default both)
 *   ?fresh=150      seconds of silence tolerated (30..600)
 *   ?empty=1        include arenas with nobody in them
 *
 * See src/lib/live/types.ts for the row shape. USL-only alias for third parties:
 * GET /api/usl-mix/live.
 */
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function OPTIONS() {
  return corsPreflight();
}

export async function GET(request: NextRequest) {
  try {
    return await buildLiveResponse(request);
  } catch (error: any) {
    console.error('[live] GET failed:', error);
    return Response.json({ success: false, error: 'Failed to load live arenas', arenas: [] }, { status: 500 });
  }
}
