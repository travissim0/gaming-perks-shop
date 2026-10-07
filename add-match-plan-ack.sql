-- A player's in-game answer to the plan their captain set for them (match page Plan tab).
-- Before the match the zone whispers each player their planned side / class; they reply
-- ?y (accept: the zone also switches their class) or ?n [o|d] [class] (decline, optionally
-- suggesting what they'd rather play). The zone posts that to /api/matches/[id]/plan-response.
-- Private like the rest of match_lineups. Cleared automatically when the captain changes what
-- that player is asked to play.

ALTER TABLE public.match_lineups
  ADD COLUMN IF NOT EXISTS plan_ack TEXT CHECK (plan_ack IN ('yes', 'no')),
  ADD COLUMN IF NOT EXISTS plan_ack_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS plan_suggest_side TEXT CHECK (plan_suggest_side IN ('O', 'D')),
  ADD COLUMN IF NOT EXISTS plan_suggest_class TEXT CHECK (plan_suggest_class IN ('INF', 'HVY', 'SL', 'MED', 'ENG', 'IFL', 'JT'));
