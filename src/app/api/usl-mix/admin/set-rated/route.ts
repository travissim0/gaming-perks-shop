import { NextRequest, NextResponse } from 'next/server';
import { getServiceSupabase } from '@/lib/supabase';
import { requireZoneAdmin } from '@/lib/adminApiAuth';
import { recomputeAllRatings } from '@/lib/uslMix/ingest';

/**
 * POST /api/usl-mix/admin/set-rated  { game_id: string, rated: boolean }
 *
 * Flips the ELO opt-in on a stored mix game after the fact (a host forgot *mix rated on, or a
 * rated game turned out to be a stomp nobody wants counted), then replays every rated mix so
 * the ratings table matches. Zone admins only.
 */
export const runtime = 'nodejs';
export const maxDuration = 300;

export async function POST(request: NextRequest) {
  const auth = await requireZoneAdmin(request);
  if (!auth.ok) return auth.response!;
  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ success: false, error: 'Body must be JSON' }, { status: 400 });
  }
  const gameId = typeof body?.game_id === 'string' ? body.game_id : null;
  const rated = body?.rated;
  if (!gameId || typeof rated !== 'boolean') {
    return NextResponse.json({ success: false, error: 'game_id (string) and rated (boolean) are required' }, { status: 400 });
  }
  const supabase = getServiceSupabase();
  const { data: game, error } = await supabase.from('usl_mix_games').select('id, game_kind, rated').eq('id', gameId).maybeSingle();
  if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  if (!game) return NextResponse.json({ success: false, error: 'Game not found' }, { status: 404 });
  if (game.game_kind !== 'mix') return NextResponse.json({ success: false, error: `Only mix games can be rated (this is ${game.game_kind})` }, { status: 400 });

  const { error: upErr } = await supabase.from('usl_mix_games').update({ rated }).eq('id', gameId);
  if (upErr) return NextResponse.json({ success: false, error: upErr.message }, { status: 500 });

  try {
    const result = await recomputeAllRatings(supabase);
    return NextResponse.json({ success: true, game_id: gameId, rated, was_rated: game.rated === true, recompute: result });
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e?.message || 'recompute failed after flag update' }, { status: 500 });
  }
}
