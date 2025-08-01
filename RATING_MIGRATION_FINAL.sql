-- Squad Ratings Official/Unofficial System Migration
-- Execute this in your Supabase SQL Editor

-- Step 1: Add is_official column if it doesn't exist
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'squad_ratings' 
        AND column_name = 'is_official'
    ) THEN
        ALTER TABLE squad_ratings 
        ADD COLUMN is_official BOOLEAN NOT NULL DEFAULT FALSE;
    END IF;
END $$;

-- Step 2: Mark all existing ratings as unofficial
UPDATE squad_ratings 
SET is_official = FALSE;

-- Step 3: Drop existing function if it exists
DROP FUNCTION IF EXISTS get_squad_ratings();

-- Step 4: Create new function with is_official field
CREATE FUNCTION get_squad_ratings()
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

-- Step 5: Add performance index
CREATE INDEX IF NOT EXISTS idx_squad_ratings_is_official ON squad_ratings(is_official);

-- Step 6: Update all existing season names to CTFPL Season 22
UPDATE squad_ratings 
SET season_name = 'CTFPL Season 22'
WHERE season_name IS NOT NULL;

-- Step 7: Add documentation comments
COMMENT ON COLUMN squad_ratings.is_official IS 
    'Flag to distinguish between official ratings (panel reviews) and unofficial ratings (individual opinions)';

COMMENT ON COLUMN squad_ratings.season_name IS 
    'Season name must be selected from predefined list (currently: CTFPL Season 22)';

-- Step 8: Grant permissions
GRANT EXECUTE ON FUNCTION get_squad_ratings() TO authenticated;