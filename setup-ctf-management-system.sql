-- CTF Management System Setup
-- Sets up tables and policies for CTF admin management features

-- Add tournament_eligible column to squads table if it doesn't exist
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'squads' AND column_name = 'tournament_eligible'
    ) THEN
        ALTER TABLE squads ADD COLUMN tournament_eligible BOOLEAN DEFAULT false;
        COMMENT ON COLUMN squads.tournament_eligible IS 'Whether this squad is eligible for tournament matches';
    END IF;
END $$;

-- Create free_agents table
CREATE TABLE IF NOT EXISTS free_agents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    player_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    preferred_roles TEXT[] DEFAULT '{}',
    availability TEXT,
    skill_level TEXT DEFAULT 'intermediate' CHECK (skill_level IN ('beginner', 'intermediate', 'advanced', 'expert')),
    notes TEXT,
    contact_info TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- Ensure a player can only be in the free agent pool once while active
    UNIQUE(player_id, is_active) DEFERRABLE INITIALLY DEFERRED
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_free_agents_player_id ON free_agents(player_id);
CREATE INDEX IF NOT EXISTS idx_free_agents_is_active ON free_agents(is_active);
CREATE INDEX IF NOT EXISTS idx_free_agents_skill_level ON free_agents(skill_level);
CREATE INDEX IF NOT EXISTS idx_squads_tournament_eligible ON squads(tournament_eligible);

-- Add updated_at trigger for free_agents
CREATE OR REPLACE FUNCTION update_free_agents_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_free_agents_updated_at
    BEFORE UPDATE ON free_agents
    FOR EACH ROW
    EXECUTE FUNCTION update_free_agents_updated_at();

-- Set up Row Level Security (RLS) for free_agents table
ALTER TABLE free_agents ENABLE ROW LEVEL SECURITY;

-- Policy: Allow EVERYONE (including anonymous users) to view active free agents
CREATE POLICY "free_agents_public_view" ON free_agents
    FOR SELECT USING (is_active = true);

-- Policy: Allow players to manage their own free agent entry
CREATE POLICY "free_agents_manage_own" ON free_agents
    FOR ALL USING (
        auth.uid() = player_id
    );

-- Policy: Allow CTF admins and site admins to manage all free agents
CREATE POLICY "free_agents_ctf_admin_manage" ON free_agents
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM profiles 
            WHERE id = auth.uid() 
            AND (is_admin = true OR ctf_role = 'ctf_admin')
        )
    );

-- Update squads table policies to allow CTF admins to manage tournament eligibility
DROP POLICY IF EXISTS "ctf_admin_squad_management" ON squads;
CREATE POLICY "ctf_admin_squad_management" ON squads
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM profiles 
            WHERE id = auth.uid() 
            AND (is_admin = true OR ctf_role = 'ctf_admin')
        )
    );

-- Function to automatically remove players from free agent pool when they join a squad
CREATE OR REPLACE FUNCTION remove_from_free_agent_pool_on_squad_join()
RETURNS TRIGGER AS $$
BEGIN
    -- When a player joins a squad, deactivate their free agent entry
    UPDATE free_agents 
    SET is_active = false, updated_at = NOW()
    WHERE player_id = NEW.player_id AND is_active = true;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to automatically remove from free agent pool when joining squad
DROP TRIGGER IF EXISTS trigger_remove_free_agent_on_squad_join ON squad_members;
CREATE TRIGGER trigger_remove_free_agent_on_squad_join
    AFTER INSERT ON squad_members
    FOR EACH ROW
    EXECUTE FUNCTION remove_from_free_agent_pool_on_squad_join();

-- Function to get available players for free agent pool (not in any active squad)
CREATE OR REPLACE FUNCTION get_available_players_for_free_agents()
RETURNS TABLE (
    id UUID,
    in_game_alias TEXT,
    email TEXT,
    registration_status TEXT
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        p.id,
        p.in_game_alias,
        p.email,
        p.registration_status
    FROM profiles p
    WHERE 
        p.registration_status = 'completed'
        AND p.in_game_alias IS NOT NULL
        AND p.in_game_alias != ''
        AND NOT EXISTS (
            SELECT 1 FROM squad_members sm 
            WHERE sm.player_id = p.id
        )
        AND NOT EXISTS (
            SELECT 1 FROM free_agents fa 
            WHERE fa.player_id = p.id AND fa.is_active = true
        );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant necessary permissions
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT ALL ON free_agents TO authenticated;
GRANT EXECUTE ON FUNCTION get_available_players_for_free_agents() TO authenticated;
GRANT EXECUTE ON FUNCTION remove_from_free_agent_pool_on_squad_join() TO authenticated;
GRANT EXECUTE ON FUNCTION update_free_agents_updated_at() TO authenticated;

-- Insert some example data for testing (optional)
-- This will only run if the free_agents table is empty
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM free_agents LIMIT 1) THEN
        -- Add some sample free agents for testing
        INSERT INTO free_agents (player_id, preferred_roles, availability, skill_level, notes, contact_info)
        SELECT 
            p.id,
            ARRAY['Offense', 'Support'],
            'Weekends and evenings EST',
            'intermediate',
            'Looking for an active squad for tournaments',
            'Discord: Player#1234'
        FROM profiles p
        WHERE p.registration_status = 'completed' 
        AND p.in_game_alias IS NOT NULL
        AND NOT EXISTS (SELECT 1 FROM squad_members WHERE player_id = p.id)
        LIMIT 3;
    END IF;
END $$;

-- Update existing squads to have tournament_eligible = true for active squads
UPDATE squads 
SET tournament_eligible = true 
WHERE is_active = true AND tournament_eligible IS NULL;

COMMENT ON TABLE free_agents IS 'Players available for recruitment by squads';
COMMENT ON COLUMN squads.tournament_eligible IS 'Indicates if squad can participate in tournaments';

-- Create view for CTF admin dashboard stats
CREATE OR REPLACE VIEW ctf_management_stats AS
SELECT 
    (SELECT COUNT(*) FROM squads WHERE is_active = true) as active_squads,
    (SELECT COUNT(*) FROM squads WHERE tournament_eligible = true) as tournament_eligible_squads,
    (SELECT COUNT(*) FROM free_agents WHERE is_active = true) as active_free_agents,
    (SELECT COUNT(*) FROM profiles WHERE ctf_role = 'ctf_admin') as ctf_admins,
    (SELECT COUNT(*) FROM profiles WHERE ctf_role IS NOT NULL AND ctf_role != 'none') as total_ctf_staff;

GRANT SELECT ON ctf_management_stats TO authenticated;

-- Add league ban functionality
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'profiles' AND column_name = 'is_league_banned'
    ) THEN
        ALTER TABLE profiles ADD COLUMN is_league_banned BOOLEAN DEFAULT false;
        COMMENT ON COLUMN profiles.is_league_banned IS 'Whether player is banned from CTF leagues and free agent pool';
    END IF;
    
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'profiles' AND column_name = 'league_ban_reason'
    ) THEN
        ALTER TABLE profiles ADD COLUMN league_ban_reason TEXT;
        COMMENT ON COLUMN profiles.league_ban_reason IS 'Reason for league ban if applicable';
    END IF;
    
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'profiles' AND column_name = 'league_ban_date'
    ) THEN
        ALTER TABLE profiles ADD COLUMN league_ban_date TIMESTAMPTZ;
        COMMENT ON COLUMN profiles.league_ban_date IS 'Date when league ban was applied';
    END IF;
END $$;

-- Update free_agents table to prevent banned players from joining
DROP POLICY IF EXISTS "free_agents_no_banned_players" ON free_agents;
CREATE POLICY "free_agents_no_banned_players" ON free_agents
    FOR INSERT WITH CHECK (
        NOT EXISTS (
            SELECT 1 FROM profiles 
            WHERE id = player_id AND is_league_banned = true
        )
    ); 