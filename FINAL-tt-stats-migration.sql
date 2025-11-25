-- =====================================================
-- FINAL TRIPLE THREAT STATS MIGRATION
-- Run this ONE file in your Supabase SQL Editor
-- No profile registration required!
-- =====================================================

-- Step 1: Fix stat_type constraint to allow 'game'
ALTER TABLE tt_player_stats DROP CONSTRAINT IF EXISTS tt_player_stats_stat_type_check;
ALTER TABLE tt_player_stats ADD CONSTRAINT tt_player_stats_stat_type_check 
CHECK (stat_type = ANY (ARRAY['match'::text, 'tournament'::text, 'season'::text, 'game'::text]));

-- Step 2: Make player_id and team_id nullable (allow stats without profiles)
ALTER TABLE tt_player_stats ALTER COLUMN player_id DROP NOT NULL;
ALTER TABLE tt_player_stats ALTER COLUMN team_id DROP NOT NULL;

-- Step 3: Add text-based columns for aliases
ALTER TABLE tt_player_stats ADD COLUMN IF NOT EXISTS player_alias TEXT;
ALTER TABLE tt_player_stats ADD COLUMN IF NOT EXISTS team_name TEXT;
ALTER TABLE tt_player_stats ADD COLUMN IF NOT EXISTS primary_class TEXT;
ALTER TABLE tt_player_stats ADD COLUMN IF NOT EXISTS total_hits INTEGER DEFAULT 0;
ALTER TABLE tt_player_stats ADD COLUMN IF NOT EXISTS total_shots INTEGER DEFAULT 0;
ALTER TABLE tt_player_stats ADD COLUMN IF NOT EXISTS accuracy DECIMAL(5,2);
ALTER TABLE tt_player_stats ADD COLUMN IF NOT EXISTS teammates TEXT[];
ALTER TABLE tt_player_stats ADD COLUMN IF NOT EXISTS game_duration_seconds INTEGER;
ALTER TABLE tt_player_stats ADD COLUMN IF NOT EXISTS result TEXT CHECK (result IN ('win', 'loss'));
ALTER TABLE tt_player_stats ADD COLUMN IF NOT EXISTS game_number_in_series INTEGER DEFAULT 1;
ALTER TABLE tt_player_stats ADD COLUMN IF NOT EXISTS series_id TEXT;
ALTER TABLE tt_player_stats ADD COLUMN IF NOT EXISTS opponent_team TEXT;

-- Step 4: Create indexes
CREATE INDEX IF NOT EXISTS idx_tt_player_stats_player_alias ON tt_player_stats(player_alias);
CREATE INDEX IF NOT EXISTS idx_tt_player_stats_team_name ON tt_player_stats(team_name);
CREATE INDEX IF NOT EXISTS idx_tt_player_stats_series_id ON tt_player_stats(series_id);
CREATE INDEX IF NOT EXISTS idx_tt_player_stats_primary_class ON tt_player_stats(primary_class);
CREATE INDEX IF NOT EXISTS idx_tt_player_stats_result ON tt_player_stats(result);

-- Step 5: Drop old functions
DROP FUNCTION IF EXISTS insert_tt_game_stat(TEXT, TEXT, TEXT, INT, INT, TEXT, TEXT, INT, INT, DECIMAL, TEXT[], INT, INT, TEXT, UUID, UUID);
DROP FUNCTION IF EXISTS get_player_game_history(TEXT, INT);
DROP FUNCTION IF EXISTS get_series_stats(TEXT);
DROP FUNCTION IF EXISTS get_player_series_averages(TEXT, TEXT);
DROP FUNCTION IF EXISTS get_player_class_stats(TEXT);

-- Step 6: Create insert function (works without profiles!)
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
  -- Try to link to profile if it exists
  SELECT id INTO v_player_id FROM profiles WHERE in_game_alias = p_player_alias LIMIT 1;
  
  -- Try to link to team if it exists
  SELECT id INTO v_team_id FROM tt_teams WHERE team_name = p_team_name LIMIT 1;
  
  -- Calculate accuracy
  IF p_total_shots > 0 THEN
    v_calculated_accuracy := ROUND((p_total_hits::NUMERIC / p_total_shots::NUMERIC) * 100, 2);
  ELSE
    v_calculated_accuracy := p_accuracy;
  END IF;
  
  -- Insert (player_id and team_id can be NULL)
  INSERT INTO tt_player_stats (
    player_id, player_alias, team_id, team_name, match_id, tournament_id,
    round_wins, round_losses, series_wins, series_losses,
    kills, deaths, primary_class, total_hits, total_shots, accuracy,
    teammates, game_duration_seconds, result, game_number_in_series,
    series_id, opponent_team, stat_type, recorded_at
  ) VALUES (
    v_player_id, p_player_alias, v_team_id, p_team_name, p_match_id, p_tournament_id,
    CASE WHEN p_result = 'win' THEN 1 ELSE 0 END,
    CASE WHEN p_result = 'loss' THEN 1 ELSE 0 END,
    0, 0, p_kills, p_deaths, p_primary_class, p_total_hits, p_total_shots,
    v_calculated_accuracy, p_teammates, p_game_duration, p_result, p_game_number,
    p_series_id, p_opponent_team, 'game', NOW()
  ) RETURNING id INTO v_stat_id;
  
  RETURN v_stat_id;
END;
$$ LANGUAGE plpgsql;

-- Step 7: Create query functions (use text aliases)
CREATE OR REPLACE FUNCTION get_player_game_history(p_player_alias TEXT, p_limit INT DEFAULT 20)
RETURNS TABLE (
  id UUID, recorded_at TIMESTAMPTZ, result TEXT, kills INT, deaths INT,
  kd_ratio DECIMAL(5,2), primary_class TEXT, accuracy DECIMAL(5,2),
  total_hits INT, total_shots INT, teammates TEXT[], opponent_team TEXT,
  game_duration_seconds INT, series_id TEXT, game_number_in_series INT
) AS $$
BEGIN
  RETURN QUERY
  SELECT ps.id, ps.recorded_at, ps.result, ps.kills, ps.deaths,
    CASE WHEN ps.deaths > 0 THEN ROUND((ps.kills::NUMERIC / ps.deaths::NUMERIC), 2) ELSE ps.kills::NUMERIC END,
    ps.primary_class, ps.accuracy, ps.total_hits, ps.total_shots, ps.teammates,
    ps.opponent_team, ps.game_duration_seconds, ps.series_id, ps.game_number_in_series
  FROM tt_player_stats ps
  WHERE ps.player_alias = p_player_alias AND ps.stat_type = 'game'
  ORDER BY ps.recorded_at DESC LIMIT p_limit;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION get_series_stats(p_series_id TEXT)
RETURNS TABLE (
  game_number INT, player_alias TEXT, result TEXT, kills INT, deaths INT,
  kd_ratio DECIMAL(5,2), accuracy DECIMAL(5,2), primary_class TEXT, recorded_at TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  SELECT ps.game_number_in_series, ps.player_alias, ps.result, ps.kills, ps.deaths,
    CASE WHEN ps.deaths > 0 THEN ROUND((ps.kills::NUMERIC / ps.deaths::NUMERIC), 2) ELSE ps.kills::NUMERIC END,
    ps.accuracy, ps.primary_class, ps.recorded_at
  FROM tt_player_stats ps
  WHERE ps.series_id = p_series_id AND ps.stat_type = 'game'
  ORDER BY ps.game_number_in_series ASC, ps.recorded_at ASC;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION get_player_series_averages(p_player_alias TEXT, p_series_id TEXT)
RETURNS TABLE (
  total_games INT, wins INT, losses INT, avg_kills DECIMAL(5,2), avg_deaths DECIMAL(5,2),
  avg_kd_ratio DECIMAL(5,2), avg_accuracy DECIMAL(5,2), most_used_class TEXT
) AS $$
BEGIN
  RETURN QUERY
  SELECT COUNT(*)::INT, 
    SUM(CASE WHEN ps.result = 'win' THEN 1 ELSE 0 END)::INT,
    SUM(CASE WHEN ps.result = 'loss' THEN 1 ELSE 0 END)::INT,
    ROUND(AVG(ps.kills), 2), ROUND(AVG(ps.deaths), 2),
    ROUND(AVG(CASE WHEN ps.deaths > 0 THEN ps.kills::NUMERIC / ps.deaths::NUMERIC ELSE ps.kills::NUMERIC END), 2),
    ROUND(AVG(ps.accuracy), 2),
    MODE() WITHIN GROUP (ORDER BY ps.primary_class)
  FROM tt_player_stats ps
  WHERE ps.player_alias = p_player_alias AND ps.series_id = p_series_id AND ps.stat_type = 'game';
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION get_player_class_stats(p_player_alias TEXT)
RETURNS TABLE (
  primary_class TEXT, games_played INT, wins INT, losses INT, win_rate DECIMAL(5,2),
  avg_kills DECIMAL(5,2), avg_deaths DECIMAL(5,2), avg_kd_ratio DECIMAL(5,2), avg_accuracy DECIMAL(5,2)
) AS $$
BEGIN
  RETURN QUERY
  SELECT ps.primary_class, COUNT(*)::INT,
    SUM(CASE WHEN ps.result = 'win' THEN 1 ELSE 0 END)::INT,
    SUM(CASE WHEN ps.result = 'loss' THEN 1 ELSE 0 END)::INT,
    CASE WHEN COUNT(*) > 0 THEN ROUND((SUM(CASE WHEN ps.result = 'win' THEN 1 ELSE 0 END)::NUMERIC / COUNT(*)::NUMERIC) * 100, 2) ELSE 0 END,
    ROUND(AVG(ps.kills), 2), ROUND(AVG(ps.deaths), 2),
    ROUND(AVG(CASE WHEN ps.deaths > 0 THEN ps.kills::NUMERIC / ps.deaths::NUMERIC ELSE ps.kills::NUMERIC END), 2),
    ROUND(AVG(ps.accuracy), 2)
  FROM tt_player_stats ps
  WHERE ps.player_alias = p_player_alias AND ps.stat_type = 'game' AND ps.primary_class IS NOT NULL
  GROUP BY ps.primary_class ORDER BY games_played DESC;
END;
$$ LANGUAGE plpgsql;

-- Step 8: Grant permissions
GRANT EXECUTE ON FUNCTION insert_tt_game_stat(TEXT, TEXT, TEXT, INT, INT, TEXT, TEXT, INT, INT, DECIMAL, TEXT[], INT, INT, TEXT, UUID, UUID) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION get_player_game_history(TEXT, INT) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION get_series_stats(TEXT) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION get_player_series_averages(TEXT, TEXT) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION get_player_class_stats(TEXT) TO authenticated, anon;

-- =====================================================
-- DONE! Stats now work for ALL players!
-- No profile registration required.
-- =====================================================
SELECT '✅ Triple Threat stats now work for all players (no registration required)!' as status;

