-- USL Mix: shotcaller tag. Players claim it in the zone with ?sc (jousting rules in USLMixes.cs);
-- it is a badge on the site and is never an ELO input. Run BEFORE deploying the site build that
-- reads it - the ingest route tolerates the columns being absent, the read routes select '*'.
ALTER TABLE usl_mix_games        ADD COLUMN IF NOT EXISTS team_a_shotcaller TEXT;
ALTER TABLE usl_mix_games        ADD COLUMN IF NOT EXISTS team_b_shotcaller TEXT;
ALTER TABLE usl_mix_game_players ADD COLUMN IF NOT EXISTS is_shotcaller BOOLEAN NOT NULL DEFAULT FALSE;
