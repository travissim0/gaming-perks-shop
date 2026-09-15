import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChatInputCommandInteraction,
  Guild,
  MessageFlags,
  PermissionFlagsBits,
  Role,
  SlashCommandBuilder,
  type ButtonInteraction,
  type Interaction,
} from 'discord.js';
import { config } from './config.js';

/**
 * Self-assign role picker.
 *
 * A staffer runs /rolepicker in the channel where the picker should live and
 * names up to 10 roles; the bot posts one message with a button per role.
 * Clicking a button toggles that role on the clicker (ephemeral confirmation).
 * The message is plain bot content, so re-running the command posts a fresh
 * picker and the old one can simply be deleted.
 */

const BUTTON_PREFIX = 'selfrole:';
const MAX_ROLES = 10;

// Roles that grant any of these are never self-assignable, no matter who set
// the picker up — same idea as Discord's own Onboarding restriction.
const FORBIDDEN = [
  PermissionFlagsBits.Administrator,
  PermissionFlagsBits.KickMembers,
  PermissionFlagsBits.BanMembers,
  PermissionFlagsBits.ModerateMembers,
  PermissionFlagsBits.ManageGuild,
  PermissionFlagsBits.ManageRoles,
  PermissionFlagsBits.ManageChannels,
  PermissionFlagsBits.ManageMessages,
  PermissionFlagsBits.ManageWebhooks,
  PermissionFlagsBits.ManageNicknames,
  PermissionFlagsBits.MentionEveryone,
  PermissionFlagsBits.MuteMembers,
  PermissionFlagsBits.DeafenMembers,
  PermissionFlagsBits.MoveMembers,
];

/** null when assignable, else a human reason. Re-checked on every click — roles get edited. */
function notAssignable(role: Role): string | null {
  const me = role.guild.members.me;
  if (role.managed || role.id === role.guild.roles.everyone.id) return `**${role.name}** is managed by an integration`;
  if (FORBIDDEN.some((p) => role.permissions.has(p))) return `**${role.name}** has moderation permissions`;
  if (me && role.position >= me.roles.highest.position) return `**${role.name}** is above my role — drag mine higher in Server Settings → Roles`;
  return null;
}

export async function registerRolePickerCommand(guild: Guild): Promise<void> {
  const cmd = new SlashCommandBuilder()
    .setName('rolepicker')
    .setDescription('Post a message with buttons that let anyone give/remove these roles on themselves')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles);
  cmd.addRoleOption((o) => o.setName('role1').setDescription('A self-assignable role').setRequired(true));
  for (let i = 2; i <= MAX_ROLES; i++) {
    cmd.addRoleOption((o) => o.setName(`role${i}`).setDescription('Another self-assignable role').setRequired(false));
  }
  cmd.addStringOption((o) => o.setName('text').setDescription('Message above the buttons').setRequired(false));
  await guild.commands.set([cmd]);
}

async function postPicker(interaction: ChatInputCommandInteraction): Promise<void> {
  if (!interaction.inCachedGuild() || !interaction.channel || !interaction.channel.isSendable()) {
    await interaction.reply({ content: 'I can’t post in this channel.', flags: MessageFlags.Ephemeral });
    return;
  }
  const roles: Role[] = [];
  for (let i = 1; i <= MAX_ROLES; i++) {
    const r = interaction.options.getRole(`role${i}`);
    if (r && !roles.some((x) => x.id === r.id)) roles.push(r as Role);
  }
  const blocked = roles.map(notAssignable).filter((x): x is string => x !== null);
  if (blocked.length) {
    await interaction.reply({ content: `Can’t offer: ${blocked.join('; ')}.`, flags: MessageFlags.Ephemeral });
    return;
  }
  if (config.dryRun) {
    await interaction.reply({ content: `DRY RUN — would post a picker for ${roles.map((r) => r.name).join(', ')}.`, flags: MessageFlags.Ephemeral });
    return;
  }
  const rows: ActionRowBuilder<ButtonBuilder>[] = [];
  for (let i = 0; i < roles.length; i += 5) {
    rows.push(new ActionRowBuilder<ButtonBuilder>().addComponents(
      roles.slice(i, i + 5).map((r) =>
        new ButtonBuilder().setCustomId(`${BUTTON_PREFIX}${r.id}`).setLabel(r.name.slice(0, 80)).setStyle(ButtonStyle.Secondary),
      ),
    ));
  }
  const text = interaction.options.getString('text') || 'Click a button to give yourself the role — click again to remove it.';
  await interaction.channel.send({ content: text, components: rows });
  await interaction.reply({ content: 'Role picker posted.', flags: MessageFlags.Ephemeral });
  console.log(`role picker posted in #${interaction.channel.name} by ${interaction.user.tag}: ${roles.map((r) => r.name).join(', ')}`);
}

async function toggleRole(interaction: ButtonInteraction): Promise<void> {
  if (!interaction.inCachedGuild()) return;
  const role = await interaction.guild.roles.fetch(interaction.customId.slice(BUTTON_PREFIX.length)).catch(() => null);
  if (!role) {
    await interaction.reply({ content: 'That role no longer exists.', flags: MessageFlags.Ephemeral });
    return;
  }
  const blocked = notAssignable(role);
  if (blocked) {
    await interaction.reply({ content: `Sorry — ${blocked}.`, flags: MessageFlags.Ephemeral });
    return;
  }
  if (config.dryRun) {
    await interaction.reply({ content: `DRY RUN — would toggle **${role.name}**.`, flags: MessageFlags.Ephemeral });
    return;
  }
  const has = interaction.member.roles.cache.has(role.id);
  if (has) await interaction.member.roles.remove(role, 'role picker');
  else await interaction.member.roles.add(role, 'role picker');
  await interaction.reply({ content: has ? `Removed **${role.name}**.` : `You now have **${role.name}**.`, flags: MessageFlags.Ephemeral });
}

export async function onInteraction(interaction: Interaction): Promise<void> {
  try {
    if (interaction.isChatInputCommand() && interaction.commandName === 'rolepicker') await postPicker(interaction);
    else if (interaction.isButton() && interaction.customId.startsWith(BUTTON_PREFIX)) await toggleRole(interaction);
  } catch (e: any) {
    console.error('role picker:', e?.message || e);
    if ((interaction.isChatInputCommand() || interaction.isButton()) && !interaction.replied) {
      await interaction.reply({ content: `Something went wrong: ${e?.message || e}`, flags: MessageFlags.Ephemeral }).catch(() => {});
    }
  }
}
