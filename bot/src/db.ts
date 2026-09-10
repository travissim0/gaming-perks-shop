import { createClient } from '@supabase/supabase-js';
import WebSocket from 'ws';
import { config } from './config.js';

/**
 * Everything the bot reads from and writes to the site's database.
 * Uses the service-role key: RLS does not apply.
 * Node 20 has no global WebSocket, so Realtime gets the `ws` implementation.
 */
export const db = createClient(config.supabaseUrl, config.supabaseKey, {
  auth: { persistSession: false, autoRefreshToken: false },
  realtime: { params: { eventsPerSecond: 5 }, transport: WebSocket as unknown as any },
});

export interface SeasonContext {
  league: { id: string; slug: string; name: string; format: string | null };
  season: { id: string; season_number: number; status: string };
}

export interface TeamRoster {
  squadId: string;
  name: string;
  tag: string | null;
  captainId: string | null;
  captainDiscordId: string | null;
  /** Every active member incl. captain: site alias + Discord id (null when not linked). */
  members: { playerId: string; alias: string; discordId: string | null }[];
}

export interface ChannelMapping {
  squad_id: string;
  role_id: string;
  category_id: string;
  text_channel_id: string | null;
  voice_team_id: string | null;
  voice_offense_id: string | null;
  voice_defense_id: string | null;
  squad_name: string;
}

/** The featured league and its running (active, else upcoming) season. */
export async function getSeasonContext(): Promise<SeasonContext | null> {
  const { data: leagues } = await db.from('leagues').select('id, slug, name, format, is_featured, display_order').order('display_order');
  const league = (leagues || []).find((l: any) => l.is_featured) || (leagues || []).find((l: any) => l.slug === 'ctfpl') || (leagues || [])[0];
  if (!league) return null;

  const table = league.slug === 'ctfpl' ? 'ctfpl_seasons' : 'league_seasons';
  let q = db.from(table).select('id, season_number, status').in('status', ['active', 'upcoming']).order('season_number', { ascending: false });
  if (table === 'league_seasons') q = q.eq('league_id', league.id);
  const { data: seasons } = await q;
  const season = (seasons || []).find((s: any) => s.status === 'active') || (seasons || [])[0];
  if (!season) return null;
  return { league: { id: league.id, slug: league.slug, name: league.name, format: league.format ?? null }, season };
}

/** Teams that belong to the season: drafted teams for draft leagues, tagged/untagged active squads otherwise. */
export async function getSeasonTeams(ctx: SeasonContext): Promise<TeamRoster[]> {
  let squadIds: string[] = [];
  if (ctx.league.format === 'draft') {
    const { data: draft } = await db.from('ctfdl_drafts').select('id').eq('league_season_id', ctx.season.id).maybeSingle();
    if (!draft) return [];
    const { data: teams } = await db.from('ctfdl_draft_teams').select('squad_id').eq('draft_id', draft.id);
    squadIds = (teams || []).map((t: any) => t.squad_id);
  } else {
    const { data: squads } = await db.from('squads').select('id, league_slug, is_legacy').eq('is_active', true);
    squadIds = (squads || []).filter((s: any) => !s.is_legacy && (s.league_slug === ctx.league.slug || !s.league_slug)).map((s: any) => s.id);
  }
  if (squadIds.length === 0) return [];

  const [{ data: squads }, { data: members }] = await Promise.all([
    db.from('squads').select('id, name, tag, captain_id').in('id', squadIds),
    db.from('squad_members').select('squad_id, player_id').in('squad_id', squadIds).eq('status', 'active'),
  ]);

  const playerIds = new Set<string>();
  (members || []).forEach((m: any) => playerIds.add(m.player_id));
  (squads || []).forEach((s: any) => s.captain_id && playerIds.add(s.captain_id));
  const { data: profiles } = playerIds.size
    ? await db.from('profiles').select('id, in_game_alias, discord_id').in('id', Array.from(playerIds))
    : { data: [] as any[] };
  const prof = new Map<string, { alias: string; discordId: string | null }>();
  (profiles || []).forEach((p: any) => prof.set(p.id, { alias: p.in_game_alias || 'Unknown', discordId: p.discord_id || null }));

  return (squads || []).map((s: any) => {
    const ids = new Set<string>((members || []).filter((m: any) => m.squad_id === s.id).map((m: any) => m.player_id));
    if (s.captain_id) ids.add(s.captain_id);
    return {
      squadId: s.id,
      name: s.name,
      tag: s.tag ?? null,
      captainId: s.captain_id ?? null,
      captainDiscordId: s.captain_id ? prof.get(s.captain_id)?.discordId ?? null : null,
      members: Array.from(ids).map((id) => ({ playerId: id, alias: prof.get(id)?.alias || 'Unknown', discordId: prof.get(id)?.discordId ?? null })),
    };
  });
}

export async function getMappings(guildId: string, seasonId: string): Promise<ChannelMapping[]> {
  const { data } = await db.from('discord_squad_channels').select('*').eq('guild_id', guildId).eq('season_id', seasonId);
  return (data || []) as ChannelMapping[];
}

export async function saveMapping(guildId: string, seasonId: string, m: ChannelMapping) {
  await db.from('discord_squad_channels').upsert({ guild_id: guildId, season_id: seasonId, ...m, updated_at: new Date().toISOString() }, { onConflict: 'guild_id,season_id,squad_id' });
}

export async function deleteMapping(guildId: string, seasonId: string, squadId: string) {
  await db.from('discord_squad_channels').delete().eq('guild_id', guildId).eq('season_id', seasonId).eq('squad_id', squadId);
}

export interface BotCommand { id: string; action: 'sync' | 'teardown'; season_id: string | null; requested_by: string | null }

export async function pendingCommands(): Promise<BotCommand[]> {
  const { data } = await db.from('discord_bot_commands').select('id, action, season_id, requested_by').is('done_at', null).order('created_at');
  return (data || []) as BotCommand[];
}

export async function finishCommand(id: string, result: string) {
  await db.from('discord_bot_commands').update({ done_at: new Date().toISOString(), result }).eq('id', id);
}

export async function writeState(patch: Record<string, unknown>) {
  await db.from('discord_bot_state').upsert({ id: 1, ...patch, updated_at: new Date().toISOString() });
}
