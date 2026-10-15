-- Captains agree the kick-off time of a league match on the site.
--
-- The league sets the DAY of each regular-season match; the two squads' captains (or
-- co-captains) pick what time that day to play. One side proposes a time, the other accepts
-- or declines on the match page (/matches/[id]); on acceptance the fixture's time is set and
-- the referees' channel is told, as when staff set it by hand. Staff can still set or move
-- a time directly.
--
-- No client policies: the service role (the site's API) is the only reader and writer.

CREATE TABLE IF NOT EXISTS public.match_time_proposals (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id     UUID NOT NULL REFERENCES public.matches(id) ON DELETE CASCADE,
  -- The squad proposing, and who did it for them.
  squad_id     UUID NOT NULL REFERENCES public.squads(id) ON DELETE CASCADE,
  proposed_by  UUID NOT NULL REFERENCES public.profiles(id),
  -- The kick-off being proposed.
  proposed_at  TIMESTAMPTZ NOT NULL,
  status       TEXT NOT NULL DEFAULT 'pending'
               CHECK (status IN ('pending', 'accepted', 'declined', 'withdrawn')),
  -- A note from the proposer, or on a decline the reason given back.
  note         TEXT,
  decided_by   UUID REFERENCES public.profiles(id),
  decided_at   TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- One open proposal per match; a new one replaces (withdraws or declines) the old.
CREATE UNIQUE INDEX IF NOT EXISTS match_time_proposals_one_pending
  ON public.match_time_proposals (match_id) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS match_time_proposals_match
  ON public.match_time_proposals (match_id, created_at DESC);

ALTER TABLE public.match_time_proposals ENABLE ROW LEVEL SECURITY;
