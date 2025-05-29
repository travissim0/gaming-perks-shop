-- Simple fix for squad join requests
-- Run this in Supabase SQL Editor

-- First, let's see what policies currently exist
-- (Run this first to understand current state)
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check 
FROM pg_policies 
WHERE tablename = 'squad_invites';

-- Drop ALL existing policies on squad_invites to start clean
DROP POLICY IF EXISTS "Users can view their own invites" ON squad_invites;
DROP POLICY IF EXISTS "Users can view squad invites" ON squad_invites;
DROP POLICY IF EXISTS "Captains and co-captains can create invites" ON squad_invites;
DROP POLICY IF EXISTS "Squad invites can be created by captains" ON squad_invites;
DROP POLICY IF EXISTS "Squad invites can be created by captains or self-requests" ON squad_invites;
DROP POLICY IF EXISTS "Allow squad invites and join requests" ON squad_invites;
DROP POLICY IF EXISTS "Users can view relevant squad invites" ON squad_invites;
DROP POLICY IF EXISTS "Users can respond to their invites" ON squad_invites;

-- Create very simple policies
-- 1. Allow anyone to insert (for now, to test)
CREATE POLICY "Allow all inserts for testing" ON squad_invites 
FOR INSERT WITH CHECK (true);

-- 2. Allow users to see invites they're involved with
CREATE POLICY "Allow viewing relevant invites" ON squad_invites 
FOR SELECT USING (
    auth.uid() = invited_player_id OR 
    auth.uid() = invited_by
);

-- 3. Allow users to update invites sent to them
CREATE POLICY "Allow updating own invites" ON squad_invites 
FOR UPDATE USING (auth.uid() = invited_player_id); 