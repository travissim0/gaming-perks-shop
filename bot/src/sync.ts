import type { Guild } from 'discord.js';
import { createHash } from 'crypto';
import { config } from './config.js';
import { deleteMapping, getMappings, getSeasonContext, getSeasonTeams, saveMapping, writeState, type ChannelMapping } from './db.js';
import { ensureTeam, postStaff, syncRoleMembers, teardownTeam } from './discord.js';

let lastUnlinkedHash = '';
let running = false;
let queued = false;

/**
 * Full reconcile: site → Discord. Creates what's missing, fixes names and
 * permissions, grants/removes roles, and tears down teams that left the season.
 * Never deletes anything for a season that's still running unless the team is
 * gone from the site.
 */
export async function reconcile(guild: Guild, reason: string): Promise<string> {
  if (running) { queued = true; return 'queued'; }
  running = true;
  const started = Date.now();
  try {
    const ctx = await getSeasonContext();
    if (!ctx) { await writeState({ last_sync_at: new Date().toISOString(), last_result: 'no season' }); return 'no season'; }
    const teams = await getSeasonTeams(ctx);
    const mappings = await getMappings(guild.id, ctx.season.id);
    const byId = new Map(mappings.map((m) => [m.squad_id, m]));

    // Make sure member cache is warm so role membership diffs are accurate.
    await guild.members.fetch().catch((e) => console.warn('members.fetch failed (enable Server Members Intent):', e.message));
    await guild.roles.fetch();
    await guild.channels.fetch();

    const lines: string[] = [];
    const unlinked: string[] = [];
    const notInServer: string[] = [];

    for (const team of teams) {
      const mapping = await ensureTeam(guild, team, byId.get(team.squadId) ?? null);
      if (!config.dryRun) await saveMapping(guild.id, ctx.season.id, mapping);
      const role = guild.roles.cache.get(mapping.role_id);
      if (role) {
        const r = await syncRoleMembers(guild, role, team);
        if (r.added.length) lines.push(`${team.name}: +${r.added.join(', ')}`);
        if (r.removed.length) lines.push(`${team.name}: −${r.removed.join(', ')}`);
        r.notInServer.forEach((a) => notInServer.push(`${a} (${team.name})`));
      }
      team.members.filter((m) => !m.discordId).forEach((m) => unlinked.push(`${m.alias} (${team.name})`));
      byId.delete(team.squadId);
    }

    // Teams that were set up earlier this season but are no longer part of it.
    for (const stale of byId.values()) {
      await teardownTeam(guild, stale);
      if (!config.dryRun) await deleteMapping(guild.id, ctx.season.id, stale.squad_id);
      lines.push(`removed ${stale.squad_name} (no longer in the season)`);
    }

    // Report only when something changed or the unlinked list changed.
    const hash = createHash('sha1').update([...unlinked, ...notInServer].sort().join('|')).digest('hex');
    if (lines.length) await postStaff(guild, `**freeinf.org sync** (${reason})\n${lines.map((l) => `• ${l}`).join('\n')}`);
    if (hash !== lastUnlinkedHash && (unlinked.length || notInServer.length)) {
      const parts: string[] = [];
      if (unlinked.length) parts.push(`**Not linked to Discord on freeinf.org** — can't get squad roles yet:\n${unlinked.map((u) => `• ${u}`).join('\n')}`);
      if (notInServer.length) parts.push(`**Linked but not in this server:**\n${notInServer.map((u) => `• ${u}`).join('\n')}`);
      await postStaff(guild, parts.join('\n\n'));
    }
    lastUnlinkedHash = hash;

    const result = `${teams.length} teams, ${lines.length} changes, ${unlinked.length} unlinked, ${Date.now() - started}ms`;
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
  const msg = `Season teardown: removed ${mappings.length} squad${mappings.length === 1 ? '' : 's'} (roles, categories and channels).`;
  await postStaff(guild, `**freeinf.org** ${msg}`);
  await writeState({ last_result: msg, updated_at: new Date().toISOString() });
  return msg;
}
