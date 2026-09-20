import { Client, GatewayIntentBits, type Guild } from 'discord.js';
import { config } from './config.js';
import { db, finishCommand, pendingCommands } from './db.js';
import { reconcile, teardownSeason } from './sync.js';
import { onInteraction, rolePickerCommand } from './rolepicker.js';
import { onSquadInteraction, squadCommand } from './squad.js';
import { checkSignups, onSignupMessage, onSignupsInteraction, signupsCommand, startSignupWatch } from './signups.js';
import { deliverNotices } from './notices.js';

/**
 * FreeInf CTF bot.
 *
 * - On start and every SYNC_INTERVAL_MINUTES: full reconcile of the featured
 *   league's season (draft teams / squads → roles, private categories, channels).
 * - On changes to squads, squad_members, draft teams or picks: reconcile within
 *   a few seconds.
 * - On a row in discord_bot_commands ('sync' | 'teardown'): run it and mark done.
 * - /rolepicker (staff): posts a button message for self-assignable roles.
 * - /squad add|remove (captains): squad role for players who won't link Discord.
 * - Sign-up hype in #ctf-signup: shout-out per new registration, nudges for
 *   @mentioned players who haven't registered, /signups kickoff|status (staff).
 */

const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers, GatewayIntentBits.GuildMessages] });

let guild: Guild | null = null;
let debounce: NodeJS.Timeout | null = null;

function scheduleSync(reason: string, delayMs = 4000) {
  if (!guild) return;
  if (debounce) clearTimeout(debounce);
  debounce = setTimeout(() => { debounce = null; reconcile(guild!, reason); }, delayMs);
}

async function runCommands() {
  if (!guild) return;
  for (const cmd of await pendingCommands()) {
    console.log(`command ${cmd.action} (${cmd.id})`);
    let result: string;
    try {
      result = cmd.action === 'teardown'
        ? cmd.season_id ? await teardownSeason(guild, cmd.season_id) : 'teardown needs a season_id'
        : await reconcile(guild, 'requested from the site');
    } catch (e: any) {
      result = `error: ${e?.message || e}`;
    }
    await finishCommand(cmd.id, result);
  }
}

client.once('ready', async () => {
  console.log(`Logged in as ${client.user?.tag}${config.dryRun ? ' (DRY RUN)' : ''}`);
  guild = await client.guilds.fetch(config.guildId).catch(() => null);
  if (!guild) {
    console.error(`Bot is not in guild ${config.guildId}. Invite it first (see bot/README.md).`);
    process.exit(1);
  }
  console.log(`Serving ${guild.name}`);

  await guild.commands.set([rolePickerCommand(), squadCommand(), signupsCommand()]).catch((e) => console.error('slash command registration:', e?.message || e));
  await runCommands();
  await reconcile(guild, 'startup');
  setInterval(() => reconcile(guild!, 'scheduled'), config.syncIntervalMs);
  setInterval(runCommands, 20_000); // belt and braces if Realtime drops
  await deliverNotices(client, guild);
  setInterval(() => deliverNotices(client, guild!), 30_000);
  startSignupWatch(guild);

  db.channel('freeinf-bot')
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'discord_bot_notices' }, () => deliverNotices(client, guild!))
    .on('postgres_changes', { event: '*', schema: 'public', table: 'squad_members' }, () => scheduleSync('roster change'))
    .on('postgres_changes', { event: '*', schema: 'public', table: 'squads' }, () => scheduleSync('squad change'))
    .on('postgres_changes', { event: '*', schema: 'public', table: 'ctfdl_draft_teams' }, () => scheduleSync('draft teams change'))
    .on('postgres_changes', { event: '*', schema: 'public', table: 'ctfdl_draft_picks' }, () => scheduleSync('draft pick'))
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'discord_bot_commands' }, () => runCommands())
    .on('postgres_changes', { event: '*', schema: 'public', table: 'free_agents' }, () => setTimeout(() => checkSignups(guild!, 'registration'), 2000))
    .subscribe((status) => console.log(`realtime: ${status}`));
});

client.on('interactionCreate', (i) => {
  if (i.isChatInputCommand() && i.commandName === 'squad') return onSquadInteraction(i);
  if (i.isChatInputCommand() && i.commandName === 'signups') return onSignupsInteraction(i);
  return onInteraction(i);
});
client.on('messageCreate', onSignupMessage);
client.on('error', (e) => console.error('discord client error:', e));
process.on('unhandledRejection', (e) => console.error('unhandled rejection:', e));
process.on('SIGTERM', () => { client.destroy(); process.exit(0); });
process.on('SIGINT', () => { client.destroy(); process.exit(0); });

client.login(config.botToken);
