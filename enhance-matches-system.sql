-- Enhanced Matches System Migration - Essential Changes Only
-- This script adds the minimal required columns for the enhanced matches system

-- Add only the essential missing column to matches table
ALTER TABLE matches ADD COLUMN IF NOT EXISTS game_id VARCHAR(255);
ALTER TABLE matches ADD COLUMN IF NOT EXISTS actual_start_time TIMESTAMP WITH TIME ZONE;
ALTER TABLE matches ADD COLUMN IF NOT EXISTS actual_end_time TIMESTAMP WITH TIME ZONE;
ALTER TABLE matches ADD COLUMN IF NOT EXISTS match_notes TEXT;

-- Add index for game_id to quickly find matches by game stats
CREATE INDEX IF NOT EXISTS idx_matches_game_id ON matches(game_id);

-- Create a simple function to automatically set match status based on current time
CREATE OR REPLACE FUNCTION update_match_status()
RETURNS void AS $$
BEGIN
  -- Mark expired scheduled matches as 'expired'
  UPDATE matches 
  SET status = 'expired'
  WHERE status = 'scheduled' 
    AND scheduled_at < NOW() - INTERVAL '2 hours'
    AND game_id IS NULL;
    
  -- Mark matches with game_id as 'completed' if they don't have status set
  UPDATE matches 
  SET status = 'completed'
  WHERE game_id IS NOT NULL 
    AND status = 'scheduled';
END;
$$ LANGUAGE plpgsql;

-- Add RLS policies for the new columns
CREATE POLICY "Match results are viewable by everyone" ON matches
    FOR SELECT USING (true);

-- Allow match creators and admins to update match results
CREATE POLICY "Match creators and admins can update results" ON matches
    FOR UPDATE USING (
        auth.uid() = created_by 
        OR auth.uid() IN (SELECT id FROM profiles WHERE is_admin = true)
    );

COMMENT ON COLUMN matches.game_id IS 'Links to player_stats.game_id for actual game data';
COMMENT ON COLUMN matches.actual_start_time IS 'When the match actually started';
COMMENT ON COLUMN matches.actual_end_time IS 'When the match actually ended';
COMMENT ON COLUMN matches.match_notes IS 'Notes about the match (rules changes, incidents, etc.)'; 