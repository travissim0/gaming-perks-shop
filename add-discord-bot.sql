-- Tables the FreeInf CTF bot (bot/) uses. All written by the bot or by staff
-- through service-role routes; RLS is on with no browser policies.

-- What the bot created per squad per season, so syncs are idempotent and
-- teardown knows exactly what to delete.
CREATE TABLE IF NOT EXISTS public.discord_squad_channels (
  guild_id          TEXT NOT NULL,
  season_id         UUID NOT NULL,
  squad_id          UUID NOT NULL REFERENCES public.squads(id) ON DELETE CASCADE,
  squad_name        TEXT NOT NULL,
  role_id           TEXT NOT NULL,
  category_id       TEXT NOT NULL,
  text_channel_id   TEXT,
  voice_team_id     TEXT,
  voice_offense_id  TEXT,
  voice_defense_id  TEXT,
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (guild_id, season_id, squad_id)
);

-- Staff → bot requests ('sync' now, or 'teardown' a season's channels).
CREATE TABLE IF NOT EXISTS public.discord_bot_commands (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  action        TEXT NOT NULL CHECK (action IN ('sync', 'teardown')),
  season_id     UUID,
  requested_by  UUID REFERENCES public.profiles(id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  done_at       TIMESTAMPTZ,
  result        TEXT
);

-- One-row heartbeat the admin panel reads.
CREATE TABLE IF NOT EXISTS public.discord_bot_state (
  id            INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  guild_id      TEXT,
  season_id     UUID,
  last_sync_at  TIMESTAMPTZ,
  last_result   TEXT,
  last_error    TEXT,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.discord_squad_channels ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.discord_bot_commands   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.discord_bot_state      ENABLE ROW LEVEL SECURITY;

-- Realtime: the bot listens for roster and draft changes and for new commands.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'squad_members') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.squad_members;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'squads') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.squads;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'ctfdl_draft_teams') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.ctfdl_draft_teams;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'discord_bot_commands') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.discord_bot_commands;
  END IF;
END $$;
