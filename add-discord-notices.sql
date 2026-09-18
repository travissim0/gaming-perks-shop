-- Outbound notices for the FreeInf CTF Discord bot: the site queues a row,
-- the bot DMs the person (and posts to a channel where relevant) and marks
-- it sent. RLS on with NO policies: only the service role reads or writes.

CREATE TABLE IF NOT EXISTS public.discord_bot_notices (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID REFERENCES public.profiles(id) ON DELETE CASCADE,   -- who to DM (null = channel only)
  channel     TEXT CHECK (channel IS NULL OR channel IN ('referee', 'staff')),  -- also post here
  kind        TEXT NOT NULL,          -- crew_added | crew_removed | fs_proposed | fs_accepted …
  payload     JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  sent_at     TIMESTAMPTZ,
  error       TEXT
);

CREATE INDEX IF NOT EXISTS discord_bot_notices_pending_idx ON public.discord_bot_notices (created_at) WHERE sent_at IS NULL;

ALTER TABLE public.discord_bot_notices ENABLE ROW LEVEL SECURITY;

-- Let the bot's Realtime subscription see inserts.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'discord_bot_notices'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.discord_bot_notices;
  END IF;
END $$;
