import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import { getLeagues, getOpenSeason, pickFeatured, seasonLabel } from '@/lib/leagues';

/**
 * Staff ↔ bot bridge.
 * GET  → { state, pending, channels, roster } for the admin panel
 * POST { action: 'sync' | 'teardown', season_id? } → queues a command the bot picks up
 */

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

export interface RosterPerson {
  id: string;
  alias: string;
  /** captain / co-captain / member of a season team, or registered in the pool */
  role: 'captain' | 'co_captain' | 'member' | 'pool';
  squad: string | null;
  discord: { username: string; in_guild: boolean; nick: string | null; linked_at: string | null } | null;
}

/**
 * Everyone the bot cares about this season — season-team captains and members
 * (draft teams for draft leagues, active squads otherwise) plus the free-agent
 * pool — with their Discord link status. Same selection the bot itself makes.
 */
async function loadRoster(): Promise<{ season: string | null; people: RosterPerson[] }> {
  const league = pickFeatured(await getLeagues());
  if (!league) return { season: null, people: [] };
  const season = await getOpenSeason(league);
  if (!season) return { season: null, people: [] };

  let squadIds: string[] = [];
  if (league.format === 'draft') {
    const { data: draft } = await supabaseAdmin.from('ctfdl_drafts').select('id').eq('league_season_id', season.id).maybeSingle();
    if (draft) {
      const { data: teams } = await supabaseAdmin.from('ctfdl_draft_teams').select('squad_id').eq('draft_id', draft.id);
      squadIds = (teams || []).map((t: any) => t.squad_id);
    }
  } else {
    const { data: squads } = await supabaseAdmin.from('squads').select('id, league_slug, is_legacy').eq('is_active', true);
    squadIds = (squads || []).filter((s: any) => !s.is_legacy && (s.league_slug === league.slug || !s.league_slug)).map((s: any) => s.id);
  }

  const [{ data: squads }, { data: members }, { data: pool }] = await Promise.all([
    squadIds.length ? supabaseAdmin.from('squads').select('id, name, captain_id').in('id', squadIds) : Promise.resolve({ data: [] as any[] }),
    squadIds.length ? supabaseAdmin.from('squad_members').select('squad_id, player_id, role').in('squad_id', squadIds).eq('status', 'active') : Promise.resolve({ data: [] as any[] }),
    supabaseAdmin.from('free_agents').select('player_id').eq('is_active', true).eq('league_slug', league.slug).eq('season_number', season.season_number),
  ]);

  // Who is what. A person on a team is listed under the team, not the pool.
  const roleOf = new Map<string, { role: RosterPerson['role']; squad: string | null }>();
  (pool || []).forEach((r: any) => roleOf.set(r.player_id, { role: 'pool', squad: null }));
  const squadName = new Map<string, string>((squads || []).map((s: any) => [s.id, s.name]));
  (members || []).forEach((m: any) => roleOf.set(m.player_id, { role: m.role === 'co_captain' ? 'co_captain' : 'member', squad: squadName.get(m.squad_id) || null }));
  (squads || []).forEach((s: any) => s.captain_id && roleOf.set(s.captain_id, { role: 'captain', squad: s.name }));

  const ids = Array.from(roleOf.keys());
  const { data: profiles } = ids.length
    ? await supabaseAdmin
        .from('profiles')
        .select('id, in_game_alias, discord_id, discord_username, discord_in_guild, discord_guild_nick, discord_linked_at')
        .in('id', ids)
    : { data: [] as any[] };

  const people: RosterPerson[] = (profiles || []).map((p: any) => {
    const r = roleOf.get(p.id)!;
    return {
      id: p.id,
      alias: p.in_game_alias || 'Unknown',
      role: r.role,
      squad: r.squad,
      discord: p.discord_id
        ? { username: p.discord_username || p.discord_id, in_guild: p.discord_in_guild === true, nick: p.discord_guild_nick || null, linked_at: p.discord_linked_at || null }
        : null,
    };
  });

  const rank = { captain: 0, co_captain: 1, member: 2, pool: 3 };
  people.sort((a, b) => (a.squad || '￿').localeCompare(b.squad || '￿') || rank[a.role] - rank[b.role] || a.alias.localeCompare(b.alias));
  return { season: seasonLabel(league, season), people };
}

async function requireStaff(request: NextRequest) {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) return null;
  const { data: { user }, error } = await supabase.auth.getUser(authHeader.slice(7));
  if (error || !user) return null;
  const { data: p } = await supabaseAdmin.from('profiles').select('is_admin, ctf_role').eq('id', user.id).maybeSingle();
  return p && (p.is_admin === true || p.ctf_role === 'ctf_admin') ? user : null;
}

export async function GET(request: NextRequest) {
  const user = await requireStaff(request);
  if (!user) return NextResponse.json({ error: 'Staff only' }, { status: 403 });
  const [{ data: state, error }, { data: pending }, { data: channels }, roster] = await Promise.all([
    supabaseAdmin.from('discord_bot_state').select('*').eq('id', 1).maybeSingle(),
    supabaseAdmin.from('discord_bot_commands').select('id, action, created_at').is('done_at', null),
    supabaseAdmin.from('discord_squad_channels').select('squad_id, squad_name, season_id, updated_at'),
    loadRoster().catch((e) => { console.error('discord roster failed', e); return { season: null, people: [] as RosterPerson[] }; }),
  ]);
  if (error && /does not exist/i.test(error.message)) return NextResponse.json({ pending_sql: true });
  return NextResponse.json(
    { state: state || null, pending: pending || [], channels: channels || [], roster },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}

export async function POST(request: NextRequest) {
  const user = await requireStaff(request);
  if (!user) return NextResponse.json({ error: 'Staff only' }, { status: 403 });
  const body = await request.json().catch(() => null);
  const action = body?.action;
  if (action !== 'sync' && action !== 'teardown') return NextResponse.json({ error: 'action must be sync or teardown' }, { status: 400 });
  if (action === 'teardown' && !body.season_id) return NextResponse.json({ error: 'season_id required for teardown' }, { status: 400 });
  const { data, error } = await supabaseAdmin
    .from('discord_bot_commands')
    .insert({ action, season_id: body.season_id || null, requested_by: user.id })
    .select('id')
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, id: data.id });
}
