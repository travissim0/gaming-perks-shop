import { createClient } from '@supabase/supabase-js';
import { winTypeFromMinutes, type MatchKind, type WinType } from '@/lib/scoring';
import { loadSeasonRules, rebuildStandings } from '@/lib/standings-server';
import { tagOf } from '@/lib/match-setup-server';

/**
 * Record a league fixture's result from the game the zone ran for it.
 *
 * The game says which team won and how long it took; there is no score in
 * CTF beyond win/loss. So: read the game's stat rows, map the in-game team
 * names ("KEVI T", "NSS C") back to the fixture's squads by tag, take the
 * winner and the length, and write the same league_matches row the match
 * manager would, with the win type from the season's scoring rules. Then
 * rebuild the standings. Staff can remove the row in the match manager and
 * re-enter it if the game got it wrong.
 */

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

export interface AutoRecordOutcome {
  recorded: boolean;
  reason?: string;
  winner_squad_id?: string | null;
  win_type?: WinType | null;
  minutes?: number | null;
  league_match_id?: string | null;
}

async function leagueSeasonId(slug: string, seasonNumber: number): Promise<string | null> {
  const { data: league } = await supabaseAdmin.from('leagues').select('id').eq('slug', slug).maybeSingle();
  if (!league) return null;
  const { data: season } = await supabaseAdmin.from('league_seasons').select('id').eq('league_id', league.id).eq('season_number', seasonNumber).maybeSingle();
  return season?.id ?? null;
}

/** "KEVI T" → "KEVI"; anything else unchanged, upper-cased. */
const squadTagOfTeam = (team: string) => String(team || '').replace(/\s+[TC]$/i, '').trim().toUpperCase();

export async function autoRecordFromGame(match: any, gameId: string): Promise<AutoRecordOutcome> {
  if (!match.league_slug || !match.season_number) return { recorded: false, reason: 'not a league fixture' };
  if (!match.squad_a_id || !match.squad_b_id) return { recorded: false, reason: 'fixture has no squads' };
  if (match.league_slug === 'ctfpl') return { recorded: false, reason: 'CTFPL results are entered by staff' };

  // Already recorded (by the zone earlier, or by staff)? Leave it alone.
  const { data: existing } = await supabaseAdmin
    .from('league_matches')
    .select('id')
    .or(`fixture_id.eq.${match.id},game_id.eq.${gameId}`)
    .limit(1);
  if (existing && existing.length > 0) return { recorded: false, reason: 'already recorded', league_match_id: existing[0].id };

  const seasonId = await leagueSeasonId(match.league_slug, match.season_number);
  if (!seasonId) return { recorded: false, reason: `no season ${match.season_number} for ${match.league_slug}` };

  const [{ data: squads }, { data: rows }] = await Promise.all([
    supabaseAdmin.from('squads').select('id, name, tag').in('id', [match.squad_a_id, match.squad_b_id]),
    supabaseAdmin.from('player_stats').select('player_name, team, result, kills, game_length_minutes, game_date, arena_name').eq('game_id', gameId),
  ]);
  const home = (squads || []).find((s: any) => s.id === match.squad_a_id);
  const away = (squads || []).find((s: any) => s.id === match.squad_b_id);
  if (!home || !away) return { recorded: false, reason: 'squads not found' };
  if (!rows || rows.length === 0) return { recorded: false, reason: 'no stat rows for this game yet' };

  // Per in-game team: which squad it belongs to, whether it won, and its kills.
  const byTag = new Map<string, { squadId: string; win: boolean; loss: boolean; kills: number }>();
  for (const r of rows as any[]) {
    const tag = squadTagOfTeam(r.team);
    const squadId = tag === tagOf(home) ? home.id : tag === tagOf(away) ? away.id : null;
    if (!squadId) continue; // spec / np / stray teams
    const e = byTag.get(squadId) || { squadId, win: false, loss: false, kills: 0 };
    const res = String(r.result || '').toLowerCase();
    if (res === 'win') e.win = true;
    if (res === 'loss') e.loss = true;
    e.kills += Number(r.kills) || 0;
    byTag.set(squadId, e);
  }
  const h = byTag.get(home.id), a = byTag.get(away.id);
  if (!h || !a) return { recorded: false, reason: `game teams don't match the fixture's squads (${tagOf(home)} / ${tagOf(away)})` };
  const winnerId = h.win && !a.win ? home.id : a.win && !h.win ? away.id : null;
  if (!winnerId) return { recorded: false, reason: h.win && a.win ? 'both teams marked as winners' : 'no winner in the stat rows (undecided game?)' };

  const minutes = Math.max(0, ...(rows as any[]).map((r) => Number(r.game_length_minutes) || 0)) || null;
  const rules = await loadSeasonRules(seasonId);
  const matchKind: MatchKind = match.stage === 'fs' ? 'fs' : 'rs';
  const matchType = match.stage === 'playoff' ? 'Playoffs' : 'Season';
  const winType: WinType | null = winTypeFromMinutes(rules, minutes);
  const playedAt = (rows as any[])[0]?.game_date ? new Date((rows as any[])[0].game_date).toISOString() : new Date().toISOString();

  const insert: Record<string, unknown> = {
    league_season_id: seasonId,
    team_a_name: home.name,
    team_b_name: away.name,
    team_a_squad_id: home.id,
    team_b_squad_id: away.id,
    team_a_result: winnerId === home.id ? 'Win' : 'Loss',
    team_b_result: winnerId === away.id ? 'Win' : 'Loss',
    team_a_kills: h.kills,
    team_b_kills: a.kills,
    match_date: playedAt,
    season_number: match.season_number,
    game_id: gameId,
    match_type: matchType,
    game_length_minutes: minutes,
    arena_name: (rows as any[])[0]?.arena_name || null,
    match_kind: matchKind,
    win_type: winType,
    no_contest: false,
    verified: true, // the zone ran it: as good as a recording
    fixture_id: match.id,
  };
  let res = await supabaseAdmin.from('league_matches').insert(insert).select('id').single();
  if (res.error && /column .*does not exist/i.test(res.error.message)) {
    const { match_kind: _mk, win_type: _wt, no_contest: _nc, verified: _v, fixture_id: _f, ...basic } = insert;
    res = await supabaseAdmin.from('league_matches').insert(basic).select('id').single();
  }
  if (res.error) return { recorded: false, reason: res.error.message };

  // Close the fixture the same way the match manager does.
  await supabaseAdmin.from('matches').update({
    status: 'completed',
    completed_at: playedAt,
    winner_squad_id: winnerId,
    squad_a_score: h.kills,
    squad_b_score: a.kills,
    game_id: gameId,
    actual_end_time: playedAt,
    match_notes: `Result recorded automatically from game ${gameId} (${winType || 'no win type'}${minutes ? `, ${minutes.toFixed(0)} min` : ''}). Staff can remove it in the match manager if it's wrong.`,
  }).eq('id', match.id);

  if (matchType === 'Season') await rebuildStandings(seasonId);
  return { recorded: true, winner_squad_id: winnerId, win_type: winType, minutes, league_match_id: res.data?.id || null };
}

/** Staff override: drop a recorded result, reopen its fixture, rebuild standings. */
export async function removeLeagueResult(leagueMatchId: string): Promise<{ ok: boolean; error?: string }> {
  const { data: row, error } = await supabaseAdmin.from('league_matches').select('id, league_season_id, fixture_id, match_type').eq('id', leagueMatchId).maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!row) return { ok: false, error: 'Result not found' };
  const { error: delErr } = await supabaseAdmin.from('league_matches').delete().eq('id', leagueMatchId);
  if (delErr) return { ok: false, error: delErr.message };
  if ((row as any).fixture_id) {
    await supabaseAdmin.from('matches').update({
      status: 'scheduled', completed_at: null, winner_squad_id: null, squad_a_score: null, squad_b_score: null, actual_end_time: null,
      match_notes: 'Recorded result removed by staff; re-enter it in the match manager.',
    }).eq('id', (row as any).fixture_id);
  }
  if ((row as any).league_season_id) await rebuildStandings((row as any).league_season_id);
  return { ok: true };
}
