import { NextRequest, NextResponse } from 'next/server';
import { loadAll, loadMatch, viewerFor } from '@/lib/match-setup-server';
import { releaseLateStart } from '@/lib/late-start-server';

export const dynamic = 'force-dynamic';

/**
 * POST /api/matches/[id]/late { action: 'release' } — Start now.
 *
 * Staff or a referee lift a late-start hold by hand (the earlier match is over but its result
 * never reached the site, or they just want to go). The usual 10-minute setup window still runs.
 * Replies with the setup payload, as /api/matches/[id]/setup does.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const viewer = await viewerFor(request);
  if (!viewer.staff && !viewer.referee) return NextResponse.json({ error: 'League staff and referees only' }, { status: 403 });
  const body = await request.json().catch(() => ({}));
  if (body?.action !== 'release') return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  const match = await loadMatch(id);
  if (!match) return NextResponse.json({ error: 'Match not found' }, { status: 404 });
  const r = await releaseLateStart(match, viewer.alias);
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: 409 });
  return NextResponse.json(await loadAll(id, viewer));
}
