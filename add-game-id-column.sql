-- Migration to add game_id column to existing player_stats table
-- Run this on your Supabase database

-- Add the game_id column
ALTER TABLE player_stats ADD COLUMN IF NOT EXISTS game_id VARCHAR(255);

-- Add index for better query performance
CREATE INDEX IF NOT EXISTS idx_player_stats_game_id ON player_stats(game_id);

-- Verify the changes
SELECT column_name, data_type, is_nullable 
FROM information_schema.columns 
WHERE table_name = 'player_stats' 
AND column_name = 'game_id'; 