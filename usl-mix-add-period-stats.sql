-- USL Mix: per-player, per-class totals over a time window, for /api/usl-mix/leaders
-- ("top player this week / month / year, top player by class" - Chris, 2026-09-08).
-- One row per (player, primary class). The API sums the classes for player totals.
-- Until this exists the API aggregates in Node from raw rows (slower, capped at 8000 rows).

CREATE OR REPLACE FUNCTION usl_mix_period_stats(
    p_since TIMESTAMPTZ DEFAULT NULL,                  -- NULL = all time
    p_kinds TEXT[]      DEFAULT ARRAY['mix', 'pub'],
    p_map   TEXT        DEFAULT NULL                   -- NULL = every map
)
RETURNS TABLE (
    alias_key           TEXT,
    alias               TEXT,
    class_name          TEXT,
    games               BIGINT,
    wins                BIGINT,
    losses              BIGINT,
    draws               BIGINT,
    kills               BIGINT,
    deaths              BIGINT,
    team_kills          BIGINT,
    shots_fired         BIGINT,
    shots_landed        BIGINT,
    heal_amount         BIGINT,
    play_seconds        BIGINT,
    opening_kills       BIGINT,
    opening_deaths      BIGINT,
    opening_fights_won  BIGINT,
    rated_games         BIGINT,
    rating_delta        NUMERIC
)
LANGUAGE sql STABLE AS $$
    SELECT
        p.alias_key,
        MAX(p.alias),
        COALESCE(p.primary_class, 'Unknown'),
        COUNT(*),
        COUNT(*) FILTER (WHERE p.result = 'win'),
        COUNT(*) FILTER (WHERE p.result = 'loss'),
        COUNT(*) FILTER (WHERE p.result = 'draw'),
        COALESCE(SUM(p.kills), 0),
        COALESCE(SUM(p.deaths), 0),
        COALESCE(SUM(p.team_kills), 0),
        COALESCE(SUM(p.shots_fired), 0),
        COALESCE(SUM(p.shots_landed), 0),
        COALESCE(SUM(p.heal_amount), 0),
        COALESCE(SUM(p.play_seconds), 0),
        COALESCE(SUM(p.opening_kills), 0),
        COALESCE(SUM(p.opening_deaths), 0),
        COALESCE(SUM(p.opening_fights_won), 0),
        COUNT(*) FILTER (WHERE p.rating_delta IS NOT NULL),
        COALESCE(SUM(p.rating_delta), 0)
    FROM usl_mix_game_players p
    JOIN usl_mix_games g ON g.id = p.game_id
    WHERE g.game_kind = ANY(p_kinds)
      AND (p_since IS NULL OR g.ended_at >= p_since)
      AND (p_map IS NULL OR g.map_key = p_map)
    GROUP BY p.alias_key, COALESCE(p.primary_class, 'Unknown')
$$;

GRANT EXECUTE ON FUNCTION usl_mix_period_stats(TIMESTAMPTZ, TEXT[], TEXT) TO anon, authenticated, service_role;

-- Games end at ended_at; the window filter needs it indexed
CREATE INDEX IF NOT EXISTS usl_mix_games_ended_at_idx ON usl_mix_games (ended_at DESC);
