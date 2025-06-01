-- Simple function to get player aliases and their custom phrases
-- Run this in your Supabase SQL Editor

CREATE OR REPLACE FUNCTION get_simple_player_phrases()
RETURNS TABLE (
    in_game_alias TEXT,
    custom_phrase TEXT
) 
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        p.in_game_alias::TEXT,
        COALESCE(up.phrase, pr.phrase, 'BLOOP')::TEXT as custom_phrase
    FROM user_products up
    JOIN profiles p ON up.user_id = p.id
    JOIN products pr ON up.product_id = pr.id
    WHERE 
        p.in_game_alias IS NOT NULL 
        AND p.in_game_alias != ''
        AND up.status = 'active'
        AND (up.phrase IS NOT NULL OR pr.phrase IS NOT NULL)
    ORDER BY p.in_game_alias;
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION get_simple_player_phrases() TO anon, authenticated;

-- Even simpler direct query (not a function) - use this for testing:
/*
SELECT 
    p.in_game_alias::TEXT,
    COALESCE(up.phrase, pr.phrase, 'BLOOP')::TEXT as custom_phrase
FROM user_products up
JOIN profiles p ON up.user_id = p.id
JOIN products pr ON up.product_id = pr.id
WHERE 
    p.in_game_alias IS NOT NULL 
    AND p.in_game_alias != ''
    AND up.status = 'active'
    AND (up.phrase IS NOT NULL OR pr.phrase IS NOT NULL)
ORDER BY p.in_game_alias;
*/

-- Check what columns actually exist in your user_products table:
/*
SELECT column_name, data_type, is_nullable
FROM information_schema.columns 
WHERE table_name = 'user_products' 
ORDER BY ordinal_position;
*/ 