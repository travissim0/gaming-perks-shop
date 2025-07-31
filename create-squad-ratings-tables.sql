-- Squad Ratings System Database Schema
-- Creates tables for storing squad analysis and player ratings

-- Create squad_ratings table for storing analysis metadata
CREATE TABLE IF NOT EXISTS squad_ratings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    squad_id UUID NOT NULL REFERENCES squads(id) ON DELETE CASCADE,
    analyst_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    season_name TEXT NOT NULL,
    analysis_date DATE NOT NULL DEFAULT CURRENT_DATE,
    analyst_commentary TEXT,
    analyst_quote TEXT,
    breakdown_summary TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- Ensure one analysis per squad per season per analyst
    UNIQUE(squad_id, analyst_id, season_name)
);

-- Create player_ratings table for individual player assessments
CREATE TABLE IF NOT EXISTS player_ratings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    squad_rating_id UUID NOT NULL REFERENCES squad_ratings(id) ON DELETE CASCADE,
    player_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    rating DECIMAL(2,1) NOT NULL CHECK (rating >= 1.0 AND rating <= 6.0 AND rating * 10 % 5 = 0),
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- Ensure one rating per player per squad analysis
    UNIQUE(squad_rating_id, player_id)
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_squad_ratings_squad_id ON squad_ratings(squad_id);
CREATE INDEX IF NOT EXISTS idx_squad_ratings_analyst_id ON squad_ratings(analyst_id);
CREATE INDEX IF NOT EXISTS idx_squad_ratings_season ON squad_ratings(season_name);
CREATE INDEX IF NOT EXISTS idx_squad_ratings_date ON squad_ratings(analysis_date DESC);
CREATE INDEX IF NOT EXISTS idx_player_ratings_squad_rating_id ON player_ratings(squad_rating_id);
CREATE INDEX IF NOT EXISTS idx_player_ratings_player_id ON player_ratings(player_id);
CREATE INDEX IF NOT EXISTS idx_player_ratings_rating ON player_ratings(rating DESC);

-- Enable Row Level Security
ALTER TABLE squad_ratings ENABLE ROW LEVEL SECURITY;
ALTER TABLE player_ratings ENABLE ROW LEVEL SECURITY;

-- RLS Policies for squad_ratings
-- Anyone can read squad ratings
CREATE POLICY "Anyone can read squad ratings" ON squad_ratings
    FOR SELECT USING (true);

-- Only site admins and media managers can create/update/delete ratings
CREATE POLICY "Admins and media managers can manage squad ratings" ON squad_ratings
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM profiles 
            WHERE profiles.id = auth.uid() 
            AND (profiles.is_admin = true OR profiles.is_media_manager = true)
        )
    );

-- RLS Policies for player_ratings
-- Anyone can read player ratings
CREATE POLICY "Anyone can read player ratings" ON player_ratings
    FOR SELECT USING (true);

-- Only site admins and media managers can create/update/delete ratings
CREATE POLICY "Admins and media managers can manage player ratings" ON player_ratings
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM profiles 
            WHERE profiles.id = auth.uid() 
            AND (profiles.is_admin = true OR profiles.is_media_manager = true)
        )
    );

-- Create trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE OR REPLACE TRIGGER update_squad_ratings_updated_at 
    BEFORE UPDATE ON squad_ratings 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE OR REPLACE TRIGGER update_player_ratings_updated_at 
    BEFORE UPDATE ON player_ratings 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Create function to get squad ratings with analyst and squad info
CREATE OR REPLACE FUNCTION get_squad_ratings()
RETURNS TABLE (
    id UUID,
    squad_id UUID,
    squad_name TEXT,
    squad_tag TEXT,
    analyst_id UUID,
    analyst_alias TEXT,
    season_name TEXT,
    analysis_date DATE,
    analyst_commentary TEXT,
    analyst_quote TEXT,
    breakdown_summary TEXT,
    created_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ
) 
LANGUAGE SQL SECURITY DEFINER
AS $$
    SELECT 
        sr.id,
        sr.squad_id,
        s.name as squad_name,
        s.tag as squad_tag,
        sr.analyst_id,
        p.in_game_alias as analyst_alias,
        sr.season_name,
        sr.analysis_date,
        sr.analyst_commentary,
        sr.analyst_quote,
        sr.breakdown_summary,
        sr.created_at,
        sr.updated_at
    FROM squad_ratings sr
    JOIN squads s ON sr.squad_id = s.id
    JOIN profiles p ON sr.analyst_id = p.id
    ORDER BY sr.analysis_date DESC, sr.created_at DESC;
$$;

-- Create function to get player ratings for a specific squad rating
CREATE OR REPLACE FUNCTION get_player_ratings_for_squad(squad_rating_uuid UUID)
RETURNS TABLE (
    id UUID,
    player_id UUID,
    player_alias TEXT,
    rating DECIMAL(2,1),
    notes TEXT,
    created_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ
) 
LANGUAGE SQL SECURITY DEFINER
AS $$
    SELECT 
        pr.id,
        pr.player_id,
        p.in_game_alias as player_alias,
        pr.rating,
        pr.notes,
        pr.created_at,
        pr.updated_at
    FROM player_ratings pr
    JOIN profiles p ON pr.player_id = p.id
    WHERE pr.squad_rating_id = squad_rating_uuid
    ORDER BY pr.rating DESC, p.in_game_alias ASC;
$$;

-- Grant permissions
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT ALL ON squad_ratings TO authenticated;
GRANT ALL ON player_ratings TO authenticated;
GRANT EXECUTE ON FUNCTION get_squad_ratings() TO authenticated;
GRANT EXECUTE ON FUNCTION get_player_ratings_for_squad(UUID) TO authenticated;