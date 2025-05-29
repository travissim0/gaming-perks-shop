-- Fix RLS policy for match_participants to allow users to delete their own participation
-- Run this in Supabase SQL Editor

-- Add a policy to allow users to delete their own match participation
CREATE POLICY "Users can delete their own participation" ON match_participants 
FOR DELETE USING (auth.uid() = player_id);

-- Optional: Also ensure users can delete their own participation via update (setting status to 'declined')
-- This is already covered by the existing update policy, but we're adding explicit delete capability 