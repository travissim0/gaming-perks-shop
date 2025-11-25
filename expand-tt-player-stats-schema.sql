-- Expand tt_player_stats for detailed game tracking
-- Run this in your Supabase SQL editor

-- Add new columns for detailed stats
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

