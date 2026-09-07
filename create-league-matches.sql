-- ============================================================================
-- league_matches — match history for the generic leagues (CTFDL, OVDL, ...)
-- ============================================================================
-- Until now EVERY league's matches were written into ctfpl_matches, which has
-- no league column — so "CTFDL Season 3" and "CTFPL Season 3" were
-- indistinguishable, and CTFDL's standings page showed CTFPL's playoff bracket.
--
-- This gives the generic leagues their own table keyed by league_season_id,
-- keeping each league's backend separate (as intended). CTFPL keeps using
-- ctfpl_matches, unchanged.
--
-- Additive only. Safe to re-run. Paste into the Supabase SQL editor.
-- ============================================================================

CREATE TABLE IF NOT EXISTS league_matches (
    id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    league_season_id          UUID NOT NULL REFERENCES league_seasons(id) ON DELETE CASCADE,
    season_number             INTEGER,                 -- denormalized for display
    game_id                   TEXT UNIQUE,             -- links to player_stats
    match_date                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    match_type                TEXT NOT NULL DEFAULT 'Season'
                              CHECK (match_type IN ('Season', 'Playoffs', 'Finals')),
    arena_name                TEXT,
    game_length_minutes       NUMERIC,
    win_margin_minutes        NUMERIC,
    mvp_player_name           TEXT,

    team_a_name               TEXT NOT NULL,
    team_a_squad_id           UUID REFERENCES squads(id),
    team_a_result             TEXT CHECK (team_a_result IN ('Win', 'Loss', 'No Show')),
    team_a_kills              INTEGER DEFAULT 0,
    team_a_deaths             INTEGER DEFAULT 0,
    team_a_captures           INTEGER DEFAULT 0,
    team_a_carrier_kills      INTEGER DEFAULT 0,
    team_a_carry_time_seconds INTEGER DEFAULT 0,

    team_b_name               TEXT NOT NULL,
    team_b_squad_id           UUID REFERENCES squads(id),
    team_b_result             TEXT CHECK (team_b_result IN ('Win', 'Loss', 'No Show')),
    team_b_kills              INTEGER DEFAULT 0,
    team_b_deaths             INTEGER DEFAULT 0,
    team_b_captures           INTEGER DEFAULT 0,
    team_b_carrier_kills      INTEGER DEFAULT 0,
    team_b_carry_time_seconds INTEGER DEFAULT 0,

    created_at                TIMESTAMPTZ DEFAULT NOW(),

    CONSTRAINT league_matches_different_squads
        CHECK (team_a_squad_id IS DISTINCT FROM team_b_squad_id)
);

CREATE INDEX IF NOT EXISTS idx_league_matches_season ON league_matches(league_season_id);
CREATE INDEX IF NOT EXISTS idx_league_matches_date   ON league_matches(match_date);
CREATE INDEX IF NOT EXISTS idx_league_matches_type   ON league_matches(match_type);

ALTER TABLE league_matches ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS league_matches_read  ON league_matches;
DROP POLICY IF EXISTS league_matches_admin ON league_matches;

CREATE POLICY league_matches_read ON league_matches
    FOR SELECT USING (true);

CREATE POLICY league_matches_admin ON league_matches
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.id = auth.uid()
              AND (profiles.is_admin = true OR profiles.ctf_role = 'ctf_admin')
        )
    );

COMMENT ON TABLE league_matches IS
    'Match history for generic leagues (CTFDL, OVDL). CTFPL uses ctfpl_matches.';

-- ----------------------------------------------------------------------------
-- OPTIONAL: moving historical rows.
-- Any OLD CTFDL/OVDL matches still sit in ctfpl_matches with no league marker,
-- so they cannot be separated automatically. If you know their game_ids, move
-- them like this (fill in the league_season uuid + game_ids):
--
--   INSERT INTO league_matches (league_season_id, season_number, game_id, match_date,
--       match_type, arena_name, game_length_minutes, win_margin_minutes, mvp_player_name,
--       team_a_name, team_a_squad_id, team_a_result, team_a_kills, team_a_deaths,
--       team_a_captures, team_a_carrier_kills, team_a_carry_time_seconds,
--       team_b_name, team_b_squad_id, team_b_result, team_b_kills, team_b_deaths,
--       team_b_captures, team_b_carrier_kills, team_b_carry_time_seconds)
--   SELECT '<league_season_uuid>', season_number, game_id, match_date,
--       match_type, arena_name, game_length_minutes, win_margin_minutes, mvp_player_name,
--       team_a_name, team_a_squad_id, team_a_result, team_a_kills, team_a_deaths,
--       team_a_captures, team_a_carrier_kills, team_a_carry_time_seconds,
--       team_b_name, team_b_squad_id, team_b_result, team_b_kills, team_b_deaths,
--       team_b_captures, team_b_carrier_kills, team_b_carry_time_seconds
--   FROM ctfpl_matches WHERE game_id IN ('...', '...');
--   DELETE FROM ctfpl_matches WHERE game_id IN ('...', '...');
-- ----------------------------------------------------------------------------
