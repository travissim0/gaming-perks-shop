-- Grant squad photo editing permissions to CTF admins, site admins, and media managers
-- This supplements the frontend permission checks with database-level security
-- CORRECTED VERSION - Uses proper schema fields

-- Update squad RLS policy to allow photo editing by additional roles
DROP POLICY IF EXISTS "Squad banner update permissions" ON squads;

CREATE POLICY "Squad banner update permissions" ON squads
    FOR UPDATE USING (
        -- Allow squad captains and co-captains
        auth.uid() = captain_id 
        OR auth.uid() IN (
            SELECT player_id FROM squad_members 
            WHERE squad_id = squads.id 
            AND role IN ('captain', 'co_captain')
            AND status = 'active'
        )
        -- Allow site admins
        OR auth.uid() IN (
            SELECT id FROM profiles WHERE is_admin = true
        )
        -- Allow CTF admins
        OR auth.uid() IN (
            SELECT id FROM profiles WHERE ctf_role = 'ctf_admin'
        )
        -- Allow media managers (using correct boolean field)
        OR auth.uid() IN (
            SELECT id FROM profiles WHERE is_media_manager = true
        )
    );

-- Also ensure squad read policy allows these roles to see all squads
DROP POLICY IF EXISTS "Enhanced squad read access" ON squads;

CREATE POLICY "Enhanced squad read access" ON squads
    FOR SELECT USING (
        -- Public can see active squads
        is_active = true
        -- Squad members can see their squad (active or inactive)
        OR auth.uid() = captain_id 
        OR auth.uid() IN (
            SELECT player_id FROM squad_members 
            WHERE squad_id = squads.id
        )
        -- Admins and staff can see all squads
        OR auth.uid() IN (
            SELECT id FROM profiles 
            WHERE is_admin = true 
            OR ctf_role = 'ctf_admin'
            OR is_media_manager = true
        )
    );

-- Grant UPDATE permission specifically for banner_url column
-- This is a more granular approach if needed
COMMENT ON POLICY "Squad banner update permissions" ON squads IS 
'Allows squad captains, co-captains, site admins, CTF admins, and media managers to edit squad photos/banners';

-- Ensure the policies are enabled
ALTER TABLE squads ENABLE ROW LEVEL SECURITY; 