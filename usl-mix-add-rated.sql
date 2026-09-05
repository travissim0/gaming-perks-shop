-- USL Mix: per-game ELO opt-in flag. The mix host runs *mix rated on in the zone; only
-- mix games with rated = true move ratings. Every game is still recorded either way.
ALTER TABLE usl_mix_games ADD COLUMN IF NOT EXISTS rated BOOLEAN NOT NULL DEFAULT FALSE;
