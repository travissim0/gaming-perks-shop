-- ============================================================================
-- CTF Community Ratings (head-to-head player voting)
--
-- Additive only: creates ONE read-only view over the existing player_stats
-- table plus TWO new tables. Nothing existing is altered.
--
-- Names are grouped case-insensitively because player_stats holds 40 sets of
-- case variants for the same person ("Unorthodox"/"UnorthodoX",
-- "metal"/"METAL"/"Metal", "the mountain" in four casings). Grouping on the
-- raw name would rank the same human several times over.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 0. Games whose outcome was actually recorded.
--
-- 100 of the 954 games on file (10%) have every single player marked 'Loss' -
-- the winner was never captured. It is heavily concentrated in Mix: 98 of 279
-- Mix games (35%) versus 2 of 656 OvD, all between May and Sept 2025.
--
-- Counting those as losses is what made win rate - and anything derived from it -
-- read wrong, and it punished whoever played the most Mix. Win rate below is
-- therefore taken only over games that recorded a winner. Effect on the regulars
-- is +4 to +6 points, and unevenly: ViN +6, Dinobot +4.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW ctf_decided_games AS
SELECT game_id
FROM player_stats
WHERE game_id IS NOT NULL
GROUP BY game_id
HAVING COUNT(*) FILTER (WHERE result = 'Win') > 0;

-- ---------------------------------------------------------------------------
-- 1. Aggregated player card, straight off the games already recorded.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW ctf_player_card_stats AS
SELECT
    lower(ps.player_name)                                     AS player_key,
    -- most frequently used spelling becomes the display name
    mode() WITHIN GROUP (ORDER BY ps.player_name)             AS player_name,
    COUNT(DISTINCT ps.game_id)                                AS games,
    SUM(ps.kills)                                             AS kills,
    SUM(ps.deaths)                                            AS deaths,
    ROUND(SUM(ps.kills)::numeric / GREATEST(SUM(ps.deaths), 1), 2)  AS kd,

    -- decided games only; NULL rather than a fake 0 when none are decided
    COUNT(*) FILTER (WHERE d.game_id IS NOT NULL)             AS decided_games,
    CASE WHEN COUNT(*) FILTER (WHERE d.game_id IS NOT NULL) > 0
         THEN ROUND(100.0 * COUNT(*) FILTER (WHERE d.game_id IS NOT NULL AND ps.result = 'Win')
                    / COUNT(*) FILTER (WHERE d.game_id IS NOT NULL))::int
    END                                                       AS win_rate,

    -- CTF-specific flag play (the part USL has no equivalent for)
    SUM(ps.captures)                                          AS captures,
    SUM(ps.carrier_kills)                                     AS carrier_kills,
    SUM(ps.carry_time_seconds)                                AS carry_time_seconds,

    -- supporting / macro signals
    ROUND(AVG(NULLIF(ps.accuracy, 0))::numeric, 3)            AS accuracy,
    ROUND(AVG(ps.avg_explosive_unused_per_death)::numeric, 2) AS explosives_left_per_death,
    ROUND(AVG(ps.avg_resource_unused_per_death)::numeric, 2)  AS resources_left_per_death,
    SUM(ps.turret_damage)                                     AS turret_damage,
    SUM(ps.eb_hits)                                           AS eb_hits,

    mode() WITHIN GROUP (ORDER BY ps.main_class)              AS main_class,
    MAX(ps.game_date)                                         AS last_played
FROM player_stats ps
LEFT JOIN ctf_decided_games d ON d.game_id = ps.game_id
WHERE ps.player_name IS NOT NULL
  AND btrim(ps.player_name) <> ''
  AND ps.game_id IS NOT NULL
GROUP BY lower(ps.player_name);

-- NOTE: the elo_before / elo_after / elo_change columns on player_stats are
-- deliberately NOT read here. Community Ratings is vote-driven and starts every
-- player level at 1500, so last season's ELO cannot leak into it.

-- ---------------------------------------------------------------------------
-- 2. One rating row per player. Written by the API with the service role.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ctf_player_ratings (
    player_key   text PRIMARY KEY,
    rating       numeric(8,2) NOT NULL DEFAULT 1500,
    wins         integer      NOT NULL DEFAULT 0,
    losses       integer      NOT NULL DEFAULT 0,
    updated_at   timestamptz  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ctf_player_ratings_rating
    ON ctf_player_ratings (rating DESC);

-- ---------------------------------------------------------------------------
-- 3. Every vote cast, for the daily cap, agreement % and future recompute.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ctf_rating_votes (
    id                    bigserial PRIMARY KEY,
    voter_id              uuid         NOT NULL,
    winner_key            text         NOT NULL,
    loser_key             text         NOT NULL,
    winner_rating_before  numeric(8,2) NOT NULL,
    loser_rating_before   numeric(8,2) NOT NULL,
    -- did the voter side with whoever was already rated higher
    agreed                boolean      NOT NULL,
    created_at            timestamptz  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ctf_rating_votes_voter
    ON ctf_rating_votes (voter_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ctf_rating_votes_created
    ON ctf_rating_votes (created_at DESC);

-- ---------------------------------------------------------------------------
-- 4. RLS: public read, writes only through the service role (which bypasses
--    RLS). Deliberately flat USING (true) conditions - no cross-table joins,
--    so there is nothing here that can recurse.
-- ---------------------------------------------------------------------------
ALTER TABLE ctf_player_ratings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "ctf_player_ratings_public_read" ON ctf_player_ratings;
CREATE POLICY "ctf_player_ratings_public_read" ON ctf_player_ratings
    FOR SELECT USING (true);

ALTER TABLE ctf_rating_votes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "ctf_rating_votes_public_read" ON ctf_rating_votes;
CREATE POLICY "ctf_rating_votes_public_read" ON ctf_rating_votes
    FOR SELECT USING (true);
