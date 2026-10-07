-- Captain's offense / defense arrangement of a match lineup ('O' or 'D' per player).
-- A planning aid only: the zone never reads it. Private like the rest of
-- match_lineups (service role only), so the opposing squad never sees it; the
-- squad's own captains, league staff and (after side release) referees do.

ALTER TABLE public.match_lineups
  ADD COLUMN IF NOT EXISTS plan_side TEXT CHECK (plan_side IN ('O', 'D'));

COMMENT ON COLUMN public.match_lineups.plan_side IS
  'Captain''s offense (O) / defense (D) plan for this player. Planning aid only; the zone ignores it.';
