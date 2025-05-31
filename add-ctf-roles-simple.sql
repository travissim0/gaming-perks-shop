-- Simple CTF Roles System
-- Adds a single CTF role field to existing profiles table

-- Create enum for CTF roles (if it doesn't exist)
DO $$ BEGIN
    CREATE TYPE ctf_role_type AS ENUM (
        'none',
        'ctf_admin', 
        'ctf_head_referee',
        'ctf_referee',
        'ctf_recorder',
        'ctf_commentator'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Add ctf_role column to profiles table
ALTER TABLE profiles 
ADD COLUMN IF NOT EXISTS ctf_role ctf_role_type DEFAULT 'none';

-- Create an index for better performance
CREATE INDEX IF NOT EXISTS idx_profiles_ctf_role ON profiles(ctf_role);

-- Add some comments for documentation
COMMENT ON COLUMN profiles.ctf_role IS 'Single CTF role for the user. Users can have either admin access OR a CTF role, not both.';

-- Update RLS policies to include CTF role access
-- Allow CTF admins to view all profiles
DROP POLICY IF EXISTS "CTF admins can view all profiles" ON profiles;
CREATE POLICY "CTF admins can view all profiles" ON profiles
    FOR SELECT USING (
        auth.uid() IN (
            SELECT id FROM profiles 
            WHERE (is_admin = true OR ctf_role = 'ctf_admin') 
            AND id = auth.uid()
        )
    );

-- Allow CTF admins to update CTF roles
DROP POLICY IF EXISTS "CTF admins can update CTF roles" ON profiles;
CREATE POLICY "CTF admins can update CTF roles" ON profiles
    FOR UPDATE USING (
        auth.uid() IN (
            SELECT id FROM profiles 
            WHERE (is_admin = true OR ctf_role = 'ctf_admin') 
            AND id = auth.uid()
        )
    );

-- Create a view for role information (optional, for reference)
CREATE OR REPLACE VIEW ctf_role_info AS
SELECT 
    'none' as role_name,
    'No CTF Role' as display_name,
    'Regular user with no CTF permissions' as description,
    0 as hierarchy_level
UNION ALL
SELECT 
    'ctf_admin' as role_name,
    'CTF Administrator' as display_name,
    'Manages all CTF operations and roles' as description,
    90 as hierarchy_level
UNION ALL
SELECT 
    'ctf_head_referee' as role_name,
    'CTF Head Referee' as display_name,
    'Manages all referees and their applications' as description,
    80 as hierarchy_level
UNION ALL
SELECT 
    'ctf_referee' as role_name,
    'CTF Referee' as display_name,
    'Confirms and edits match results and statistics' as description,
    70 as hierarchy_level
UNION ALL
SELECT 
    'ctf_recorder' as role_name,
    'CTF Recorder' as display_name,
    'Manages video recordings for tournament matches' as description,
    60 as hierarchy_level
UNION ALL
SELECT 
    'ctf_commentator' as role_name,
    'CTF Commentator' as display_name,
    'Can sign up to commentate matches' as description,
    50 as hierarchy_level
ORDER BY hierarchy_level DESC;

-- Create helper functions
CREATE OR REPLACE FUNCTION get_user_ctf_role(user_uuid UUID)
RETURNS ctf_role_type AS $$
BEGIN
    RETURN (
        SELECT COALESCE(ctf_role, 'none')
        FROM profiles
        WHERE id = user_uuid
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION user_has_ctf_permission(user_uuid UUID, permission_name TEXT)
RETURNS BOOLEAN AS $$
DECLARE
    user_role ctf_role_type;
    user_is_admin BOOLEAN;
BEGIN
    SELECT ctf_role, is_admin INTO user_role, user_is_admin
    FROM profiles
    WHERE id = user_uuid;
    
    -- Site admins have all permissions
    IF user_is_admin THEN
        RETURN true;
    END IF;
    
    -- Check CTF role permissions
    CASE user_role
        WHEN 'ctf_admin' THEN
            RETURN permission_name IN ('manage_ctf_roles', 'manage_matches', 'manage_squads', 'manage_referees', 'manage_referee_applications', 'view_ctf_admin_panel');
        WHEN 'ctf_head_referee' THEN
            RETURN permission_name IN ('manage_referees', 'manage_referee_applications', 'approve_referee_promotions', 'manage_match_results', 'view_referee_panel');
        WHEN 'ctf_referee' THEN
            RETURN permission_name IN ('manage_match_results', 'edit_match_stats', 'view_match_details', 'referee_matches');
        WHEN 'ctf_recorder' THEN
            RETURN permission_name IN ('add_match_videos', 'edit_match_videos', 'manage_tournament_recordings');
        WHEN 'ctf_commentator' THEN
            RETURN permission_name IN ('signup_for_commentary', 'view_match_schedule');
        ELSE
            RETURN false;
    END CASE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER; 