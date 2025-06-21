-- Add free agent opt-out column to profiles table
-- This allows users to opt out of being displayed on the free agents page

-- Add hide_from_free_agents column
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS hide_from_free_agents BOOLEAN DEFAULT false;

-- Add index for better performance
CREATE INDEX IF NOT EXISTS idx_profiles_hide_from_free_agents ON profiles(hide_from_free_agents);

-- Add comment for documentation
COMMENT ON COLUMN profiles.hide_from_free_agents IS 'Whether user should be hidden from free agents page even if they are eligible';

-- Update the free agents queries to respect this setting
-- This will need to be implemented in the application code

-- Success message
SELECT 'Free agent opt-out column added successfully!' as status; 