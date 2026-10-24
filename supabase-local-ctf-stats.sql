-- Minimal local schema for CTF stats testing.
--
-- Purpose: let the zone POST real end-of-game rows into a THROWAWAY database, so the site can be
-- run locally against data produced by bot games without any chance of touching production.
-- Nothing here should ever be applied to the live project.
--
-- Columns mirror the live `player_stats` and `elo_seasons` exactly (read from the production
-- PostgREST schema on 2026-09-06 via scripts/supabase-query.mjs --columns), so a row that inserts
-- here would insert there. That equivalence is the whole point - it is what makes the local test
-- meaningful rather than a toy.
--
-- Apply with:   npx supabase start  &&  psql "$(npx supabase status -o env | grep DB_URL | cut -d= -f2-)" -f supabase-local-ctf-stats.sql
-- or just paste it into the local Studio SQL editor (npx supabase start prints the URL).

-- ---------------------------------------------------------------------------
-- Seasons. This is the real seasonalisation mechanism - `player_stats.season`
-- is filled from whichever row here has is_active = true.
--
-- On production, `Q3-2025` is STILL is_active = true with an end_date of
-- 2025-09-30. Nothing ever rolled it over, which is why 96% of live rows say
-- Q3-2025. Locally we start where you actually want to be: Q3-2026.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS elo_seasons (
    id           bigserial PRIMARY KEY,
    season_name  varchar NOT NULL UNIQUE,
    start_date   date,
    end_date     date,
    is_active    boolean     DEFAULT false,
    description  text,
    created_at   timestamptz DEFAULT now()
);

INSERT INTO elo_seasons (season_name, start_date, end_date, is_active, description)
VALUES
    ('Q3-2025', '2025-07-01', '2025-09-30', false, 'Archived - carried over from production'),
    ('Q3-2026', '2026-07-01', '2026-09-30', true,  'Q3 2026 Competitive Season - local trial')
ON CONFLICT (season_name) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Per-player, per-game rows. Written by /api/player-stats.
--
-- `season` is NOT sent by the zone - the ingest route never sets it - so it has
-- to default from elo_seasons. On production that behaviour comes from a
-- default/trigger created by hand in the dashboard; this reproduces it
-- explicitly so local and live agree.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION current_season_name() RETURNS varchar
LANGUAGE sql STABLE AS $$
    SELECT season_name FROM elo_seasons WHERE is_active LIMIT 1;
$$;

CREATE TABLE IF NOT EXISTS player_stats (
    id                              bigserial PRIMARY KEY,
    player_name                     varchar NOT NULL,
    team                            varchar,
    game_mode                       varchar,     -- 'OvD' | 'Mix' | 'Pub' | 'Tournament'
    arena_name                      varchar,
    base_used                       varchar,
    side                            varchar,     -- 'offense' | 'defense' | 'N/A'
    result                          varchar,     -- 'Win' | 'Loss'
    main_class                      varchar,
    kills                           integer DEFAULT 0,
    deaths                          integer DEFAULT 0,
    captures                        integer DEFAULT 0,
    carrier_kills                   integer DEFAULT 0,
    carry_time_seconds              integer DEFAULT 0,
    class_swaps                     integer DEFAULT 0,
    turret_damage                   integer DEFAULT 0,
    eb_hits                         integer DEFAULT 0,
    accuracy                        numeric DEFAULT 0,
    avg_resource_unused_per_death   numeric DEFAULT 0,
    avg_explosive_unused_per_death  numeric DEFAULT 0,
    game_length_minutes             numeric DEFAULT 0,
    game_date                       timestamptz DEFAULT now(),
    game_id                         varchar,
    elo_before                      numeric,
    elo_after                       numeric,
    elo_change                      numeric,
    season                          varchar DEFAULT current_season_name(),
    left_early                      boolean DEFAULT false
);

CREATE INDEX IF NOT EXISTS idx_player_stats_player  ON player_stats (player_name);
CREATE INDEX IF NOT EXISTS idx_player_stats_mode    ON player_stats (game_mode);
CREATE INDEX IF NOT EXISTS idx_player_stats_season  ON player_stats (season);
CREATE INDEX IF NOT EXISTS idx_player_stats_date    ON player_stats (game_date DESC);

-- The site reads this view for the ELO leaderboard. Stubbed so the page renders locally; the real
-- one on production also folds in known aliases, which local testing does not need.
CREATE OR REPLACE VIEW elo_leaderboard_agg_with_aliases AS
SELECT
    player_name,
    player_name                                   AS all_aliases,
    game_mode,
    season,
    count(*)                                      AS games,
    sum((result = 'Win')::int)                    AS wins,
    round(avg((result = 'Win')::int) * 100, 1)    AS win_rate,
    sum(kills)                                    AS kills,
    sum(deaths)                                   AS deaths,
    max(game_date)                                AS last_active
FROM player_stats
GROUP BY player_name, game_mode, season;

-- ---------------------------------------------------------------------------
-- schema 2 (2026-09-11): Tier-1 payload columns. Same statement as player-stats-schema2.sql
-- (the production migration) so a fresh local reset matches; IF NOT EXISTS keeps it idempotent.
-- ---------------------------------------------------------------------------
ALTER TABLE player_stats
    ADD COLUMN IF NOT EXISTS class_play_times  jsonb,
    ADD COLUMN IF NOT EXISTS weapon_stats      jsonb,
    ADD COLUMN IF NOT EXISTS play_seconds      integer NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS times_summoned    integer NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS summons_performed integer NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS mined_tso         integer NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS mined_tox         integer NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS is_captain        boolean NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS schema_version    integer NOT NULL DEFAULT 1,
    ADD COLUMN IF NOT EXISTS script_version    varchar(64);
