import { NextRequest, NextResponse } from 'next/server';
import { hasClientKey, isLocked, leads, loadMatch, loadSquads, missingTable, supabaseAdmin, tagOf } from '@/lib/match-setup-server';

export const dynamic = 'force-dynamic';

/**
 * POST /api/matches/[id]/side   (X-Client-Key: the zone)
 *   { alias, side: 'titan' | 'collective' }
 *
 * The home captain or co-captain picks the side in game (?side titan / ?side collective), the
 * same thing as the side picker on the match page: same rules (home squad's captain or
 * co-captain, until the scheduled time). The zone vouches for the alias, as with plan-response.
 * The reply carries `message`, a line the zone shows the captain.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!(await hasClientKey(request))) return NextResponse.json({ error: 'Zone client key required' }, { status: 403 });

  const body = await request.json().catch(() => null);
  const alias = typeof body?.alias === 'string' ? body.alias.trim() : '';
  const side = body?.side === 'titan' || body?.side === 'collective' ? body.side : null;
  if (!alias || !side) return NextResponse.json({ error: 'alias and side (titan / collective) required' }, { status: 400 });

  const match = await loadMatch(id);
  if (!match) return NextResponse.json({ error: 'Match not found' }, { status: 404 });
  if (!match.squad_a_id || !match.squad_b_id) return NextResponse.json({ error: 'Both teams must be set on the match first' }, { status: 409 });
  if (isLocked(match)) return NextResponse.json({ error: 'The side is locked now the match has started' }, { status: 409 });

  const squads = await loadSquads([match.squad_a_id, match.squad_b_id]);
  const home = squads[match.squad_a_id];
  // The in-game alias is the roster alias (profiles.in_game_alias); case can differ.
  const member = home?.members.find((m) => m.alias.toLowerCase() === alias.toLowerCase());
  if (!home || !member || !leads(home, member.player_id)) {
    return NextResponse.json({ error: `Only ${home?.name || 'the home team'}'s captain or co-captain picks the side (home team)` }, { status: 403 });
  }

  const now = new Date().toISOString();
  const { error } = await supabaseAdmin
    .from('match_setup')
    .upsert({ match_id: id, home_side: side, side_chosen_at: now, side_chosen_by: member.player_id, updated_at: now });
  if (error) {
    const missing = missingTable(error.message);
    return NextResponse.json({ error: missing ? 'Run add-match-setup.sql in Supabase first' : error.message }, { status: missing ? 503 : 500 });
  }
  const sideName = side === 'titan' ? 'Titan' : 'Collective';
  return NextResponse.json({ ok: true, side, squad_tag: tagOf(home), message: `[${tagOf(home)}] plays ${sideName}. Side saved on freeinf.org.` });
}
