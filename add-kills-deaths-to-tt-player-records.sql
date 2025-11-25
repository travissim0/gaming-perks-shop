-- Migration to add kills and deaths tracking to tt_player_records
-- Run this in your Supabase SQL editor

-- Add kills and deaths columns
ALTER TABLE tt_player_records 
ADD COLUMN IF NOT EXISTS kills INTEGER DEFAULT 0 NOT NULL,
ADD COLUMN IF NOT EXISTS deaths INTEGER DEFAULT 0 NOT NULL;

-- Update the constraint to include new columns
ALTER TABLE tt_player_records 
DROP CONSTRAINT IF EXISTS tt_player_records_positive_stats;

ALTER TABLE tt_player_records 
ADD CONSTRAINT tt_player_records_positive_stats CHECK (
    game_wins >= 0 AND 
    game_losses >= 0 AND 
    series_wins >= 0 AND 
    series_losses >= 0 AND
    kills >= 0 AND
    deaths >= 0
);

-- Create indexes for the new columns
CREATE INDEX IF NOT EXISTS idx_tt_player_records_kills ON tt_player_records(kills DESC);
CREATE INDEX IF NOT EXISTS idx_tt_player_records_kd_ratio ON tt_player_records(
    (CASE WHEN deaths > 0 THEN kills::FLOAT / deaths ELSE kills::FLOAT END) DESC
);

-- Drop existing functions that we're going to recreate with new return types
DROP FUNCTION IF EXISTS get_tt_top_players_by_game_wins(integer);
DROP FUNCTION IF EXISTS get_tt_top_players_by_series_wins(integer);
DROP FUNCTION IF EXISTS get_tt_player_record(uuid);

-- Create function to increment kills for a player
CREATE OR REPLACE FUNCTION increment_tt_player_kills(
    p_player_alias TEXT, 
    p_kills_to_add INTEGER
)
RETURNS VOID AS $$
BEGIN
    UPDATE tt_player_records
    SET kills = kills + p_kills_to_add,
        updated_at = NOW()
    WHERE player_alias = p_player_alias;
END;
$$ LANGUAGE plpgsql;

-- Create function to increment deaths for a player
CREATE OR REPLACE FUNCTION increment_tt_player_deaths(
    p_player_alias TEXT, 
    p_deaths_to_add INTEGER
)
RETURNS VOID AS $$
BEGIN
    UPDATE tt_player_records
    SET deaths = deaths + p_deaths_to_add,
        updated_at = NOW()
    WHERE player_alias = p_player_alias;
END;
$$ LANGUAGE plpgsql;

-- Update the get_tt_top_players_by_game_wins function to include kills/deaths
CREATE OR REPLACE FUNCTION get_tt_top_players_by_game_wins(limit_count INTEGER DEFAULT 10)
RETURNS TABLE (
    player_id UUID,
    player_alias TEXT,
    game_wins INTEGER,
    game_losses INTEGER,
    total_games INTEGER,
    win_rate NUMERIC(5,2),
    series_wins INTEGER,
    series_losses INTEGER,
    kills INTEGER,
    deaths INTEGER,
    kd_ratio NUMERIC(5,2),
    updated_at TIMESTAMPTZ
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        pr.player_id,
        pr.player_alias,
        pr.game_wins,
        pr.game_losses,
        (pr.game_wins + pr.game_losses) as total_games,
        CASE 
            WHEN (pr.game_wins + pr.game_losses) > 0 
            THEN ROUND((pr.game_wins::NUMERIC / (pr.game_wins + pr.game_losses)) * 100, 2)
            ELSE 0
        END as win_rate,
        pr.series_wins,
        pr.series_losses,
        pr.kills,
        pr.deaths,
        CASE 
            WHEN pr.deaths > 0 
            THEN ROUND((pr.kills::NUMERIC / pr.deaths), 2)
            ELSE pr.kills::NUMERIC
        END as kd_ratio,
        pr.updated_at
    FROM tt_player_records pr
    WHERE (pr.game_wins + pr.game_losses) > 0
    ORDER BY pr.game_wins DESC, win_rate DESC
    LIMIT limit_count;
END;
$$ LANGUAGE plpgsql;

-- Update the get_tt_top_players_by_series_wins function to include kills/deaths
CREATE OR REPLACE FUNCTION get_tt_top_players_by_series_wins(limit_count INTEGER DEFAULT 10)
RETURNS TABLE (
    player_id UUID,
    player_alias TEXT,
    series_wins INTEGER,
    series_losses INTEGER,
    total_series INTEGER,
    series_win_rate NUMERIC(5,2),
    game_wins INTEGER,
    game_losses INTEGER,
    kills INTEGER,
    deaths INTEGER,
    kd_ratio NUMERIC(5,2),
    updated_at TIMESTAMPTZ
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        pr.player_id,
        pr.player_alias,
        pr.series_wins,
        pr.series_losses,
        (pr.series_wins + pr.series_losses) as total_series,
        CASE 
            WHEN (pr.series_wins + pr.series_losses) > 0 
            THEN ROUND((pr.series_wins::NUMERIC / (pr.series_wins + pr.series_losses)) * 100, 2)
            ELSE 0
        END as series_win_rate,
        pr.game_wins,
        pr.game_losses,
        pr.kills,
        pr.deaths,
        CASE 
            WHEN pr.deaths > 0 
            THEN ROUND((pr.kills::NUMERIC / pr.deaths), 2)
            ELSE pr.kills::NUMERIC
        END as kd_ratio,
        pr.updated_at
    FROM tt_player_records pr
    WHERE (pr.series_wins + pr.series_losses) > 0
    ORDER BY pr.series_wins DESC, series_win_rate DESC
    LIMIT limit_count;
END;
$$ LANGUAGE plpgsql;

-- Create new function to get top players by K/D ratio
CREATE OR REPLACE FUNCTION get_tt_top_players_by_kd_ratio(
    limit_count INTEGER DEFAULT 10,
    min_games INTEGER DEFAULT 5
)
RETURNS TABLE (
    player_id UUID,
    player_alias TEXT,
    kills INTEGER,
    deaths INTEGER,
    kd_ratio NUMERIC(5,2),
    game_wins INTEGER,
    game_losses INTEGER,
    total_games INTEGER,
    updated_at TIMESTAMPTZ
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        pr.player_id,
        pr.player_alias,
        pr.kills,
        pr.deaths,
        CASE 
            WHEN pr.deaths > 0 
            THEN ROUND((pr.kills::NUMERIC / pr.deaths), 2)
            ELSE pr.kills::NUMERIC
        END as kd_ratio,
        pr.game_wins,
        pr.game_losses,
        (pr.game_wins + pr.game_losses) as total_games,
        pr.updated_at
    FROM tt_player_records pr
    WHERE (pr.game_wins + pr.game_losses) >= min_games
    ORDER BY kd_ratio DESC, pr.kills DESC
    LIMIT limit_count;
END;
$$ LANGUAGE plpgsql;

-- Update the get_tt_player_record function to include kills/deaths
CREATE OR REPLACE FUNCTION get_tt_player_record(p_player_id UUID)
RETURNS TABLE (
    player_id UUID,
    player_alias TEXT,
    game_wins INTEGER,
    game_losses INTEGER,
    total_games INTEGER,
    game_win_rate NUMERIC(5,2),
    series_wins INTEGER,
    series_losses INTEGER,
    total_series INTEGER,
    series_win_rate NUMERIC(5,2),
    kills INTEGER,
    deaths INTEGER,
    kd_ratio NUMERIC(5,2),
    created_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        pr.player_id,
        pr.player_alias,
        pr.game_wins,
        pr.game_losses,
        (pr.game_wins + pr.game_losses) as total_games,
        CASE 
            WHEN (pr.game_wins + pr.game_losses) > 0 
            THEN ROUND((pr.game_wins::NUMERIC / (pr.game_wins + pr.game_losses)) * 100, 2)
            ELSE 0
        END as game_win_rate,
        pr.series_wins,
        pr.series_losses,
        (pr.series_wins + pr.series_losses) as total_series,
        CASE 
            WHEN (pr.series_wins + pr.series_losses) > 0 
            THEN ROUND((pr.series_wins::NUMERIC / (pr.series_wins + pr.series_losses)) * 100, 2)
            ELSE 0
        END as series_win_rate,
        pr.kills,
        pr.deaths,
        CASE 
            WHEN pr.deaths > 0 
            THEN ROUND((pr.kills::NUMERIC / pr.deaths), 2)
            ELSE pr.kills::NUMERIC
        END as kd_ratio,
        pr.created_at,
        pr.updated_at
    FROM tt_player_records pr
    WHERE pr.player_id = p_player_id;
END;
$$ LANGUAGE plpgsql;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION increment_tt_player_kills(TEXT, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION increment_tt_player_deaths(TEXT, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION get_tt_top_players_by_kd_ratio(INTEGER, INTEGER) TO authenticated;

-- Add comments
COMMENT ON COLUMN tt_player_records.kills IS 'Total kills across all games';
COMMENT ON COLUMN tt_player_records.deaths IS 'Total deaths across all games';
COMMENT ON FUNCTION increment_tt_player_kills(TEXT, INTEGER) IS 'Increment kills count for a player by alias';
COMMENT ON FUNCTION increment_tt_player_deaths(TEXT, INTEGER) IS 'Increment deaths count for a player by alias';
COMMENT ON FUNCTION get_tt_top_players_by_kd_ratio(INTEGER, INTEGER) IS 'Get top players by K/D ratio with minimum games filter';

