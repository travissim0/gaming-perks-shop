-- ============================================================================
-- USL Mix ELO / stats pipeline  (paste into the Supabase SQL editor)
--
-- Written by the USL zone script (USLMixStats.cs) via POST /api/usl-mix/ingest,
-- read by the public GET /api/usl-mix/* endpoints and the /usl-mix pages.
-- All writes go through the service role; every table is public-read (RLS).
-- Safe to re-run: everything is IF NOT EXISTS / CREATE OR REPLACE.
-- ============================================================================

-- One row per recorded game (mix, casual "pub", or a *mixstats sendnow test snapshot)
CREATE TABLE IF NOT EXISTS usl_mix_games (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    match_id            TEXT NOT NULL UNIQUE,              -- GUID minted by the zone script (idempotency key)
    schema_version      INT  NOT NULL DEFAULT 1,
    script_version      TEXT,
    zone_name           TEXT,
    arena_name          TEXT,
    level_file          TEXT,                              -- e.g. uslMegamap2.lvl
    map_key             TEXT,                              -- e.g. els / kp / apollo (megamap sub-map) or the lvl name
    game_kind           TEXT NOT NULL CHECK (game_kind IN ('mix', 'pub', 'test')),
    team_size           INT,                               -- *mix team size (0 for pubs)
    started_at          TIMESTAMPTZ,
    ended_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    duration_seconds    INT NOT NULL DEFAULT 0,
    end_reason          TEXT,                              -- clock / mercy / manual
    -- the two teams
    team_a_name         TEXT, team_a_side TEXT, team_a_kills INT, team_a_deaths INT, team_a_result TEXT, team_a_captain TEXT, team_a_players INT,
    team_b_name         TEXT, team_b_side TEXT, team_b_kills INT, team_b_deaths INT, team_b_result TEXT, team_b_captain TEXT, team_b_players INT,
    winner_side         TEXT CHECK (winner_side IN ('T', 'C')),   -- NULL = draw or sides unknown
    winner_team         TEXT,
    loser_team          TEXT,
    unattributed_deaths INT DEFAULT 0,
    elo_applied         BOOLEAN NOT NULL DEFAULT FALSE,
    raw                 JSONB,                             -- the full payload as received
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS usl_mix_games_ended_at_idx ON usl_mix_games (ended_at DESC);
CREATE INDEX IF NOT EXISTS usl_mix_games_map_key_idx  ON usl_mix_games (map_key);
CREATE INDEX IF NOT EXISTS usl_mix_games_kind_idx     ON usl_mix_games (game_kind);

-- One row per player per game
CREATE TABLE IF NOT EXISTS usl_mix_game_players (
    id                  BIGSERIAL PRIMARY KEY,
    game_id             UUID NOT NULL REFERENCES usl_mix_games(id) ON DELETE CASCADE,
    alias               TEXT NOT NULL,
    alias_key           TEXT NOT NULL,                     -- lower(trim(alias))
    side                TEXT,                              -- T / C
    team_name           TEXT,
    result              TEXT CHECK (result IN ('win', 'loss', 'draw')),
    is_captain          BOOLEAN NOT NULL DEFAULT FALSE,
    primary_class       TEXT,                              -- class with the most play time this game
    classes             JSONB NOT NULL DEFAULT '{}',       -- {"Marine": seconds, ...}
    kills               INT NOT NULL DEFAULT 0,            -- enemy kills (from death events)
    deaths              INT NOT NULL DEFAULT 0,
    team_kills          INT NOT NULL DEFAULT 0,
    kills_scoreboard    INT,                               -- server scoreboard delta, for cross-checking
    deaths_scoreboard   INT,
    shots_fired         INT NOT NULL DEFAULT 0,
    shots_landed        INT NOT NULL DEFAULT 0,
    accuracy            NUMERIC(6,2),
    bio_dart_hits       INT NOT NULL DEFAULT 0,
    heal_amount         INT NOT NULL DEFAULT 0,            -- HP available to heal when heals fired
    heal_uses           INT NOT NULL DEFAULT 0,
    play_seconds        INT NOT NULL DEFAULT 0,
    weapon_kills        JSONB NOT NULL DEFAULT '{}',       -- {"1004": {"name": "LAW", "count": 3}}
    weapon_deaths       JSONB NOT NULL DEFAULT '{}',
    -- filled in when the ELO pass runs (mix games only)
    rating_before       NUMERIC(8,2),
    rating_after        NUMERIC(8,2),
    rating_delta        NUMERIC(8,2),
    performance         NUMERIC(6,3),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (game_id, alias_key)
);
CREATE INDEX IF NOT EXISTS usl_mix_game_players_alias_idx ON usl_mix_game_players (alias_key);
CREATE INDEX IF NOT EXISTS usl_mix_game_players_game_idx  ON usl_mix_game_players (game_id);
CREATE INDEX IF NOT EXISTS usl_mix_game_players_class_idx ON usl_mix_game_players (primary_class);

-- One row per death (weapon attribution lives here)
CREATE TABLE IF NOT EXISTS usl_mix_kill_events (
    id                  BIGSERIAL PRIMARY KEY,
    game_id             UUID NOT NULL REFERENCES usl_mix_games(id) ON DELETE CASCADE,
    t_ms                INT NOT NULL DEFAULT 0,            -- ms since game start
    killer              TEXT,                              -- NULL for terrain / unknown deaths
    killer_key          TEXT,
    victim              TEXT NOT NULL,
    victim_key          TEXT NOT NULL,
    killer_side         TEXT,
    victim_side         TEXT,
    killer_class        TEXT,
    victim_class        TEXT,
    weapon_id           INT,                               -- raw exploding item (may be shrapnel)
    weapon_name         TEXT,
    root_weapon_id      INT,                               -- rolled up: shrapnel -> LAW
    root_weapon_name    TEXT,
    team_kill           BOOLEAN NOT NULL DEFAULT FALSE,
    kill_type           TEXT,                              -- Player / Terrain / Explosion ...
    attribution         TEXT,                              -- matched / fallback / unknown / none
    x                   INT,
    y                   INT
);
CREATE INDEX IF NOT EXISTS usl_mix_kill_events_game_idx   ON usl_mix_kill_events (game_id);
CREATE INDEX IF NOT EXISTS usl_mix_kill_events_killer_idx ON usl_mix_kill_events (killer_key);
CREATE INDEX IF NOT EXISTS usl_mix_kill_events_weapon_idx ON usl_mix_kill_events (root_weapon_name);

-- Current rating per alias (mix games only)
CREATE TABLE IF NOT EXISTS usl_mix_player_ratings (
    alias_key           TEXT PRIMARY KEY,
    alias               TEXT NOT NULL,
    rating              NUMERIC(8,2) NOT NULL DEFAULT 1200,
    peak_rating         NUMERIC(8,2) NOT NULL DEFAULT 1200,
    games               INT NOT NULL DEFAULT 0,
    wins                INT NOT NULL DEFAULT 0,
    losses              INT NOT NULL DEFAULT 0,
    draws               INT NOT NULL DEFAULT 0,
    kills               INT NOT NULL DEFAULT 0,
    deaths              INT NOT NULL DEFAULT 0,
    last_game_at        TIMESTAMPTZ,
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS usl_mix_player_ratings_rating_idx ON usl_mix_player_ratings (rating DESC);

-- Every rating change, so the formula can be audited and replayed
CREATE TABLE IF NOT EXISTS usl_mix_rating_history (
    id                  BIGSERIAL PRIMARY KEY,
    game_id             UUID NOT NULL REFERENCES usl_mix_games(id) ON DELETE CASCADE,
    alias_key           TEXT NOT NULL,
    alias               TEXT,
    rating_before       NUMERIC(8,2) NOT NULL,
    rating_after        NUMERIC(8,2) NOT NULL,
    delta               NUMERIC(8,2) NOT NULL,
    team_expected       NUMERIC(6,4),                      -- expected score of the player's team
    performance         NUMERIC(6,3),                      -- individual performance multiplier
    k_factor            NUMERIC(6,2),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS usl_mix_rating_history_alias_idx ON usl_mix_rating_history (alias_key, created_at);
CREATE INDEX IF NOT EXISTS usl_mix_rating_history_game_idx  ON usl_mix_rating_history (game_id);

-- ---------------------------------------------------------------------------
-- Insight views (mix + pub games; test snapshots excluded)
-- ---------------------------------------------------------------------------

-- Titan vs Collective win rate per map
CREATE OR REPLACE VIEW usl_mix_v_side_winrates AS
SELECT
    COALESCE(map_key, 'unknown')                              AS map_key,
    game_kind,
    COUNT(*)                                                  AS games,
    COUNT(*) FILTER (WHERE winner_side = 'T')                 AS titan_wins,
    COUNT(*) FILTER (WHERE winner_side = 'C')                 AS collective_wins,
    COUNT(*) FILTER (WHERE winner_side IS NULL)               AS draws,
    SUM(CASE WHEN team_a_side = 'T' THEN team_a_kills ELSE team_b_kills END) AS titan_kills,
    SUM(CASE WHEN team_a_side = 'C' THEN team_a_kills ELSE team_b_kills END) AS collective_kills
FROM usl_mix_games
WHERE game_kind IN ('mix', 'pub')
GROUP BY 1, 2;

-- Class performance per map (one appearance = one player-game with that primary class)
CREATE OR REPLACE VIEW usl_mix_v_class_stats AS
SELECT
    COALESCE(g.map_key, 'unknown')                            AS map_key,
    g.game_kind,
    COALESCE(p.primary_class, 'Unknown')                      AS class_name,
    COUNT(*)                                                  AS appearances,
    COUNT(*) FILTER (WHERE p.result = 'win')                  AS wins,
    COUNT(*) FILTER (WHERE p.result = 'loss')                 AS losses,
    SUM(p.kills)                                              AS kills,
    SUM(p.deaths)                                             AS deaths,
    SUM(p.shots_fired)                                        AS shots_fired,
    SUM(p.shots_landed)                                       AS shots_landed,
    SUM(p.heal_amount)                                        AS heal_amount,
    SUM(p.play_seconds)                                       AS play_seconds
FROM usl_mix_game_players p
JOIN usl_mix_games g ON g.id = p.game_id
WHERE g.game_kind IN ('mix', 'pub')
GROUP BY 1, 2, 3;

-- Kills by (rolled-up) weapon per map
CREATE OR REPLACE VIEW usl_mix_v_weapon_stats AS
SELECT
    COALESCE(g.map_key, 'unknown')                            AS map_key,
    g.game_kind,
    COALESCE(e.root_weapon_name, 'Unknown')                   AS weapon,
    e.root_weapon_id                                          AS weapon_id,
    COUNT(*)                                                  AS kills,
    COUNT(*) FILTER (WHERE e.attribution = 'matched')         AS kills_matched
FROM usl_mix_kill_events e
JOIN usl_mix_games g ON g.id = e.game_id
WHERE e.killer IS NOT NULL AND NOT e.team_kill AND g.game_kind IN ('mix', 'pub')
GROUP BY 1, 2, 3, 4;

-- Career totals per alias across mix + pub games
CREATE OR REPLACE VIEW usl_mix_v_player_career AS
SELECT
    p.alias_key,
    MAX(p.alias)                                              AS alias,
    COUNT(*)                                                  AS games,
    COUNT(*) FILTER (WHERE p.result = 'win')                  AS wins,
    COUNT(*) FILTER (WHERE p.result = 'loss')                 AS losses,
    COUNT(*) FILTER (WHERE p.result = 'draw')                 AS draws,
    COUNT(*) FILTER (WHERE g.game_kind = 'mix')               AS mix_games,
    SUM(p.kills)                                              AS kills,
    SUM(p.deaths)                                             AS deaths,
    SUM(p.team_kills)                                         AS team_kills,
    SUM(p.shots_fired)                                        AS shots_fired,
    SUM(p.shots_landed)                                       AS shots_landed,
    SUM(p.bio_dart_hits)                                      AS bio_dart_hits,
    SUM(p.heal_amount)                                        AS heal_amount,
    SUM(p.play_seconds)                                       AS play_seconds,
    MAX(g.ended_at)                                           AS last_game_at
FROM usl_mix_game_players p
JOIN usl_mix_games g ON g.id = p.game_id
WHERE g.game_kind IN ('mix', 'pub')
GROUP BY 1;

-- ---------------------------------------------------------------------------
-- Row level security: public read, service-role write (no insert policies on purpose)
-- ---------------------------------------------------------------------------
ALTER TABLE usl_mix_games          ENABLE ROW LEVEL SECURITY;
ALTER TABLE usl_mix_game_players   ENABLE ROW LEVEL SECURITY;
ALTER TABLE usl_mix_kill_events    ENABLE ROW LEVEL SECURITY;
ALTER TABLE usl_mix_player_ratings ENABLE ROW LEVEL SECURITY;
ALTER TABLE usl_mix_rating_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS usl_mix_games_public_read          ON usl_mix_games;
DROP POLICY IF EXISTS usl_mix_game_players_public_read   ON usl_mix_game_players;
DROP POLICY IF EXISTS usl_mix_kill_events_public_read    ON usl_mix_kill_events;
DROP POLICY IF EXISTS usl_mix_player_ratings_public_read ON usl_mix_player_ratings;
DROP POLICY IF EXISTS usl_mix_rating_history_public_read ON usl_mix_rating_history;

CREATE POLICY usl_mix_games_public_read          ON usl_mix_games          FOR SELECT USING (true);
CREATE POLICY usl_mix_game_players_public_read   ON usl_mix_game_players   FOR SELECT USING (true);
CREATE POLICY usl_mix_kill_events_public_read    ON usl_mix_kill_events    FOR SELECT USING (true);
CREATE POLICY usl_mix_player_ratings_public_read ON usl_mix_player_ratings FOR SELECT USING (true);
CREATE POLICY usl_mix_rating_history_public_read ON usl_mix_rating_history FOR SELECT USING (true);

GRANT SELECT ON usl_mix_games, usl_mix_game_players, usl_mix_kill_events, usl_mix_player_ratings, usl_mix_rating_history TO anon, authenticated;
GRANT SELECT ON usl_mix_v_side_winrates, usl_mix_v_class_stats, usl_mix_v_weapon_stats, usl_mix_v_player_career TO anon, authenticated;
