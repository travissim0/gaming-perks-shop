-- Add Season Support to ELO System
-- This creates a new season system that archives Q2-2025 data and starts fresh Q3-2025

-- Create the tier type if it doesn't exist
DO $$ BEGIN
    CREATE TYPE elo_tier_type AS (
        name VARCHAR(20),
        color VARCHAR(10),
        min INTEGER,
        max INTEGER
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Create seasons table
CREATE TABLE IF NOT EXISTS elo_seasons (
    id BIGSERIAL PRIMARY KEY,
    season_name VARCHAR(50) UNIQUE NOT NULL,
    start_date DATE NOT NULL,
    end_date DATE,
    is_active BOOLEAN DEFAULT false,
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add season column to player_aggregate_stats
ALTER TABLE player_aggregate_stats 
ADD COLUMN IF NOT EXISTS season VARCHAR(50) DEFAULT 'Q3-2025',
ADD COLUMN IF NOT EXISTS archived_elo DECIMAL(8,2),
ADD COLUMN IF NOT EXISTS season_influence DECIMAL(5,3) DEFAULT 0.0;

-- Add season column to player_stats
ALTER TABLE player_stats
ADD COLUMN IF NOT EXISTS season VARCHAR(50) DEFAULT 'Q3-2025';

-- Create unique constraint including season
DROP INDEX IF EXISTS idx_player_aggregate_unique;
ALTER TABLE player_aggregate_stats DROP CONSTRAINT IF EXISTS player_aggregate_stats_player_name_game_mode_key;
CREATE UNIQUE INDEX IF NOT EXISTS idx_player_aggregate_season_unique 
ON player_aggregate_stats(player_name, game_mode, season);

-- Insert season definitions
INSERT INTO elo_seasons (season_name, start_date, end_date, is_active, description) VALUES
('Q2-2025', '2025-04-01', '2025-06-30', false, 'Second quarter 2025 - Historical season'),
('Q3-2025', '2025-07-01', '2025-09-30', true, 'Third quarter 2025 - Current active season')
ON CONFLICT (season_name) DO UPDATE SET
    is_active = EXCLUDED.is_active,
    description = EXCLUDED.description;

-- Function to archive current ELO data as Q2-2025
CREATE OR REPLACE FUNCTION archive_q2_2025_season()
RETURNS TEXT AS $$
DECLARE
    processed_count INTEGER := 0;
    season_record RECORD;
BEGIN
    -- Check if Q2-2025 data already exists
    SELECT COUNT(*) INTO processed_count
    FROM player_aggregate_stats 
    WHERE season = 'Q2-2025';
    
    IF processed_count > 0 THEN
        RETURN format('Q2-2025 season already has %s records. Archive skipped.', processed_count);
    END IF;
    
    -- Archive existing data as Q2-2025 season
    INSERT INTO player_aggregate_stats (
        player_name,
        game_mode,
        season,
        total_games,
        total_wins,
        total_losses,
        total_kills,
        total_deaths,
        total_captures,
        total_carrier_kills,
        total_carry_time_seconds,
        total_class_swaps,
        total_turret_damage,
        total_eb_hits,
        avg_kills_per_game,
        avg_deaths_per_game,
        avg_captures_per_game,
        avg_accuracy,
        avg_resource_unused_per_death,
        avg_explosive_unused_per_death,
        kill_death_ratio,
        win_rate,
        elo_rating,
        elo_confidence,
        elo_peak,
        first_game_date,
        last_game_date,
        updated_at,
        created_at
    )
    SELECT 
        player_name,
        game_mode,
        'Q2-2025' as season,
        total_games,
        total_wins,
        total_losses,
        total_kills,
        total_deaths,
        total_captures,
        total_carrier_kills,
        total_carry_time_seconds,
        total_class_swaps,
        total_turret_damage,
        total_eb_hits,
        avg_kills_per_game,
        avg_deaths_per_game,
        avg_captures_per_game,
        avg_accuracy,
        avg_resource_unused_per_death,
        avg_explosive_unused_per_death,
        kill_death_ratio,
        win_rate,
        elo_rating,
        elo_confidence,
        elo_peak,
        first_game_date,
        last_game_date,
        NOW() as updated_at,
        created_at
    FROM player_aggregate_stats
    WHERE season IS NULL OR season = 'Q3-2025';
    
    GET DIAGNOSTICS processed_count = ROW_COUNT;
    
    RETURN format('Successfully archived %s player records to Q2-2025 season', processed_count);
END;
$$ LANGUAGE plpgsql;

-- Function to reset Q3-2025 with soft influence from Q2-2025
CREATE OR REPLACE FUNCTION reset_q3_2025_season()
RETURNS TEXT AS $$
DECLARE
    processed_count INTEGER := 0;
    influence_factor DECIMAL(5,3) := 0.15; -- 15% influence from previous season
BEGIN
    -- Update existing Q3-2025 records with season reset
    UPDATE player_aggregate_stats 
    SET 
        -- Archive the current ELO for reference
        archived_elo = elo_rating,
        
        -- Reset stats to zero
        total_games = 0,
        total_wins = 0,
        total_losses = 0,
        total_kills = 0,
        total_deaths = 0,
        total_captures = 0,
        total_carrier_kills = 0,
        total_carry_time_seconds = 0,
        total_class_swaps = 0,
        total_turret_damage = 0,
        total_eb_hits = 0,
        avg_kills_per_game = 0,
        avg_deaths_per_game = 0,
        avg_captures_per_game = 0,
        avg_accuracy = 0,
        avg_resource_unused_per_death = 0,
        avg_explosive_unused_per_death = 0,
        kill_death_ratio = 0,
        win_rate = 0,
        
        -- Reset ELO with soft influence from previous season
        elo_rating = CASE 
            WHEN elo_rating IS NOT NULL THEN 
                1200.0 + ((elo_rating - 1200.0) * influence_factor)
            ELSE 1200.0
        END,
        elo_confidence = 0.0,
        elo_peak = CASE 
            WHEN elo_rating IS NOT NULL THEN 
                1200.0 + ((elo_rating - 1200.0) * influence_factor)
            ELSE 1200.0
        END,
        season_influence = influence_factor,
        
        -- Reset dates
        first_game_date = NULL,
        last_game_date = NULL,
        updated_at = NOW()
    WHERE season = 'Q3-2025' OR season IS NULL;
    
    GET DIAGNOSTICS processed_count = ROW_COUNT;
    
    -- Also update the season for any player_stats records
    UPDATE player_stats
    SET season = 'Q3-2025'
    WHERE season IS NULL;
    
    RETURN format('Successfully reset %s player records for Q3-2025 season with %s%% influence from previous season', 
                  processed_count, (influence_factor * 100)::INTEGER);
END;
$$ LANGUAGE plpgsql;

-- Function to execute the full season transition
CREATE OR REPLACE FUNCTION transition_to_q3_2025()
RETURNS TEXT AS $$
DECLARE
    archive_result TEXT;
    reset_result TEXT;
BEGIN
    -- Step 1: Archive Q2-2025 data
    SELECT archive_q2_2025_season() INTO archive_result;
    
    -- Step 2: Reset Q3-2025 with influence
    SELECT reset_q3_2025_season() INTO reset_result;
    
    -- Step 3: Update season status
    UPDATE elo_seasons SET is_active = false WHERE season_name != 'Q3-2025';
    UPDATE elo_seasons SET is_active = true WHERE season_name = 'Q3-2025';
    
    RETURN format('Season transition complete! Archive: %s | Reset: %s', archive_result, reset_result);
END;
$$ LANGUAGE plpgsql;

-- Update ELO leaderboard view to include season support
CREATE OR REPLACE VIEW elo_leaderboard AS
SELECT 
    pas.player_name,
    pas.game_mode,
    pas.season,
    pas.elo_rating,
    pas.elo_confidence,
    pas.elo_peak,
    pas.archived_elo,
    pas.season_influence,
    pas.total_games,
    pas.total_wins,
    pas.total_losses,
    pas.win_rate,
    pas.kill_death_ratio,
    pas.last_game_date,
    -- Weighted ELO score for ranking (considers confidence)
    (pas.elo_rating * pas.elo_confidence + 1200.0 * (1.0 - pas.elo_confidence)) AS weighted_elo,
    -- Rank within game mode and season
    ROW_NUMBER() OVER (
        PARTITION BY pas.game_mode, pas.season
        ORDER BY (pas.elo_rating * pas.elo_confidence + 1200.0 * (1.0 - pas.elo_confidence)) DESC
    ) AS elo_rank,
    -- Overall rank across all modes in season
    ROW_NUMBER() OVER (
        PARTITION BY pas.season
        ORDER BY (pas.elo_rating * pas.elo_confidence + 1200.0 * (1.0 - pas.elo_confidence)) DESC
    ) AS overall_elo_rank,
    -- Add tier calculation
    CASE 
        WHEN (pas.elo_rating * pas.elo_confidence + 1200.0 * (1.0 - pas.elo_confidence)) >= 2400 THEN 
            ROW('Legend', '#FF6B35', 2400, 2800)::elo_tier_type
        WHEN (pas.elo_rating * pas.elo_confidence + 1200.0 * (1.0 - pas.elo_confidence)) >= 2200 THEN 
            ROW('Grandmaster', '#9333EA', 2200, 2399)::elo_tier_type
        WHEN (pas.elo_rating * pas.elo_confidence + 1200.0 * (1.0 - pas.elo_confidence)) >= 2000 THEN 
            ROW('Master', '#EF4444', 2000, 2199)::elo_tier_type
        WHEN (pas.elo_rating * pas.elo_confidence + 1200.0 * (1.0 - pas.elo_confidence)) >= 1800 THEN 
            ROW('Diamond', '#06B6D4', 1800, 1999)::elo_tier_type
        WHEN (pas.elo_rating * pas.elo_confidence + 1200.0 * (1.0 - pas.elo_confidence)) >= 1600 THEN 
            ROW('Platinum', '#10B981', 1600, 1799)::elo_tier_type
        WHEN (pas.elo_rating * pas.elo_confidence + 1200.0 * (1.0 - pas.elo_confidence)) >= 1400 THEN 
            ROW('Gold', '#F59E0B', 1400, 1599)::elo_tier_type
        WHEN (pas.elo_rating * pas.elo_confidence + 1200.0 * (1.0 - pas.elo_confidence)) >= 1200 THEN 
            ROW('Silver', '#6B7280', 1200, 1399)::elo_tier_type
        WHEN (pas.elo_rating * pas.elo_confidence + 1200.0 * (1.0 - pas.elo_confidence)) >= 1000 THEN 
            ROW('Bronze', '#CD7F32', 1000, 1199)::elo_tier_type
        ELSE 
            ROW('Unranked', '#4B5563', 0, 999)::elo_tier_type
    END AS elo_tier
FROM player_aggregate_stats pas
WHERE pas.season = (SELECT season_name FROM elo_seasons WHERE is_active = true LIMIT 1)
  AND pas.total_games > 0
ORDER BY weighted_elo DESC;

-- Grant permissions
GRANT SELECT ON elo_seasons TO anon, authenticated;
GRANT EXECUTE ON FUNCTION archive_q2_2025_season TO authenticated;
GRANT EXECUTE ON FUNCTION reset_q3_2025_season TO authenticated; 
GRANT EXECUTE ON FUNCTION transition_to_q3_2025 TO authenticated;

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_player_aggregate_season ON player_aggregate_stats(season);
CREATE INDEX IF NOT EXISTS idx_player_stats_season ON player_stats(season);
CREATE INDEX IF NOT EXISTS idx_elo_seasons_active ON elo_seasons(is_active) WHERE is_active = true;

COMMENT ON TABLE elo_seasons IS 'Defines ELO competitive seasons';
COMMENT ON COLUMN player_aggregate_stats.season IS 'Season identifier for this player record';
COMMENT ON COLUMN player_aggregate_stats.archived_elo IS 'Previous season ELO for reference';
COMMENT ON COLUMN player_aggregate_stats.season_influence IS 'Percentage of previous season ELO carried over';
COMMENT ON FUNCTION transition_to_q3_2025 IS 'Archives Q2-2025 data and resets Q3-2025 with soft ELO influence'; 