import { NextRequest, NextResponse } from 'next/server';
import { loadMatch, supabaseAdmin, viewerFor } from '@/lib/match-setup-server';

export const dynamic = 'force-dynamic';

/**
 * POST /api/matches/[id]/placement   (game client key, or league staff)
 * { held: [{ alias, reason }] }
 * The zone reports moves it is holding back, e.g. a player it would spec for a sub who is carrying
 * a flag ({ alias: "Kev", reason: "flag" }). The match page shows "waiting on the arena" for them so
 * nobody thinks the sub failed. Send { held: [] } when nothing is held; a report older than three
 * minutes is ignored anyway. Needs add-match-placement-hold.sql.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const viewer = await viewerFor(request);
  if (!viewer.client && !viewer.staff) return NextResponse.json({ error: 'Client key or staff token required' }, { status: 403 });
  const match = await loadMatch(id);
  if (!match) return NextResponse.json({ error: 'Match not found' }, { status: 404 });

  const body = await request.json().catch(() => null);
  const held = (Array.isArray(body?.held) ? body.held : [])
    .filter((h: any) => h && typeof h.alias === 'string' && h.alias.trim())
    .slice(0, 30)
    .map((h: any) => ({ alias: String(h.alias).trim().slice(0, 64), reason: typeof h.reason === 'string' && h.reason.trim() ? h.reason.trim().slice(0, 64) : 'flag' }));
  const { error } = await supabaseAdmin.from('match_setup').upsert({ match_id: match.id, placement_hold: { at: new Date().toISOString(), held } });
  if (error) {
    if (/placement_hold|does not exist/i.test(error.message)) return NextResponse.json({ ok: false, pending_sql: true }, { status: 503 });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true, held: held.length });
}
