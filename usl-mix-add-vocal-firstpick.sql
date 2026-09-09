-- USL Mix: the ?v "on comms" tag, and which team picked first.
--   is_vocal        - self-declared in the zone with ?v. A badge; never an ELO input. Feeds the
--                     eventual "don't build a team with nobody calling anything" draft rule.
--   first_pick_team - the team that won the coin flip and drafted first, so we can finally measure
--                     whether first or second pick actually wins more (Champion asked; nobody knew).
-- Safe to run any time: ingest tolerates either column being absent.
ALTER TABLE usl_mix_games        ADD COLUMN IF NOT EXISTS first_pick_team TEXT;
ALTER TABLE usl_mix_game_players ADD COLUMN IF NOT EXISTS is_vocal BOOLEAN NOT NULL DEFAULT FALSE;
