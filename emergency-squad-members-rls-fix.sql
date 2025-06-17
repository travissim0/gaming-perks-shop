-- EMERGENCY FIX: Fix squad_members RLS policies to allow captains to add members
-- Run this in Supabase SQL Editor immediately

-- Drop existing problematic policies on squad_members
DROP POLICY IF EXISTS "squad_members_allow_all_reads" ON squad_members;
DROP POLICY IF EXISTS "squad_members_anonymous_read" ON squad_members;
DROP POLICY IF EXISTS "squad_members_public_read" ON squad_members;
DROP POLICY IF EXISTS "squad_members_simple_read" ON squad_members;
DROP POLICY IF EXISTS "Squad members can be inserted by service role" ON squad_members;
DROP POLICY IF EXISTS "Squad members can be updated by captains" ON squad_members;
DROP POLICY IF EXISTS "Squad members can be deleted by captains or themselves" ON squad_members;
DROP POLICY IF EXISTS "Captains and co-captains can manage members" ON squad_members;

-- Re-enable RLS
ALTER TABLE squad_members ENABLE ROW LEVEL SECURITY;

-- Create simple, working policies
-- 1. Allow everyone to read squad members (public info)
CREATE POLICY "Allow all reads on squad_members" ON squad_members
    FOR SELECT USING (true);

-- 2. Allow captains/co-captains to insert new members (for approving join requests)
CREATE POLICY "Allow captains to insert members" ON squad_members
    FOR INSERT WITH CHECK (
        -- Squad captains can add members
        auth.uid() IN (SELECT captain_id FROM squads WHERE id = squad_id)
        OR
        -- Co-captains can add members
        EXISTS (
            SELECT 1 FROM squad_members sm 
            WHERE sm.squad_id = squad_members.squad_id 
            AND sm.player_id = auth.uid() 
            AND sm.role = 'co_captain'
            AND sm.status = 'active'
        )
        OR
        -- Users can add themselves (when accepting invitations)
        auth.uid() = player_id
    );

-- 3. Allow members to update their own status, captains to update any member
CREATE POLICY "Allow member updates" ON squad_members
    FOR UPDATE USING (
        -- Users can update their own membership
        auth.uid() = player_id 
        OR
        -- Squad captains can update any member
        auth.uid() IN (SELECT captain_id FROM squads WHERE id = squad_id)
        OR
        -- Co-captains can update members (but not other co-captains or captains)
        (EXISTS (
            SELECT 1 FROM squad_members sm 
            WHERE sm.squad_id = squad_members.squad_id 
            AND sm.player_id = auth.uid() 
            AND sm.role = 'co_captain'
            AND sm.status = 'active'
        ) AND role = 'player')
    );

-- 4. Allow members to leave, captains to remove members
CREATE POLICY "Allow member removal" ON squad_members
    FOR DELETE USING (
        -- Users can leave themselves
        auth.uid() = player_id 
        OR
        -- Squad captains can remove any member
        auth.uid() IN (SELECT captain_id FROM squads WHERE id = squad_id)
        OR
        -- Co-captains can remove regular players
        (EXISTS (
            SELECT 1 FROM squad_members sm 
            WHERE sm.squad_id = squad_members.squad_id 
            AND sm.player_id = auth.uid() 
            AND sm.role = 'co_captain'
            AND sm.status = 'active'
        ) AND role = 'player')
    );

-- Test the fix
SELECT 'RLS policies for squad_members have been fixed!' as status;

-- Show current policies
SELECT policyname, cmd, roles, permissive
FROM pg_policies 
WHERE tablename = 'squad_members' 
AND schemaname = 'public'; 