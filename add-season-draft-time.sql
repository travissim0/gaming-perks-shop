-- Draft start time for draft-league seasons. When set, league registration stays open until
-- one hour before the draft (instead of closing at the end of registration_closes_on).
ALTER TABLE public.league_seasons ADD COLUMN IF NOT EXISTS draft_at TIMESTAMPTZ;
