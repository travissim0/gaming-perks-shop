-- Add Legacy Squad Designation System
-- This allows historical squads to be preserved while players join active squads

-- 1. Add is_legacy column to squads table
ALTER TABLE squads ADD COLUMN IF NOT EXISTS is_legacy BOOLEAN DEFAULT false;

-- 2. Create index for better performance on legacy queries
CREATE INDEX IF NOT EXISTS idx_squads_is_legacy ON squads(is_legacy);

-- 3. Update squad membership validation logic
-- Create function to check if user can join squad (considering legacy rules)
CREATE OR REPLACE FUNCTION can_join_squad(user_id UUID, target_squad_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
    active_squad_count INTEGER;
    target_is_legacy BOOLEAN;
BEGIN
    -- Check if target squad is legacy
    SELECT is_legacy INTO target_is_legacy 
    FROM squads 
    WHERE id = target_squad_id;
    
    -- Count active (non-legacy) squad memberships
    SELECT COUNT(*) INTO active_squad_count
    FROM squad_members sm
    JOIN squads s ON s.id = sm.squad_id
    WHERE sm.player_id = user_id 
      AND sm.status = 'active'
      AND s.is_legacy = false;
    
    -- Allow sending requests if:
    -- 1. Target is legacy squad (can request to join legacy squads even if in active squad)
    -- 2. Target is active squad AND user has no active squad memberships
    -- Note: This function only checks if user can REQUEST to join, captain approval is still required
    RETURN (target_is_legacy = true) OR (target_is_legacy = false AND active_squad_count = 0);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. Create function to get user's active (non-legacy) squad
CREATE OR REPLACE FUNCTION get_user_active_squad(user_id UUID)
RETURNS TABLE (
    squad_id UUID,
    squad_name TEXT,
    squad_tag TEXT,
    role TEXT
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        s.id as squad_id,
        s.name as squad_name,
        s.tag as squad_tag,
        sm.role
    FROM squad_members sm
    JOIN squads s ON s.id = sm.squad_id
    WHERE sm.player_id = user_id 
      AND sm.status = 'active'
      AND s.is_legacy = false
      AND s.is_active = true
    LIMIT 1;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5. Create function to get user's legacy squads
CREATE OR REPLACE FUNCTION get_user_legacy_squads(user_id UUID)
RETURNS TABLE (
    squad_id UUID,
    squad_name TEXT,
    squad_tag TEXT,
    role TEXT,
    joined_at TIMESTAMP WITH TIME ZONE
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        s.id as squad_id,
        s.name as squad_name,
        s.tag as squad_tag,
        sm.role,
        sm.joined_at
    FROM squad_members sm
    JOIN squads s ON s.id = sm.squad_id
    WHERE sm.player_id = user_id 
      AND sm.status = 'active'
      AND s.is_legacy = true
    ORDER BY sm.joined_at DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 6. Update free agents logic to only consider active squads
CREATE OR REPLACE FUNCTION get_free_agents_excluding_active_only()
RETURNS TABLE (
    player_id UUID,
    in_game_alias TEXT,
    email TEXT,
    created_at TIMESTAMP WITH TIME ZONE
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        p.id as player_id,
        p.in_game_alias,
        p.email,
        p.created_at
    FROM profiles p
    WHERE p.id NOT IN (
        -- Exclude players who are in active (non-legacy) squads
        SELECT DISTINCT sm.player_id 
        FROM squad_members sm 
        JOIN squads s ON s.id = sm.squad_id
        WHERE sm.status = 'active'
          AND s.is_legacy = false
          AND s.is_active = true
    )
    AND p.in_game_alias IS NOT NULL
    AND p.in_game_alias != ''
    AND p.registration_status = 'completed'
    ORDER BY p.in_game_alias ASC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 7. Create function to check if user can be free agent (only blocked by active squads)
CREATE OR REPLACE FUNCTION can_be_free_agent(user_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
    active_squad_count INTEGER;
BEGIN
    -- Count active (non-legacy) squad memberships
    SELECT COUNT(*) INTO active_squad_count
    FROM squad_members sm
    JOIN squads s ON s.id = sm.squad_id
    WHERE sm.player_id = user_id 
      AND sm.status = 'active'
      AND s.is_legacy = false
      AND s.is_active = true;
    
    -- Can be free agent if not in any active squads
    RETURN active_squad_count = 0;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 8. Add RLS policy to allow viewing legacy status
-- Drop and recreate the squad read policy to include legacy information
DROP POLICY IF EXISTS "Enhanced squad read access" ON squads;
DROP POLICY IF EXISTS "Public squads are viewable by everyone" ON squads;
DROP POLICY IF EXISTS "Squads are viewable by everyone" ON squads;

CREATE POLICY "Public can view active squads and members can view their squads" ON squads
    FOR SELECT USING (
        -- Public can see active non-legacy squads
        (is_active = true AND is_legacy = false)
        -- Squad members can see their squad (active or inactive, legacy or not)
        OR auth.uid() = captain_id 
        OR auth.uid() IN (
            SELECT player_id FROM squad_members 
            WHERE squad_id = squads.id AND status = 'active'
        )
        -- Admins and staff can see all squads
        OR auth.uid() IN (
            SELECT id FROM profiles 
            WHERE is_admin = true 
            OR ctf_role = 'ctf_admin'
            OR is_media_manager = true
        )
    );

-- 9. Update squad creation to prevent creating legacy squads directly
-- (Legacy status should be set manually by admins for historical preservation)
ALTER TABLE squads ADD CONSTRAINT check_no_direct_legacy_creation 
    CHECK (is_legacy = false OR created_at < NOW() - INTERVAL '1 hour');

-- 10. Grant permissions on new functions
GRANT EXECUTE ON FUNCTION can_join_squad(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION get_user_active_squad(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION get_user_legacy_squads(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION get_free_agents_excluding_active_only() TO authenticated;
GRANT EXECUTE ON FUNCTION can_be_free_agent(UUID) TO authenticated;

-- Grant to anonymous for public functions
GRANT EXECUTE ON FUNCTION get_free_agents_excluding_active_only() TO anon;

-- 11. Add comments for documentation
COMMENT ON COLUMN squads.is_legacy IS 'Legacy squads allow flexible membership - players can be in legacy squads while also joining active squads';
COMMENT ON FUNCTION can_join_squad(UUID, UUID) IS 'Checks if user can join squad considering legacy vs active squad rules';
COMMENT ON FUNCTION get_user_active_squad(UUID) IS 'Returns users primary active (non-legacy) squad';
COMMENT ON FUNCTION get_user_legacy_squads(UUID) IS 'Returns all legacy squads user is member of';
COMMENT ON FUNCTION can_be_free_agent(UUID) IS 'Checks if user can be free agent (only blocked by active squad membership)';

-- 12. Create example query to find candidates for legacy designation
-- (Run this to identify old inactive squads that could become legacy)
/*
SELECT 
    s.id,
    s.name,
    s.tag,
    s.created_at,
    s.is_active,
    COUNT(sm.id) as member_count,
    MAX(sm.joined_at) as last_member_joined
FROM squads s
LEFT JOIN squad_members sm ON sm.squad_id = s.id AND sm.status = 'active'
WHERE s.created_at < NOW() - INTERVAL '6 months'
  AND s.is_legacy = false
  AND s.is_active = false
GROUP BY s.id, s.name, s.tag, s.created_at, s.is_active
ORDER BY s.created_at ASC;
*/

-- Success message
SELECT 'Legacy squad system successfully implemented!' as status; 