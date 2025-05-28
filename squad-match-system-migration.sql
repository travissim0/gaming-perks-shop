-- Squad and Match Management System Migration
-- Run this in Supabase SQL Editor

-- Create squads table
CREATE TABLE IF NOT EXISTS squads (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    name VARCHAR(100) NOT NULL UNIQUE,
    tag VARCHAR(10) NOT NULL UNIQUE, -- Squad tag like [TAG]
    description TEXT,
    captain_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    is_active BOOLEAN DEFAULT true,
    max_members INTEGER DEFAULT 20,
    logo_url TEXT, -- Optional squad logo
    discord_link TEXT,
    website_link TEXT
);

-- Create squad_members table
CREATE TABLE IF NOT EXISTS squad_members (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    squad_id UUID NOT NULL REFERENCES squads(id) ON DELETE CASCADE,
    player_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    role VARCHAR(20) NOT NULL DEFAULT 'player', -- 'captain', 'co_captain', 'player'
    joined_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    invited_by UUID REFERENCES profiles(id),
    invite_message TEXT,
    status VARCHAR(20) NOT NULL DEFAULT 'active', -- 'active', 'inactive', 'kicked'
    UNIQUE(squad_id, player_id)
);

-- Create squad_invites table
CREATE TABLE IF NOT EXISTS squad_invites (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    squad_id UUID NOT NULL REFERENCES squads(id) ON DELETE CASCADE,
    invited_player_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    invited_by UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    message TEXT,
    status VARCHAR(20) NOT NULL DEFAULT 'pending', -- 'pending', 'accepted', 'declined', 'expired'
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    expires_at TIMESTAMP WITH TIME ZONE DEFAULT (NOW() + INTERVAL '7 days'),
    responded_at TIMESTAMP WITH TIME ZONE,
    UNIQUE(squad_id, invited_player_id, status) -- Prevent duplicate pending invites
);

-- Create matches table
CREATE TABLE IF NOT EXISTS matches (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    title VARCHAR(200) NOT NULL,
    description TEXT,
    match_type VARCHAR(50) NOT NULL, -- 'squad_vs_squad', 'tournament', 'scrim', 'event'
    status VARCHAR(20) NOT NULL DEFAULT 'scheduled', -- 'scheduled', 'in_progress', 'completed', 'cancelled'
    scheduled_at TIMESTAMP WITH TIME ZONE NOT NULL,
    duration_minutes INTEGER DEFAULT 60,
    max_participants INTEGER DEFAULT 20,
    created_by UUID NOT NULL REFERENCES profiles(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Match details
    map_name VARCHAR(100),
    game_mode VARCHAR(50),
    server_info TEXT,
    rules TEXT,
    prize_info TEXT,
    
    -- Squad vs Squad specific
    squad_a_id UUID REFERENCES squads(id),
    squad_b_id UUID REFERENCES squads(id),
    winner_squad_id UUID REFERENCES squads(id),
    
    -- Scores
    squad_a_score INTEGER DEFAULT 0,
    squad_b_score INTEGER DEFAULT 0,
    
    -- Match completion
    completed_at TIMESTAMP WITH TIME ZONE,
    match_result JSONB -- Store detailed match results
);

-- Create match_participants table
CREATE TABLE IF NOT EXISTS match_participants (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    match_id UUID NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
    player_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    role VARCHAR(20) NOT NULL, -- 'player', 'commentator', 'referee', 'recorder'
    squad_id UUID REFERENCES squads(id), -- Which squad they're representing (if any)
    signed_up_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    status VARCHAR(20) NOT NULL DEFAULT 'confirmed', -- 'confirmed', 'maybe', 'declined', 'no_show'
    notes TEXT,
    UNIQUE(match_id, player_id, role)
);

-- Create match_comments table for match discussions
CREATE TABLE IF NOT EXISTS match_comments (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    match_id UUID NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
    author_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    is_edited BOOLEAN DEFAULT false,
    parent_comment_id UUID REFERENCES match_comments(id) -- For replies
);

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_squads_captain ON squads(captain_id);
CREATE INDEX IF NOT EXISTS idx_squads_active ON squads(is_active);
CREATE INDEX IF NOT EXISTS idx_squad_members_squad ON squad_members(squad_id);
CREATE INDEX IF NOT EXISTS idx_squad_members_player ON squad_members(player_id);
CREATE INDEX IF NOT EXISTS idx_squad_members_role ON squad_members(role);
CREATE INDEX IF NOT EXISTS idx_squad_invites_player ON squad_invites(invited_player_id);
CREATE INDEX IF NOT EXISTS idx_squad_invites_status ON squad_invites(status);
CREATE INDEX IF NOT EXISTS idx_matches_scheduled ON matches(scheduled_at);
CREATE INDEX IF NOT EXISTS idx_matches_status ON matches(status);
CREATE INDEX IF NOT EXISTS idx_matches_type ON matches(match_type);
CREATE INDEX IF NOT EXISTS idx_match_participants_match ON match_participants(match_id);
CREATE INDEX IF NOT EXISTS idx_match_participants_player ON match_participants(player_id);
CREATE INDEX IF NOT EXISTS idx_match_comments_match ON match_comments(match_id);

-- Add RLS (Row Level Security) policies
ALTER TABLE squads ENABLE ROW LEVEL SECURITY;
ALTER TABLE squad_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE squad_invites ENABLE ROW LEVEL SECURITY;
ALTER TABLE matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE match_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE match_comments ENABLE ROW LEVEL SECURITY;

-- Squads policies
CREATE POLICY "Squads are viewable by everyone" ON squads FOR SELECT USING (true);
CREATE POLICY "Users can create squads" ON squads FOR INSERT WITH CHECK (auth.uid() = captain_id);
CREATE POLICY "Captains can update their squads" ON squads FOR UPDATE USING (auth.uid() = captain_id);
CREATE POLICY "Captains can delete their squads" ON squads FOR DELETE USING (auth.uid() = captain_id);

-- Squad members policies
CREATE POLICY "Squad members are viewable by everyone" ON squad_members FOR SELECT USING (true);
CREATE POLICY "Captains and co-captains can manage members" ON squad_members FOR ALL USING (
    EXISTS (
        SELECT 1 FROM squad_members sm 
        WHERE sm.squad_id = squad_members.squad_id 
        AND sm.player_id = auth.uid() 
        AND sm.role IN ('captain', 'co_captain')
        AND sm.status = 'active'
    )
);

-- Squad invites policies
CREATE POLICY "Users can view their own invites" ON squad_invites FOR SELECT USING (
    auth.uid() = invited_player_id OR 
    EXISTS (
        SELECT 1 FROM squad_members sm 
        WHERE sm.squad_id = squad_invites.squad_id 
        AND sm.player_id = auth.uid() 
        AND sm.role IN ('captain', 'co_captain')
        AND sm.status = 'active'
    )
);
CREATE POLICY "Captains and co-captains can create invites" ON squad_invites FOR INSERT WITH CHECK (
    EXISTS (
        SELECT 1 FROM squad_members sm 
        WHERE sm.squad_id = squad_invites.squad_id 
        AND sm.player_id = auth.uid() 
        AND sm.role IN ('captain', 'co_captain')
        AND sm.status = 'active'
    )
);
CREATE POLICY "Users can respond to their invites" ON squad_invites FOR UPDATE USING (auth.uid() = invited_player_id);

-- Matches policies
CREATE POLICY "Matches are viewable by everyone" ON matches FOR SELECT USING (true);
CREATE POLICY "Authenticated users can create matches" ON matches FOR INSERT WITH CHECK (auth.uid() = created_by);
CREATE POLICY "Match creators can update their matches" ON matches FOR UPDATE USING (auth.uid() = created_by);

-- Match participants policies
CREATE POLICY "Match participants are viewable by everyone" ON match_participants FOR SELECT USING (true);
CREATE POLICY "Users can sign up for matches" ON match_participants FOR INSERT WITH CHECK (auth.uid() = player_id);
CREATE POLICY "Users can update their own participation" ON match_participants FOR UPDATE USING (auth.uid() = player_id);
CREATE POLICY "Match creators can manage participants" ON match_participants FOR ALL USING (
    EXISTS (SELECT 1 FROM matches m WHERE m.id = match_participants.match_id AND m.created_by = auth.uid())
);

-- Match comments policies
CREATE POLICY "Match comments are viewable by everyone" ON match_comments FOR SELECT USING (true);
CREATE POLICY "Authenticated users can comment" ON match_comments FOR INSERT WITH CHECK (auth.uid() = author_id);
CREATE POLICY "Users can update their own comments" ON match_comments FOR UPDATE USING (auth.uid() = author_id);
CREATE POLICY "Users can delete their own comments" ON match_comments FOR DELETE USING (auth.uid() = author_id);

-- Create functions for common operations
CREATE OR REPLACE FUNCTION get_free_agents()
RETURNS TABLE (
    id UUID,
    in_game_alias TEXT,
    email TEXT,
    created_at TIMESTAMP WITH TIME ZONE
) AS $$
BEGIN
    RETURN QUERY
    SELECT p.id, p.in_game_alias, p.email, p.created_at
    FROM profiles p
    WHERE p.id NOT IN (
        SELECT sm.player_id 
        FROM squad_members sm 
        WHERE sm.status = 'active'
    )
    AND p.registration_status = 'completed'
    ORDER BY p.in_game_alias;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create function to get squad hierarchy
CREATE OR REPLACE FUNCTION get_squad_members_with_roles(squad_uuid UUID)
RETURNS TABLE (
    id UUID,
    in_game_alias TEXT,
    role TEXT,
    joined_at TIMESTAMP WITH TIME ZONE,
    is_online BOOLEAN
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        p.id,
        p.in_game_alias,
        sm.role,
        sm.joined_at,
        false as is_online -- TODO: Implement online status
    FROM squad_members sm
    JOIN profiles p ON p.id = sm.player_id
    WHERE sm.squad_id = squad_uuid
    AND sm.status = 'active'
    ORDER BY 
        CASE sm.role 
            WHEN 'captain' THEN 1
            WHEN 'co_captain' THEN 2
            ELSE 3
        END,
        sm.joined_at;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER; 