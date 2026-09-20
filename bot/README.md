# FreeInf CTF bot

Keeps the CTFPL Discord in step with freeinf.org for the featured league's season:

- one **role**, one **private category** and four channels (`#squad-chat`, `Team`, `Offense`, `Defense` voice) per team;
- the **captain** gets the role plus manage rights on the category;
- **drafted / added players** get the role within seconds; **dropped players** lose it;
- other squads can't see each other's categories (only that squad, Discord admins, and an optional staff role);
- **season teardown** deletes all of it, from a button in CTF management.

Teams come from the draft (`ctfdl_draft_teams`) for draft leagues, or from active squads for squad leagues.
Members come from `squad_members`; the Discord id comes from the player's account link on their profile.
Players without a link are listed in the staff channel so someone can chase them.

## One-time setup

**Discord developer portal** (application "FreeInf CTF"):

1. Bot → enable **Server Members Intent** (required to see who has a role).
2. Invite the bot to the server with this URL (replace nothing — the application id is baked in):
   `https://discord.com/oauth2/authorize?client_id=1547467056008400936&scope=bot&permissions=268438544`
   (Manage Roles, Manage Channels, View Channels, Send Messages, Connect, Move Members, Mute/Deafen.)
3. In the server, drag the bot's role **above** the squad roles it creates (it can only manage roles below its own).
4. Optional: create a staff-only text channel for bot reports and copy its id.

**Supabase:** run `add-discord-bot.sql` (tables + realtime).

**John's Linux server:**

```bash
# Node 20+ and pm2
sudo npm i -g pm2
git clone https://github.com/travissim0/gaming-perks-shop.git
cd gaming-perks-shop/bot
cp .env.example .env && nano .env      # fill in the values
npm ci && npm run build
pm2 startOrRestart ecosystem.config.cjs && pm2 save
pm2 startup                            # prints a command to run once so pm2 starts on boot
pm2 logs freeinf-ctf-bot
```

Test first with `DISCORD_GUILD_ID` set to a scratch server. `DRY_RUN=1` logs what the bot would do without touching Discord.

## Automatic deploys

`.github/workflows/deploy-bot.yml` SSHes into the server on every push to `main` that touches `bot/`, pulls, builds and restarts.
Add the four secrets it lists to the GitHub repo. Generate the key on your machine with
`ssh-keygen -t ed25519 -f ctfbot-deploy -N ""`, put `ctfbot-deploy.pub` in `~/.ssh/authorized_keys` on the server, and paste the private file into `BOT_SSH_KEY`.

## Staff controls

CTF management → Season settings has **Discord bot** controls: last sync, a **Sync now** button, and **Tear down season channels** (confirmed). They queue rows in `discord_bot_commands`; the bot runs them within seconds.

## Self-assign role picker

`/rolepicker` (needs Manage Roles) posts an embed in the current channel with a button per role (up to 10; optional `title`, `text`, and `emojis` — space-separated, one per role in order); clicking toggles that role on the clicker. Roles with moderation permissions, integration-managed roles, and roles at or above the bot's own are refused — both when posting and on every click. To change the lineup, run the command again and delete the old message. The buttons keep working across bot restarts.

## Captains: `/squad add` and `/squad remove`

Players who won't link Discord on freeinf.org never get their squad role from the sync. A squad's captain or co-captains (linked, so the bot knows who they are) can hand it out themselves: `/squad add user:@player` gives the role, `/squad remove user:@player` takes it back. The bot makes the change, so captains never need Manage Roles. Staff (Manage Roles or the staff role) can act for any squad with `squad:<name or tag>`; a captain who runs more than one squad names it the same way.

The sync only ever removes the role from accounts that have linked Discord and are no longer on the roster, so a manual add sticks. It also means a player added this way is **not** removed automatically when they leave the squad on the site — the captain (or staff) removes them with the command. Linked players stay the site's business: the command refuses to add or remove them and points at the roster on freeinf.org instead, because the next sync would undo it. Every change is posted to the staff channel. Season teardown deletes the role itself, so manual adds go with it.

## Sign-up hype (`#ctf-signup`)

Set `DISCORD_SIGNUP_CHANNEL_ID` to the public sign-up channel and the bot promotes league registration there (needs the Guild Messages intent, which is on by default — no privileged intent):

- **Every new registration** on freeinf.org/league/register (an active `free_agents` row for the open season) gets a shout-out within a minute: who signed up (mention when linked, alias otherwise), their preferred classes, the pool size and the link. Eight different wordings, never the same one twice in a row. Edits and re-registrations of the same row are not re-announced.
- **@mention nudges:** when someone in that channel tags a player who hasn't registered, the bot replies tagging them with the link (seven wordings, at most once a day per person). Tagging someone who *is* registered gets a short "already in" instead. "Registered" means a linked account with a row for the season, or a display name / username matching a registrant's alias (for players who never linked). Nudges stop once the registration deadline passes.
- **`/signups kickoff`** (staff) posts the roll-call — everyone in the pool so far, the deadline and the link — to start the channel off. **`/signups status`** shows the pool, who is linked and the deadline, privately.

Which rows were announced and who was nudged when is kept in `bot/.signups-state.json` (gitignored) so a restart never repeats itself. On the first run for a season the existing pool is recorded silently; use `/signups kickoff` to introduce it.
