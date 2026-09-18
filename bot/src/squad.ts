import {
  ChatInputCommandInteraction,
  Guild,
  GuildMember,
  MessageFlags,
  PermissionFlagsBits,
  Role,
  SlashCommandBuilder,
} from 'discord.js';
import { config } from './config.js';
import { getMappings, getProfileByDiscordId, getSeasonContext, getSeasonTeams, type TeamRoster } from './db.js';
import { postStaff } from './discord.js';

/**
 * /squad add|remove @user — captains and co-captains hand their squad role to
 * players who won't link Discord on freeinf.org (and take it back). The bot does
 * the role change itself, so captains never need Manage Roles.
 *
 * Linked accounts stay the site's business: the sync grants/removes their role
 * from the roster, and would undo a manual change within minutes, so the command
 * refuses and points at freeinf.org instead. Staff (Manage Roles or the staff
 * role) can act for any squad by naming it.
 */

export function squadCommand() {
  const cmd = new SlashCommandBuilder().setName('squad').setDescription('Give or take your squad’s Discord role (captains and co-captains)');
  cmd.addSubcommand((s) =>
    s.setName('add').setDescription('Give your squad role to a player who has not linked Discord on freeinf.org')
      .addUserOption((o) => o.setName('user').setDescription('Who gets the role').setRequired(true))
      .addStringOption((o) => o.setName('squad').setDescription('Squad name or tag (only if you run more than one, or you are staff)').setRequired(false)),
  );
  cmd.addSubcommand((s) =>
    s.setName('remove').setDescription('Take your squad role away from a player')
      .addUserOption((o) => o.setName('user').setDescription('Who loses the role').setRequired(true))
      .addStringOption((o) => o.setName('squad').setDescription('Squad name or tag (only if you run more than one, or you are staff)').setRequired(false)),
  );
  return cmd;
}

function isStaff(member: GuildMember): boolean {
  if (member.permissions.has(PermissionFlagsBits.ManageRoles)) return true;
  return !!config.staffRoleId && member.roles.cache.has(config.staffRoleId);
}

function matchSquad(teams: TeamRoster[], text: string): TeamRoster | null {
  const q = text.trim().toLowerCase();
  if (!q) return null;
  return teams.find((t) => t.name.toLowerCase() === q || (t.tag || '').toLowerCase() === q)
    ?? teams.find((t) => t.name.toLowerCase().includes(q))
    ?? null;
}

/** Which squad the invoker may act for, or a reason they can't. */
function pickTeam(teams: TeamRoster[], member: GuildMember, squadArg: string | null): { team: TeamRoster } | { error: string } {
  const mine = teams.filter((t) => t.leadDiscordIds.includes(member.id));
  const staff = isStaff(member);
  if (squadArg) {
    const pool = staff ? teams : mine;
    const team = matchSquad(pool, squadArg);
    if (team) return { team };
    return { error: staff ? `No squad called **${squadArg}** in this season.` : `You don’t run a squad called **${squadArg}**.` };
  }
  if (mine.length === 1) return { team: mine[0] };
  if (mine.length > 1) return { error: `You run more than one squad — add \`squad:\` with the name (${mine.map((t) => t.name).join(', ')}).` };
  if (staff) return { error: 'Add `squad:` with the squad name or tag.' };
  return { error: 'Only a squad’s captain or co-captains can do this. Captains: make sure you’ve linked Discord on freeinf.org so I know who you are.' };
}

async function run(interaction: ChatInputCommandInteraction): Promise<void> {
  if (!interaction.inCachedGuild()) return;
  const guild: Guild = interaction.guild;
  const adding = interaction.options.getSubcommand() === 'add';
  const target = interaction.options.getMember('user');
  if (!target) { await interaction.reply({ content: 'That user isn’t in this server.', flags: MessageFlags.Ephemeral }); return; }
  if (target.user.bot) { await interaction.reply({ content: 'Bots don’t play CTF.', flags: MessageFlags.Ephemeral }); return; }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const ctx = await getSeasonContext();
  if (!ctx) { await interaction.editReply('No season is running right now.'); return; }
  const teams = await getSeasonTeams(ctx);
  const picked = pickTeam(teams, interaction.member, interaction.options.getString('squad'));
  if ('error' in picked) { await interaction.editReply(picked.error); return; }
  const { team } = picked;

  const mapping = (await getMappings(guild.id, ctx.season.id)).find((m) => m.squad_id === team.squadId);
  const role: Role | null = mapping ? guild.roles.cache.get(mapping.role_id) ?? (await guild.roles.fetch(mapping.role_id).catch(() => null)) : null;
  if (!role) { await interaction.editReply(`**${team.name}** doesn’t have its Discord role yet — try again after the next sync.`); return; }

  // Linked players belong to the site's roster; a manual change would just be undone.
  const profile = await getProfileByDiscordId(target.id);
  const onRoster = team.members.some((m) => m.discordId === target.id);
  if (profile && onRoster && adding) {
    if (!target.roles.cache.has(role.id) && !config.dryRun) await target.roles.add(role, `On the squad roster at freeinf.org (/squad by ${interaction.user.tag})`);
    await interaction.editReply(`**${profile.alias}** is on your roster at freeinf.org, so the role is theirs automatically — done.`);
    return;
  }
  if (profile && onRoster && !adding) {
    await interaction.editReply(`**${profile.alias}** is on your roster at freeinf.org. Remove them there and the role goes with it.`);
    return;
  }
  if (profile && adding) {
    await interaction.editReply(`**${profile.alias}** has linked Discord on freeinf.org, so add them to the roster on the site instead — a manual role would be removed on the next sync.`);
    return;
  }

  const has = target.roles.cache.has(role.id);
  if (adding && has) { await interaction.editReply(`${target} already has **${role.name}**.`); return; }
  if (!adding && !has) { await interaction.editReply(`${target} doesn’t have **${role.name}**.`); return; }
  if (config.dryRun) { await interaction.editReply(`DRY RUN — would ${adding ? 'give' : 'remove'} **${role.name}** ${adding ? 'to' : 'from'} ${target}.`); return; }

  const reason = `/squad ${adding ? 'add' : 'remove'} by ${interaction.user.tag}`;
  if (adding) await target.roles.add(role, reason);
  else await target.roles.remove(role, reason);
  await interaction.editReply(adding ? `${target} now has **${role.name}**.` : `Removed **${role.name}** from ${target}.`);
  const who = profile ? `${profile.alias} (${target.user.tag})` : target.user.tag;
  await postStaff(guild, `**/squad** ${interaction.user.tag} ${adding ? 'gave' : 'removed'} **${role.name}** ${adding ? 'to' : 'from'} ${who}${profile ? '' : ' (not linked on freeinf.org)'}`);
}

export async function onSquadInteraction(interaction: ChatInputCommandInteraction): Promise<void> {
  try {
    await run(interaction);
  } catch (e: any) {
    console.error('/squad:', e?.message || e);
    const msg = `Something went wrong: ${e?.message || e}`;
    if (interaction.deferred || interaction.replied) await interaction.editReply(msg).catch(() => {});
    else await interaction.reply({ content: msg, flags: MessageFlags.Ephemeral }).catch(() => {});
  }
}
