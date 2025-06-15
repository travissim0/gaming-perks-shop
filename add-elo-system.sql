-- Add ELO system to player stats
-- This adds ELO rating columns and functions to calculate meaningful rankings

-- Add ELO columns to player_aggregate_stats table
ALTER TABLE player_aggregate_stats 
ADD COLUMN IF NOT EXISTS elo_rating DECIMAL(8,2) DEFAULT 1200.00,
ADD COLUMN IF NOT EXISTS elo_confidence DECIMAL(5,3) DEFAULT 0.000,
ADD COLUMN IF NOT EXISTS elo_peak DECIMAL(8,2) DEFAULT 1200.00,
ADD COLUMN IF NOT EXISTS elo_last_updated TIMESTAMP WITH TIME ZONE DEFAULT NOW();

-- Add ELO tracking to individual game records
ALTER TABLE player_stats 
ADD COLUMN IF NOT EXISTS elo_before DECIMAL(8,2) DEFAULT NULL,
ADD COLUMN IF NOT EXISTS elo_after DECIMAL(8,2) DEFAULT NULL,
ADD COLUMN IF NOT EXISTS elo_change DECIMAL(6,2) DEFAULT 0.00;

-- Create ELO calculation function
CREATE OR REPLACE FUNCTION calculate_elo_rating(
    player_elo DECIMAL(8,2),
    opponent_avg_elo DECIMAL(8,2),
    game_result VARCHAR(10),
    games_played INTEGER
) RETURNS DECIMAL(8,2) AS $$
DECLARE
    k_factor DECIMAL(4,2) := 32.0;
    expected_score DECIMAL(5,4);
    actual_score DECIMAL(3,1);
    confidence_multiplier DECIMAL(5,3);
    elo_change DECIMAL(6,2);
    new_elo DECIMAL(8,2);
BEGIN
    -- Calculate expected score using ELO formula
    expected_score := 1.0 / (1.0 + POWER(10.0, (opponent_avg_elo - player_elo) / 400.0));
    
    -- Actual score: 1 for win, 0 for loss
    actual_score := CASE WHEN game_result = 'Win' THEN 1.0 ELSE 0.0 END;
    
    -- Confidence multiplier: reduces rating changes for new players
    confidence_multiplier := LEAST(games_played::DECIMAL / 10.0, 1.0);
    
    -- Calculate ELO change
    elo_change := k_factor * (actual_score - expected_score) * confidence_multiplier;
    
    -- Calculate new ELO (minimum 800, maximum 2800)
    new_elo := GREATEST(800.0, LEAST(2800.0, player_elo + elo_change));
    
    RETURN new_elo;
END;
$$ LANGUAGE plpgsql;

-- Create function to get team average ELO
CREATE OR REPLACE FUNCTION get_team_average_elo(
    game_id_param VARCHAR(255),
    player_team VARCHAR(255)
) RETURNS DECIMAL(8,2) AS $$
DECLARE
    avg_elo DECIMAL(8,2);
BEGIN
    -- Get average ELO of opposing team members in the same game
    SELECT COALESCE(AVG(pas.elo_rating), 1200.0)
    INTO avg_elo
    FROM player_stats ps
    JOIN player_aggregate_stats pas ON ps.player_name = pas.player_name 
        AND ps.game_mode = pas.game_mode
    WHERE ps.game_id = game_id_param 
        AND ps.team != player_team;
    
    -- If no opposing team data, use global average
    IF avg_elo IS NULL THEN
        SELECT COALESCE(AVG(elo_rating), 1200.0) INTO avg_elo 
        FROM player_aggregate_stats;
    END IF;
    
    RETURN avg_elo;
END;
$$ LANGUAGE plpgsql;

-- Create comprehensive ELO update function
CREATE OR REPLACE FUNCTION update_player_elo()
RETURNS TRIGGER AS $$
DECLARE
    current_elo DECIMAL(8,2);
    opponent_avg_elo DECIMAL(8,2);
    new_elo DECIMAL(8,2);
    elo_change DECIMAL(6,2);
    current_games INTEGER;
    confidence DECIMAL(5,3);
BEGIN
    -- Get current player stats
    SELECT 
        COALESCE(elo_rating, 1200.0),
        COALESCE(total_games, 0)
    INTO current_elo, current_games
    FROM player_aggregate_stats 
    WHERE player_name = NEW.player_name 
        AND game_mode = NEW.game_mode;
    
    -- If player doesn't exist in aggregates yet, use defaults
    IF current_elo IS NULL THEN
        current_elo := 1200.0;
        current_games := 0;
    END IF;
    
    -- Get opposing team average ELO
    opponent_avg_elo := get_team_average_elo(NEW.game_id, NEW.team);
    
    -- Calculate new ELO
    new_elo := calculate_elo_rating(
        current_elo, 
        opponent_avg_elo, 
        NEW.result, 
        current_games + 1
    );
    
    -- Calculate ELO change
    elo_change := new_elo - current_elo;
    
    -- Calculate confidence (how reliable the rating is)
    confidence := LEAST((current_games + 1)::DECIMAL / 20.0, 1.0);
    
    -- Store ELO data in the game record
    NEW.elo_before := current_elo;
    NEW.elo_after := new_elo;
    NEW.elo_change := elo_change;
    
    -- Update aggregate stats with new ELO
    INSERT INTO player_aggregate_stats (
        player_name, 
        game_mode, 
        elo_rating, 
        elo_confidence,
        elo_peak,
        elo_last_updated
    ) VALUES (
        NEW.player_name,
        NEW.game_mode,
        new_elo,
        confidence,
        GREATEST(new_elo, 1200.0),
        NOW()
    )
    ON CONFLICT (player_name, game_mode) DO UPDATE SET
        elo_rating = new_elo,
        elo_confidence = confidence,
        elo_peak = GREATEST(player_aggregate_stats.elo_peak, new_elo),
        elo_last_updated = NOW();
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to update ELO on new games
DROP TRIGGER IF EXISTS trigger_update_player_elo ON player_stats;
CREATE TRIGGER trigger_update_player_elo
    BEFORE INSERT ON player_stats
    FOR EACH ROW
    EXECUTE FUNCTION update_player_elo();

-- Create function to recalculate all ELO ratings (for historical data)
CREATE OR REPLACE FUNCTION recalculate_all_elo_ratings()
RETURNS TEXT AS $$
DECLARE
    game_record RECORD;
    processed_count INTEGER := 0;
BEGIN
    -- Reset all ELO ratings to default
    UPDATE player_aggregate_stats SET 
        elo_rating = 1200.0,
        elo_confidence = 0.0,
        elo_peak = 1200.0,
        elo_last_updated = NOW();
    
    -- Clear ELO data from game records
    UPDATE player_stats SET 
        elo_before = NULL,
        elo_after = NULL,
        elo_change = 0.0;
    
    -- Process all games in chronological order
    FOR game_record IN 
        SELECT * FROM player_stats 
        ORDER BY game_date ASC, game_id ASC
    LOOP
        -- Trigger ELO calculation by updating the record
        UPDATE player_stats 
        SET elo_before = elo_before  -- Dummy update to trigger function
        WHERE id = game_record.id;
        
        processed_count := processed_count + 1;
        
        -- Log progress every 100 games
        IF processed_count % 100 = 0 THEN
            RAISE NOTICE 'Processed % games', processed_count;
        END IF;
    END LOOP;
    
    RETURN format('Successfully recalculated ELO for %s games', processed_count);
END;
$$ LANGUAGE plpgsql;

-- Create view for ELO leaderboard
CREATE OR REPLACE VIEW elo_leaderboard AS
SELECT 
    pas.player_name,
    pas.game_mode,
    pas.elo_rating,
    pas.elo_confidence,
    pas.elo_peak,
    pas.total_games,
    pas.total_wins,
    pas.total_losses,
    pas.win_rate,
    pas.kill_death_ratio,
    pas.last_game_date,
    -- Weighted ELO score for ranking (considers confidence)
    (pas.elo_rating * pas.elo_confidence + 1200.0 * (1.0 - pas.elo_confidence)) AS weighted_elo,
    -- Rank within game mode
    ROW_NUMBER() OVER (
        PARTITION BY pas.game_mode 
        ORDER BY (pas.elo_rating * pas.elo_confidence + 1200.0 * (1.0 - pas.elo_confidence)) DESC
    ) AS elo_rank,
    -- Overall rank across all modes
    ROW_NUMBER() OVER (
        ORDER BY (pas.elo_rating * pas.elo_confidence + 1200.0 * (1.0 - pas.elo_confidence)) DESC
    ) AS overall_elo_rank
FROM player_aggregate_stats pas
WHERE pas.total_games > 0
ORDER BY weighted_elo DESC;

-- Create indexes for ELO queries
CREATE INDEX IF NOT EXISTS idx_player_aggregate_elo_rating ON player_aggregate_stats(elo_rating DESC);
CREATE INDEX IF NOT EXISTS idx_player_aggregate_elo_confidence ON player_aggregate_stats(elo_confidence DESC);
CREATE INDEX IF NOT EXISTS idx_player_stats_elo_change ON player_stats(elo_change DESC);
CREATE INDEX IF NOT EXISTS idx_player_stats_game_date ON player_stats(game_date ASC);

-- Grant permissions
GRANT SELECT ON elo_leaderboard TO anon, authenticated;
GRANT EXECUTE ON FUNCTION calculate_elo_rating TO anon, authenticated;
GRANT EXECUTE ON FUNCTION get_team_average_elo TO anon, authenticated;

COMMENT ON COLUMN player_aggregate_stats.elo_rating IS 'Current ELO rating (800-2800)';
COMMENT ON COLUMN player_aggregate_stats.elo_confidence IS 'Confidence in rating (0.0-1.0, based on games played)';
COMMENT ON COLUMN player_aggregate_stats.elo_peak IS 'Highest ELO rating achieved';
COMMENT ON VIEW elo_leaderboard IS 'ELO-based player rankings with weighted scores'; 