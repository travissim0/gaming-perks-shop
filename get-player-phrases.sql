-- Supabase function to get active player phrases for game server
-- Run this in your Supabase SQL Editor

CREATE OR REPLACE FUNCTION get_player_phrases()
RETURNS TABLE (
    player_alias TEXT,
    phrase TEXT,
    expires_at TIMESTAMP WITH TIME ZONE,
    is_active BOOLEAN
) 
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        p.in_game_alias as player_alias,
        COALESCE(up.phrase, pr.phrase) as phrase,
        up.expires_at,
        CASE 
            WHEN up.status = 'active' AND (up.expires_at IS NULL OR up.expires_at > NOW()) THEN true
            ELSE false
        END as is_active
    FROM user_products up
    JOIN profiles p ON up.user_id = p.id
    JOIN products pr ON up.product_id = pr.id
    WHERE 
        p.in_game_alias IS NOT NULL 
        AND p.in_game_alias != ''
        AND (
            up.phrase IS NOT NULL 
            OR pr.phrase IS NOT NULL
        )
        -- Only include products that have phrases (either custom or default)
        AND (up.phrase IS NOT NULL AND up.phrase != '' OR pr.phrase IS NOT NULL AND pr.phrase != '')
    ORDER BY p.in_game_alias;
END;
$$;

-- Alternative simpler version if you want to include all products with phrases
-- Uncomment this version if the above doesn't work or you prefer it:
/*
CREATE OR REPLACE FUNCTION get_player_phrases()
RETURNS TABLE (
    player_alias TEXT,
    phrase TEXT,
    expires_at TIMESTAMP WITH TIME ZONE,
    is_active BOOLEAN
) 
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        p.in_game_alias as player_alias,
        CASE 
            WHEN up.phrase IS NOT NULL AND up.phrase != '' THEN up.phrase
            WHEN pr.phrase IS NOT NULL AND pr.phrase != '' THEN pr.phrase
            ELSE 'BLOOP'
        END as phrase,
        up.expires_at,
        CASE 
            WHEN up.status = 'active' AND (up.expires_at IS NULL OR up.expires_at > NOW()) THEN true
            ELSE false
        END as is_active
    FROM user_products up
    JOIN profiles p ON up.user_id = p.id
    JOIN products pr ON up.product_id = pr.id
    WHERE 
        p.in_game_alias IS NOT NULL 
        AND p.in_game_alias != ''
        AND up.status = 'active'
    ORDER BY p.in_game_alias;
END;
$$;
*/

-- Grant execute permission to anon and authenticated users
GRANT EXECUTE ON FUNCTION get_player_phrases() TO anon, authenticated;

-- Create an RLS policy for this function (since it uses SECURITY DEFINER)
-- This allows the function to bypass RLS but still be callable by anyone
COMMENT ON FUNCTION get_player_phrases() IS 'Public function to retrieve active player phrases for game server integration'; 