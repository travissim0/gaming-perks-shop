# Discord integration — setup

Two pieces share one Discord application ("FreeInf CTF"):

1. **Account link** (live on the site): players connect Discord on `/profile`.
   The site stores their Discord id, username, avatar and CTFPL-server nickname,
   fills the Discord field on league registration, and shows the handle in the
   player pool. Scopes requested: `identify`, `guilds.members.read`. Nothing is
   ever posted on a player's behalf.
2. **CTFPL bot** (`bot/`, runs on John's Linux server): squad roles, private
   categories and channels driven by the site's draft and squad data.

## Discord developer portal (one time)

- Application: **FreeInf CTF** — Application ID `1547467056008400936`.
- OAuth2 → Redirects: add **both**
  - `https://www.freeinf.org/api/discord/callback`
  - `https://freeinf.org/api/discord/callback`
- Bot → Add Bot → copy the token (for the bot host only).
- CTFPL server id: `374782525647749131`.

## Vercel environment variables (site)

| Name | Value |
| --- | --- |
| `DISCORD_CLIENT_ID` | `1547467056008400936` |
| `DISCORD_CLIENT_SECRET` | from OAuth2 → Client Secret (never in chat or git) |
| `DISCORD_GUILD_ID` | `374782525647749131` |

Redeploy after adding them. Then run `add-discord-link.sql` in Supabase.

## What each route does

- `GET /api/discord/start` (signed in) → returns the Discord authorize URL with a signed state.
- `GET /api/discord/callback` → exchanges the code, reads `/users/@me` and the CTFPL member record, saves to `profiles`, backfills a blank Discord field on the player's current registration, redirects back with `?discord=linked`.
- `POST /api/discord/unlink` (signed in) → clears the link.

## Testing the link

1. Sign in, open `/profile`, click **Connect Discord**, approve.
2. Back on the profile the Discord card shows your handle and CTFPL nickname.
3. Open `/league/register`: the Discord field is filled and read-only.
