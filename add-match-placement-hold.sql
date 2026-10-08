-- ============================================================================
-- Match placement holds
--
-- The zone reports moves it is holding back during a match (a player it would
-- spec for a sub who is carrying a flag) through POST /api/matches/<id>/placement.
-- The match page shows "waiting on the arena" for them so the referee and
-- captains don't think the sub failed. Stored as one JSON value per match:
--   { "at": "<when reported>", "held": [{ "alias": "Kev", "reason": "flag" }] }
-- Safe to run more than once. Until it is run, holds are simply not shown.
-- ============================================================================

ALTER TABLE public.match_setup
  ADD COLUMN IF NOT EXISTS placement_hold JSONB;

-- Tell the API layer about the new column right away.
NOTIFY pgrst, 'reload schema';
