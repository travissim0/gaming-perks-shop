-- =====================================================
-- COMPLETE TRIPLE THREAT ENHANCED STATS MIGRATION
-- Run this entire file in your Supabase SQL Editor
-- =====================================================

-- =====================================================
-- PART 1: Expand tt_player_stats Schema
-- =====================================================

-- Add new columns for detailed per-game tracking
ALTER TABLE tt_player_stats 
ADD COLUMN IF NOT EXISTS primary_class TEXT,
ADD COLUMN IF NOT EXISTS total_hits INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS total_shots INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS accuracy DECIMAL(5,2),
ADD COLUMN IF NOT EXISTS teammates TEXT[],
ADD COLUMN IF NOT EXISTS game_duration_seconds INTEGER,
ADD COLUMN IF NOT EXISTS result TEXT CHECK (result IN ('win', 'loss')),
ADD COLUMN IF NOT EXISTS game_number_in_series INTEGER DEFAULT 1,
ADD COLUMN IF NOT EXISTS series_id TEXT,
ADD COLUMN IF NOT EXISTS opponent_team TEXT;

-- Drop and recreate the stat_type constraint to include 'game'
ALTER TABLE tt_player_stats 
DROP CONSTRAINT IF EXISTS tt_player_stats_stat_type_check;

ALTER TABLE tt_player_stats
ADD CONSTRAINT tt_player_stats_stat_type_check 
CHECK (stat_type = ANY (ARRAY['match'::text, 'tournament'::text, 'season'::text, 'game'::text]));

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_tt_player_stats_series_id ON tt_player_stats(series_id);
CREATE INDEX IF NOT EXISTS idx_tt_player_stats_primary_class ON tt_player_stats(primary_class);
CREATE INDEX IF NOT EXISTS idx_tt_player_stats_result ON tt_player_stats(result);
CREATE INDEX IF NOT EXISTS idx_tt_player_stats_accuracy ON tt_player_stats(accuracy DESC) WHERE accuracy IS NOT NULL;

-- Add comments
COMMENT ON COLUMN tt_player_stats.primary_class IS 'Main vehicle/class used during the game';
COMMENT ON COLUMN tt_player_stats.total_hits IS 'Total shots that hit target';
COMMENT ON COLUMN tt_player_stats.total_shots IS 'Total shots fired';
COMMENT ON COLUMN tt_player_stats.accuracy IS 'Calculated accuracy percentage';
COMMENT ON COLUMN tt_player_stats.teammates IS 'Array of teammate aliases in this game';
COMMENT ON COLUMN tt_player_stats.game_duration_seconds IS 'How long the game lasted in seconds';
COMMENT ON COLUMN tt_player_stats.result IS 'Win or loss for this player';
COMMENT ON COLUMN tt_player_stats.game_number_in_series IS 'Which game in the series (1, 2, 3, etc.)';
COMMENT ON COLUMN tt_player_stats.series_id IS 'Unique identifier to group games in same series';
COMMENT ON COLUMN tt_player_stats.opponent_team IS 'Name of opposing team';

-- =====================================================
-- PART 2: RPC Functions
-- =====================================================

-- Drop existing functions if they exist (to allow updates)
DROP FUNCTION IF EXISTS insert_tt_game_stat(TEXT, TEXT, TEXT, INT, INT, TEXT, TEXT, INT, INT, DECIMAL, TEXT[], INT, INT, TEXT, UUID, UUID);
DROP FUNCTION IF EXISTS get_player_game_history(TEXT, INT);
DROP FUNCTION IF EXISTS get_series_stats(TEXT);
DROP FUNCTION IF EXISTS get_player_series_averages(TEXT, TEXT);
DROP FUNCTION IF EXISTS get_player_class_stats(TEXT);

-- Function to insert detailed game stats into tt_player_stats
CREATE OR REPLACE FUNCTION insert_tt_game_stat(
  p_player_alias TEXT,
  p_team_name TEXT,
  p_opponent_team TEXT,
  p_kills INT,
  p_deaths INT,
  p_result TEXT,
  p_primary_class TEXT DEFAULT NULL,
  p_total_hits INT DEFAULT 0,
  p_total_shots INT DEFAULT 0,
  p_accuracy DECIMAL DEFAULT NULL,
  p_teammates TEXT[] DEFAULT NULL,
  p_game_duration INT DEFAULT NULL,
  p_game_number INT DEFAULT 1,
  p_series_id TEXT DEFAULT NULL,
  p_match_id UUID DEFAULT NULL,
  p_tournament_id UUID DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
  v_player_id UUID;
  v_team_id UUID;
  v_stat_id UUID;
  v_calculated_accuracy DECIMAL(5,2);
BEGIN
  -- Try to get player_id from profiles based on alias
  SELECT id INTO v_player_id
  FROM profiles
  WHERE in_game_alias = p_player_alias
  LIMIT 1;
  
  -- If no player found, use a default UUID (or create player)
  IF v_player_id IS NULL THEN
    v_player_id := '00000000-0000-0000-0000-000000000000'::UUID;
  END IF;
  
  -- Try to get or create team_id
  SELECT id INTO v_team_id
  FROM tt_teams
  WHERE team_name = p_team_name
  LIMIT 1;
  
  -- If no team found, create a temporary team or use default
  IF v_team_id IS NULL THEN
    v_team_id := '00000000-0000-0000-0000-000000000000'::UUID;
  END IF;
  
  -- Calculate accuracy if we have shots
  IF p_total_shots > 0 THEN
    v_calculated_accuracy := ROUND((p_total_hits::NUMERIC / p_total_shots::NUMERIC) * 100, 2);
  ELSE
    v_calculated_accuracy := p_accuracy;
  END IF;
  
  -- Insert the game stat
  INSERT INTO tt_player_stats (
    player_id,
    team_id,
    match_id,
    tournament_id,
    round_wins,
    round_losses,
    series_wins,
    series_losses,
    kills,
    deaths,
    primary_class,
    total_hits,
    total_shots,
    accuracy,
    teammates,
    game_duration_seconds,
    result,
    game_number_in_series,
    series_id,
    opponent_team,
    stat_type,
    recorded_at
  ) VALUES (
    v_player_id,
    v_team_id,
    p_match_id,
    p_tournament_id,
    CASE WHEN p_result = 'win' THEN 1 ELSE 0 END,
    CASE WHEN p_result = 'loss' THEN 1 ELSE 0 END,
    0, -- series wins tracked separately
    0, -- series losses tracked separately
    p_kills,
    p_deaths,
    p_primary_class,
    p_total_hits,
    p_total_shots,
    v_calculated_accuracy,
    p_teammates,
    p_game_duration,
    p_result,
    p_game_number,
    p_series_id,
    p_opponent_team,
    'game',
    NOW()
  )
  RETURNING id INTO v_stat_id;
  
  RETURN v_stat_id;
END;
$$ LANGUAGE plpgsql;

-- Function to get game history for a player
CREATE OR REPLACE FUNCTION get_player_game_history(
  p_player_alias TEXT,
  p_limit INT DEFAULT 20
)
RETURNS TABLE (
  id UUID,
  recorded_at TIMESTAMPTZ,
  result TEXT,
  kills INT,
  deaths INT,
  kd_ratio DECIMAL(5,2),
  primary_class TEXT,
  accuracy DECIMAL(5,2),
  total_hits INT,
  total_shots INT,
  teammates TEXT[],
  opponent_team TEXT,
  game_duration_seconds INT,
  series_id TEXT,
  game_number_in_series INT
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    ps.id,
    ps.recorded_at,
    ps.result,
    ps.kills,
    ps.deaths,
    CASE 
      WHEN ps.deaths > 0 THEN ROUND((ps.kills::NUMERIC / ps.deaths::NUMERIC), 2)
      ELSE ps.kills::NUMERIC
    END as kd_ratio,
    ps.primary_class,
    ps.accuracy,
    ps.total_hits,
    ps.total_shots,
    ps.teammates,
    ps.opponent_team,
    ps.game_duration_seconds,
    ps.series_id,
    ps.game_number_in_series
  FROM tt_player_stats ps
  JOIN profiles p ON ps.player_id = p.id
  WHERE p.in_game_alias = p_player_alias
    AND ps.stat_type = 'game'
  ORDER BY ps.recorded_at DESC
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql;

-- Function to get series analysis
CREATE OR REPLACE FUNCTION get_series_stats(
  p_series_id TEXT
)
RETURNS TABLE (
  game_number INT,
  player_alias TEXT,
  result TEXT,
  kills INT,
  deaths INT,
  kd_ratio DECIMAL(5,2),
  accuracy DECIMAL(5,2),
  primary_class TEXT,
  recorded_at TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    ps.game_number_in_series,
    p.in_game_alias,
    ps.result,
    ps.kills,
    ps.deaths,
    CASE 
      WHEN ps.deaths > 0 THEN ROUND((ps.kills::NUMERIC / ps.deaths::NUMERIC), 2)
      ELSE ps.kills::NUMERIC
    END as kd_ratio,
    ps.accuracy,
    ps.primary_class,
    ps.recorded_at
  FROM tt_player_stats ps
  JOIN profiles p ON ps.player_id = p.id
  WHERE ps.series_id = p_series_id
    AND ps.stat_type = 'game'
  ORDER BY ps.game_number_in_series ASC, ps.recorded_at ASC;
END;
$$ LANGUAGE plpgsql;

-- Function to get series averages for a player
CREATE OR REPLACE FUNCTION get_player_series_averages(
  p_player_alias TEXT,
  p_series_id TEXT
)
RETURNS TABLE (
  total_games INT,
  wins INT,
  losses INT,
  avg_kills DECIMAL(5,2),
  avg_deaths DECIMAL(5,2),
  avg_kd_ratio DECIMAL(5,2),
  avg_accuracy DECIMAL(5,2),
  most_used_class TEXT
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    COUNT(*)::INT as total_games,
    SUM(CASE WHEN ps.result = 'win' THEN 1 ELSE 0 END)::INT as wins,
    SUM(CASE WHEN ps.result = 'loss' THEN 1 ELSE 0 END)::INT as losses,
    ROUND(AVG(ps.kills), 2) as avg_kills,
    ROUND(AVG(ps.deaths), 2) as avg_deaths,
    ROUND(AVG(CASE WHEN ps.deaths > 0 THEN ps.kills::NUMERIC / ps.deaths::NUMERIC ELSE ps.kills::NUMERIC END), 2) as avg_kd_ratio,
    ROUND(AVG(ps.accuracy), 2) as avg_accuracy,
    MODE() WITHIN GROUP (ORDER BY ps.primary_class) as most_used_class
  FROM tt_player_stats ps
  JOIN profiles p ON ps.player_id = p.id
  WHERE p.in_game_alias = p_player_alias
    AND ps.series_id = p_series_id
    AND ps.stat_type = 'game';
END;
$$ LANGUAGE plpgsql;

-- Function to get class statistics for a player
CREATE OR REPLACE FUNCTION get_player_class_stats(
  p_player_alias TEXT
)
RETURNS TABLE (
  primary_class TEXT,
  games_played INT,
  wins INT,
  losses INT,
  win_rate DECIMAL(5,2),
  avg_kills DECIMAL(5,2),
  avg_deaths DECIMAL(5,2),
  avg_kd_ratio DECIMAL(5,2),
  avg_accuracy DECIMAL(5,2)
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    ps.primary_class,
    COUNT(*)::INT as games_played,
    SUM(CASE WHEN ps.result = 'win' THEN 1 ELSE 0 END)::INT as wins,
    SUM(CASE WHEN ps.result = 'loss' THEN 1 ELSE 0 END)::INT as losses,
    CASE 
      WHEN COUNT(*) > 0 THEN ROUND((SUM(CASE WHEN ps.result = 'win' THEN 1 ELSE 0 END)::NUMERIC / COUNT(*)::NUMERIC) * 100, 2)
      ELSE 0
    END as win_rate,
    ROUND(AVG(ps.kills), 2) as avg_kills,
    ROUND(AVG(ps.deaths), 2) as avg_deaths,
    ROUND(AVG(CASE WHEN ps.deaths > 0 THEN ps.kills::NUMERIC / ps.deaths::NUMERIC ELSE ps.kills::NUMERIC END), 2) as avg_kd_ratio,
    ROUND(AVG(ps.accuracy), 2) as avg_accuracy
  FROM tt_player_stats ps
  JOIN profiles p ON ps.player_id = p.id
  WHERE p.in_game_alias = p_player_alias
    AND ps.stat_type = 'game'
    AND ps.primary_class IS NOT NULL
  GROUP BY ps.primary_class
  ORDER BY games_played DESC;
END;
$$ LANGUAGE plpgsql;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION insert_tt_game_stat(TEXT, TEXT, TEXT, INT, INT, TEXT, TEXT, INT, INT, DECIMAL, TEXT[], INT, INT, TEXT, UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION get_player_game_history(TEXT, INT) TO authenticated;
GRANT EXECUTE ON FUNCTION get_series_stats(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION get_player_series_averages(TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION get_player_class_stats(TEXT) TO authenticated;

-- Add comments
COMMENT ON FUNCTION insert_tt_game_stat IS 'Insert detailed game stats for a player including class, accuracy, teammates';
COMMENT ON FUNCTION get_player_game_history IS 'Get recent game history for a player with detailed stats';
COMMENT ON FUNCTION get_series_stats IS 'Get all games in a series with player performance';
COMMENT ON FUNCTION get_player_series_averages IS 'Calculate averages for a player in a specific series';
COMMENT ON FUNCTION get_player_class_stats IS 'Get performance statistics grouped by class for a player';

-- =====================================================
-- Migration Complete!
-- =====================================================

SELECT 'Triple Threat Enhanced Stats migration completed successfully!' as status;

