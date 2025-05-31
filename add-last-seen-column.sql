-- Add last_seen column to profiles table for online user tracking
-- Run this in Supabase SQL Editor

-- Add the last_seen column to profiles table
ALTER TABLE profiles 
ADD COLUMN IF NOT EXISTS last_seen TIMESTAMP WITH TIME ZONE DEFAULT NOW();

-- Create index for performance on last_seen queries
CREATE INDEX IF NOT EXISTS idx_profiles_last_seen ON profiles(last_seen);

-- Update existing profiles to have current timestamp
UPDATE profiles 
SET last_seen = NOW() 
WHERE last_seen IS NULL;

-- Verify the changes
SELECT column_name, data_type, is_nullable, column_default 
FROM information_schema.columns 
WHERE table_name = 'profiles' 
AND column_name = 'last_seen';

-- Test query to ensure online users functionality works
SELECT id, email, in_game_alias, last_seen 
FROM profiles 
WHERE last_seen > NOW() - INTERVAL '5 minutes'
ORDER BY last_seen DESC 
LIMIT 5; 