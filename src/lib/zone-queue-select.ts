import { supabaseAdmin } from '@/lib/match-setup-server';

/**
 * The matches the zone's automation should see. Shared by /api/matches/zone-queue (the full payload)
 * and /api/matches/zone-queue/changes (the light "did anything change" check), so the two can never
 * disagree about WHICH matches are in the queue.
 *
 *   hours   look-ahead window
 *   past    also include matches that started up to this many hours ago
 *   league  restrict to one league slug ('' = every league match)
 */
export async function selectZoneQueueMatches(opts: { hours: number; past: number; league: string; now: number }) {
  const { hours, past, league, now } = opts;

  const run = (skip: string[]) => {
    const extra = ['fs_color', 'fs_status'].filter((c) => !skip.includes(c));
    let query = supabaseAdmin
      .from('matches')
      .select(['id, title, scheduled_at, status, match_type, league_slug, season_number, week, stage, playoff_round, squad_a_id, squad_b_id, game_id', ...extra].join(', '))
      .in('status', ['scheduled', 'in_progress'])
      .not('squad_a_id', 'is', null)
      .not('squad_b_id', 'is', null)
      .gte('scheduled_at', new Date(now - past * 3_600_000).toISOString())
      .lte('scheduled_at', new Date(now + hours * 3_600_000).toISOString())
      .order('scheduled_at', { ascending: true })
      .limit(50);
    // "Time TBD" fixtures have no kick-off time (scheduled_at is only their play-by day), so the
    // zone must not open an arena for them. They join the queue once staff set a real time.
    if (!skip.includes('time_tbd')) query = query.eq('time_tbd', false);
    // Per-match switch: staff marked this one to be run by hand.
    if (!skip.includes('manual_zone')) query = query.eq('manual_zone', false);
    if (league) query = query.eq('league_slug', league);
    else query = query.not('league_slug', 'is', null);
    return query;
  };

  // Each optional column arrives with its own SQL file; drop a filter whose column is missing.
  const skip: string[] = [];
  let { data, error } = await run(skip);
  for (let i = 0; i < 4 && error; i++) {
    const col = ['time_tbd', 'manual_zone', 'fs_color', 'fs_status'].find((c) => !skip.includes(c) && error!.message.includes(c));
    if (!col) break;
    skip.push(col);
    ({ data, error } = await run(skip));
  }
  return { data: (data || []) as any[], error };
}
