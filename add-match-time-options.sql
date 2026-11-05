-- Match time proposals can offer several kick-off times at once (2026-11-04).
--
-- A captain proposes up to three times on the league's day; the other side picks one, which
-- sets the match time, instead of accept/decline/counter round trips for every time.
--
-- proposed_at stays the first (or, once accepted, the chosen) time, so earlier rows and the
-- history keep working; `alternatives` holds the other times offered.

ALTER TABLE public.match_time_proposals
  ADD COLUMN IF NOT EXISTS alternatives TIMESTAMPTZ[] NOT NULL DEFAULT '{}';

NOTIFY pgrst, 'reload schema';
