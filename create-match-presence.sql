-- Who was in a league match's arena, sampled from the zone's live snapshots.
--
-- The zone posts a snapshot of every arena about once a minute (live_arena_snapshots), listing
-- every player with a spectator flag. While a league match is near or in progress, each poll of
-- the match queue notes who is in that match's arena. Evidence for the Crew tab (a referee who
-- signed up but was never seen; a staff member who turned up without signing up) and for who on
-- a roster actually showed. Never a verdict on its own: no-shows stay a manual mark.
--
-- No client policies: the service role (the site's API) is the only reader and writer.

CREATE TABLE IF NOT EXISTS public.match_presence (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id    UUID NOT NULL REFERENCES public.matches(id) ON DELETE CASCADE,
  -- The alias as the zone reported it, and the key it is matched on (lower-cased, staff prefix
  -- such as "CTF[Ref] " stripped).
  alias       TEXT NOT NULL,
  alias_key   TEXT NOT NULL,
  -- The site profile that alias resolved to, when one did.
  player_id   UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  -- 'ref' / 'admin' when the alias carried a CTF[Ref] / CTF[Admin] prefix: a staff member working
  -- the match. Under a normal alias the same person is there to play.
  staff_tag   TEXT,
  first_seen  TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen   TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Seen spectating / seen on a playing team at least once.
  spec_seen   BOOLEAN NOT NULL DEFAULT false,
  play_seen   BOOLEAN NOT NULL DEFAULT false,
  samples     INTEGER NOT NULL DEFAULT 1,
  UNIQUE (match_id, alias_key)
);
CREATE INDEX IF NOT EXISTS match_presence_match ON public.match_presence (match_id);

ALTER TABLE public.match_presence ENABLE ROW LEVEL SECURITY;
