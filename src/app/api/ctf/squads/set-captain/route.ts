import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function verifyAdmin(request: NextRequest) {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) return null;
  const token = authHeader.slice(7);
  const { data: { user }, error } = await supabase.auth.getUser(token);
  if (error || !user) return null;

  const { data: profile } = await supabaseAdmin
    .from('profiles')
    .select('is_admin, ctf_role')
    .eq('id', user.id)
    .single();

  if (!profile || (!profile.is_admin && profile.ctf_role !== 'ctf_admin')) return null;
  return user;
}

// Search profiles by in_game_alias
export async function GET(request: NextRequest) {
  const user = await verifyAdmin(request);
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const query = searchParams.get('q');
  if (!query || query.length < 2) {
    return NextResponse.json({ error: 'Query must be at least 2 characters' }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from('profiles')
    .select('id, in_game_alias, display_name')
    .or(`in_game_alias.ilike.%${query}%,display_name.ilike.%${query}%`)
    .limit(10);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ players: data || [] });
}

// Set captain for a squad (works for legacy squads with no members)
export async function POST(request: NextRequest) {
  const user = await verifyAdmin(request);
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { squadId, playerId } = await request.json();
  if (!squadId || !playerId) {
    return NextResponse.json({ error: 'squadId and playerId are required' }, { status: 400 });
  }

  // Verify squad exists
  const { data: squad, error: squadErr } = await supabaseAdmin
    .from('squads')
    .select('id, captain_id')
    .eq('id', squadId)
    .single();

  if (squadErr || !squad) {
    return NextResponse.json({ error: 'Squad not found' }, { status: 404 });
  }

  // Verify player exists
  const { data: player, error: playerErr } = await supabaseAdmin
    .from('profiles')
    .select('id, in_game_alias')
    .eq('id', playerId)
    .single();

  if (playerErr || !player) {
    return NextResponse.json({ error: 'Player not found' }, { status: 404 });
  }

  // Demote old captain in squad_members if they exist
  await supabaseAdmin
    .from('squad_members')
    .update({ role: 'player' })
    .eq('squad_id', squadId)
    .eq('role', 'captain');

  // Add player as squad member if not already a member
  const { data: existingMember } = await supabaseAdmin
    .from('squad_members')
    .select('id')
    .eq('squad_id', squadId)
    .eq('player_id', playerId)
    .single();

  if (!existingMember) {
    await supabaseAdmin
      .from('squad_members')
      .insert({ squad_id: squadId, player_id: playerId, role: 'captain', status: 'active' });
  } else {
    await supabaseAdmin
      .from('squad_members')
      .update({ role: 'captain' })
      .eq('squad_id', squadId)
      .eq('player_id', playerId);
  }

  // Update squad captain_id
  const { error: updateErr } = await supabaseAdmin
    .from('squads')
    .update({ captain_id: playerId })
    .eq('id', squadId);

  if (updateErr) {
    return NextResponse.json({ error: 'Failed to update captain' }, { status: 500 });
  }

  return NextResponse.json({ success: true, captain_alias: player.in_game_alias });
}
