-- "Time TBD" fixtures: staff can put a league match on the schedule before the captains
-- have agreed a time. While time_tbd is true, scheduled_at holds the end of the play-by
-- day (for sorting and the Mon–Sun week), not a kick-off time: lineups stay open, the
-- side stays hidden, the zone opens no arena, and the match never auto-expires.
ALTER TABLE matches ADD COLUMN IF NOT EXISTS time_tbd boolean NOT NULL DEFAULT false;
