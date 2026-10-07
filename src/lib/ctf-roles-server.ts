import { createClient } from '@supabase/supabase-js';
import { draftRole, statClass, type PlayerRoles, type RoleKey } from '@/lib/ctf-roles';

/**
 * Loads what each player plays (see src/lib/ctf-roles.ts): their league
 * registration and their CTF mix history. Public data either way: the free
 * agent board shows the registration and /stats shows the games.
 */

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const PAGE = 1000;
const MAX_ROWS = 8000;

export async function loadPlayerRoles(
  players: { player_id: string; alias: string }[],
  context: { league_slug?: string | null; season_number?: number | null } = {},
): Promise<Record<string, PlayerRoles>> {
  const ids = Array.from(new Set(players.map((p) => p.player_id)));
  if (ids.length === 0) return {};

  const [faRes, aliasRes] = await Promise.all([
    supabaseAdmin
      .from('free_agents')
      .select('player_id, preferred_roles, secondary_roles, class_ratings, league_slug, season_number, updated_at, created_at')
      .in('player_id', ids),
    supabaseAdmin.from('profile_aliases').select('profile_id, alias').in('profile_id', ids),
  ]);

  // Draft entry: this match's league + season, else that league's latest, else the latest anywhere.
  const draftBy = new Map<string, any>();
  const score = (r: any) =>
    (r.league_slug && r.league_slug === context.league_slug ? 2e6 : 0) +
    (r.league_slug === context.league_slug && r.season_number === context.season_number ? 1e6 : 0) +
    (Number(r.season_number) || 0) * 1000 +
    new Date(r.updated_at || r.created_at || 0).getTime() / 1e13;
  (faRes.data || []).forEach((r: any) => {
    const cur = draftBy.get(r.player_id);
    if (!cur || score(r) > score(cur)) draftBy.set(r.player_id, r);
  });

  // Every name a player has used, so mix rows under an old alias still count.
  const idByName = new Map<string, string>();
  players.forEach((p) => p.alias && idByName.set(p.alias, p.player_id));
  (aliasRes.data || []).forEach((a: any) => a.alias && !idByName.has(a.alias) && idByName.set(a.alias, a.profile_id));
  const names = Array.from(idByName.keys());

  const mixBy = new Map<string, { classes: Map<RoleKey, { n: number; o: number; d: number }>; games: number; offense: number; defense: number }>();
  for (let from = 0; names.length && from < MAX_ROWS; from += PAGE) {
    const { data, error } = await supabaseAdmin
      .from('player_stats')
      .select('player_name, main_class, side')
      .eq('game_mode', 'Mix')
      .in('player_name', names)
      .order('game_date', { ascending: false })
      .range(from, from + PAGE - 1);
    if (error) { console.error('player roles: mix stats failed', error.message); break; }
    (data || []).forEach((r: any) => {
      const pid = idByName.get(r.player_name);
      const key = statClass(r.main_class);
      if (!pid || !key) return;
      let m = mixBy.get(pid);
      if (!m) { m = { classes: new Map(), games: 0, offense: 0, defense: 0 }; mixBy.set(pid, m); }
      const c = m.classes.get(key) || { n: 0, o: 0, d: 0 };
      c.n += 1;
      if (r.side === 'offense') { c.o += 1; m.offense += 1; }
      if (r.side === 'defense') { c.d += 1; m.defense += 1; }
      m.classes.set(key, c);
      m.games += 1;
    });
    if (!data || data.length < PAGE) break;
  }

  const out: Record<string, PlayerRoles> = {};
  ids.forEach((id) => {
    const fa = draftBy.get(id);
    const ratings: Record<string, number> = fa?.class_ratings && typeof fa.class_ratings === 'object' ? fa.class_ratings : {};
    const known = (r: unknown): r is string => typeof r === 'string' && !!draftRole(r);
    const mainsRaw: string[] = Array.isArray(fa?.preferred_roles) ? fa.preferred_roles.filter(known) : [];
    // Best first: their ★ rating, then the order they ticked them in.
    const mains = mainsRaw
      .map((r, i) => ({ r, i, s: Number(ratings[r]) || 0 }))
      .sort((a, b) => b.s - a.s || a.i - b.i)
      .map((x) => x.r);
    const secondaries: string[] = Array.isArray(fa?.secondary_roles) ? fa.secondary_roles.filter((r: unknown) => known(r) && !mains.includes(r as string)) : [];
    const mix = mixBy.get(id);
    out[id] = {
      mains,
      secondaries,
      ratings,
      draft_season: fa && !(fa.league_slug === context.league_slug && fa.season_number === context.season_number) ? fa.season_number ?? null : null,
      mix: mix
        ? {
            games: mix.games,
            offense: mix.offense,
            defense: mix.defense,
            classes: Array.from(mix.classes.entries()).map(([key, c]) => ({ key, ...c })).sort((a, b) => b.n - a.n),
          }
        : null,
    };
  });
  return out;
}
