-- Basic ELO System Setup
-- Run this first to set up the basic structure

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

-- Insert the seasons
INSERT INTO elo_seasons (season_name, start_date, end_date, is_active, description) VALUES
    ('Q2-2025', '2025-04-01', '2025-06-30', false, 'Q2 2025 Competitive Season - Archived'),
    ('Q3-2025', '2025-07-01', '2025-09-30', true, 'Q3 2025 Competitive Season - Current')
ON CONFLICT (season_name) DO UPDATE SET
    is_active = EXCLUDED.is_active,
    description = EXCLUDED.description;

-- Create ELO tiers table
CREATE TABLE IF NOT EXISTS elo_tiers (
    id BIGSERIAL PRIMARY KEY,
    tier_name VARCHAR(20) UNIQUE NOT NULL,
    tier_color VARCHAR(10) NOT NULL,
    min_elo INTEGER NOT NULL,
    max_elo INTEGER NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Insert ELO tiers
INSERT INTO elo_tiers (tier_name, tier_color, min_elo, max_elo) VALUES
    ('Bronze', '#CD7F32', 0, 1199),
    ('Silver', '#C0C0C0', 1200, 1499),
    ('Gold', '#FFD700', 1500, 1799),
    ('Platinum', '#E5E4E2', 1800, 2199),
    ('Diamond', '#B9F2FF', 2200, 2399),
    ('Legend', '#FF6B35', 2400, 2800)
ON CONFLICT (tier_name) DO UPDATE SET
    tier_color = EXCLUDED.tier_color,
    min_elo = EXCLUDED.min_elo,
    max_elo = EXCLUDED.max_elo;

-- Grant permissions
GRANT SELECT ON elo_seasons TO anon, authenticated;
GRANT SELECT ON elo_tiers TO anon, authenticated;

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_player_aggregate_season ON player_aggregate_stats(season);
CREATE INDEX IF NOT EXISTS idx_player_stats_season ON player_stats(season);
CREATE INDEX IF NOT EXISTS idx_elo_seasons_active ON elo_seasons(is_active) WHERE is_active = true;

-- Comments
COMMENT ON TABLE elo_seasons IS 'Defines ELO competitive seasons';
COMMENT ON TABLE elo_tiers IS 'ELO tier definitions with colors and ranges';
COMMENT ON COLUMN player_aggregate_stats.season IS 'Season identifier for this player record';
COMMENT ON COLUMN player_aggregate_stats.archived_elo IS 'Previous season ELO for reference';
COMMENT ON COLUMN player_aggregate_stats.season_influence IS 'Percentage of previous season ELO carried over'; 