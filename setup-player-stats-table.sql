-- Player Stats Database Schema
-- This script creates tables for tracking detailed player statistics

-- Main player stats table for individual game records
CREATE TABLE player_stats (
    id SERIAL PRIMARY KEY,
    game_id VARCHAR(255), -- Links to match system or unique game identifier
    player_name VARCHAR(255) NOT NULL,
    team VARCHAR(255),
    game_mode VARCHAR(50) NOT NULL,
    arena_name VARCHAR(255),
    base_used VARCHAR(10),
    side VARCHAR(20), -- 'offense', 'defense', 'N/A'
    result VARCHAR(10), -- 'Win', 'Loss'
    main_class VARCHAR(100),
    
    -- Core stats
    kills INTEGER DEFAULT 0,
    deaths INTEGER DEFAULT 0,
    captures INTEGER DEFAULT 0,
    carrier_kills INTEGER DEFAULT 0,
    carry_time_seconds INTEGER DEFAULT 0,
    class_swaps INTEGER DEFAULT 0,
    turret_damage INTEGER DEFAULT 0,
    eb_hits INTEGER DEFAULT 0,
    
    -- New advanced stats
    accuracy DECIMAL(5,3) DEFAULT 0.000,
    avg_resource_unused_per_death DECIMAL(8,2) DEFAULT 0.00,
    avg_explosive_unused_per_death DECIMAL(8,2) DEFAULT 0.00,
    
    -- Game metadata
    game_length_minutes DECIMAL(6,2) DEFAULT 0.00,
    game_date TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Indexes for performance
    CONSTRAINT valid_accuracy CHECK (accuracy >= 0 AND accuracy <= 1),
    CONSTRAINT valid_result CHECK (result IN ('Win', 'Loss')),
    CONSTRAINT valid_side CHECK (side IN ('offense', 'defense', 'N/A'))
);

-- Player aggregate stats table for overall performance tracking
CREATE TABLE player_aggregate_stats (
    id SERIAL PRIMARY KEY,
    player_name VARCHAR(255) NOT NULL,
    game_mode VARCHAR(50) NOT NULL,
    
    -- Aggregate counters
    total_games INTEGER DEFAULT 0,
    total_wins INTEGER DEFAULT 0,
    total_losses INTEGER DEFAULT 0,
    
    -- Aggregate stats
    total_kills INTEGER DEFAULT 0,
    total_deaths INTEGER DEFAULT 0,
    total_captures INTEGER DEFAULT 0,
    total_carrier_kills INTEGER DEFAULT 0,
    total_carry_time_seconds BIGINT DEFAULT 0,
    total_class_swaps INTEGER DEFAULT 0,
    total_turret_damage BIGINT DEFAULT 0,
    total_eb_hits INTEGER DEFAULT 0,
    
    -- Calculated averages
    avg_kills_per_game DECIMAL(6,2) DEFAULT 0.00,
    avg_deaths_per_game DECIMAL(6,2) DEFAULT 0.00,
    avg_captures_per_game DECIMAL(6,2) DEFAULT 0.00,
    avg_accuracy DECIMAL(5,3) DEFAULT 0.000,
    avg_resource_unused_per_death DECIMAL(8,2) DEFAULT 0.00,
    avg_explosive_unused_per_death DECIMAL(8,2) DEFAULT 0.00,
    
    -- Performance metrics
    kill_death_ratio DECIMAL(6,3) DEFAULT 0.000,
    win_rate DECIMAL(5,3) DEFAULT 0.000,
    
    -- Timestamps
    first_game_date TIMESTAMP WITH TIME ZONE,
    last_game_date TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Unique constraint to prevent duplicate player/gamemode combinations
    UNIQUE(player_name, game_mode)
);

-- Create indexes for better query performance
CREATE INDEX idx_player_stats_game_id ON player_stats(game_id);
CREATE INDEX idx_player_stats_player_name ON player_stats(player_name);
CREATE INDEX idx_player_stats_game_mode ON player_stats(game_mode);
CREATE INDEX idx_player_stats_game_date ON player_stats(game_date);
CREATE INDEX idx_player_stats_player_game_mode ON player_stats(player_name, game_mode);

CREATE INDEX idx_player_aggregate_player_name ON player_aggregate_stats(player_name);
CREATE INDEX idx_player_aggregate_game_mode ON player_aggregate_stats(game_mode);
CREATE INDEX idx_player_aggregate_updated_at ON player_aggregate_stats(updated_at);

-- Function to update aggregate stats when new game stats are inserted
CREATE OR REPLACE FUNCTION update_player_aggregates()
RETURNS TRIGGER AS $$
BEGIN
    -- Insert or update aggregate stats
    INSERT INTO player_aggregate_stats (
        player_name, 
        game_mode, 
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
        first_game_date,
        last_game_date
    ) VALUES (
        NEW.player_name,
        NEW.game_mode,
        1,
        CASE WHEN NEW.result = 'Win' THEN 1 ELSE 0 END,
        CASE WHEN NEW.result = 'Loss' THEN 1 ELSE 0 END,
        NEW.kills,
        NEW.deaths,
        NEW.captures,
        NEW.carrier_kills,
        NEW.carry_time_seconds,
        NEW.class_swaps,
        NEW.turret_damage,
        NEW.eb_hits,
        NEW.game_date,
        NEW.game_date
    )
    ON CONFLICT (player_name, game_mode) DO UPDATE SET
        total_games = player_aggregate_stats.total_games + 1,
        total_wins = player_aggregate_stats.total_wins + CASE WHEN NEW.result = 'Win' THEN 1 ELSE 0 END,
        total_losses = player_aggregate_stats.total_losses + CASE WHEN NEW.result = 'Loss' THEN 1 ELSE 0 END,
        total_kills = player_aggregate_stats.total_kills + NEW.kills,
        total_deaths = player_aggregate_stats.total_deaths + NEW.deaths,
        total_captures = player_aggregate_stats.total_captures + NEW.captures,
        total_carrier_kills = player_aggregate_stats.total_carrier_kills + NEW.carrier_kills,
        total_carry_time_seconds = player_aggregate_stats.total_carry_time_seconds + NEW.carry_time_seconds,
        total_class_swaps = player_aggregate_stats.total_class_swaps + NEW.class_swaps,
        total_turret_damage = player_aggregate_stats.total_turret_damage + NEW.turret_damage,
        total_eb_hits = player_aggregate_stats.total_eb_hits + NEW.eb_hits,
        last_game_date = NEW.game_date,
        updated_at = NOW(),
        -- Recalculate averages
        avg_kills_per_game = (player_aggregate_stats.total_kills + NEW.kills)::DECIMAL / (player_aggregate_stats.total_games + 1),
        avg_deaths_per_game = (player_aggregate_stats.total_deaths + NEW.deaths)::DECIMAL / (player_aggregate_stats.total_games + 1),
        avg_captures_per_game = (player_aggregate_stats.total_captures + NEW.captures)::DECIMAL / (player_aggregate_stats.total_games + 1),
        kill_death_ratio = CASE 
            WHEN (player_aggregate_stats.total_deaths + NEW.deaths) = 0 THEN (player_aggregate_stats.total_kills + NEW.kills)::DECIMAL
            ELSE (player_aggregate_stats.total_kills + NEW.kills)::DECIMAL / (player_aggregate_stats.total_deaths + NEW.deaths)
        END,
        win_rate = (player_aggregate_stats.total_wins + CASE WHEN NEW.result = 'Win' THEN 1 ELSE 0 END)::DECIMAL / (player_aggregate_stats.total_games + 1);
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to automatically update aggregates
CREATE TRIGGER trigger_update_player_aggregates
    AFTER INSERT ON player_stats
    FOR EACH ROW
    EXECUTE FUNCTION update_player_aggregates();

-- Enable Row Level Security
ALTER TABLE player_stats ENABLE ROW LEVEL SECURITY;
ALTER TABLE player_aggregate_stats ENABLE ROW LEVEL SECURITY;

-- Create policies for public read access
CREATE POLICY "Enable read access for all users" ON player_stats FOR SELECT USING (true);
CREATE POLICY "Enable read access for all users" ON player_aggregate_stats FOR SELECT USING (true);

-- Create policy for insert access (for API)
CREATE POLICY "Enable insert for service role" ON player_stats FOR INSERT WITH CHECK (true);
CREATE POLICY "Enable update for service role" ON player_aggregate_stats FOR ALL USING (true); 