import { existsSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import {
  ChatInputCommandInteraction,
  Guild,
  GuildMember,
  Message,
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
  type TextBasedChannel,
} from 'discord.js';
import { config } from './config.js';
import { db, getSeasonContext, type SeasonContext } from './db.js';

/**
 * League sign-up hype for #ctf-signup.
 *
 * - Every new registration on freeinf.org/league/register (an active
 *   free_agents row for the open season) gets a shout-out in the channel,
 *   worded from a rotating set so it never reads the same twice in a row.
 * - When someone in the channel @mentions a player who hasn't registered,
 *   the bot tags that player with a nudge and the link (once a day per person).
 * - /signups kickoff (staff) posts the roll-call of everyone already in, for
 *   starting the channel off; /signups status shows the numbers privately.
 *
 * Who counts as registered: a linked Discord account whose profile has an
 * active row for the season, or — for players who never linked — a Discord
 * display name / username that matches a registrant's alias. The bot can't
 * see any further than that, so the alias match keeps it from hassling
 * people who did sign up but didn't link.
 *
 * State (which rows were already announced, who was nudged when) lives in a
 * small JSON file next to the build so a restart never re-announces the pool.
 * On the very first run the current pool is recorded silently.
 */

const REGISTER_URL = 'https://freeinf.org/league/register';
const STATE_FILE = join(process.cwd(), '.signups-state.json');
const NUDGE_COOLDOWN_MS = 24 * 60 * 60 * 1000;
const POLL_MS = 60_000;

interface Registrant { rowId: string; playerId: string; alias: string; discordId: string | null; classes: string[]; createdAt: string }
interface SeasonInfo { key: string; label: string; closesOn: string | null; ctx: SeasonContext }
interface State { seasonKey: string | null; announced: string[]; nudged: Record<string, string>; lastSignupTemplate: number; lastNudgeTemplate: number }

// ---------------------------------------------------------------------------
// Wording. {player} is a mention or bold alias, {n} the pool size, {classes}
// their preferred classes, {deadline} a Discord relative timestamp, {link} the
// registration page. Keep these short — they're read on phones.

const SIGNUP_LINES = [
  '🚨 {player} just signed up for {season}! That makes **{n}** in the pool. Who’s next? {link}',
  '{player} is IN for {season} ({classes}). **{n}** registered so far — don’t get left in spec. {link}',
  'Another one! {player} joins the {season} pool. **{n}** and counting. Sign up: {link}',
  '{player} locked in for {season}. Captains are watching the pool grow — **{n}** now. Your turn: {link}',
  'Welcome to the draft pool, {player}! **{n}** players ready for {season}. Registration closes {deadline}. {link}',
  '📋 {player} registered for {season} as {classes}. Pool is at **{n}**. Get on the board: {link}',
  'The pool just got deeper: {player} is in for {season}. **{n}** strong. Don’t make your squad wait — {link}',
  '{player} said yes to {season}. That’s **{n}**. If you’re reading this and haven’t signed up… {link}',
];

const NUDGE_LINES = [
  '{player} — you got tagged, and you’re not on the {season} list yet. Let’s get you registered today! {link}',
  'Hey {player}, the pool has **{n}** players and none of them are you. Fix that: {link}',
  '{player}, your friends want you in {season}. Takes two minutes: {link}',
  '👀 {player} hasn’t signed up for {season}. Registration closes {deadline}. Click here: {link}',
  '{player} — spec is no place for you this season. Get in the draft pool: {link}',
  'Captains can’t draft what isn’t in the pool, {player}. Sign up for {season}: {link}',
  '{player}, people are asking for you. **{n}** registered so far — be number {next}: {link}',
];

const ALREADY_LINES = [
  '{player} is already in the pool — one of the **{n}**. 💪',
  'No need to nudge {player}, they signed up already. **{n}** in.',
];

function pick(lines: string[], last: number): { text: string; idx: number } {
  if (lines.length === 1) return { text: lines[0], idx: 0 };
  let idx = Math.floor(Math.random() * lines.length);
  if (idx === last) idx = (idx + 1) % lines.length;
  return { text: lines[idx], idx };
}

function fill(text: string, vars: Record<string, string>): string {
  return text.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? '');
}

// ---------------------------------------------------------------------------
// State file

function loadState(): State {
  try {
    if (existsSync(STATE_FILE)) {
      const s = JSON.parse(readFileSync(STATE_FILE, 'utf8'));
      return { seasonKey: s.seasonKey ?? null, announced: Array.isArray(s.announced) ? s.announced : [], nudged: s.nudged ?? {}, lastSignupTemplate: s.lastSignupTemplate ?? -1, lastNudgeTemplate: s.lastNudgeTemplate ?? -1 };
    }
  } catch (e: any) {
    console.warn('signups: could not read state file:', e?.message || e);
  }
  return { seasonKey: null, announced: [], nudged: {}, lastSignupTemplate: -1, lastNudgeTemplate: -1 };
}

function saveState(s: State) {
  try { writeFileSync(STATE_FILE, JSON.stringify(s)); } catch (e: any) { console.warn('signups: could not write state file:', e?.message || e); }
}

let state: State = loadState();

// ---------------------------------------------------------------------------
// Site data

async function openSeason(): Promise<SeasonInfo | null> {
  const ctx = await getSeasonContext();
  if (!ctx) return null;
  const table = ctx.league.slug === 'ctfpl' ? 'ctfpl_seasons' : 'league_seasons';
  const { data } = await db.from(table).select('season_name, registration_closes_on').eq('id', ctx.season.id).maybeSingle();
  const name = (data as any)?.season_name?.trim();
  const generic = `Season ${ctx.season.season_number}`;
  const label = name && name.toLowerCase() !== generic.toLowerCase() ? `${ctx.league.name} ${generic} · ${name}` : `${ctx.league.name} ${generic}`;
  return { key: `${ctx.league.slug}/${ctx.season.season_number}`, label, closesOn: (data as any)?.registration_closes_on ?? null, ctx };
}

async function registrants(season: SeasonInfo): Promise<Registrant[]> {
  const { data: rows } = await db
    .from('free_agents')
    .select('id, player_id, preferred_roles, created_at')
    .eq('is_active', true)
    .eq('league_slug', season.ctx.league.slug)
    .eq('season_number', season.ctx.season.season_number)
    .order('created_at');
  const ids = (rows || []).map((r: any) => r.player_id);
  const { data: profiles } = ids.length ? await db.from('profiles').select('id, in_game_alias, discord_id').in('id', ids) : { data: [] as any[] };
  const prof = new Map<string, { alias: string; discordId: string | null }>();
  (profiles || []).forEach((p: any) => prof.set(p.id, { alias: p.in_game_alias || 'Unknown', discordId: p.discord_id || null }));
  return (rows || []).map((r: any) => ({
    rowId: r.id,
    playerId: r.player_id,
    alias: prof.get(r.player_id)?.alias || 'Unknown',
    discordId: prof.get(r.player_id)?.discordId ?? null,
    classes: Array.isArray(r.preferred_roles) ? r.preferred_roles.map(String) : [],
    createdAt: r.created_at,
  }));
}

/** Registration deadline as Discord timestamps (end of that day, Pacific). */
function closesAt(season: SeasonInfo): number | null {
  if (!season.closesOn || !/^\d{4}-\d{2}-\d{2}$/.test(season.closesOn)) return null;
  // Deadlines are announced as end of day Pacific; -07:00 is close enough for "closes in 5 days".
  return Math.floor(new Date(`${season.closesOn}T23:59:59-07:00`).getTime() / 1000);
}

function deadline(season: SeasonInfo): { relative: string; absolute: string } | null {
  const t = closesAt(season);
  return t ? { relative: `<t:${t}:R>`, absolute: `<t:${t}:D>` } : null;
}

function closed(season: SeasonInfo): boolean {
  const t = closesAt(season);
  return !!t && Date.now() / 1000 > t;
}

async function signupChannel(guild: Guild): Promise<(TextBasedChannel & { send: Function }) | null> {
  if (!config.signupChannelId) return null;
  const ch = guild.channels.cache.get(config.signupChannelId) ?? (await guild.channels.fetch(config.signupChannelId).catch(() => null));
  if (ch && ch.isTextBased() && 'send' in ch) return ch as any;
  console.warn(`signup channel ${config.signupChannelId} not found or not a text channel`);
  return null;
}

function who(r: Registrant): string {
  return r.discordId ? `<@${r.discordId}>` : `**${r.alias}**`;
}

function vars(season: SeasonInfo, n: number, extra: Record<string, string> = {}): Record<string, string> {
  const d = deadline(season);
  return { season: season.label, n: String(n), next: String(n + 1), deadline: d ? d.relative : 'soon', link: `<${REGISTER_URL}>`, ...extra };
}

// ---------------------------------------------------------------------------
// New sign-ups → channel

let checking = false;

export async function checkSignups(guild: Guild, reason = 'poll'): Promise<void> {
  if (checking || !config.signupChannelId) return;
  checking = true;
  try {
    const season = await openSeason();
    if (!season) return;
    const pool = await registrants(season);

    // New season (or first run ever): record what's there without announcing it.
    if (state.seasonKey !== season.key) {
      state = { seasonKey: season.key, announced: pool.map((r) => r.rowId), nudged: {}, lastSignupTemplate: -1, lastNudgeTemplate: -1 };
      saveState(state);
      console.log(`signups: tracking ${season.label} — ${pool.length} already registered (not announced)`);
      return;
    }

    const seen = new Set(state.announced);
    const fresh = pool.filter((r) => !seen.has(r.rowId));
    if (!fresh.length) return;
    const ch = await signupChannel(guild);
    let n = pool.length - fresh.length;
    for (const r of fresh) {
      n++;
      const { text, idx } = pick(SIGNUP_LINES, state.lastSignupTemplate);
      state.lastSignupTemplate = idx;
      const classes = r.classes.length ? r.classes.join(' / ') : 'any class';
      const line = fill(text, vars(season, n, { player: who(r), classes }));
      console.log(`signups (${reason}): ${r.alias} → ${line}`);
      if (ch && !config.dryRun) await ch.send({ content: line, allowedMentions: { users: r.discordId ? [r.discordId] : [] } }).catch((e: any) => console.warn('signup post failed:', e.message));
      state.announced.push(r.rowId);
    }
    saveState(state);
  } catch (e: any) {
    console.error('signups check failed:', e?.message || e);
  } finally {
    checking = false;
  }
}

export function startSignupWatch(guild: Guild) {
  if (!config.signupChannelId) { console.log('signups: DISCORD_SIGNUP_CHANNEL_ID not set — hype disabled'); return; }
  checkSignups(guild, 'startup');
  setInterval(() => checkSignups(guild, 'poll'), POLL_MS);
}

// ---------------------------------------------------------------------------
// @mention nudges

function isRegistered(member: GuildMember, pool: Registrant[]): boolean {
  if (pool.some((r) => r.discordId === member.id)) return true;
  const names = new Set([member.displayName, member.user.username, member.user.globalName || ''].map((s) => s.trim().toLowerCase()).filter(Boolean));
  return pool.some((r) => names.has(r.alias.trim().toLowerCase()));
}

export async function onSignupMessage(message: Message): Promise<void> {
  try {
    if (!config.signupChannelId || message.channelId !== config.signupChannelId) return;
    if (message.author.bot || !message.inGuild()) return;
    const mentioned = [...message.mentions.users.values()].filter((u) => !u.bot && u.id !== message.author.id);
    if (!mentioned.length) return;

    const season = await openSeason();
    if (!season || closed(season)) return;
    const pool = await registrants(season);
    const now = Date.now();
    const lines: string[] = [];
    const pings: string[] = [];

    for (const user of mentioned) {
      const member = message.guild.members.cache.get(user.id) ?? (await message.guild.members.fetch(user.id).catch(() => null));
      if (!member) continue;
      if (isRegistered(member, pool)) {
        const { text } = pick(ALREADY_LINES, -1);
        lines.push(fill(text, vars(season, pool.length, { player: `**${member.displayName}**` })));
        continue;
      }
      const last = state.nudged[user.id] ? new Date(state.nudged[user.id]).getTime() : 0;
      if (now - last < NUDGE_COOLDOWN_MS) continue;
      const { text, idx } = pick(NUDGE_LINES, state.lastNudgeTemplate);
      state.lastNudgeTemplate = idx;
      lines.push(fill(text, vars(season, pool.length, { player: `<@${user.id}>` })));
      pings.push(user.id);
      state.nudged[user.id] = new Date(now).toISOString();
    }
    if (!lines.length) return;
    saveState(state);
    console.log(`signups nudge in #${(message.channel as any).name} by ${message.author.tag}: ${lines.join(' | ')}`);
    if (config.dryRun) return;
    const payload = { content: lines.join('\n'), allowedMentions: { users: pings, repliedUser: false } };
    // Reply-quote needs Read Message History; fall back to a plain post if that's missing.
    await message.reply(payload).catch(() => (message.channel as any).send(payload)).catch((e: any) => console.warn('nudge failed:', e.message));
  } catch (e: any) {
    console.error('signup nudge failed:', e?.message || e);
  }
}

// ---------------------------------------------------------------------------
// /signups (staff)

export function signupsCommand() {
  const cmd = new SlashCommandBuilder().setName('signups').setDescription('League sign-up hype (staff)').setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles);
  cmd.addSubcommand((s) => s.setName('kickoff').setDescription('Post the roll-call of everyone registered so far in the sign-up channel'));
  cmd.addSubcommand((s) => s.setName('status').setDescription('Show the pool size and who is linked (only you see it)'));
  return cmd;
}

export async function onSignupsInteraction(interaction: ChatInputCommandInteraction): Promise<void> {
  try {
    if (!interaction.inCachedGuild()) return;
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const season = await openSeason();
    if (!season) { await interaction.editReply('No season is open for registration.'); return; }
    const pool = await registrants(season);
    const d = deadline(season);
    const sub = interaction.options.getSubcommand();

    if (sub === 'status') {
      const linked = pool.filter((r) => r.discordId).length;
      const lines = pool.map((r) => `${r.discordId ? '🔗' : '·'} ${r.alias}${r.classes.length ? ` (${r.classes.join('/')})` : ''}`);
      await interaction.editReply(`**${season.label}** — ${pool.length} registered, ${linked} linked to Discord${d ? `, closes ${d.absolute}` : ''}.\n${lines.join('\n')}`.slice(0, 1900));
      return;
    }

    const ch = await signupChannel(interaction.guild);
    if (!ch) { await interaction.editReply('Sign-up channel is not configured (DISCORD_SIGNUP_CHANNEL_ID).'); return; }
    const names = pool.map(who).join(', ');
    const text =
      `🏆 **${season.label} registration is open!**\n` +
      `**${pool.length}** players are already in the draft pool: ${names}\n\n` +
      `Captains draft from this pool once registration closes${d ? ` ${d.relative} (${d.absolute})` : ''}. ` +
      `Not on the list? Sign up now — it takes two minutes: <${REGISTER_URL}>\n` +
      `Tag a friend who should be here and I’ll give them a nudge. 👀`;
    if (config.dryRun) { await interaction.editReply(`DRY RUN — would post:\n${text}`.slice(0, 1900)); return; }
    await ch.send({ content: text.slice(0, 1990), allowedMentions: { users: pool.map((r) => r.discordId).filter((x): x is string => !!x) } });
    // Everyone in the roll-call counts as announced from here on.
    state.seasonKey = season.key;
    state.announced = Array.from(new Set([...state.announced, ...pool.map((r) => r.rowId)]));
    saveState(state);
    await interaction.editReply(`Posted the roll-call (${pool.length} players) in <#${config.signupChannelId}>.`);
    console.log(`signups kickoff by ${interaction.user.tag}: ${pool.length} players`);
  } catch (e: any) {
    console.error('/signups:', e?.message || e);
    const msg = `Something went wrong: ${e?.message || e}`;
    if (interaction.deferred || interaction.replied) await interaction.editReply(msg).catch(() => {});
    else await interaction.reply({ content: msg, flags: MessageFlags.Ephemeral }).catch(() => {});
  }
}
