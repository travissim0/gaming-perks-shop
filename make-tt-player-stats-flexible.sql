-- Make tt_player_stats work without requiring profiles or teams
-- This allows text-based stat tracking for any player

-- Make player_id and team_id nullable (allow NULL values)
ALTER TABLE tt_player_stats 
ALTER COLUMN player_id DROP NOT NULL;

ALTER TABLE tt_player_stats 
ALTER COLUMN team_id DROP NOT NULL;

-- Add a player_alias column if it doesn't exist (for text-based storage)
ALTER TABLE tt_player_stats 
ADD COLUMN IF NOT EXISTS player_alias TEXT;

-- Add a team_name column if it doesn't exist (for text-based storage)
ALTER TABLE tt_player_stats 
ADD COLUMN IF NOT EXISTS team_name TEXT;

-- Add index for text-based queries
CREATE INDEX IF NOT EXISTS idx_tt_player_stats_player_alias ON tt_player_stats(player_alias);
CREATE INDEX IF NOT EXISTS idx_tt_player_stats_team_name ON tt_player_stats(team_name);

-- Add comments
COMMENT ON COLUMN tt_player_stats.player_alias IS 'Player in-game alias (text-based, no profile required)';
COMMENT ON COLUMN tt_player_stats.team_name IS 'Team name (text-based, no team record required)';

-- Now recreate the insert function to use text-based storage
DROP FUNCTION IF EXISTS insert_tt_game_stat(TEXT, TEXT, TEXT, INT, INT, TEXT, TEXT, INT, INT, DECIMAL, TEXT[], INT, INT, TEXT, UUID, UUID);

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
  -- Try to get player_id from profiles based on alias (optional)
  SELECT id INTO v_player_id
  FROM profiles
  WHERE in_game_alias = p_player_alias
  LIMIT 1;
  
  -- Try to get team_id (optional)
  SELECT id INTO v_team_id
  FROM tt_teams
  WHERE team_name = p_team_name
  LIMIT 1;
  
  -- Calculate accuracy if we have shots
  IF p_total_shots > 0 THEN
    v_calculated_accuracy := ROUND((p_total_hits::NUMERIC / p_total_shots::NUMERIC) * 100, 2);
  ELSE
    v_calculated_accuracy := p_accuracy;
  END IF;
  
  -- Insert the game stat (player_id and team_id can be NULL now)
  INSERT INTO tt_player_stats (
    player_id,
    player_alias,
    team_id,
    team_name,
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
    v_player_id,           -- NULL if player not registered
    p_player_alias,        -- Always store alias as text
    v_team_id,             -- NULL if team doesn't exist
    p_team_name,           -- Always store team name as text
    p_match_id,
    p_tournament_id,
    CASE WHEN p_result = 'win' THEN 1 ELSE 0 END,
    CASE WHEN p_result = 'loss' THEN 1 ELSE 0 END,
    0,
    0,
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

-- Update get_player_game_history to work with text aliases
DROP FUNCTION IF EXISTS get_player_game_history(TEXT, INT);

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
  WHERE ps.player_alias = p_player_alias  -- Use text alias directly
    AND ps.stat_type = 'game'
  ORDER BY ps.recorded_at DESC
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql;

-- Update get_series_stats to work with text aliases
DROP FUNCTION IF EXISTS get_series_stats(TEXT);

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
    ps.player_alias,  -- Use text alias directly
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
  WHERE ps.series_id = p_series_id
    AND ps.stat_type = 'game'
  ORDER BY ps.game_number_in_series ASC, ps.recorded_at ASC;
END;
$$ LANGUAGE plpgsql;

-- Update get_player_series_averages to work with text aliases
DROP FUNCTION IF EXISTS get_player_series_averages(TEXT, TEXT);

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
  WHERE ps.player_alias = p_player_alias  -- Use text alias directly
    AND ps.series_id = p_series_id
    AND ps.stat_type = 'game';
END;
$$ LANGUAGE plpgsql;

-- Update get_player_class_stats to work with text aliases
DROP FUNCTION IF EXISTS get_player_class_stats(TEXT);

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
  WHERE ps.player_alias = p_player_alias  -- Use text alias directly
    AND ps.stat_type = 'game'
    AND ps.primary_class IS NOT NULL
  GROUP BY ps.primary_class
  ORDER BY games_played DESC;
END;
$$ LANGUAGE plpgsql;

-- Grant permissions
GRANT EXECUTE ON FUNCTION insert_tt_game_stat(TEXT, TEXT, TEXT, INT, INT, TEXT, TEXT, INT, INT, DECIMAL, TEXT[], INT, INT, TEXT, UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION get_player_game_history(TEXT, INT) TO authenticated;
GRANT EXECUTE ON FUNCTION get_series_stats(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION get_player_series_averages(TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION get_player_class_stats(TEXT) TO authenticated;

SELECT 'tt_player_stats now supports text-based aliases without requiring profiles!' as status;

