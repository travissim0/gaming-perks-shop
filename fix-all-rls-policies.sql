-- Fix RLS policies for both match_participants and squad_invites
-- Run this in Supabase SQL Editor

-- 1. Fix match_participants to allow users to delete their own participation
CREATE POLICY "Users can delete their own participation" ON match_participants 
FOR DELETE USING (auth.uid() = player_id);

-- 2. Drop the restrictive squad_invites insert policy
DROP POLICY IF EXISTS "Captains and co-captains can create invites" ON squad_invites;

-- 3. Create a new policy that allows both captains inviting others AND users requesting to join
CREATE POLICY "Squad invites can be created by captains or self-requests" ON squad_invites 
FOR INSERT WITH CHECK (
    -- Allow captains/co-captains to invite others
    (auth.uid() IN (
        SELECT captain_id FROM squads WHERE id = squad_invites.squad_id
    ) OR 
    EXISTS (
        SELECT 1 FROM squad_members sm 
        WHERE sm.squad_id = squad_invites.squad_id 
        AND sm.player_id = auth.uid() 
        AND sm.role IN ('captain', 'co_captain')
        AND sm.status = 'active'
    ))
    OR
    -- Allow users to create self-requests (request to join)
    (auth.uid() = invited_player_id AND auth.uid() = invited_by)
); 