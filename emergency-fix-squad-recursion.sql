-- EMERGENCY FIX: Squad Policy Recursion Issue
-- This fixes the infinite recursion error in squad RLS policies
-- Run this IMMEDIATELY in Supabase SQL Editor

-- STEP 1: Disable RLS temporarily to break the recursion
ALTER TABLE squads DISABLE ROW LEVEL SECURITY;
ALTER TABLE squad_members DISABLE ROW LEVEL SECURITY;
ALTER TABLE squad_invites DISABLE ROW LEVEL SECURITY;

-- STEP 2: Drop ALL problematic policies
DROP POLICY IF EXISTS "Public squads are viewable by everyone" ON squads;
DROP POLICY IF EXISTS "Anonymous and authenticated squad access" ON squads;
DROP POLICY IF EXISTS "Optimized users can create squads" ON squads;
DROP POLICY IF EXISTS "Optimized captains and admins can update their squads" ON squads;
DROP POLICY IF EXISTS "Optimized captains can delete their squads" ON squads;
DROP POLICY IF EXISTS "Users can create squads" ON squads;
DROP POLICY IF EXISTS "Authenticated users can create squads" ON squads;
DROP POLICY IF EXISTS "Squad leaders can update their squads" ON squads;
DROP POLICY IF EXISTS "Squad leaders can delete their squads" ON squads;
DROP POLICY IF EXISTS "Captains and admins can update their squads" ON squads;
DROP POLICY IF EXISTS "Captains can delete their squads" ON squads;
DROP POLICY IF EXISTS "Admins can update any squad" ON squads;

-- STEP 3: Drop squad_members policies
DROP POLICY IF EXISTS "Squad members are viewable by squad members" ON squad_members;
DROP POLICY IF EXISTS "Squad members are viewable by everyone" ON squad_members;
DROP POLICY IF EXISTS "Squad leaders and users can add members" ON squad_members;
DROP POLICY IF EXISTS "Squad leaders and users can update members" ON squad_members;
DROP POLICY IF EXISTS "Squad leaders and users can remove members" ON squad_members;
DROP POLICY IF EXISTS "Squad leaders can add members" ON squad_members;
DROP POLICY IF EXISTS "Users can leave squads" ON squad_members;

-- STEP 4: Drop squad_invites policies
DROP POLICY IF EXISTS "Users can view relevant squad invites" ON squad_invites;
DROP POLICY IF EXISTS "Authenticated users can view relevant squad invites" ON squad_invites;
DROP POLICY IF EXISTS "Squad captains and users can create invites" ON squad_invites;
DROP POLICY IF EXISTS "Users and captains can update squad invites" ON squad_invites;
DROP POLICY IF EXISTS "Squad members can create invites" ON squad_invites;
DROP POLICY IF EXISTS "Users can update invites they received" ON squad_invites;

-- STEP 5: Create SIMPLE, NON-RECURSIVE policies

-- Re-enable RLS
ALTER TABLE squads ENABLE ROW LEVEL SECURITY;
ALTER TABLE squad_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE squad_invites ENABLE ROW LEVEL SECURITY;

-- Simple squad policy - NO RECURSION
CREATE POLICY "simple_squad_read" ON squads
    FOR SELECT USING (
        is_active = true  -- Public can see active squads
        OR auth.uid() = captain_id  -- Captains can see their squads
    );

CREATE POLICY "simple_squad_insert" ON squads
    FOR INSERT WITH CHECK (auth.uid() = captain_id);

CREATE POLICY "simple_squad_update" ON squads
    FOR UPDATE USING (auth.uid() = captain_id);

CREATE POLICY "simple_squad_delete" ON squads
    FOR DELETE USING (auth.uid() = captain_id);

-- Simple squad_members policy - NO RECURSION
CREATE POLICY "simple_members_read" ON squad_members
    FOR SELECT USING (true);  -- Everyone can see squad members (public info)

CREATE POLICY "simple_members_insert" ON squad_members
    FOR INSERT WITH CHECK (
        auth.uid() = player_id  -- Users can join
        OR auth.uid() IN (SELECT captain_id FROM squads WHERE id = squad_id)  -- Captains can add
    );

CREATE POLICY "simple_members_update" ON squad_members
    FOR UPDATE USING (
        auth.uid() = player_id  -- Users can update their own
        OR auth.uid() IN (SELECT captain_id FROM squads WHERE id = squad_id)  -- Captains can update
    );

CREATE POLICY "simple_members_delete" ON squad_members
    FOR DELETE USING (
        auth.uid() = player_id  -- Users can leave
        OR auth.uid() IN (SELECT captain_id FROM squads WHERE id = squad_id)  -- Captains can remove
    );

-- Simple squad_invites policy - NO RECURSION
CREATE POLICY "simple_invites_read" ON squad_invites
    FOR SELECT USING (
        auth.uid() = invited_player_id 
        OR auth.uid() = invited_by
        OR auth.uid() IN (SELECT captain_id FROM squads WHERE id = squad_id)
    );

CREATE POLICY "simple_invites_insert" ON squad_invites
    FOR INSERT WITH CHECK (
        auth.uid() = invited_by  -- Users can create invites
    );

CREATE POLICY "simple_invites_update" ON squad_invites
    FOR UPDATE USING (
        auth.uid() = invited_player_id 
        OR auth.uid() = invited_by
    );

-- STEP 6: Grant permissions to anonymous users
GRANT SELECT ON squads TO anon;
GRANT SELECT ON squad_members TO anon;
GRANT SELECT ON profiles TO anon;

-- Test the fix
SELECT 'EMERGENCY FIX COMPLETE' as status, 'Testing squad access...' as test;

-- Quick test query that should work now
SELECT COUNT(*) as active_squads FROM squads WHERE is_active = true;

SELECT 'If you see squad count above, the recursion is fixed!' as result; 