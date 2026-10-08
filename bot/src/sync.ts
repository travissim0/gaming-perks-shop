import type { Guild } from 'discord.js';
import { config } from './config.js';
import { db, deleteMapping, getLinkedDiscordIds, getMappings, getSeasonContext, getSeasonTeams, saveMapping, writeState, type ChannelMapping, type SeasonContext } from './db.js';
import { clearLeadRoles, ensureTeam, findOrphans, postStaff, syncLeadRoles, syncRoleMembers, teardownTeam, vouchedLeads } from './discord.js';
import { syncProduction } from './production.js';

/**
 * What the staff channel was last told about players who can't get a squad role. null until the
 * first sync after a start: that sync only takes a note, so a restart never re-posts the list.
 * After that, only the CHANGES are posted (who newly needs linking, who no longer does), never
 * the whole list again. The full list lives on the site (CTF management → Discord).
 */
let lastUnlinked: Set<string> | null = null;
/** Production Team holders without a freeinf.org link, as last reported (same change-only rule). */
let lastProdUnlinked: Set<string> | null = null;
let lastNotInServer: Set<string> | null = null;
/** Set while a draft is running: the channel stays quiet and gets one summary when it ends. */
let draftWasLive = false;
let running = false;
let queued = false;

const LIST_MAX = 15;
const shortList = (items: string[]) => (items.length <= LIST_MAX ? items.join(', ') : `${items.slice(0, LIST_MAX).join(', ')} and ${items.length - LIST_MAX} more`);

/** Is this season's draft being run right now? Picks land every few seconds then; reporting each sync floods the channel. */
async function draftIsLive(ctx: SeasonContext): Promise<boolean> {
  if (ctx.league.format !== 'draft') return false;
  const { data } = await db.from('ctfdl_drafts').select('status').eq('league_season_id', ctx.season.id).maybeSingle();
  const status = (data as any)?.status;
  return status === 'live' || status === 'paused';
}

/**
 * Full reconcile: site → Discord. Creates what's missing, fixes names and
 * permissions, grants/removes roles, and tears down teams that left the season.
 * Never deletes anything for a season that's still running unless the team is
 * gone from the site.
 */
export async function reconcile(guild: Guild, reason: string): Promise<string> {
  if (running) { queued = true; return 'queued'; }
  running = true;
  try {
    const ctx = await getSeasonContext();
    if (!ctx) { await writeState({ last_sync_at: new Date().toISOString(), last_result: 'no season' }); return 'no season'; }
    const teams = await getSeasonTeams(ctx);
    const mappings = await getMappings(guild.id, ctx.season.id);
    const linked = await getLinkedDiscordIds();
    const byId = new Map(mappings.map((m) => [m.squad_id, m]));

    // Make sure member cache is warm so role membership diffs are accurate.
    await guild.members.fetch().catch((e) => console.warn('members.fetch failed (enable Server Members Intent):', e.message));
    await guild.roles.fetch();
    await guild.channels.fetch();

    const lines: string[] = [];
    const unlinked: string[] = [];
    const notInServer: string[] = [];

    for (const team of teams) {
      const existing = byId.get(team.squadId) ?? null;
      const heldRole = existing ? guild.roles.cache.get(existing.role_id) : undefined;
      const vouched = heldRole ? vouchedLeads(heldRole, linked).filter((id) => !team.leadDiscordIds.includes(id)) : [];
      const withLeads = vouched.length ? { ...team, leadDiscordIds: [...team.leadDiscordIds, ...vouched] } : team;
      const mapping = await ensureTeam(guild, withLeads, existing, async (m) => {
        if (!config.dryRun) await saveMapping(guild.id, ctx.season.id, m);
      });
      const role = guild.roles.cache.get(mapping.role_id);
      if (role) {
        const r = await syncRoleMembers(guild, role, team, linked);
        if (r.added.length) lines.push(`${team.name}: +${r.added.join(', ')}`);
        if (r.removed.length) lines.push(`${team.name}: −${r.removed.join(', ')}`);
        r.notInServer.forEach((a) => notInServer.push(`${a} (${team.name})`));
      }
      team.members.filter((m) => !m.discordId).forEach((m) => unlinked.push(`${m.alias} (${team.name})`));
      byId.delete(team.squadId);
    }

    lines.push(...(await syncLeadRoles(guild, teams, linked)));
    const production = await syncProduction(guild);
    lines.push(...production.lines);

    // Teams that were set up earlier this season but are no longer part of it.
    for (const stale of byId.values()) {
      await teardownTeam(guild, stale);
      if (!config.dryRun) await deleteMapping(guild.id, ctx.season.id, stale.squad_id);
      lines.push(`removed ${stale.squad_name} (no longer in the season)`);
    }
    // Leftovers the bot created but has no record of (crash mid-setup, table reset).
    for (const orphan of findOrphans(guild, teams, mappings)) {
      await teardownTeam(guild, orphan);
      lines.push(`removed leftover ${orphan.squad_name}`);
    }

    // Reporting. Roles are always applied above; this only decides what the staff channel hears.
    const nowUnlinked = new Set(unlinked);
    const nowNotInServer = new Set(notInServer);
    const live = await draftIsLive(ctx).catch(() => false);

    if (live) {
      // A draft is running: say nothing per sync. One summary goes out when it ends.
      draftWasLive = true;
    } else if (draftWasLive) {
      draftWasLive = false;
      const perTeam = teams.map((t) => {
        const waiting = t.members.filter((m) => !m.discordId).length;
        return `• ${t.name}: ${t.members.length} on the roster${waiting ? `, ${waiting} not linked to Discord` : ''}`;
      });
      await postStaff(guild, [
        `**Draft finished: squad roles are set**`,
        ...perTeam,
        unlinked.length
          ? `${unlinked.length} drafted player${unlinked.length === 1 ? ' has' : 's have'} not linked Discord on freeinf.org, so they can't get a squad role yet. Captains can add them with \`/squad add @player\`. The full list is on the site: CTF management → Discord.`
          : 'Everyone drafted has linked Discord.',
      ].join('\n'));
    } else {
      if (lines.length) await postStaff(guild, `**freeinf.org sync** (${reason})\n${lines.map((l) => `• ${l}`).join('\n')}`);
      // Only what changed since the last sync, and nothing at all on the first sync after a start.
      if (lastUnlinked && lastNotInServer) {
        const added = unlinked.filter((u) => !lastUnlinked!.has(u));
        const cleared = [...lastUnlinked].filter((u) => !nowUnlinked.has(u));
        const awayNew = notInServer.filter((u) => !lastNotInServer!.has(u));
        const parts: string[] = [];
        if (added.length) parts.push(`• New, not linked to Discord yet: ${shortList(added)}`);
        if (cleared.length) parts.push(`• No longer waiting: ${shortList(cleared)}`);
        if (awayNew.length) parts.push(`• Linked but not in this server: ${shortList(awayNew)}`);
        const prodNew = production.unlinked.filter((u) => !lastProdUnlinked?.has(u));
        if (prodNew.length) parts.push(`• Production Team but not linked on freeinf.org (can't be made Commentator): ${shortList(prodNew)}`);
        if (parts.length) await postStaff(guild, `**Discord links** · ${unlinked.length} still can't get a squad role\n${parts.join('\n')}`);
      }
    }
    lastUnlinked = nowUnlinked;
    lastNotInServer = nowNotInServer;
    lastProdUnlinked = new Set(production.unlinked);

    const result = `${teams.length} teams, ${lines.length} changes, ${unlinked.length} unlinked`;
    await writeState({ last_sync_at: new Date().toISOString(), last_result: result, last_error: null, season_id: ctx.season.id, guild_id: guild.id });
    console.log(`sync (${reason}): ${result}`);
    return result;
  } catch (e: any) {
    console.error('sync failed:', e);
    await writeState({ last_error: String(e?.message || e), updated_at: new Date().toISOString() }).catch(() => {});
    return `error: ${e?.message || e}`;
  } finally {
    running = false;
    if (queued) { queued = false; setTimeout(() => reconcile(guild, 'queued change'), 1000); }
  }
}

/** Remove every squad role/category/channel the bot created for a season. */
export async function teardownSeason(guild: Guild, seasonId: string): Promise<string> {
  const mappings: ChannelMapping[] = await getMappings(guild.id, seasonId);
  await guild.roles.fetch();
  await guild.channels.fetch();
  for (const m of mappings) {
    await teardownTeam(guild, m);
    if (!config.dryRun) await deleteMapping(guild.id, seasonId, m.squad_id);
  }
  const leads = await clearLeadRoles(guild);
  const msg = `Season teardown: removed ${mappings.length} squad${mappings.length === 1 ? '' : 's'} (roles, categories and channels)${leads ? ` and ${leads} captain/co-captain role${leads === 1 ? '' : 's'}` : ''}.`;
  await postStaff(guild, `**freeinf.org** ${msg}`);
  await writeState({ last_result: msg, updated_at: new Date().toISOString() });
  return msg;
}
