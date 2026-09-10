import {
  ChannelType,
  Guild,
  GuildMember,
  OverwriteType,
  PermissionFlagsBits,
  Role,
  type CategoryChannel,
  type GuildBasedChannel,
  type OverwriteResolvable,
} from 'discord.js';
import { config } from './config.js';
import type { ChannelMapping, TeamRoster } from './db.js';

/** Guild-side operations. Every function is idempotent: safe to run again. */

const ROLE_PREFIX = 'Squad · ';
const roleName = (t: TeamRoster) => `${ROLE_PREFIX}${t.name}`.slice(0, 100);
const categoryName = (t: TeamRoster) => (t.tag ? `${t.tag} · ${t.name}` : t.name).slice(0, 100);

const MEMBER_ALLOW = [
  PermissionFlagsBits.ViewChannel,
  PermissionFlagsBits.SendMessages,
  PermissionFlagsBits.ReadMessageHistory,
  PermissionFlagsBits.AttachFiles,
  PermissionFlagsBits.EmbedLinks,
  PermissionFlagsBits.AddReactions,
  PermissionFlagsBits.Connect,
  PermissionFlagsBits.Speak,
  PermissionFlagsBits.Stream,
  PermissionFlagsBits.UseVAD,
];
const CAPTAIN_ALLOW = [
  ...MEMBER_ALLOW,
  PermissionFlagsBits.ManageChannels,
  PermissionFlagsBits.ManageMessages,
  PermissionFlagsBits.MuteMembers,
  PermissionFlagsBits.DeafenMembers,
  PermissionFlagsBits.MoveMembers,
  PermissionFlagsBits.PrioritySpeaker,
];

export function overwritesFor(guild: Guild, role: Role, captainDiscordId: string | null): OverwriteResolvable[] {
  const list: OverwriteResolvable[] = [
    { id: guild.roles.everyone.id, type: OverwriteType.Role, deny: [PermissionFlagsBits.ViewChannel] },
    { id: role.id, type: OverwriteType.Role, allow: MEMBER_ALLOW },
  ];
  if (config.staffRoleId) list.push({ id: config.staffRoleId, type: OverwriteType.Role, allow: MEMBER_ALLOW });
  if (captainDiscordId && guild.members.cache.has(captainDiscordId)) {
    list.push({ id: captainDiscordId, type: OverwriteType.Member, allow: CAPTAIN_ALLOW });
  }
  return list;
}

async function ensureRole(guild: Guild, team: TeamRoster, existingId: string | null): Promise<Role> {
  const wanted = roleName(team);
  let role = existingId ? guild.roles.cache.get(existingId) ?? (await guild.roles.fetch(existingId).catch(() => null)) : null;
  if (!role) role = guild.roles.cache.find((r) => r.name === wanted) ?? null;
  if (!role) {
    if (config.dryRun) { console.log(`[dry] create role ${wanted}`); return { id: 'dry', name: wanted } as unknown as Role; }
    role = await guild.roles.create({ name: wanted, mentionable: true, reason: 'freeinf.org squad' });
    console.log(`+ role ${wanted}`);
  } else if (role.name !== wanted && !config.dryRun) {
    await role.setName(wanted, 'Squad renamed on freeinf.org');
  }
  return role;
}

async function ensureCategory(guild: Guild, team: TeamRoster, role: Role, existingId: string | null): Promise<CategoryChannel> {
  const wanted = categoryName(team);
  let cat = existingId ? (guild.channels.cache.get(existingId) as CategoryChannel | undefined) ?? ((await guild.channels.fetch(existingId).catch(() => null)) as CategoryChannel | null) : null;
  if (!cat || cat.type !== ChannelType.GuildCategory) {
    cat = (guild.channels.cache.find((c) => c.type === ChannelType.GuildCategory && c.name === wanted) as CategoryChannel | undefined) ?? null;
  }
  const overwrites = overwritesFor(guild, role, team.captainDiscordId);
  if (!cat) {
    if (config.dryRun) { console.log(`[dry] create category ${wanted}`); return { id: 'dry', name: wanted, children: { cache: new Map() } } as unknown as CategoryChannel; }
    cat = await guild.channels.create({ name: wanted, type: ChannelType.GuildCategory, permissionOverwrites: overwrites, reason: 'freeinf.org squad' });
    console.log(`+ category ${wanted}`);
  } else if (!config.dryRun) {
    if (cat.name !== wanted) await cat.setName(wanted);
    await cat.permissionOverwrites.set(overwrites, 'freeinf.org sync');
  }
  return cat;
}

async function ensureChild(guild: Guild, cat: CategoryChannel, name: string, type: ChannelType.GuildText | ChannelType.GuildVoice, existingId: string | null): Promise<GuildBasedChannel | null> {
  if (config.dryRun) { console.log(`[dry] ensure ${type === ChannelType.GuildText ? 'text' : 'voice'} ${name} in ${cat.name}`); return null; }
  let ch = existingId ? guild.channels.cache.get(existingId) ?? (await guild.channels.fetch(existingId).catch(() => null)) : null;
  if (!ch) ch = cat.children.cache.find((c) => c.type === type && c.name.toLowerCase() === name.toLowerCase()) ?? null;
  if (!ch) {
    ch = await guild.channels.create({ name, type, parent: cat.id, reason: 'freeinf.org squad' });
    console.log(`+ ${type === ChannelType.GuildText ? '#' : '🔊'}${name} (${cat.name})`);
  } else if ('parentId' in ch && ch.parentId !== cat.id && 'setParent' in ch) {
    await (ch as any).setParent(cat.id);
  }
  // Inherit the category's permissions.
  if ('lockPermissions' in ch) await (ch as any).lockPermissions().catch(() => {});
  return ch as GuildBasedChannel;
}

/** Create or update the role, category and four channels for one team. */
export async function ensureTeam(guild: Guild, team: TeamRoster, existing: ChannelMapping | null): Promise<ChannelMapping> {
  const role = await ensureRole(guild, team, existing?.role_id ?? null);
  const cat = await ensureCategory(guild, team, role, existing?.category_id ?? null);
  const text = await ensureChild(guild, cat, 'squad-chat', ChannelType.GuildText, existing?.text_channel_id ?? null);
  const vTeam = await ensureChild(guild, cat, 'Team', ChannelType.GuildVoice, existing?.voice_team_id ?? null);
  const vOff = await ensureChild(guild, cat, 'Offense', ChannelType.GuildVoice, existing?.voice_offense_id ?? null);
  const vDef = await ensureChild(guild, cat, 'Defense', ChannelType.GuildVoice, existing?.voice_defense_id ?? null);
  return {
    squad_id: team.squadId,
    squad_name: team.name,
    role_id: role.id,
    category_id: cat.id,
    text_channel_id: text?.id ?? existing?.text_channel_id ?? null,
    voice_team_id: vTeam?.id ?? existing?.voice_team_id ?? null,
    voice_offense_id: vOff?.id ?? existing?.voice_offense_id ?? null,
    voice_defense_id: vDef?.id ?? existing?.voice_defense_id ?? null,
  };
}

/** Give the role to linked members, take it from anyone who no longer belongs. Returns who isn't in the server. */
export async function syncRoleMembers(guild: Guild, role: Role, team: TeamRoster): Promise<{ added: string[]; removed: string[]; notInServer: string[] }> {
  const wanted = new Map<string, string>(); // discordId → alias
  team.members.forEach((m) => { if (m.discordId) wanted.set(m.discordId, m.alias); });

  const added: string[] = [];
  const removed: string[] = [];
  const notInServer: string[] = [];

  for (const [discordId, alias] of wanted) {
    const member: GuildMember | null = guild.members.cache.get(discordId) ?? (await guild.members.fetch(discordId).catch(() => null));
    if (!member) { notInServer.push(alias); continue; }
    if (!member.roles.cache.has(role.id)) {
      if (!config.dryRun) await member.roles.add(role, 'On the squad roster at freeinf.org');
      added.push(alias);
    }
  }
  if (config.dryRun) return { added, removed, notInServer };

  for (const member of role.members.values()) {
    if (!wanted.has(member.id)) {
      await member.roles.remove(role, 'No longer on the squad roster at freeinf.org');
      removed.push(member.displayName);
    }
  }
  return { added, removed, notInServer };
}

/** Delete a team's channels, category and role. */
export async function teardownTeam(guild: Guild, m: ChannelMapping) {
  const ids = [m.text_channel_id, m.voice_team_id, m.voice_offense_id, m.voice_defense_id, m.category_id].filter(Boolean) as string[];
  for (const id of ids) {
    const ch = guild.channels.cache.get(id) ?? (await guild.channels.fetch(id).catch(() => null));
    if (ch && !config.dryRun) await ch.delete('Season over (freeinf.org)').catch((e) => console.warn(`could not delete channel ${id}:`, e.message));
  }
  const role = guild.roles.cache.get(m.role_id) ?? (await guild.roles.fetch(m.role_id).catch(() => null));
  if (role && !config.dryRun) await role.delete('Season over (freeinf.org)').catch((e) => console.warn(`could not delete role ${m.role_id}:`, e.message));
  console.log(`- removed ${m.squad_name}`);
}

export async function postStaff(guild: Guild, text: string) {
  if (!config.staffChannelId || config.dryRun) { console.log(`[staff] ${text}`); return; }
  const ch = guild.channels.cache.get(config.staffChannelId) ?? (await guild.channels.fetch(config.staffChannelId).catch(() => null));
  if (ch && ch.isTextBased()) await ch.send(text.slice(0, 1900)).catch((e) => console.warn('staff post failed:', e.message));
}
