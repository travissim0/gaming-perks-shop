-- Discord account link: what we store when a player connects Discord on their
-- profile (/api/discord/callback). Read-only from the browser; written by the
-- service-role callback. One Discord account can be linked to one profile.
--
-- Needs these Vercel environment variables:
--   DISCORD_CLIENT_ID      (public, from the Discord developer portal)
--   DISCORD_CLIENT_SECRET  (secret)
--   DISCORD_GUILD_ID       (the CTFPL server id — used to read the member's nickname)

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS discord_id          TEXT,
  ADD COLUMN IF NOT EXISTS discord_username    TEXT,
  ADD COLUMN IF NOT EXISTS discord_global_name TEXT,
  ADD COLUMN IF NOT EXISTS discord_avatar      TEXT,
  ADD COLUMN IF NOT EXISTS discord_guild_nick  TEXT,
  ADD COLUMN IF NOT EXISTS discord_in_guild    BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS discord_linked_at   TIMESTAMPTZ;

CREATE UNIQUE INDEX IF NOT EXISTS profiles_discord_id_unique
  ON public.profiles (discord_id)
  WHERE discord_id IS NOT NULL;
