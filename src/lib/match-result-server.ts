import { createClient } from '@supabase/supabase-js';
import { winTypeFromMinutes, type MatchKind, type WinType } from '@/lib/scoring';
import { loadSeasonRules, rebuildStandings } from '@/lib/standings-server';
import { greenBlockedFor, loadSquads, tagOf } from '@/lib/match-setup-server';
import { fsCapCheck } from '@/lib/fs-server';

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

/**
 * Which of the arena's games is the match. Every game the arena runs (a warm-up before kick-off,
 * a restart, a game after the match) saves its own stats under its own game id. The match is the
 * first game the zone reports as played with a winner THAT STARTED AT KICK-OFF: a game that began
 * more than this long before the scheduled time is a warm-up and is never recorded, even if it
 * ended with a winner (the arena's countdown timer ends the warm-up game at kick-off).
 */
export const EARLY_START_GRACE_MS = 10 * 60 * 1000;

export interface AutoRecordOutcome {
  recorded: boolean;
  /** True when the game was refused as a pre-match warm-up: the match stays open for the real game. */
  warmup?: boolean;
  /** True when the game had no winner (restarted / abandoned): the match stays open for the real game. */
  aborted?: boolean;
  /** Dry run only: this game is recordable (has a winner and matches the fixture's squads). */
  would_record?: boolean;
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
export const squadTagOfTeam = (team: string) => String(team || '').replace(/\s+[TC]$/i, '').trim().toUpperCase();

/**
 * opts.staffPick  a staff member chose this game on the match page: the warm-up guard is skipped
 *                 (staff know which game was the match).
 * opts.dryRun     work out what would be recorded and stop before writing anything
 *                 (`would_record` on the outcome); also skips the "already recorded" check.
 */
export async function autoRecordFromGame(match: any, gameId: string, opts: { staffPick?: boolean; dryRun?: boolean } = {}): Promise<AutoRecordOutcome> {
  if (!match.league_slug || !match.season_number) return { recorded: false, reason: 'not a league fixture' };
  if (!match.squad_a_id || !match.squad_b_id) return { recorded: false, reason: 'fixture has no squads' };
  if (match.league_slug === 'ctfpl') return { recorded: false, reason: 'CTFPL results are entered by staff' };

  // Already recorded (by the zone earlier, or by staff)? Leave it alone.
  if (!opts.dryRun) {
    const { data: existing } = await supabaseAdmin
      .from('league_matches')
      .select('id')
      .or(`fixture_id.eq.${match.id},game_id.eq.${gameId}`)
      .limit(1);
    if (existing && existing.length > 0) return { recorded: false, reason: 'already recorded', league_match_id: existing[0].id };
  }

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
  // No winner = a game that was restarted or abandoned before a team held the flags to win.
  // It is never the match result; the match stays open for the game that is decided.
  if (!winnerId) return { recorded: false, aborted: !(h.win && a.win), reason: h.win && a.win ? 'both teams marked as winners' : 'no winner in the stat rows: a restarted or abandoned game, not the match result' };

  const minutes = Math.max(0, ...(rows as any[]).map((r) => Number(r.game_length_minutes) || 0)) || null;

  // Warm-up guard. The report arrives as the game ends, so it started about `minutes` ago. A game
  // that began well before the scheduled kick-off is not the match.
  const kickoff = match.scheduled_at && match.time_tbd !== true ? new Date(match.scheduled_at).getTime() : NaN;
  if (!Number.isNaN(kickoff) && !opts.staffPick) {
    const startedAt = Date.now() - (minutes || 0) * 60_000;
    if (startedAt < kickoff - EARLY_START_GRACE_MS) {
      const early = Math.round((kickoff - startedAt) / 60_000);
      return { recorded: false, warmup: true, minutes, reason: `warm-up: this game started about ${early} min before the scheduled kick-off, so it is not the match. If the match really was played early, change its time on the site or record the result in the match manager.` };
    }
  }

  const rules = await loadSeasonRules(seasonId);
  const matchKind: MatchKind = match.stage === 'fs' ? 'fs' : 'rs';
  const matchType = match.stage === 'playoff' ? 'Playoffs' : 'Season';
  const winType: WinType | null = winTypeFromMinutes(rules, minutes);
  const playedAt = (rows as any[])[0]?.game_date ? new Date((rows as any[])[0].game_date).toISOString() : new Date().toISOString();
  if (opts.dryRun) return { recorded: false, would_record: true, winner_squad_id: winnerId, win_type: winType, minutes };

  // FS Red / Green. A Green match in which a round 1-3 pick actually played scores as Red for
  // both squads. "Played" = has a stat row on a squad's STARTING team; the bench sits in spec on
  // the squad's other team name and doesn't count.
  let fsColor: 'red' | 'green' | null = null;
  let greenBroken: string[] = [];
  if (matchKind === 'fs' && rules.fs.colors) {
    fsColor = match.fs_color === 'green' ? 'green' : 'red';
    if (fsColor === 'green') {
      const squadsFull = await loadSquads([home.id, away.id]);
      const green = await greenBlockedFor(match, squadsFull);
      if (green && green.blocked.size > 0) {
        const ids = Array.from(green.blocked);
        const [{ data: profs }, { data: aliases }, { data: setupRow }] = await Promise.all([
          supabaseAdmin.from('profiles').select('id, in_game_alias').in('id', ids),
          supabaseAdmin.from('profile_aliases').select('profile_id, alias').in('profile_id', ids),
          supabaseAdmin.from('match_setup').select('home_side').eq('match_id', match.id).maybeSingle(),
        ]);
        const nameOf = new Map<string, string>(); // any known name (lower-cased) → display alias
        (profs || []).forEach((p: any) => { if (p.in_game_alias) nameOf.set(String(p.in_game_alias).trim().toLowerCase(), p.in_game_alias); });
        (aliases || []).forEach((a: any) => {
          const main = (profs || []).find((p: any) => p.id === a.profile_id)?.in_game_alias || a.alias;
          if (a.alias) nameOf.set(String(a.alias).trim().toLowerCase(), main);
        });
        const side = (setupRow as any)?.home_side as 'titan' | 'collective' | undefined;
        const startingTeams = side
          ? new Set([`${tagOf(home)} ${side === 'titan' ? 'T' : 'C'}`, `${tagOf(away)} ${side === 'titan' ? 'C' : 'T'}`].map((t) => t.toUpperCase()))
          : null; // side unknown: any row on either squad's teams counts
        const hit = new Set<string>();
        for (const r of rows as any[]) {
          const team = String(r.team || '').trim().toUpperCase();
          const onField = startingTeams ? startingTeams.has(team) : [tagOf(home), tagOf(away)].includes(squadTagOfTeam(team));
          const who = nameOf.get(String(r.player_name || '').trim().toLowerCase());
          if (onField && who) hit.add(who);
        }
        greenBroken = Array.from(hit);
        if (greenBroken.length) fsColor = 'red';
      }
    }
  }
  // A Green that dropped to Red counts against the Red limits from here on. If that takes a squad
  // over a Red limit, the match does not count: it is recorded as a no-contest, nobody scores
  // (John, 2026-10-03: "a red match over the limit shouldn't count").
  let overRedLimit: string | null = null;
  if (greenBroken.length) {
    overRedLimit = await fsCapCheck(seasonId, match.league_slug, match.season_number, rules, home.id, away.id, playedAt, match.id, { a: home.name, b: away.name }, 'red').catch(() => null);
    if (overRedLimit && /^FS clos/i.test(overRedLimit)) overRedLimit = null; // the cut-off date is not a colour limit
  }

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
    no_contest: !!overRedLimit, // a Red over the limit scores nothing
    verified: true, // the zone ran it: as good as a recording
    fixture_id: match.id,
    ...(fsColor ? { fs_color: fsColor } : {}),
  };
  let res = await supabaseAdmin.from('league_matches').insert(insert).select('id').single();
  if (res.error && /fs_color/.test(res.error.message)) {
    // Before add-fs-colors.sql: record it without the colour (scores as red).
    const { fs_color: _fc, ...noColor } = insert;
    res = await supabaseAdmin.from('league_matches').insert(noColor).select('id').single();
  }
  if (res.error && /column .*does not exist/i.test(res.error.message)) {
    const { match_kind: _mk, win_type: _wt, no_contest: _nc, verified: _v, fixture_id: _f, fs_color: _fc2, ...basic } = insert;
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
    match_notes: `Result recorded ${opts.staffPick ? 'from the game staff picked,' : 'automatically from game'} ${gameId} (${winType || 'no win type'}${minutes ? `, ${minutes.toFixed(0)} min` : ''}).${greenBroken.length ? ` Booked as FS Green but scored as FS Red: ${greenBroken.join(', ')} (round 1–${rules.fs.green_min_round - 1}) played.${overRedLimit ? ` As a Red match it is over the limit, so it does NOT count: no points for either squad. ${overRedLimit}` : ' It now counts against the Red limits.'}` : ''} Staff can remove it in the match manager if it's wrong.`,
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
