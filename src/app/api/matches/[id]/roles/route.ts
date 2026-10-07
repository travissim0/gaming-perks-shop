import { NextRequest, NextResponse } from 'next/server';
import { loadMatch, loadSquads } from '@/lib/match-setup-server';
import { loadPlayerRoles } from '@/lib/ctf-roles-server';

export const dynamic = 'force-dynamic';

/**
 * GET /api/matches/[id]/roles — what each player on both rosters plays: their
 * draft registration (mains, secondaries, ★) and their CTF mix class/side
 * history. Public: it colours the rosters and lineups on the match page.
 * Shape: { roles: { [player_id]: PlayerRoles } } (src/lib/ctf-roles.ts).
 */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const match = await loadMatch(id);
    if (!match) return NextResponse.json({ error: 'Match not found' }, { status: 404 });
    const squads = await loadSquads([match.squad_a_id, match.squad_b_id].filter(Boolean));
    const players = Object.values(squads).flatMap((s) => s.members.map((m) => ({ player_id: m.player_id, alias: m.alias })));
    const roles = await loadPlayerRoles(players, { league_slug: match.league_slug, season_number: match.season_number });
    return NextResponse.json({ roles }, { headers: { 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600' } });
  } catch (e: any) {
    console.error('match roles GET failed', e);
    return NextResponse.json({ error: 'Could not load player roles' }, { status: 500 });
  }
}
