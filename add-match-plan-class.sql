-- The class a captain plans each player on for a match (Field view on the match page).
-- A planning aid only: the zone never reads it. Private like the rest of
-- match_lineups (service role only): the squad's own captains, league staff and
-- (after side release) referees see it; the opposing squad never does.

ALTER TABLE public.match_lineups
  ADD COLUMN IF NOT EXISTS plan_class TEXT CHECK (plan_class IN ('INF', 'HVY', 'SL', 'MED', 'ENG', 'IFL', 'JT'));

COMMENT ON COLUMN public.match_lineups.plan_class IS
  'Captain''s planned class for this player: INF, HVY, SL, MED, ENG, IFL (infiltrator) or JT. Planning aid only; the zone ignores it.';
