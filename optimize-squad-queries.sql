-- Optimize Squad Queries - Fix Slow Performance Issues
-- Run this in your Supabase SQL Editor

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_squad_members_squad_id_status ON squad_members(squad_id, status);
CREATE INDEX IF NOT EXISTS idx_squad_members_player_id_status ON squad_members(player_id, status);
CREATE INDEX IF NOT EXISTS idx_squad_invites_invited_player_status ON squad_invites(invited_player_id, status);
CREATE INDEX IF NOT EXISTS idx_squad_invites_squad_id_status ON squad_invites(squad_id, status);
CREATE INDEX IF NOT EXISTS idx_squads_active_created ON squads(is_active, created_at);

-- Function to get all squads with member counts and captain info in one query
CREATE OR REPLACE FUNCTION get_all_squads_optimized()
RETURNS TABLE (
  squad_id UUID,
  squad_name TEXT,
  squad_tag TEXT,
  squad_description TEXT,
  discord_link TEXT,
  website_link TEXT,
  captain_id UUID,
  captain_alias TEXT,
  created_at TIMESTAMPTZ,
  banner_url TEXT,
  member_count BIGINT
)
LANGUAGE SQL
STABLE
AS $$
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
  LEFT JOIN profiles p ON s.captain_id = p.id
  LEFT JOIN (
    SELECT 
      squad_id, 
      COUNT(*) as count
    FROM squad_members 
    WHERE status = 'active'
    GROUP BY squad_id
  ) member_counts ON s.id = member_counts.squad_id
  WHERE s.is_active = true
  ORDER BY member_counts.count DESC NULLS LAST, s.created_at DESC;
$$;

-- Function to get squad members with profiles in one query
CREATE OR REPLACE FUNCTION get_squad_members_optimized(squad_id_param UUID)
RETURNS TABLE (
  member_id UUID,
  player_id UUID,
  in_game_alias TEXT,
  role TEXT,
  joined_at TIMESTAMPTZ
)
LANGUAGE SQL
STABLE
AS $$
  SELECT 
    sm.id,
    sm.player_id,
    COALESCE(p.in_game_alias, 'Unknown') as in_game_alias,
    sm.role,
    sm.joined_at
  FROM squad_members sm
  LEFT JOIN profiles p ON sm.player_id = p.id
  WHERE sm.squad_id = squad_id_param 
    AND sm.status = 'active'
  ORDER BY 
    CASE sm.role 
      WHEN 'captain' THEN 1 
      WHEN 'co_captain' THEN 2 
      ELSE 3 
    END,
    sm.joined_at;
$$;

-- Function to get user's squad with all details
CREATE OR REPLACE FUNCTION get_user_squad_optimized(user_id_param UUID)
RETURNS TABLE (
  squad_id UUID,
  squad_name TEXT,
  squad_tag TEXT,
  squad_description TEXT,
  discord_link TEXT,
  website_link TEXT,
  captain_id UUID,
  created_at TIMESTAMPTZ,
  banner_url TEXT,
  member_count BIGINT
)
LANGUAGE SQL
STABLE
AS $$
  SELECT 
    s.id,
    s.name,
    s.tag,
    s.description,
    s.discord_link,
    s.website_link,
    s.captain_id,
    s.created_at,
    s.banner_url,
    COALESCE(member_counts.count, 0) as member_count
  FROM squad_members sm
  INNER JOIN squads s ON sm.squad_id = s.id
  LEFT JOIN (
    SELECT 
      squad_id, 
      COUNT(*) as count
    FROM squad_members 
    WHERE status = 'active'
    GROUP BY squad_id
  ) member_counts ON s.id = member_counts.squad_id
  WHERE sm.player_id = user_id_param 
    AND sm.status = 'active'
    AND s.is_active = true
  LIMIT 1;
$$;

-- Function to get free agents efficiently
CREATE OR REPLACE FUNCTION get_free_agents_optimized()
RETURNS TABLE (
  player_id UUID,
  in_game_alias TEXT,
  email TEXT,
  created_at TIMESTAMPTZ
)
LANGUAGE SQL
STABLE
AS $$
  SELECT 
    p.id,
    p.in_game_alias,
    p.email,
    p.created_at
  FROM profiles p
  WHERE p.in_game_alias IS NOT NULL 
    AND p.in_game_alias != ''
    AND NOT EXISTS (
      SELECT 1 
      FROM squad_members sm 
      WHERE sm.player_id = p.id 
        AND sm.status = 'active'
    )
  ORDER BY p.created_at DESC
  LIMIT 20;
$$;

-- Function to get squad invitations with all related data
CREATE OR REPLACE FUNCTION get_squad_invitations_optimized(user_id_param UUID)
RETURNS TABLE (
  invite_id UUID,
  squad_id UUID,
  squad_name TEXT,
  squad_tag TEXT,
  invited_by UUID,
  inviter_alias TEXT,
  message TEXT,
  created_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  status TEXT
)
LANGUAGE SQL
STABLE
AS $$
  SELECT 
    si.id,
    si.squad_id,
    s.name,
    s.tag,
    si.invited_by,
    COALESCE(p.in_game_alias, 'Unknown') as inviter_alias,
    si.message,
    si.created_at,
    si.expires_at,
    si.status
  FROM squad_invites si
  INNER JOIN squads s ON si.squad_id = s.id
  LEFT JOIN profiles p ON si.invited_by = p.id
  WHERE si.invited_player_id = user_id_param
    AND si.status = 'pending'
    AND si.invited_by != user_id_param
    AND si.expires_at > NOW()
  ORDER BY si.created_at DESC;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION get_all_squads_optimized() TO authenticated;
GRANT EXECUTE ON FUNCTION get_squad_members_optimized(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION get_user_squad_optimized(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION get_free_agents_optimized() TO authenticated;
GRANT EXECUTE ON FUNCTION get_squad_invitations_optimized(UUID) TO authenticated; 