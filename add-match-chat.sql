-- The in-game chat a referee opens for a league match, so both squads' captains and co-captains
-- can raise things during it. Kept on match_setup, which has row security with no policies, so
-- the name is never readable from the browser; the site shows it only to league staff, referees
-- and the two squads' captains / co-captains.
ALTER TABLE public.match_setup ADD COLUMN IF NOT EXISTS ref_chat TEXT;
