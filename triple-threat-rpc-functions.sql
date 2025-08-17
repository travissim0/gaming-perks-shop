-- Triple Threat RPC Functions
-- Execute these in your Supabase SQL editor

-- 1. Get all teams with member counts
CREATE OR REPLACE FUNCTION get_tt_teams_with_counts()
RETURNS TABLE (
    id uuid,
    team_name text,
    team_banner_url text,
    owner_id uuid,
    owner_alias text,
    created_at timestamptz,
    max_players integer,
    member_count bigint,
    is_active boolean
) 
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        t.id,
        t.team_name,
        t.team_banner_url,
        t.owner_id,
        COALESCE(p.in_game_alias, 'Unknown') as owner_alias,
        t.created_at,
        t.max_players,
        COALESCE(tm.member_count, 0) as member_count,
        t.is_active
    FROM tt_teams t
    LEFT JOIN profiles p ON t.owner_id = p.id
    LEFT JOIN (
        SELECT 
            team_id, 
            COUNT(*) as member_count
        FROM tt_team_members 
        WHERE is_active = true 
        GROUP BY team_id
    ) tm ON t.id = tm.team_id
    WHERE t.is_active = true
    ORDER BY t.created_at DESC;
END;
$$;

-- 2. Get team members for a specific team
CREATE OR REPLACE FUNCTION get_tt_team_members(team_id_input uuid)
RETURNS TABLE (
    id uuid,
    player_id uuid,
    player_alias text,
    player_avatar text,
    joined_at timestamptz,
    role text
) 
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        tm.id,
        tm.player_id,
        COALESCE(p.in_game_alias, 'Unknown') as player_alias,
        p.avatar_url as player_avatar,
        tm.joined_at,
        tm.role
    FROM tt_team_members tm
    LEFT JOIN profiles p ON tm.player_id = p.id
    WHERE tm.team_id = team_id_input 
    AND tm.is_active = true
    ORDER BY 
        CASE WHEN tm.role = 'owner' THEN 0 ELSE 1 END,
        tm.joined_at ASC;
END;
$$;

-- 3. Get user's current team
CREATE OR REPLACE FUNCTION get_user_tt_team(user_id_input uuid)
RETURNS TABLE (
    team_id uuid,
    team_name text,
    team_banner_url text,
    owner_id uuid,
    owner_alias text,
    created_at timestamptz,
    max_players integer,
    user_role text
) 
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        t.id as team_id,
        t.team_name,
        t.team_banner_url,
        t.owner_id,
        COALESCE(p.in_game_alias, 'Unknown') as owner_alias,
        t.created_at,
        t.max_players,
        tm.role as user_role
    FROM tt_team_members tm
    JOIN tt_teams t ON tm.team_id = t.id
    LEFT JOIN profiles p ON t.owner_id = p.id
    WHERE tm.player_id = user_id_input 
    AND tm.is_active = true 
    AND t.is_active = true
    LIMIT 1;
END;
$$;

-- 4. Join a team (with password verification)
CREATE OR REPLACE FUNCTION join_tt_team(
    user_id_input uuid,
    team_id_input uuid,
    password_input text
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    team_record record;
    current_members integer;
    result json;
BEGIN
    -- Check if user is already on a team
    IF EXISTS (
        SELECT 1 FROM tt_team_members 
        WHERE player_id = user_id_input AND is_active = true
    ) THEN
        RETURN json_build_object('success', false, 'error', 'Already on a team');
    END IF;

    -- Get team info and verify password
    SELECT * INTO team_record 
    FROM tt_teams 
    WHERE id = team_id_input AND is_active = true;
    
    IF NOT FOUND THEN
        RETURN json_build_object('success', false, 'error', 'Team not found');
    END IF;

    -- Verify password (assuming you have a password check function)
    IF NOT (team_record.team_password_hash = crypt(password_input, team_record.team_password_hash)) THEN
        RETURN json_build_object('success', false, 'error', 'Invalid password');
    END IF;

    -- Check if team is full
    SELECT COUNT(*) INTO current_members 
    FROM tt_team_members 
    WHERE team_id = team_id_input AND is_active = true;
    
    IF current_members >= team_record.max_players THEN
        RETURN json_build_object('success', false, 'error', 'Team is full');
    END IF;

    -- Add user to team
    INSERT INTO tt_team_members (team_id, player_id, role, joined_at, is_active)
    VALUES (team_id_input, user_id_input, 'member', NOW(), true);

    RETURN json_build_object('success', true, 'message', 'Successfully joined team');
EXCEPTION
    WHEN OTHERS THEN
        RETURN json_build_object('success', false, 'error', SQLERRM);
END;
$$;

-- 5. Create a match challenge
CREATE OR REPLACE FUNCTION create_tt_match_challenge(
    challenger_team_id uuid,
    opponent_team_id uuid,
    match_type_input text DEFAULT 'friendly'
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    -- Validate teams exist and are active
    IF NOT EXISTS (SELECT 1 FROM tt_teams WHERE id = challenger_team_id AND is_active = true) THEN
        RETURN json_build_object('success', false, 'error', 'Challenger team not found');
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM tt_teams WHERE id = opponent_team_id AND is_active = true) THEN
        RETURN json_build_object('success', false, 'error', 'Opponent team not found');
    END IF;

    -- Check for duplicate pending matches
    IF EXISTS (
        SELECT 1 FROM tt_matches 
        WHERE ((team1_id = challenger_team_id AND team2_id = opponent_team_id) 
               OR (team1_id = opponent_team_id AND team2_id = challenger_team_id))
        AND status = 'pending'
    ) THEN
        RETURN json_build_object('success', false, 'error', 'Match already pending between these teams');
    END IF;

    -- Create the match
    INSERT INTO tt_matches (
        team1_id, 
        team2_id, 
        match_type, 
        status, 
        scheduled_time
    ) VALUES (
        challenger_team_id, 
        opponent_team_id, 
        match_type_input, 
        'pending', 
        NULL
    );

    RETURN json_build_object('success', true, 'message', 'Challenge created successfully');
EXCEPTION
    WHEN OTHERS THEN
        RETURN json_build_object('success', false, 'error', SQLERRM);
END;
$$;

-- 6. Leave a team
CREATE OR REPLACE FUNCTION leave_tt_team(user_id_input uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    team_record record;
BEGIN
    -- Get user's current team membership
    SELECT tm.*, t.owner_id INTO team_record
    FROM tt_team_members tm
    JOIN tt_teams t ON tm.team_id = t.id
    WHERE tm.player_id = user_id_input AND tm.is_active = true
    LIMIT 1;
    
    IF NOT FOUND THEN
        RETURN json_build_object('success', false, 'error', 'Not on any team');
    END IF;

    -- Check if user is owner
    IF team_record.owner_id = user_id_input THEN
        RETURN json_build_object('success', false, 'error', 'Team owners cannot leave. Transfer ownership or disband team first.');
    END IF;

    -- Remove user from team
    UPDATE tt_team_members 
    SET is_active = false, updated_at = NOW()
    WHERE player_id = user_id_input AND is_active = true;

    RETURN json_build_object('success', true, 'message', 'Successfully left team');
EXCEPTION
    WHEN OTHERS THEN
        RETURN json_build_object('success', false, 'error', SQLERRM);
END;
$$;

-- Grant execute permissions to authenticated users
GRANT EXECUTE ON FUNCTION get_tt_teams_with_counts() TO authenticated;
GRANT EXECUTE ON FUNCTION get_tt_team_members(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION get_user_tt_team(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION join_tt_team(uuid, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION create_tt_match_challenge(uuid, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION leave_tt_team(uuid) TO authenticated;
