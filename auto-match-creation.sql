-- Auto-Match Creation System
-- This script adds functionality to automatically create match entries from player stats

-- Add new status for auto-created matches
ALTER TYPE match_status ADD VALUE IF NOT EXISTS 'auto_logged';

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
    
    -- Calculate team scores (based on wins)
    SELECT 
        COALESCE(MAX(CASE WHEN team = (SELECT team FROM player_stats WHERE game_id = game_id_param AND result = 'Win' LIMIT 1) THEN team END), 'Team A') as winning_team,
        COUNT(CASE WHEN result = 'Win' THEN 1 END) as win_count
    INTO team_a_name, team_a_score
    FROM player_stats 
    WHERE game_id = game_id_param;
    
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
        COALESCE(team_a_name, 'Team A'),
        COALESCE(team_b_name, 'Team B'),
        COALESCE(team_a_score, 0),
        COALESCE(team_b_score, 0),
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

-- Trigger function to auto-create match when new game stats are added
CREATE OR REPLACE FUNCTION trigger_auto_create_match()
RETURNS TRIGGER AS $$
BEGIN
    -- Only create if this is a new game_id that doesn't have a match
    IF NEW.game_id IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM matches WHERE game_id = NEW.game_id
    ) THEN
        -- Check if this is the first player stat for this game
        IF NOT EXISTS (
            SELECT 1 FROM player_stats 
            WHERE game_id = NEW.game_id AND id != NEW.id
        ) THEN
            -- Wait a bit for more players to be added, then create match
            -- This will be handled by a periodic job instead
            NULL;
        END IF;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger (commented out for now - we'll use API-based creation)
-- CREATE TRIGGER trigger_auto_create_match
--     AFTER INSERT ON player_stats
--     FOR EACH ROW
--     EXECUTE FUNCTION trigger_auto_create_match(); 