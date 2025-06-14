-- =============================================================================
-- DUELING SYSTEM DATABASE SETUP
-- =============================================================================

-- Create dueling_matches table to track individual duels
CREATE TABLE IF NOT EXISTS dueling_matches (
    id BIGSERIAL PRIMARY KEY,
    match_type VARCHAR(20) NOT NULL CHECK (match_type IN ('unranked', 'ranked_bo3', 'ranked_bo6')),
    player1_name VARCHAR(50) NOT NULL,
    player2_name VARCHAR(50) NOT NULL,
    winner_name VARCHAR(50),
    player1_rounds_won INTEGER DEFAULT 0,
    player2_rounds_won INTEGER DEFAULT 0,
    total_rounds INTEGER DEFAULT 0,
    match_status VARCHAR(20) DEFAULT 'in_progress' CHECK (match_status IN ('in_progress', 'completed', 'abandoned')),
    arena_name VARCHAR(100),
    started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    completed_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create dueling_rounds table to track individual rounds within matches
CREATE TABLE IF NOT EXISTS dueling_rounds (
    id BIGSERIAL PRIMARY KEY,
    match_id BIGINT REFERENCES dueling_matches(id) ON DELETE CASCADE,
    round_number INTEGER NOT NULL,
    winner_name VARCHAR(50) NOT NULL,
    loser_name VARCHAR(50) NOT NULL,
    winner_hp_left INTEGER DEFAULT 0,
    loser_hp_left INTEGER DEFAULT 0,
    round_duration_seconds INTEGER,
    kills_in_round INTEGER DEFAULT 0,
    started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    completed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create dueling_kills table to track individual kills within duels
CREATE TABLE IF NOT EXISTS dueling_kills (
    id BIGSERIAL PRIMARY KEY,
    match_id BIGINT REFERENCES dueling_matches(id) ON DELETE CASCADE,
    round_id BIGINT REFERENCES dueling_rounds(id) ON DELETE CASCADE,
    killer_name VARCHAR(50) NOT NULL,
    victim_name VARCHAR(50) NOT NULL,
    weapon_used VARCHAR(50),
    damage_dealt INTEGER,
    victim_hp_before INTEGER,
    victim_hp_after INTEGER DEFAULT 0,
    shots_fired INTEGER DEFAULT 0,
    shots_hit INTEGER DEFAULT 0,
    accuracy DECIMAL(5,4) DEFAULT 0,
    is_double_hit BOOLEAN DEFAULT FALSE,
    is_triple_hit BOOLEAN DEFAULT FALSE,
    kill_timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create dueling_player_stats table for aggregated player statistics
CREATE TABLE IF NOT EXISTS dueling_player_stats (
    id BIGSERIAL PRIMARY KEY,
    player_name VARCHAR(50) NOT NULL,
    match_type VARCHAR(20) NOT NULL CHECK (match_type IN ('unranked', 'ranked_bo3', 'ranked_bo6', 'overall')),
    
    -- Match Statistics
    total_matches INTEGER DEFAULT 0,
    matches_won INTEGER DEFAULT 0,
    matches_lost INTEGER DEFAULT 0,
    win_rate DECIMAL(5,4) DEFAULT 0,
    
    -- Round Statistics
    total_rounds INTEGER DEFAULT 0,
    rounds_won INTEGER DEFAULT 0,
    rounds_lost INTEGER DEFAULT 0,
    round_win_rate DECIMAL(5,4) DEFAULT 0,
    
    -- Combat Statistics
    total_kills INTEGER DEFAULT 0,
    total_deaths INTEGER DEFAULT 0,
    kill_death_ratio DECIMAL(6,3) DEFAULT 0,
    total_damage_dealt INTEGER DEFAULT 0,
    total_damage_taken INTEGER DEFAULT 0,
    
    -- Accuracy Statistics
    total_shots_fired INTEGER DEFAULT 0,
    total_shots_hit INTEGER DEFAULT 0,
    overall_accuracy DECIMAL(5,4) DEFAULT 0,
    avg_accuracy_per_kill DECIMAL(5,4) DEFAULT 0,
    
    -- HP Statistics
    avg_hp_left_when_winning DECIMAL(5,2) DEFAULT 0,
    avg_hp_left_when_losing DECIMAL(5,2) DEFAULT 0,
    total_hp_left_wins INTEGER DEFAULT 0,
    total_hp_left_losses INTEGER DEFAULT 0,
    
    -- Burst Damage Statistics
    double_hits INTEGER DEFAULT 0,
    triple_hits INTEGER DEFAULT 0,
    burst_damage_ratio DECIMAL(5,4) DEFAULT 0,
    
    -- Ranking System (for ranked matches)
    current_elo INTEGER DEFAULT 1200,
    peak_elo INTEGER DEFAULT 1200,
    elo_games_played INTEGER DEFAULT 0,
    
    -- Timestamps
    first_match_date TIMESTAMP WITH TIME ZONE,
    last_match_date TIMESTAMP WITH TIME ZONE,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Ensure unique combination of player and match type
    UNIQUE(player_name, match_type)
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_dueling_matches_players ON dueling_matches(player1_name, player2_name);
CREATE INDEX IF NOT EXISTS idx_dueling_matches_type ON dueling_matches(match_type);
CREATE INDEX IF NOT EXISTS idx_dueling_matches_status ON dueling_matches(match_status);
CREATE INDEX IF NOT EXISTS idx_dueling_matches_completed ON dueling_matches(completed_at);

CREATE INDEX IF NOT EXISTS idx_dueling_rounds_match ON dueling_rounds(match_id);
CREATE INDEX IF NOT EXISTS idx_dueling_rounds_winner ON dueling_rounds(winner_name);

CREATE INDEX IF NOT EXISTS idx_dueling_kills_match ON dueling_kills(match_id);
CREATE INDEX IF NOT EXISTS idx_dueling_kills_round ON dueling_kills(round_id);
CREATE INDEX IF NOT EXISTS idx_dueling_kills_killer ON dueling_kills(killer_name);
CREATE INDEX IF NOT EXISTS idx_dueling_kills_timestamp ON dueling_kills(kill_timestamp);

CREATE INDEX IF NOT EXISTS idx_dueling_stats_player ON dueling_player_stats(player_name);
CREATE INDEX IF NOT EXISTS idx_dueling_stats_type ON dueling_player_stats(match_type);
CREATE INDEX IF NOT EXISTS idx_dueling_stats_elo ON dueling_player_stats(current_elo);
CREATE INDEX IF NOT EXISTS idx_dueling_stats_winrate ON dueling_player_stats(win_rate);

-- =============================================================================
-- VIEWS FOR EASY DATA ACCESS
-- =============================================================================

-- View for current dueling leaderboards
CREATE OR REPLACE VIEW dueling_leaderboard AS
SELECT 
    player_name,
    match_type,
    total_matches,
    matches_won,
    matches_lost,
    win_rate,
    total_kills,
    total_deaths,
    kill_death_ratio,
    overall_accuracy,
    double_hits,
    triple_hits,
    current_elo,
    peak_elo,
    ROW_NUMBER() OVER (PARTITION BY match_type ORDER BY 
        CASE 
            WHEN match_type LIKE 'ranked%' THEN current_elo 
            ELSE win_rate 
        END DESC) as rank
FROM dueling_player_stats
WHERE total_matches >= 3 -- Minimum matches to appear on leaderboard
ORDER BY match_type, rank;

-- View for recent dueling matches
CREATE OR REPLACE VIEW recent_dueling_matches AS
SELECT 
    dm.id,
    dm.match_type,
    dm.player1_name,
    dm.player2_name,
    dm.winner_name,
    dm.player1_rounds_won,
    dm.player2_rounds_won,
    dm.total_rounds,
    dm.match_status,
    dm.arena_name,
    dm.started_at,
    dm.completed_at,
    -- Calculate match duration
    EXTRACT(EPOCH FROM (dm.completed_at - dm.started_at))::INTEGER as duration_seconds,
    -- Get round details
    COALESCE(
        (SELECT JSON_AGG(
            JSON_BUILD_OBJECT(
                'round_number', dr.round_number,
                'winner', dr.winner_name,
                'winner_hp', dr.winner_hp_left,
                'loser_hp', dr.loser_hp_left,
                'duration', dr.round_duration_seconds
            ) ORDER BY dr.round_number
        ) FROM dueling_rounds dr WHERE dr.match_id = dm.id),
        '[]'::json
    ) as rounds_data
FROM dueling_matches dm
ORDER BY dm.completed_at DESC NULLS LAST, dm.started_at DESC;

-- =============================================================================
-- FUNCTIONS FOR DUELING SYSTEM
-- =============================================================================

-- Function to start a new dueling match
CREATE OR REPLACE FUNCTION start_dueling_match(
    p_match_type VARCHAR(20),
    p_player1_name VARCHAR(50),
    p_player2_name VARCHAR(50),
    p_arena_name VARCHAR(100) DEFAULT NULL
) RETURNS BIGINT AS $$
DECLARE
    match_id BIGINT;
BEGIN
    INSERT INTO dueling_matches (
        match_type,
        player1_name,
        player2_name,
        arena_name,
        match_status
    ) VALUES (
        p_match_type,
        p_player1_name,
        p_player2_name,
        p_arena_name,
        'in_progress'
    ) RETURNING id INTO match_id;
    
    RETURN match_id;
END;
$$ LANGUAGE plpgsql;

-- Function to record a dueling kill
CREATE OR REPLACE FUNCTION record_dueling_kill(
    p_match_id BIGINT,
    p_round_id BIGINT,
    p_killer_name VARCHAR(50),
    p_victim_name VARCHAR(50),
    p_weapon_used VARCHAR(50) DEFAULT NULL,
    p_damage_dealt INTEGER DEFAULT 0,
    p_victim_hp_before INTEGER DEFAULT 100,
    p_victim_hp_after INTEGER DEFAULT 0,
    p_shots_fired INTEGER DEFAULT 0,
    p_shots_hit INTEGER DEFAULT 0,
    p_is_double_hit BOOLEAN DEFAULT FALSE,
    p_is_triple_hit BOOLEAN DEFAULT FALSE
) RETURNS BIGINT AS $$
DECLARE
    kill_id BIGINT;
    calculated_accuracy DECIMAL(5,4);
BEGIN
    -- Calculate accuracy
    calculated_accuracy := CASE 
        WHEN p_shots_fired > 0 THEN (p_shots_hit::DECIMAL / p_shots_fired::DECIMAL)
        ELSE 0
    END;
    
    INSERT INTO dueling_kills (
        match_id,
        round_id,
        killer_name,
        victim_name,
        weapon_used,
        damage_dealt,
        victim_hp_before,
        victim_hp_after,
        shots_fired,
        shots_hit,
        accuracy,
        is_double_hit,
        is_triple_hit
    ) VALUES (
        p_match_id,
        p_round_id,
        p_killer_name,
        p_victim_name,
        p_weapon_used,
        p_damage_dealt,
        p_victim_hp_before,
        p_victim_hp_after,
        p_shots_fired,
        p_shots_hit,
        calculated_accuracy,
        p_is_double_hit,
        p_is_triple_hit
    ) RETURNING id INTO kill_id;
    
    RETURN kill_id;
END;
$$ LANGUAGE plpgsql;

-- Function to complete a dueling round
CREATE OR REPLACE FUNCTION complete_dueling_round(
    p_match_id BIGINT,
    p_round_number INTEGER,
    p_winner_name VARCHAR(50),
    p_loser_name VARCHAR(50),
    p_winner_hp_left INTEGER DEFAULT 0,
    p_loser_hp_left INTEGER DEFAULT 0,
    p_round_duration_seconds INTEGER DEFAULT NULL
) RETURNS BIGINT AS $$
DECLARE
    round_id BIGINT;
BEGIN
    INSERT INTO dueling_rounds (
        match_id,
        round_number,
        winner_name,
        loser_name,
        winner_hp_left,
        loser_hp_left,
        round_duration_seconds,
        kills_in_round
    ) VALUES (
        p_match_id,
        p_round_number,
        p_winner_name,
        p_loser_name,
        p_winner_hp_left,
        p_loser_hp_left,
        p_round_duration_seconds,
        (SELECT COUNT(*) FROM dueling_kills WHERE match_id = p_match_id AND round_id IS NULL)
    ) RETURNING id INTO round_id;
    
    -- Update any kills that were recorded during this round
    UPDATE dueling_kills 
    SET round_id = round_id 
    WHERE match_id = p_match_id AND round_id IS NULL;
    
    RETURN round_id;
END;
$$ LANGUAGE plpgsql;

-- Function to complete a dueling match and update player stats
CREATE OR REPLACE FUNCTION complete_dueling_match(
    p_match_id BIGINT,
    p_winner_name VARCHAR(50)
) RETURNS BOOLEAN AS $$
DECLARE
    match_record dueling_matches%ROWTYPE;
    player1_rounds INTEGER;
    player2_rounds INTEGER;
BEGIN
    -- Get the match record
    SELECT * INTO match_record FROM dueling_matches WHERE id = p_match_id;
    
    IF NOT FOUND THEN
        RETURN FALSE;
    END IF;
    
    -- Count rounds won by each player
    SELECT 
        COUNT(*) FILTER (WHERE winner_name = match_record.player1_name),
        COUNT(*) FILTER (WHERE winner_name = match_record.player2_name)
    INTO player1_rounds, player2_rounds
    FROM dueling_rounds 
    WHERE match_id = p_match_id;
    
    -- Update the match record
    UPDATE dueling_matches SET
        winner_name = p_winner_name,
        player1_rounds_won = player1_rounds,
        player2_rounds_won = player2_rounds,
        total_rounds = player1_rounds + player2_rounds,
        match_status = 'completed',
        completed_at = NOW(),
        updated_at = NOW()
    WHERE id = p_match_id;
    
    -- Update player statistics
    PERFORM update_dueling_player_stats(match_record.player1_name, match_record.match_type);
    PERFORM update_dueling_player_stats(match_record.player2_name, match_record.match_type);
    
    RETURN TRUE;
END;
$$ LANGUAGE plpgsql;

-- Function to update player dueling statistics
CREATE OR REPLACE FUNCTION update_dueling_player_stats(
    p_player_name VARCHAR(50),
    p_match_type VARCHAR(20)
) RETURNS BOOLEAN AS $$
DECLARE
    stats_record RECORD;
BEGIN
    -- Calculate stats from matches
    SELECT 
        COUNT(*) as total_matches,
        COUNT(*) FILTER (WHERE winner_name = p_player_name) as matches_won,
        COUNT(*) FILTER (WHERE winner_name != p_player_name AND winner_name IS NOT NULL) as matches_lost,
        
        -- Round statistics
        COALESCE(SUM(
            CASE WHEN player1_name = p_player_name THEN player1_rounds_won 
                 WHEN player2_name = p_player_name THEN player2_rounds_won 
                 ELSE 0 END
        ), 0) as rounds_won,
        COALESCE(SUM(
            CASE WHEN player1_name = p_player_name THEN player2_rounds_won 
                 WHEN player2_name = p_player_name THEN player1_rounds_won 
                 ELSE 0 END
        ), 0) as rounds_lost,
        
        MIN(started_at) as first_match_date,
        MAX(COALESCE(completed_at, started_at)) as last_match_date
        
    INTO stats_record
    FROM dueling_matches 
    WHERE (player1_name = p_player_name OR player2_name = p_player_name)
      AND match_type = p_match_type
      AND match_status = 'completed';
    
    -- Insert or update player stats
    INSERT INTO dueling_player_stats (
        player_name,
        match_type,
        total_matches,
        matches_won,
        matches_lost,
        win_rate,
        total_rounds,
        rounds_won,
        rounds_lost,
        round_win_rate,
        first_match_date,
        last_match_date,
        updated_at
    ) VALUES (
        p_player_name,
        p_match_type,
        COALESCE(stats_record.total_matches, 0),
        COALESCE(stats_record.matches_won, 0),
        COALESCE(stats_record.matches_lost, 0),
        CASE WHEN COALESCE(stats_record.total_matches, 0) > 0 
             THEN COALESCE(stats_record.matches_won, 0)::DECIMAL / stats_record.total_matches 
             ELSE 0 END,
        COALESCE(stats_record.rounds_won + stats_record.rounds_lost, 0),
        COALESCE(stats_record.rounds_won, 0),
        COALESCE(stats_record.rounds_lost, 0),
        CASE WHEN COALESCE(stats_record.rounds_won + stats_record.rounds_lost, 0) > 0 
             THEN COALESCE(stats_record.rounds_won, 0)::DECIMAL / (stats_record.rounds_won + stats_record.rounds_lost) 
             ELSE 0 END,
        stats_record.first_match_date,
        stats_record.last_match_date,
        NOW()
    )
    ON CONFLICT (player_name, match_type) 
    DO UPDATE SET
        total_matches = EXCLUDED.total_matches,
        matches_won = EXCLUDED.matches_won,
        matches_lost = EXCLUDED.matches_lost,
        win_rate = EXCLUDED.win_rate,
        total_rounds = EXCLUDED.total_rounds,
        rounds_won = EXCLUDED.rounds_won,
        rounds_lost = EXCLUDED.rounds_lost,
        round_win_rate = EXCLUDED.round_win_rate,
        first_match_date = EXCLUDED.first_match_date,
        last_match_date = EXCLUDED.last_match_date,
        updated_at = NOW();
    
    -- Update combat and accuracy stats from kills
    UPDATE dueling_player_stats SET
        total_kills = (
            SELECT COUNT(*) FROM dueling_kills dk
            JOIN dueling_matches dm ON dk.match_id = dm.id
            WHERE dk.killer_name = p_player_name AND dm.match_type = p_match_type
        ),
        total_deaths = (
            SELECT COUNT(*) FROM dueling_kills dk
            JOIN dueling_matches dm ON dk.match_id = dm.id
            WHERE dk.victim_name = p_player_name AND dm.match_type = p_match_type
        ),
        total_shots_fired = (
            SELECT COALESCE(SUM(shots_fired), 0) FROM dueling_kills dk
            JOIN dueling_matches dm ON dk.match_id = dm.id
            WHERE dk.killer_name = p_player_name AND dm.match_type = p_match_type
        ),
        total_shots_hit = (
            SELECT COALESCE(SUM(shots_hit), 0) FROM dueling_kills dk
            JOIN dueling_matches dm ON dk.match_id = dm.id
            WHERE dk.killer_name = p_player_name AND dm.match_type = p_match_type
        ),
        double_hits = (
            SELECT COUNT(*) FROM dueling_kills dk
            JOIN dueling_matches dm ON dk.match_id = dm.id
            WHERE dk.killer_name = p_player_name AND dm.match_type = p_match_type AND dk.is_double_hit = TRUE
        ),
        triple_hits = (
            SELECT COUNT(*) FROM dueling_kills dk
            JOIN dueling_matches dm ON dk.match_id = dm.id
            WHERE dk.killer_name = p_player_name AND dm.match_type = p_match_type AND dk.is_triple_hit = TRUE
        )
    WHERE player_name = p_player_name AND match_type = p_match_type;
    
    -- Update calculated fields
    UPDATE dueling_player_stats SET
        kill_death_ratio = CASE WHEN total_deaths > 0 THEN total_kills::DECIMAL / total_deaths ELSE total_kills::DECIMAL END,
        overall_accuracy = CASE WHEN total_shots_fired > 0 THEN total_shots_hit::DECIMAL / total_shots_fired ELSE 0 END,
        burst_damage_ratio = CASE WHEN total_kills > 0 THEN (double_hits + triple_hits)::DECIMAL / total_kills ELSE 0 END,
        updated_at = NOW()
    WHERE player_name = p_player_name AND match_type = p_match_type;
    
    RETURN TRUE;
END;
$$ LANGUAGE plpgsql;

-- =============================================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- =============================================================================

-- Enable RLS on all tables
ALTER TABLE dueling_matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE dueling_rounds ENABLE ROW LEVEL SECURITY;
ALTER TABLE dueling_kills ENABLE ROW LEVEL SECURITY;
ALTER TABLE dueling_player_stats ENABLE ROW LEVEL SECURITY;

-- Allow public read access to all dueling data (for leaderboards, etc.)
CREATE POLICY "Public read access" ON dueling_matches FOR SELECT USING (true);
CREATE POLICY "Public read access" ON dueling_rounds FOR SELECT USING (true);
CREATE POLICY "Public read access" ON dueling_kills FOR SELECT USING (true);
CREATE POLICY "Public read access" ON dueling_player_stats FOR SELECT USING (true);

-- Allow service role to do everything
CREATE POLICY "Service role full access" ON dueling_matches FOR ALL USING (auth.jwt() ->> 'role' = 'service_role');
CREATE POLICY "Service role full access" ON dueling_rounds FOR ALL USING (auth.jwt() ->> 'role' = 'service_role');
CREATE POLICY "Service role full access" ON dueling_kills FOR ALL USING (auth.jwt() ->> 'role' = 'service_role');
CREATE POLICY "Service role full access" ON dueling_player_stats FOR ALL USING (auth.jwt() ->> 'role' = 'service_role');

-- Allow authenticated users to insert their own match data
CREATE POLICY "Users can insert dueling data" ON dueling_matches FOR INSERT WITH CHECK (true);
CREATE POLICY "Users can insert dueling data" ON dueling_rounds FOR INSERT WITH CHECK (true);
CREATE POLICY "Users can insert dueling data" ON dueling_kills FOR INSERT WITH CHECK (true);
CREATE POLICY "Users can insert dueling data" ON dueling_player_stats FOR INSERT WITH CHECK (true);

-- =============================================================================
-- GRANT PERMISSIONS
-- =============================================================================

-- Grant permissions to anon and authenticated users
GRANT SELECT ON dueling_matches TO anon, authenticated;
GRANT SELECT ON dueling_rounds TO anon, authenticated;
GRANT SELECT ON dueling_kills TO anon, authenticated;
GRANT SELECT ON dueling_player_stats TO anon, authenticated;
GRANT SELECT ON dueling_leaderboard TO anon, authenticated;
GRANT SELECT ON recent_dueling_matches TO anon, authenticated;

-- Grant insert permissions to authenticated users
GRANT INSERT ON dueling_matches TO authenticated;
GRANT INSERT ON dueling_rounds TO authenticated;
GRANT INSERT ON dueling_kills TO authenticated;
GRANT INSERT ON dueling_player_stats TO authenticated;

-- Grant function execution permissions
GRANT EXECUTE ON FUNCTION start_dueling_match TO anon, authenticated;
GRANT EXECUTE ON FUNCTION record_dueling_kill TO anon, authenticated;
GRANT EXECUTE ON FUNCTION complete_dueling_round TO anon, authenticated;
GRANT EXECUTE ON FUNCTION complete_dueling_match TO anon, authenticated;
GRANT EXECUTE ON FUNCTION update_dueling_player_stats TO anon, authenticated;

-- =============================================================================
-- SAMPLE DATA FOR TESTING
-- =============================================================================

-- Insert some sample data for testing
-- INSERT INTO dueling_matches (match_type, player1_name, player2_name, winner_name, match_status, arena_name, completed_at)
-- VALUES 
--     ('unranked', 'TestPlayer1', 'TestPlayer2', 'TestPlayer1', 'completed', 'Duel Arena', NOW() - INTERVAL '1 hour'),
--     ('ranked_bo3', 'RankedPlayer1', 'RankedPlayer2', 'RankedPlayer2', 'completed', 'Ranked Arena', NOW() - INTERVAL '30 minutes');

COMMIT; 