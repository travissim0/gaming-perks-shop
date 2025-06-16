-- Optimize Squad Queries with Database Functions
-- This creates efficient database functions to replace complex frontend queries
-- Run this in Supabase SQL Editor after fixing RLS policies

-- Drop existing function first to avoid return type conflicts
DROP FUNCTION IF EXISTS get_active_squads_optimized();

-- Function to get all active squads with member counts efficiently
CREATE OR REPLACE FUNCTION get_active_squads_optimized()
RETURNS TABLE (
    id UUID,
    name CHARACTER VARYING(100),
    tag CHARACTER VARYING(10),
    description TEXT,
    discord_link TEXT,
    website_link TEXT,
    captain_id UUID,
    captain_alias TEXT,
    created_at TIMESTAMP WITH TIME ZONE,
    banner_url TEXT,
    member_count BIGINT
) 
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        s.id,
        s.name,
        s.tag,
        s.description,
        s.discord_link,
        s.website_link,
        s.captain_id,
        COALESCE(p.in_game_alias, 'Unknown') as captain_alias,
        s.created_at,
        s.banner_url,
        COALESCE(member_counts.count, 0) as member_count
    FROM squads s
    LEFT JOIN profiles p ON p.id = s.captain_id
    LEFT JOIN (
        SELECT 
            sm.squad_id, 
            COUNT(*) as count
        FROM squad_members sm 
        WHERE sm.status = 'active'
        GROUP BY sm.squad_id
    ) member_counts ON member_counts.squad_id = s.id
    WHERE s.is_active = true
    ORDER BY s.created_at DESC;
END;
$$;

-- Drop existing function first to avoid return type conflicts
DROP FUNCTION IF EXISTS get_user_squad_optimized(UUID);

-- Function to get user's squad efficiently
CREATE OR REPLACE FUNCTION get_user_squad_optimized(user_id_param UUID)
RETURNS TABLE (
    squad_id UUID,
    squad_name CHARACTER VARYING(100),
    squad_tag CHARACTER VARYING(10),
    squad_description TEXT,
    squad_discord_link TEXT,
    squad_website_link TEXT,
    squad_captain_id UUID,
    squad_created_at TIMESTAMP WITH TIME ZONE,
    squad_banner_url TEXT,
    member_id UUID,
    member_role CHARACTER VARYING(20),
    member_joined_at TIMESTAMP WITH TIME ZONE
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        s.id as squad_id,
        s.name as squad_name,
        s.tag as squad_tag,
        s.description as squad_description,
        s.discord_link as squad_discord_link,
        s.website_link as squad_website_link,
        s.captain_id as squad_captain_id,
        s.created_at as squad_created_at,
        s.banner_url as squad_banner_url,
        sm.id as member_id,
        sm.role as member_role,
        sm.joined_at as member_joined_at
    FROM squad_members sm
    INNER JOIN squads s ON s.id = sm.squad_id
    WHERE sm.player_id = user_id_param 
      AND sm.status = 'active'
      AND s.is_active = true
    LIMIT 1;
END;
$$;

-- Drop existing function first to avoid return type conflicts  
DROP FUNCTION IF EXISTS get_squad_members_optimized(UUID);

-- Function to get squad members efficiently
CREATE OR REPLACE FUNCTION get_squad_members_optimized(squad_id_param UUID)
RETURNS TABLE (
    member_id UUID,
    player_id UUID,
    player_alias TEXT,
    role CHARACTER VARYING(20),
    joined_at TIMESTAMP WITH TIME ZONE
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        sm.id as member_id,
        sm.player_id,
        COALESCE(p.in_game_alias, 'Unknown') as player_alias,
        sm.role,
        sm.joined_at
    FROM squad_members sm
    INNER JOIN profiles p ON p.id = sm.player_id
    WHERE sm.squad_id = squad_id_param 
      AND sm.status = 'active'
    ORDER BY 
        CASE sm.role 
            WHEN 'captain' THEN 1
            WHEN 'co_captain' THEN 2
            ELSE 3
        END,
        sm.joined_at ASC;
END;
$$;

-- Drop existing function first to avoid return type conflicts
DROP FUNCTION IF EXISTS get_free_agents_optimized();

-- Function to get free agents efficiently
CREATE OR REPLACE FUNCTION get_free_agents_optimized()
RETURNS TABLE (
    player_id UUID,
    in_game_alias TEXT,
    email TEXT,
    created_at TIMESTAMP WITH TIME ZONE
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        p.id as player_id,
        p.in_game_alias,
        p.email,
        p.created_at
    FROM profiles p
    WHERE p.id NOT IN (
        SELECT DISTINCT sm.player_id 
        FROM squad_members sm 
        WHERE sm.status = 'active'
    )
    AND p.in_game_alias IS NOT NULL
    AND p.in_game_alias != ''
    ORDER BY p.in_game_alias ASC
    LIMIT 100; -- Reasonable limit
END;
$$;

-- Drop existing function first to avoid return type conflicts
DROP FUNCTION IF EXISTS get_squad_invitations_optimized(UUID);

-- Function to get squad invitations efficiently
CREATE OR REPLACE FUNCTION get_squad_invitations_optimized(user_id_param UUID)
RETURNS TABLE (
    invite_id UUID,
    squad_id UUID,
    squad_name CHARACTER VARYING(100),
    squad_tag CHARACTER VARYING(10),
    inviter_alias TEXT,
    message TEXT,
    created_at TIMESTAMP WITH TIME ZONE,
    expires_at TIMESTAMP WITH TIME ZONE,
    status CHARACTER VARYING(20)
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        si.id as invite_id,
        si.squad_id,
        s.name as squad_name,
        s.tag as squad_tag,
        COALESCE(p.in_game_alias, 'Unknown') as inviter_alias,
        si.message,
        si.created_at,
        si.expires_at,
        si.status
    FROM squad_invites si
    INNER JOIN squads s ON s.id = si.squad_id
    LEFT JOIN profiles p ON p.id = si.invited_by
    WHERE si.invited_player_id = user_id_param
      AND si.status = 'pending'
      AND si.expires_at > NOW()
      AND s.is_active = true
    ORDER BY si.created_at DESC;
END;
$$;

-- Drop existing function first to avoid return type conflicts
DROP FUNCTION IF EXISTS get_join_requests_for_squad_optimized(UUID);

-- Function to get join requests for a squad efficiently
CREATE OR REPLACE FUNCTION get_join_requests_for_squad_optimized(squad_id_param UUID)
RETURNS TABLE (
    request_id UUID,
    player_id UUID,
    player_alias TEXT,
    message TEXT,
    created_at TIMESTAMP WITH TIME ZONE,
    expires_at TIMESTAMP WITH TIME ZONE
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        si.id as request_id,
        si.invited_player_id as player_id,
        COALESCE(p.in_game_alias, 'Unknown') as player_alias,
        si.message,
        si.created_at,
        si.expires_at
    FROM squad_invites si
    INNER JOIN profiles p ON p.id = si.invited_player_id
    WHERE si.squad_id = squad_id_param
      AND si.invited_by = si.invited_player_id -- Self-requests
      AND si.status = 'pending'
      AND si.expires_at > NOW()
    ORDER BY si.created_at DESC;
END;
$$;

-- Drop existing function first to avoid return type conflicts
DROP FUNCTION IF EXISTS get_squad_details_optimized(UUID);

-- Function to get squad details efficiently
CREATE OR REPLACE FUNCTION get_squad_details_optimized(squad_id_param UUID)
RETURNS TABLE (
    squad_id UUID,
    name CHARACTER VARYING(100),
    tag CHARACTER VARYING(10),
    description TEXT,
    discord_link TEXT,
    website_link TEXT,
    captain_id UUID,
    captain_alias TEXT,
    created_at TIMESTAMP WITH TIME ZONE,
    banner_url TEXT,
    member_count BIGINT,
    max_members INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        s.id as squad_id,
        s.name,
        s.tag,
        s.description,
        s.discord_link,
        s.website_link,
        s.captain_id,
        COALESCE(p.in_game_alias, 'Unknown') as captain_alias,
        s.created_at,
        s.banner_url,
        COALESCE(member_counts.count, 0) as member_count,
        s.max_members
    FROM squads s
    LEFT JOIN profiles p ON p.id = s.captain_id
    LEFT JOIN (
        SELECT 
            sm.squad_id, 
            COUNT(*) as count
        FROM squad_members sm 
        WHERE sm.status = 'active'
        GROUP BY sm.squad_id
    ) member_counts ON member_counts.squad_id = s.id
    WHERE s.id = squad_id_param
      AND s.is_active = true;
END;
$$;

-- Grant execute permissions to authenticated users
GRANT EXECUTE ON FUNCTION get_active_squads_optimized() TO authenticated;
GRANT EXECUTE ON FUNCTION get_user_squad_optimized(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION get_squad_members_optimized(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION get_free_agents_optimized() TO authenticated;
GRANT EXECUTE ON FUNCTION get_squad_invitations_optimized(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION get_join_requests_for_squad_optimized(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION get_squad_details_optimized(UUID) TO authenticated;

-- Grant execute permissions to anonymous users for public functions
GRANT EXECUTE ON FUNCTION get_active_squads_optimized() TO anon;
GRANT EXECUTE ON FUNCTION get_squad_details_optimized(UUID) TO anon;
GRANT EXECUTE ON FUNCTION get_squad_members_optimized(UUID) TO anon;

-- Create materialized view for squad statistics (optional, for even better performance)
CREATE MATERIALIZED VIEW IF NOT EXISTS squad_stats_mv AS
SELECT 
    s.id as squad_id,
    s.name,
    s.tag,
    COUNT(sm.id) as member_count,
    s.created_at,
    s.updated_at
FROM squads s
LEFT JOIN squad_members sm ON sm.squad_id = s.id AND sm.status = 'active'
WHERE s.is_active = true
GROUP BY s.id, s.name, s.tag, s.created_at, s.updated_at;

-- Create index on materialized view
CREATE UNIQUE INDEX IF NOT EXISTS idx_squad_stats_mv_squad_id ON squad_stats_mv(squad_id);

-- Function to refresh materialized view (call this periodically or on updates)
CREATE OR REPLACE FUNCTION refresh_squad_stats()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    REFRESH MATERIALIZED VIEW CONCURRENTLY squad_stats_mv;
END;
$$;

-- Grant execute permission for refresh function
GRANT EXECUTE ON FUNCTION refresh_squad_stats() TO authenticated;

SELECT 'Squad query optimization functions created successfully!' as status; 