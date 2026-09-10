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
