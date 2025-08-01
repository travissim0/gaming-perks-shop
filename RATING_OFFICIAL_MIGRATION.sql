-- Add Official/Unofficial Flag to Squad Ratings System
-- Execute this in your Supabase SQL Editor
-- Adds is_official boolean column and marks existing ratings as unofficial

-- Add the is_official column to squad_ratings table
ALTER TABLE squad_ratings 
ADD COLUMN is_official BOOLEAN NOT NULL DEFAULT FALSE;

-- Mark all existing ratings as unofficial
UPDATE squad_ratings 
SET is_official = FALSE;

-- Update the get_squad_ratings function to include is_official field
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
    is_official BOOLEAN,
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
        sr.is_official,
        sr.created_at,
        sr.updated_at
    FROM squad_ratings sr
    JOIN squads s ON sr.squad_id = s.id
    JOIN profiles p ON sr.analyst_id = p.id
    ORDER BY sr.is_official DESC, sr.analysis_date DESC, sr.created_at DESC;
$$;

-- Add index for performance on official/unofficial filtering
CREATE INDEX IF NOT EXISTS idx_squad_ratings_is_official ON squad_ratings(is_official);

-- Update table comment for documentation
COMMENT ON COLUMN squad_ratings.is_official IS 
    'Flag to distinguish between official ratings (panel reviews) and unofficial ratings (individual opinions)';

-- Grant permissions (maintain existing access)
GRANT EXECUTE ON FUNCTION get_squad_ratings() TO authenticated;