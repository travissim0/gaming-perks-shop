-- Update free_agents table schema to support enhanced form data
-- This adds columns for the new features we've implemented

-- Add new columns to free_agents table
ALTER TABLE free_agents 
ADD COLUMN IF NOT EXISTS secondary_roles text[] DEFAULT '{}',
ADD COLUMN IF NOT EXISTS availability_days text[] DEFAULT '{}',
ADD COLUMN IF NOT EXISTS availability_times jsonb DEFAULT '{}',
ADD COLUMN IF NOT EXISTS class_ratings jsonb DEFAULT '{}',
ADD COLUMN IF NOT EXISTS classes_to_try text[] DEFAULT '{}',
ADD COLUMN IF NOT EXISTS timezone varchar(100) DEFAULT 'America/New_York';

-- Update the availability column to be more flexible (keep existing for backward compatibility)
-- The new system will use availability_days, availability_times, and timezone

-- Add helpful comments
COMMENT ON COLUMN free_agents.secondary_roles IS 'Array of secondary class roles the player can fill';
COMMENT ON COLUMN free_agents.availability_days IS 'Array of days player is available (Monday, Tuesday, etc.)';
COMMENT ON COLUMN free_agents.availability_times IS 'JSON object with day-specific time ranges {day: {start: "18:00", end: "22:00"}}';
COMMENT ON COLUMN free_agents.class_ratings IS 'JSON object with class ratings {class: rating} where rating is 1-5';
COMMENT ON COLUMN free_agents.classes_to_try IS 'Array of classes the player wants to learn this season';
COMMENT ON COLUMN free_agents.timezone IS 'Player timezone for availability display';

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_free_agents_secondary_roles ON free_agents USING GIN (secondary_roles);
CREATE INDEX IF NOT EXISTS idx_free_agents_availability_days ON free_agents USING GIN (availability_days);
CREATE INDEX IF NOT EXISTS idx_free_agents_classes_to_try ON free_agents USING GIN (classes_to_try);

-- Update RLS policies to include new columns (if RLS is enabled)
-- This ensures the new columns are accessible with existing policies

-- Example policy update (adjust based on your existing policies)
-- DROP POLICY IF EXISTS "Users can view all free agents" ON free_agents;
-- CREATE POLICY "Users can view all free agents" ON free_agents
--   FOR SELECT USING (true);

-- DROP POLICY IF EXISTS "Users can insert their own free agent record" ON free_agents;
-- CREATE POLICY "Users can insert their own free agent record" ON free_agents
--   FOR INSERT WITH CHECK (auth.uid() = player_id);

-- DROP POLICY IF EXISTS "Users can update their own free agent record" ON free_agents;
-- CREATE POLICY "Users can update their own free agent record" ON free_agents
--   FOR UPDATE USING (auth.uid() = player_id);

-- DROP POLICY IF EXISTS "Users can delete their own free agent record" ON free_agents;
-- CREATE POLICY "Users can delete their own free agent record" ON free_agents
--   FOR DELETE USING (auth.uid() = player_id);

-- Verify the schema changes
SELECT column_name, data_type, is_nullable, column_default 
FROM information_schema.columns 
WHERE table_name = 'free_agents' 
ORDER BY ordinal_position; 