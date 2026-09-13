import { NextRequest } from 'next/server';
import { corsPreflight } from '@/lib/uslMix/cors';
import { buildLiveResponse } from '@/lib/live/query';

/**
 * GET /api/usl-mix/live - the USL half of /api/live, kept under the documented USL Mix API
 * namespace for third-party sites (uslzone.com). Same query parameters minus `game`.
 */
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function OPTIONS() {
  return corsPreflight();
}

export async function GET(request: NextRequest) {
  try {
    return await buildLiveResponse(request, 'usl');
  } catch (error: any) {
    console.error('[usl-mix/live] GET failed:', error);
    return Response.json({ success: false, error: 'Failed to load live arenas', arenas: [] }, { status: 500 });
  }
}
