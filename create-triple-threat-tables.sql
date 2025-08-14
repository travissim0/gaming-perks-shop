-- Triple Threat League Database Schema
-- Creates tables for the Triple Threat 3v3 league system with tt_ prefix

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Create tt_teams table for Triple Threat teams/pods
CREATE TABLE IF NOT EXISTS tt_teams (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    team_name TEXT NOT NULL UNIQUE,
    team_password_hash TEXT NOT NULL, -- Encrypted password
    team_banner_url TEXT,
    owner_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    is_active BOOLEAN DEFAULT true,
    max_players INTEGER DEFAULT 4, -- 3 active + 1 alternate
    
    -- Constraints
    CONSTRAINT tt_teams_name_length CHECK (char_length(team_name) >= 3 AND char_length(team_name) <= 50)
);

-- Create trigger to encrypt passwords on insert/update
CREATE OR REPLACE FUNCTION encrypt_tt_team_password()
RETURNS TRIGGER AS $$
BEGIN
    -- Only encrypt if the password is not already hashed (doesn't start with $2)
    IF NEW.team_password_hash IS NOT NULL AND NOT NEW.team_password_hash LIKE '$2%' THEN
        NEW.team_password_hash = crypt(NEW.team_password_hash, gen_salt('bf'));
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tt_teams_encrypt_password_trigger
    BEFORE INSERT OR UPDATE ON tt_teams
    FOR EACH ROW EXECUTE FUNCTION encrypt_tt_team_password();

-- Create tt_team_members table for team membership
CREATE TABLE IF NOT EXISTS tt_team_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    team_id UUID NOT NULL REFERENCES tt_teams(id) ON DELETE CASCADE,
    player_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    joined_at TIMESTAMPTZ DEFAULT NOW(),
    is_active BOOLEAN DEFAULT true,
    role TEXT DEFAULT 'player' CHECK (role IN ('owner', 'player')),
    
    -- Ensure one membership per player per team
    UNIQUE(team_id, player_id)
);

-- Create tt_tournaments table for tournament tracking
CREATE TABLE IF NOT EXISTS tt_tournaments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tournament_name TEXT NOT NULL,
    description TEXT,
    start_date TIMESTAMPTZ,
    end_date TIMESTAMPTZ,
    max_teams INTEGER DEFAULT 16,
    status TEXT DEFAULT 'upcoming' CHECK (status IN ('upcoming', 'registration_open', 'in_progress', 'completed', 'cancelled')),
    created_by UUID REFERENCES profiles(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    registration_deadline TIMESTAMPTZ,
    bracket_data JSONB DEFAULT '{}',
    
    CONSTRAINT tt_tournaments_dates CHECK (end_date >= start_date)
);

-- Create tt_tournament_registrations table
CREATE TABLE IF NOT EXISTS tt_tournament_registrations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tournament_id UUID NOT NULL REFERENCES tt_tournaments(id) ON DELETE CASCADE,
    team_id UUID NOT NULL REFERENCES tt_teams(id) ON DELETE CASCADE,
    registered_at TIMESTAMPTZ DEFAULT NOW(),
    registered_by UUID NOT NULL REFERENCES profiles(id),
    
    -- Ensure one registration per team per tournament
    UNIQUE(tournament_id, team_id)
);

-- Create tt_matches table for match tracking
CREATE TABLE IF NOT EXISTS tt_matches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tournament_id UUID REFERENCES tt_tournaments(id) ON DELETE CASCADE,
    team1_id UUID NOT NULL REFERENCES tt_teams(id),
    team2_id UUID NOT NULL REFERENCES tt_teams(id),
    scheduled_time TIMESTAMPTZ,
    actual_start_time TIMESTAMPTZ,
    actual_end_time TIMESTAMPTZ,
    status TEXT DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'in_progress', 'completed', 'cancelled', 'disputed')),
    winner_team_id UUID REFERENCES tt_teams(id),
    match_type TEXT DEFAULT 'tournament' CHECK (match_type IN ('tournament', 'league', 'friendly')),
    round_name TEXT, -- e.g., "Round 1", "Quarter Finals", "Semi Finals", "Finals"
    bracket_position INTEGER,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- Ensure teams don't play against themselves
    CONSTRAINT tt_matches_different_teams CHECK (team1_id != team2_id)
);

-- Create tt_match_series table for series tracking (each match can have multiple series)
CREATE TABLE IF NOT EXISTS tt_match_series (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    match_id UUID NOT NULL REFERENCES tt_matches(id) ON DELETE CASCADE,
    series_number INTEGER NOT NULL, -- 1, 2, 3, etc.
    team1_score INTEGER DEFAULT 0,
    team2_score INTEGER DEFAULT 0,
    winner_team_id UUID REFERENCES tt_teams(id),
    started_at TIMESTAMPTZ,
    ended_at TIMESTAMPTZ,
    status TEXT DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'in_progress', 'completed')),
    
    UNIQUE(match_id, series_number)
);

-- Create tt_match_rounds table for individual round tracking within series
CREATE TABLE IF NOT EXISTS tt_match_rounds (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    series_id UUID NOT NULL REFERENCES tt_match_series(id) ON DELETE CASCADE,
    round_number INTEGER NOT NULL,
    team1_score INTEGER DEFAULT 0,
    team2_score INTEGER DEFAULT 0,
    winner_team_id UUID REFERENCES tt_teams(id),
    started_at TIMESTAMPTZ,
    ended_at TIMESTAMPTZ,
    
    UNIQUE(series_id, round_number)
);

-- Create tt_player_stats table for individual player statistics
CREATE TABLE IF NOT EXISTS tt_player_stats (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    player_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    team_id UUID NOT NULL REFERENCES tt_teams(id) ON DELETE CASCADE,
    match_id UUID REFERENCES tt_matches(id) ON DELETE CASCADE,
    tournament_id UUID REFERENCES tt_tournaments(id) ON DELETE CASCADE,
    
    -- Round/Series stats
    round_wins INTEGER DEFAULT 0,
    round_losses INTEGER DEFAULT 0,
    series_wins INTEGER DEFAULT 0,
    series_losses INTEGER DEFAULT 0,
    
    -- Kill/Death stats
    kills INTEGER DEFAULT 0,
    deaths INTEGER DEFAULT 0,
    
    -- Stat type
    stat_type TEXT DEFAULT 'match' CHECK (stat_type IN ('match', 'tournament', 'season')),
    
    -- Dates
    recorded_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- Constraints for different stat types
    UNIQUE(player_id, match_id, stat_type) DEFERRABLE,
    UNIQUE(player_id, tournament_id, stat_type) DEFERRABLE
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_tt_teams_owner_id ON tt_teams(owner_id);
CREATE INDEX IF NOT EXISTS idx_tt_teams_active ON tt_teams(is_active);
CREATE INDEX IF NOT EXISTS idx_tt_teams_name ON tt_teams(team_name);

CREATE INDEX IF NOT EXISTS idx_tt_team_members_team_id ON tt_team_members(team_id);
CREATE INDEX IF NOT EXISTS idx_tt_team_members_player_id ON tt_team_members(player_id);
CREATE INDEX IF NOT EXISTS idx_tt_team_members_active ON tt_team_members(is_active);

CREATE INDEX IF NOT EXISTS idx_tt_tournaments_status ON tt_tournaments(status);
CREATE INDEX IF NOT EXISTS idx_tt_tournaments_dates ON tt_tournaments(start_date, end_date);

CREATE INDEX IF NOT EXISTS idx_tt_tournament_registrations_tournament_id ON tt_tournament_registrations(tournament_id);
CREATE INDEX IF NOT EXISTS idx_tt_tournament_registrations_team_id ON tt_tournament_registrations(team_id);

CREATE INDEX IF NOT EXISTS idx_tt_matches_tournament_id ON tt_matches(tournament_id);
CREATE INDEX IF NOT EXISTS idx_tt_matches_teams ON tt_matches(team1_id, team2_id);
CREATE INDEX IF NOT EXISTS idx_tt_matches_status ON tt_matches(status);
CREATE INDEX IF NOT EXISTS idx_tt_matches_scheduled_time ON tt_matches(scheduled_time);

CREATE INDEX IF NOT EXISTS idx_tt_match_series_match_id ON tt_match_series(match_id);
CREATE INDEX IF NOT EXISTS idx_tt_match_rounds_series_id ON tt_match_rounds(series_id);

CREATE INDEX IF NOT EXISTS idx_tt_player_stats_player_id ON tt_player_stats(player_id);
CREATE INDEX IF NOT EXISTS idx_tt_player_stats_team_id ON tt_player_stats(team_id);
CREATE INDEX IF NOT EXISTS idx_tt_player_stats_match_id ON tt_player_stats(match_id);
CREATE INDEX IF NOT EXISTS idx_tt_player_stats_tournament_id ON tt_player_stats(tournament_id);
CREATE INDEX IF NOT EXISTS idx_tt_player_stats_type ON tt_player_stats(stat_type);

-- Enable RLS
ALTER TABLE tt_teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE tt_team_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE tt_tournaments ENABLE ROW LEVEL SECURITY;
ALTER TABLE tt_tournament_registrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE tt_matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE tt_match_series ENABLE ROW LEVEL SECURITY;
ALTER TABLE tt_match_rounds ENABLE ROW LEVEL SECURITY;
ALTER TABLE tt_player_stats ENABLE ROW LEVEL SECURITY;

-- RLS Policies

-- tt_teams policies
CREATE POLICY "Anyone can view active teams" ON tt_teams 
    FOR SELECT USING (is_active = true);

CREATE POLICY "Authenticated users can create teams" ON tt_teams 
    FOR INSERT WITH CHECK (auth.uid() IS NOT NULL AND auth.uid() = owner_id);

CREATE POLICY "Team owners can update their teams" ON tt_teams 
    FOR UPDATE USING (auth.uid() = owner_id);

CREATE POLICY "Team owners can delete their teams" ON tt_teams 
    FOR DELETE USING (auth.uid() = owner_id);

-- tt_team_members policies
CREATE POLICY "Anyone can view team members" ON tt_team_members 
    FOR SELECT USING (true);

CREATE POLICY "Authenticated users can join teams" ON tt_team_members 
    FOR INSERT WITH CHECK (auth.uid() IS NOT NULL AND auth.uid() = player_id);

CREATE POLICY "Team members can update their membership" ON tt_team_members 
    FOR UPDATE USING (auth.uid() = player_id OR auth.uid() IN (
        SELECT owner_id FROM tt_teams WHERE id = team_id
    ));

CREATE POLICY "Team members and owners can remove membership" ON tt_team_members 
    FOR DELETE USING (auth.uid() = player_id OR auth.uid() IN (
        SELECT owner_id FROM tt_teams WHERE id = team_id
    ));

-- tt_tournaments policies
CREATE POLICY "Anyone can view tournaments" ON tt_tournaments 
    FOR SELECT USING (true);

CREATE POLICY "Admins can manage tournaments" ON tt_tournaments 
    FOR ALL USING (
        auth.uid() IN (
            SELECT id FROM profiles WHERE is_admin = true OR ctf_role = 'ctf_admin'
        )
    );

-- tt_tournament_registrations policies
CREATE POLICY "Anyone can view tournament registrations" ON tt_tournament_registrations 
    FOR SELECT USING (true);

CREATE POLICY "Team owners can register their teams" ON tt_tournament_registrations 
    FOR INSERT WITH CHECK (
        auth.uid() IS NOT NULL AND auth.uid() IN (
            SELECT owner_id FROM tt_teams WHERE id = team_id
        )
    );

-- tt_matches policies
CREATE POLICY "Anyone can view matches" ON tt_matches 
    FOR SELECT USING (true);

CREATE POLICY "Admins can manage matches" ON tt_matches 
    FOR ALL USING (
        auth.uid() IN (
            SELECT id FROM profiles WHERE is_admin = true OR ctf_role = 'ctf_admin'
        )
    );

-- tt_match_series policies
CREATE POLICY "Anyone can view match series" ON tt_match_series 
    FOR SELECT USING (true);

CREATE POLICY "Admins can manage match series" ON tt_match_series 
    FOR ALL USING (
        auth.uid() IN (
            SELECT id FROM profiles WHERE is_admin = true OR ctf_role = 'ctf_admin'
        )
    );

-- tt_match_rounds policies
CREATE POLICY "Anyone can view match rounds" ON tt_match_rounds 
    FOR SELECT USING (true);

CREATE POLICY "Admins can manage match rounds" ON tt_match_rounds 
    FOR ALL USING (
        auth.uid() IN (
            SELECT id FROM profiles WHERE is_admin = true OR ctf_role = 'ctf_admin'
        )
    );

-- tt_player_stats policies
CREATE POLICY "Anyone can view player stats" ON tt_player_stats 
    FOR SELECT USING (true);

CREATE POLICY "Admins can manage player stats" ON tt_player_stats 
    FOR ALL USING (
        auth.uid() IN (
            SELECT id FROM profiles WHERE is_admin = true OR ctf_role = 'ctf_admin'
        )
    );

-- Helper functions

-- Function to check team password
CREATE OR REPLACE FUNCTION tt_verify_team_password(team_name_input TEXT, password_input TEXT)
RETURNS BOOLEAN AS $$
DECLARE
    stored_hash TEXT;
BEGIN
    SELECT team_password_hash INTO stored_hash
    FROM tt_teams
    WHERE team_name = team_name_input AND is_active = true;
    
    IF stored_hash IS NULL THEN
        RETURN FALSE;
    END IF;
    
    RETURN crypt(password_input, stored_hash) = stored_hash;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get team member count
CREATE OR REPLACE FUNCTION tt_get_team_member_count(team_id_input UUID)
RETURNS INTEGER AS $$
BEGIN
    RETURN (
        SELECT COUNT(*)
        FROM tt_team_members
        WHERE team_id = team_id_input AND is_active = true
    );
END;
$$ LANGUAGE plpgsql;

-- Function to check if user can join team
CREATE OR REPLACE FUNCTION tt_can_join_team(team_id_input UUID, user_id_input UUID)
RETURNS BOOLEAN AS $$
DECLARE
    member_count INTEGER;
    team_max_players INTEGER;
    existing_membership INTEGER;
BEGIN
    -- Check if user is already a member
    SELECT COUNT(*) INTO existing_membership
    FROM tt_team_members
    WHERE team_id = team_id_input AND player_id = user_id_input AND is_active = true;
    
    IF existing_membership > 0 THEN
        RETURN FALSE;
    END IF;
    
    -- Check if team has space
    SELECT tt_teams.max_players INTO team_max_players FROM tt_teams WHERE id = team_id_input;
    SELECT tt_get_team_member_count(team_id_input) INTO member_count;
    
    RETURN member_count < team_max_players;
END;
$$ LANGUAGE plpgsql;

-- Create RPC functions for the frontend

-- Get teams with member count
CREATE OR REPLACE FUNCTION get_tt_teams_with_counts()
RETURNS TABLE (
    id UUID,
    team_name TEXT,
    team_banner_url TEXT,
    owner_id UUID,
    owner_alias TEXT,
    created_at TIMESTAMPTZ,
    is_active BOOLEAN,
    member_count BIGINT,
    max_players INTEGER
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        t.id,
        t.team_name,
        t.team_banner_url,
        t.owner_id,
        p.in_game_alias as owner_alias,
        t.created_at,
        t.is_active,
        COALESCE(m.member_count, 0) as member_count,
        t.max_players
    FROM tt_teams t
    LEFT JOIN profiles p ON t.owner_id = p.id
    LEFT JOIN (
        SELECT team_id, COUNT(*) as member_count
        FROM tt_team_members
        WHERE is_active = true
        GROUP BY team_id
    ) m ON t.id = m.team_id
    WHERE t.is_active = true
    ORDER BY t.created_at DESC;
END;
$$ LANGUAGE plpgsql;

-- Get team members with profiles
CREATE OR REPLACE FUNCTION get_tt_team_members(team_id_input UUID)
RETURNS TABLE (
    id UUID,
    player_id UUID,
    player_alias TEXT,
    player_avatar TEXT,
    joined_at TIMESTAMPTZ,
    role TEXT
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        tm.id,
        tm.player_id,
        p.in_game_alias as player_alias,
        p.avatar_url as player_avatar,
        tm.joined_at,
        tm.role
    FROM tt_team_members tm
    LEFT JOIN profiles p ON tm.player_id = p.id
    WHERE tm.team_id = team_id_input AND tm.is_active = true
    ORDER BY tm.joined_at ASC;
END;
$$ LANGUAGE plpgsql;

COMMENT ON TABLE tt_teams IS 'Triple Threat teams/pods - max 4 players each (3 active + 1 alternate)';
COMMENT ON TABLE tt_team_members IS 'Team membership tracking for Triple Threat league';
COMMENT ON TABLE tt_tournaments IS 'Tournament organization and bracket tracking';
COMMENT ON TABLE tt_matches IS 'Individual matches between teams';
COMMENT ON TABLE tt_match_series IS 'Series within matches (e.g., best of 3)';
COMMENT ON TABLE tt_match_rounds IS 'Individual rounds within each series';
COMMENT ON TABLE tt_player_stats IS 'Player statistics tracking for matches and tournaments';
