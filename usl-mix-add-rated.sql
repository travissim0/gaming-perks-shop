-- USL Mix: per-game ELO opt-in flag. Both captains type ?rated in the zone (ref override:
-- *mix rated on|off); only mix games with rated = true move ratings. Every game is still recorded.
ALTER TABLE usl_mix_games ADD COLUMN IF NOT EXISTS rated BOOLEAN NOT NULL DEFAULT FALSE;
