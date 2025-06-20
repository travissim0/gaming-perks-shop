-- Auto-Match Creation System (Final - Uses existing admin or NULL)
-- This script creates match entries from player stats using existing users

-- Function to create a match from game stats
CREATE OR REPLACE FUNCTION create_match_from_game_stats(game_id_param VARCHAR)
RETURNS UUID AS $$
DECLARE
    match_uuid UUID;
    game_info RECORD;
    game_title VARCHAR;
    game_description VARCHAR;
    admin_user_id UUID;
BEGIN
    -- Get game information
    SELECT 
        game_mode,
        arena_name,
        game_date,
        COUNT(*) as total_players
    INTO game_info
    FROM player_stats 
    WHERE game_id = game_id_param 
    GROUP BY game_mode, arena_name, game_date
    LIMIT 1;
    
    -- Check if game info was found
    IF game_info IS NULL THEN
        RAISE EXCEPTION 'No game data found for game_id: %', game_id_param;
    END IF;
    
    -- Find an admin user to use as creator
    SELECT id INTO admin_user_id
    FROM profiles 
    WHERE is_admin = true 
    LIMIT 1;
    
    -- Create match title and description
    game_title := COALESCE(game_info.game_mode, 'Game') || ' - ' || COALESCE(game_info.arena_name, 'Unknown Arena');
    game_description := 'Auto-logged game from ' || game_info.game_date::date || ' with ' || game_info.total_players || ' players';
    
    -- Generate UUID for new match
    match_uuid := gen_random_uuid();
    
    -- Create the match entry using actual table columns
    INSERT INTO matches (
        id,
        title,
        description,
        match_type,
        status,
        scheduled_at,
        game_mode,
        map_name,
        game_id,
        actual_start_time,
        actual_end_time,
        created_by,
        match_notes,
        created_at
    ) VALUES (
        match_uuid,
        game_title,
        game_description,
        'pickup',
        'auto_logged',
        game_info.game_date,
        game_info.game_mode,
        game_info.arena_name,
        game_id_param,
        game_info.game_date,
        game_info.game_date + INTERVAL '30 minutes', -- Estimated duration
        admin_user_id, -- Use existing admin user
        'Auto-created from game statistics',
        NOW()
    );
    
    RETURN match_uuid;
END;
$$ LANGUAGE plpgsql;

-- Function to auto-create matches for unlinked games
CREATE OR REPLACE FUNCTION auto_create_matches_for_unlinked_games()
RETURNS INTEGER AS $$
DECLARE
    unlinked_game RECORD;
    matches_created INTEGER := 0;
BEGIN
    -- Find games that don't have corresponding matches
    FOR unlinked_game IN 
        SELECT DISTINCT game_id
        FROM player_stats ps
        WHERE ps.game_id IS NOT NULL 
        AND NOT EXISTS (
            SELECT 1 FROM matches m WHERE m.game_id = ps.game_id
        )
        ORDER BY game_id
    LOOP
        -- Create match for this game
        PERFORM create_match_from_game_stats(unlinked_game.game_id);
        matches_created := matches_created + 1;
    END LOOP;
    
    RETURN matches_created;
END;
$$ LANGUAGE plpgsql;

-- Function to create a single match from a specific game ID (used by API)
CREATE OR REPLACE FUNCTION create_single_match_from_game(game_id_param VARCHAR)
RETURNS UUID AS $$
DECLARE
    existing_match_id UUID;
    new_match_id UUID;
BEGIN
    -- Check if match already exists for this game
    SELECT id INTO existing_match_id
    FROM matches 
    WHERE game_id = game_id_param
    LIMIT 1;
    
    IF existing_match_id IS NOT NULL THEN
        RAISE EXCEPTION 'Match already exists for game_id: %', game_id_param;
    END IF;
    
    -- Create the match
    new_match_id := create_match_from_game_stats(game_id_param);
    
    RETURN new_match_id;
END;
$$ LANGUAGE plpgsql;

-- Grant execute permissions to authenticated users
GRANT EXECUTE ON FUNCTION create_match_from_game_stats(VARCHAR) TO authenticated;
GRANT EXECUTE ON FUNCTION auto_create_matches_for_unlinked_games() TO authenticated;
GRANT EXECUTE ON FUNCTION create_single_match_from_game(VARCHAR) TO authenticated; 