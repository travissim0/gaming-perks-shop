-- Fix RLS policies for online users functionality
-- This addresses the issue where online users can't be displayed due to restrictive RLS policies

-- Drop existing restrictive squad_members policies
DROP POLICY IF EXISTS "Squad members are viewable by squad members" ON squad_members;

-- Create new policy that allows everyone to see basic squad membership info for online users display
CREATE POLICY "Public squad membership info" ON squad_members
    FOR SELECT USING (true); -- Allow reading squad memberships for public display

-- Allow inserting squad memberships (for squad leaders and the user themselves)
CREATE POLICY "Squad leaders and users can manage memberships" ON squad_members
    FOR INSERT WITH CHECK (
        auth.uid() IN (
            SELECT leader_id FROM squads WHERE id = squad_id
        ) OR auth.uid() = user_id
    );

-- Allow updating squad memberships (for role changes, etc.)
CREATE POLICY "Squad leaders can update memberships" ON squad_members
    FOR UPDATE USING (
        auth.uid() IN (
            SELECT leader_id FROM squads WHERE id = squad_id
        )
    );

-- Allow deleting squad memberships (leaving squads)
CREATE POLICY "Users and leaders can remove memberships" ON squad_members
    FOR DELETE USING (
        auth.uid() = user_id OR auth.uid() IN (
            SELECT leader_id FROM squads WHERE id = squad_id
        )
    );

-- Ensure squads table allows public reading for basic info
DROP POLICY IF EXISTS "Public squads are viewable by everyone" ON squads;
CREATE POLICY "Public squad info viewable" ON squads
    FOR SELECT USING (true); -- Allow reading basic squad info for public display

-- Make sure profiles are fully public for online users display
DROP POLICY IF EXISTS "Public profiles are viewable by everyone" ON profiles;
CREATE POLICY "Profiles are publicly viewable" ON profiles
    FOR SELECT USING (true);

-- Add index for last_seen to improve online users query performance
CREATE INDEX IF NOT EXISTS idx_profiles_last_seen ON profiles(last_seen);

-- Add missing columns if they don't exist (in case of schema inconsistencies)
DO $$ 
BEGIN
    -- Check if last_seen column exists, if not add it
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'profiles' AND column_name = 'last_seen') THEN
        ALTER TABLE profiles ADD COLUMN last_seen TIMESTAMP WITH TIME ZONE DEFAULT NOW();
    END IF;
    
    -- Check if avatar_url column exists, if not add it
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'profiles' AND column_name = 'avatar_url') THEN
        ALTER TABLE profiles ADD COLUMN avatar_url TEXT;
    END IF;
END $$;

-- Add any missing columns to squad_members table that might be referenced in code
DO $$ 
BEGIN
    -- Check if role column exists in squad_members
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'squad_members' AND column_name = 'role') THEN
        ALTER TABLE squad_members ADD COLUMN role TEXT DEFAULT 'member';
    END IF;
    
    -- Check if status column exists in squad_members
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'squad_members' AND column_name = 'status') THEN
        ALTER TABLE squad_members ADD COLUMN status TEXT DEFAULT 'active';
    END IF;
    
    -- Check if player_id column exists (seems to be used in frontend code)
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'squad_members' AND column_name = 'player_id') THEN
        -- If user_id exists but not player_id, create an alias or rename
        IF EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'squad_members' AND column_name = 'user_id') THEN
            -- Add player_id as alias to user_id for compatibility
            ALTER TABLE squad_members ADD COLUMN player_id UUID REFERENCES profiles(id) ON DELETE CASCADE;
            -- Copy data from user_id to player_id
            UPDATE squad_members SET player_id = user_id WHERE player_id IS NULL;
        END IF;
    END IF;
END $$;

-- Add missing columns to squads table
DO $$ 
BEGIN
    -- Check if tag column exists in squads
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'squads' AND column_name = 'tag') THEN
        ALTER TABLE squads ADD COLUMN tag TEXT;
    END IF;
    
    -- Check if banner_url column exists in squads
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'squads' AND column_name = 'banner_url') THEN
        ALTER TABLE squads ADD COLUMN banner_url TEXT;
    END IF;
END $$;

-- Create or update the optimized function for getting squads
CREATE OR REPLACE FUNCTION get_all_squads_optimized()
RETURNS TABLE (
    squad_id UUID,
    squad_name TEXT,
    squad_tag TEXT,
    member_count BIGINT,
    captain_alias TEXT,
    banner_url TEXT
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        s.id as squad_id,
        s.name as squad_name,
        s.tag as squad_tag,
        COUNT(sm.id) as member_count,
        p.in_game_alias as captain_alias,
        s.banner_url
    FROM squads s
    LEFT JOIN squad_members sm ON s.id = sm.squad_id AND sm.status = 'active'
    LEFT JOIN profiles p ON s.leader_id = p.id
    GROUP BY s.id, s.name, s.tag, p.in_game_alias, s.banner_url
    ORDER BY member_count DESC, s.created_at DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission on the function
GRANT EXECUTE ON FUNCTION get_all_squads_optimized() TO anon, authenticated;

COMMENT ON POLICY "Public squad membership info" ON squad_members IS 'Allows public viewing of squad memberships for online users display';
COMMENT ON POLICY "Public squad info viewable" ON squads IS 'Allows public viewing of basic squad information';
COMMENT ON POLICY "Profiles are publicly viewable" ON profiles IS 'Allows public viewing of user profiles for online users display'; 