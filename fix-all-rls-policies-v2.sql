-- Comprehensive fix for RLS policies
-- Run this in Supabase SQL Editor

-- 1. Fix match_participants delete policy
DROP POLICY IF EXISTS "Users can delete their own participation" ON match_participants;
CREATE POLICY "Users can delete their own participation" ON match_participants 
FOR DELETE USING (auth.uid() = player_id);

-- 2. Fix squad_invites policies - drop all existing and recreate
DROP POLICY IF EXISTS "Captains and co-captains can create invites" ON squad_invites;
DROP POLICY IF EXISTS "Squad invites can be created by captains" ON squad_invites;
DROP POLICY IF EXISTS "Squad invites can be created by captains or self-requests" ON squad_invites;

-- Create a comprehensive squad_invites insert policy that allows:
-- a) Squad captains to invite others
-- b) Users to create self-requests (request to join)
CREATE POLICY "Allow squad invites and join requests" ON squad_invites 
FOR INSERT WITH CHECK (
    -- Case 1: Squad captain/co-captain inviting someone else
    (auth.uid() != invited_player_id AND (
        auth.uid() IN (SELECT captain_id FROM squads WHERE id = squad_invites.squad_id)
        OR
        EXISTS (
            SELECT 1 FROM squad_members sm 
            WHERE sm.squad_id = squad_invites.squad_id 
            AND sm.player_id = auth.uid() 
            AND sm.role IN ('captain', 'co_captain')
            AND sm.status = 'active'
        )
    ))
    OR
    -- Case 2: User creating a self-request to join (request to join)
    (auth.uid() = invited_player_id AND auth.uid() = invited_by)
);

-- 3. Also ensure the view policy allows users to see their own requests
DROP POLICY IF EXISTS "Users can view their own invites" ON squad_invites;
DROP POLICY IF EXISTS "Users can view squad invites" ON squad_invites;

CREATE POLICY "Users can view relevant squad invites" ON squad_invites 
FOR SELECT USING (
    -- Users can see invites sent to them
    auth.uid() = invited_player_id 
    OR 
    -- Squad captains/co-captains can see invites for their squad
    (auth.uid() IN (SELECT captain_id FROM squads WHERE id = squad_invites.squad_id)
    OR
    EXISTS (
        SELECT 1 FROM squad_members sm 
        WHERE sm.squad_id = squad_invites.squad_id 
        AND sm.player_id = auth.uid() 
        AND sm.role IN ('captain', 'co_captain')
        AND sm.status = 'active'
    ))
);

-- 4. Ensure users can update their own invite responses
DROP POLICY IF EXISTS "Users can respond to their invites" ON squad_invites;
CREATE POLICY "Users can respond to their invites" ON squad_invites 
FOR UPDATE USING (auth.uid() = invited_player_id); 