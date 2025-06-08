-- Auto-Match Creation System (Fixed for VARCHAR status)
-- This script adds functionality to automatically create match entries from player stats

-- Function to create a match from game stats
CREATE OR REPLACE FUNCTION create_match_from_game_stats(game_id_param VARCHAR)
RETURNS UUID AS $$
DECLARE
    match_uuid UUID;
    game_info RECORD;
    team_a_name VARCHAR;
    team_b_name VARCHAR;
    team_a_score INTEGER;
    team_b_score INTEGER;
    winner_team VARCHAR;
    player_count INTEGER;
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
    
    -- Get team names and scores
    WITH team_stats AS (
        SELECT 
            team,
            COUNT(*) as player_count,
            SUM(CASE WHEN result = 'Win' THEN 1 ELSE 0 END) as wins,
            ROW_NUMBER() OVER (ORDER BY team) as team_rank
        FROM player_stats 
        WHERE game_id = game_id_param AND team IS NOT NULL
        GROUP BY team
    )
    SELECT 
        MAX(CASE WHEN team_rank = 1 THEN team END),
        MAX(CASE WHEN team_rank = 2 THEN team END),
        MAX(CASE WHEN team_rank = 1 THEN wins END),
        MAX(CASE WHEN team_rank = 2 THEN wins END)
    INTO team_a_name, team_b_name, team_a_score, team_b_score
    FROM team_stats;
    
    -- Set defaults if teams are null
    team_a_name := COALESCE(team_a_name, 'Team A');
    team_b_name := COALESCE(team_b_name, 'Team B');
    team_a_score := COALESCE(team_a_score, 0);
    team_b_score := COALESCE(team_b_score, 0);
    
    -- Determine winner
    IF team_a_score > team_b_score THEN
        winner_team := team_a_name;
    ELSIF team_b_score > team_a_score THEN
        winner_team := team_b_name;
    END IF;
    
    -- Generate UUID for new match
    match_uuid := gen_random_uuid();
    
    -- Create the match entry
    INSERT INTO matches (
        id,
        title,
        description,
        scheduled_at,
        match_type,
        status,
        squad_a_name,
        squad_b_name,
        squad_a_score,
        squad_b_score,
        winner_name,
        game_id,
        actual_start_time,
        actual_end_time,
        created_by,
        created_by_alias,
        match_notes
    ) VALUES (
        match_uuid,
        CONCAT(game_info.game_mode, ' - ', game_info.arena_name),
        CONCAT('Auto-logged game from ', game_info.game_date::date),
        game_info.game_date,
        'pickup',
        'auto_logged',
        team_a_name,
        team_b_name,
        team_a_score,
        team_b_score,
        winner_team,
        game_id_param,
        game_info.game_date,
        game_info.game_date + INTERVAL '30 minutes', -- Estimated duration
        '00000000-0000-0000-0000-000000000000', -- System user
        'System',
        'Auto-created from game statistics'
    );
    
    -- Add players as participants
    INSERT INTO match_participants (
        id,
        match_id,
        player_id,
        in_game_alias,
        role,
        squad_name
    )
    SELECT 
        gen_random_uuid(),
        match_uuid,
        '00000000-0000-0000-0000-000000000000', -- Default player ID
        player_name,
        'player',
        team
    FROM player_stats 
    WHERE game_id = game_id_param;
    
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