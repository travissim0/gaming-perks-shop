-- Enhanced RLS policies for squad invitations
-- Run this in Supabase SQL Editor to fix squad invitation management

-- 1. Drop existing problematic policies
DROP POLICY IF EXISTS "Users can respond to their invites" ON squad_invites;
DROP POLICY IF EXISTS "Users can view relevant squad invites" ON squad_invites;
DROP POLICY IF EXISTS "Allow squad invites and join requests" ON squad_invites;

-- 2. Create comprehensive SELECT policy
CREATE POLICY "Users can view squad invites and requests" ON squad_invites 
FOR SELECT USING (
    -- Users can see invites sent TO them
    auth.uid() = invited_player_id 
    OR 
    -- Users can see requests sent BY them (including self-requests)
    auth.uid() = invited_by
    OR
    -- Squad captains/co-captains can see all invites for their squad
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

-- 3. Create comprehensive INSERT policy
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

-- 4. Create comprehensive UPDATE policy
CREATE POLICY "Users and captains can manage squad invites" ON squad_invites 
FOR UPDATE USING (
    -- Users can update invites sent TO them (accept/decline invitations)
    auth.uid() = invited_player_id 
    OR
    -- Users can update requests sent BY them (withdraw requests)
    auth.uid() = invited_by
    OR
    -- Squad captains/co-captains can update invites for their squad
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