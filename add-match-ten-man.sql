-- 10-man plan on a match lineup: who comes in when the team goes 10-man
-- (usually the infil, from the bench: 'in') and who steps out for them
-- (a starter: 'out'). Planning only; the swap itself is a normal sub.
-- Private like the rest of match_lineups (service role only).

ALTER TABLE public.match_lineups
  ADD COLUMN IF NOT EXISTS ten_man TEXT CHECK (ten_man IN ('in', 'out'));

COMMENT ON COLUMN public.match_lineups.ten_man IS
  '10-man plan: in = comes in from the bench when the team goes 10-man, out = starter who steps out for them. NULL = neither.';
