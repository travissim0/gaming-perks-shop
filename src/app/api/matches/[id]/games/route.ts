import { NextRequest, NextResponse } from 'next/server';
import { arenaNameFor, loadMatch, loadSquads, supabaseAdmin, tagOf, viewerFor } from '@/lib/match-setup-server';
import { autoRecordFromGame, removeLeagueResult, squadTagOfTeam } from '@/lib/match-result-server';

export const dynamic = 'force-dynamic';

/**
 * The games played in a league match's arena, for staff to check the site picked the right one.
 *
 * The arena saves stats for every game it runs: warm-ups, restarts, the match, anything after.
 * The site records the first one reported with a winner that started at kick-off; this is the
 * safety net when that pick is wrong.
 *
 * GET  /api/matches/[id]/games            staff → { arena, picked_game_id, recorded, games: [...] }
 * POST /api/matches/[id]/games { game_id } staff → re-records the match from that game: the
 *        current result (if any) is removed, then winner, length, win type, points and standings
 *        are taken from the chosen game. Refused, with nothing changed, when that game can't
 *        be a result (no winner, or its teams aren't this match's squads).
 */

const WINDOW_BEFORE_MS = 4 * 3_600_000;
const WINDOW_AFTER_MS = 10 * 3_600_000;

interface GameRow { game_id: string; player_name: string; team: string | null; result: string | null; kills: number | null; game_length_minutes: number | null; game_date: string | null; arena_name: string | null; game_mode: string | null }

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const viewer = await viewerFor(request);
  if (!viewer.staff) return NextResponse.json({ error: 'Staff only' }, { status: 403 });

  const match = await loadMatch(id);
  if (!match) return NextResponse.json({ error: 'Match not found' }, { status: 404 });
  if (!match.league_slug || !match.squad_a_id || !match.squad_b_id) return NextResponse.json({ arena: null, picked_game_id: match.game_id || null, recorded: false, games: [] });

  const squads = await loadSquads([match.squad_a_id, match.squad_b_id]);
  const home = squads[match.squad_a_id], away = squads[match.squad_b_id];
  if (!home || !away) return NextResponse.json({ error: 'Squads not found' }, { status: 404 });
  const arena = arenaNameFor(match, home, away);

  // Around the scheduled time; a TBD match has no time, so look at the last day and a half.
  const anchor = match.time_tbd === true ? Date.now() - 26 * 3_600_000 : new Date(match.scheduled_at).getTime();
  const from = new Date(anchor - WINDOW_BEFORE_MS).toISOString();
  const to = new Date((match.time_tbd === true ? Date.now() : anchor) + WINDOW_AFTER_MS).toISOString();

  const cols = 'game_id, player_name, team, result, kills, game_length_minutes, game_date, arena_name, game_mode';
  const base = () => supabaseAdmin.from('player_stats').select(cols).gte('game_date', from).lte('game_date', to).limit(3000);
  // The arena's games: by arena name, and by game id (the zone prefixes ids with the arena name).
  const [byArena, byId, byPicked] = await Promise.all([
    base().ilike('arena_name', arena),
    base().ilike('game_id', `${arena}%`),
    match.game_id ? supabaseAdmin.from('player_stats').select(cols).eq('game_id', match.game_id).limit(500) : Promise.resolve({ data: [] as any[], error: null }),
  ]);
  if (byArena.error && byId.error) return NextResponse.json({ error: byArena.error.message }, { status: 500 });

  const seen = new Set<string>();
  const games = new Map<string, GameRow[]>();
  for (const r of [...(byArena.data || []), ...(byId.data || []), ...(byPicked.data || [])] as GameRow[]) {
    if (!r.game_id) continue;
    const key = `${r.game_id}|${r.player_name}|${r.team}`;
    if (seen.has(key)) continue;
    seen.add(key);
    if (!games.has(r.game_id)) games.set(r.game_id, []);
    games.get(r.game_id)!.push(r);
  }

  const { data: results } = await supabaseAdmin.from('league_matches').select('id, game_id').eq('fixture_id', match.id).limit(1);
  const recordedGameId = results?.[0]?.game_id || null;

  const homeTag = tagOf(home), awayTag = tagOf(away);
  const list = Array.from(games.entries()).map(([gameId, rows]) => {
    const side = (tag: string) => {
      const mine = rows.filter((r) => squadTagOfTeam(r.team || '') === tag);
      return {
        players: mine.length,
        kills: mine.reduce((n, r) => n + (Number(r.kills) || 0), 0),
        won: mine.some((r) => String(r.result || '').toLowerCase() === 'win'),
      };
    };
    const h = side(homeTag), a = side(awayTag);
    const minutes = Math.max(0, ...rows.map((r) => Number(r.game_length_minutes) || 0)) || null;
    const winner = h.won && !a.won ? 'home' : a.won && !h.won ? 'away' : null;
    const usable = !!winner && h.players > 0 && a.players > 0;
    return {
      game_id: gameId,
      game_date: rows.map((r) => r.game_date).filter(Boolean).sort()[0] || null,
      minutes,
      game_mode: rows[0]?.game_mode || null,
      players: h.players + a.players,
      home: { ...h, name: home.name, tag: homeTag },
      away: { ...a, name: away.name, tag: awayTag },
      winner,                       // 'home' | 'away' | null (no winner: a restart or abandoned game)
      usable,                       // can be recorded as the match result
      why_not: usable ? null : h.players === 0 || a.players === 0 ? 'its teams are not this match’s squads' : 'no winner: a restarted or abandoned game',
      picked: gameId === (recordedGameId || match.game_id),
    };
  }).sort((x, y) => String(x.game_date || '').localeCompare(String(y.game_date || '')));

  return NextResponse.json(
    { arena, picked_game_id: recordedGameId || match.game_id || null, recorded: !!recordedGameId, games: list },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const viewer = await viewerFor(request);
  if (!viewer.staff) return NextResponse.json({ error: 'Staff only' }, { status: 403 });
  const body = await request.json().catch(() => null);
  const gameId = String(body?.game_id || '').trim();
  if (!gameId) return NextResponse.json({ error: 'game_id is required' }, { status: 400 });

  const match = await loadMatch(id);
  if (!match) return NextResponse.json({ error: 'Match not found' }, { status: 404 });

  // Check the chosen game can be a result BEFORE touching the current one.
  const check = await autoRecordFromGame(match, gameId, { staffPick: true, dryRun: true });
  if (!check.would_record) return NextResponse.json({ error: `That game can't be recorded as the result: ${check.reason || 'unknown reason'}` }, { status: 400 });

  // Is this game already the result of a DIFFERENT match?
  const { data: elsewhere } = await supabaseAdmin.from('league_matches').select('id, fixture_id').eq('game_id', gameId).limit(1);
  if (elsewhere?.[0] && elsewhere[0].fixture_id !== match.id) return NextResponse.json({ error: 'That game is already recorded as the result of another match.' }, { status: 409 });

  const { data: current } = await supabaseAdmin.from('league_matches').select('id, game_id').eq('fixture_id', match.id);
  if ((current || []).some((r: any) => r.game_id === gameId)) return NextResponse.json({ ok: true, unchanged: true, game_id: gameId });
  for (const r of current || []) {
    const removed = await removeLeagueResult(r.id);
    if (!removed.ok) return NextResponse.json({ error: `Could not remove the current result: ${removed.error}` }, { status: 500 });
  }

  const fresh = await loadMatch(id);
  const result = await autoRecordFromGame({ ...fresh, game_id: gameId }, gameId, { staffPick: true });
  if (!result.recorded) return NextResponse.json({ error: `The previous result was removed, but recording from the chosen game failed: ${result.reason}. Record it in the match manager.` }, { status: 500 });
  return NextResponse.json({ ok: true, game_id: gameId, result });
}
