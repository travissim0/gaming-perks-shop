-- Triple Threat Player Records Table
-- Tracks overall game wins/losses, series wins/losses, and winning players

CREATE TABLE IF NOT EXISTS tt_player_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    player_id UUID REFERENCES profiles(id) ON DELETE CASCADE, -- NULL for alias-only records
    player_alias TEXT NOT NULL, -- Store alias at time of record for historical accuracy
    
    -- Game-level statistics
    game_wins INTEGER DEFAULT 0 NOT NULL,
    game_losses INTEGER DEFAULT 0 NOT NULL,
    
    -- Series-level statistics (best-of-X series)
    series_wins INTEGER DEFAULT 0 NOT NULL,
    series_losses INTEGER DEFAULT 0 NOT NULL,
    
    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- Constraints
    CONSTRAINT tt_player_records_positive_stats CHECK (
        game_wins >= 0 AND 
        game_losses >= 0 AND 
        series_wins >= 0 AND 
        series_losses >= 0
    ),
    
    -- One record per player (for linked accounts) or per alias (for alias-only records)
    UNIQUE(player_id), -- For linked accounts
    UNIQUE(player_alias) -- For alias-only records
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_tt_player_records_player_id ON tt_player_records(player_id);
CREATE INDEX IF NOT EXISTS idx_tt_player_records_game_wins ON tt_player_records(game_wins DESC);
CREATE INDEX IF NOT EXISTS idx_tt_player_records_series_wins ON tt_player_records(series_wins DESC);
CREATE INDEX IF NOT EXISTS idx_tt_player_records_updated ON tt_player_records(updated_at DESC);

-- Create a composite index for win rates
CREATE INDEX IF NOT EXISTS idx_tt_player_records_win_rates ON tt_player_records(
    (CASE WHEN (game_wins + game_losses) > 0 THEN game_wins::FLOAT / (game_wins + game_losses) ELSE 0 END) DESC,
    (CASE WHEN (series_wins + series_losses) > 0 THEN series_wins::FLOAT / (series_wins + series_losses) ELSE 0 END) DESC
);

-- Enable RLS
ALTER TABLE tt_player_records ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Anyone can view player records" ON tt_player_records 
    FOR SELECT USING (true);

CREATE POLICY "Admins can manage player records" ON tt_player_records 
    FOR ALL USING (
        auth.uid() IN (
            SELECT id FROM profiles WHERE is_admin = true OR ctf_role = 'ctf_admin'
        )
    );

-- Create trigger to update the updated_at timestamp
CREATE OR REPLACE FUNCTION update_tt_player_records_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tt_player_records_updated_at_trigger
    BEFORE UPDATE ON tt_player_records
    FOR EACH ROW EXECUTE FUNCTION update_tt_player_records_updated_at();

-- Helper function to get or create player record (supports alias-only records)
CREATE OR REPLACE FUNCTION get_or_create_tt_player_record(
    p_player_id UUID DEFAULT NULL,
    p_player_alias TEXT DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
    record_id UUID;
    alias_to_use TEXT;
BEGIN
    -- If we have a player_id, try to find by player_id first
    IF p_player_id IS NOT NULL THEN
        SELECT id INTO record_id
        FROM tt_player_records
        WHERE player_id = p_player_id;
        
        -- If record exists, return it
        IF record_id IS NOT NULL THEN
            RETURN record_id;
        END IF;
    END IF;
    
    -- If we have an alias, try to find by alias
    IF p_player_alias IS NOT NULL THEN
        SELECT id INTO record_id
        FROM tt_player_records
        WHERE player_alias = p_player_alias;
        
        -- If record exists, return it
        IF record_id IS NOT NULL THEN
            RETURN record_id;
        END IF;
    END IF;
    
    -- Determine alias to use
    IF p_player_alias IS NOT NULL THEN
        alias_to_use = p_player_alias;
    ELSIF p_player_id IS NOT NULL THEN
        -- Get player alias from profiles table
        SELECT COALESCE(in_game_alias, email) INTO alias_to_use
        FROM profiles
        WHERE id = p_player_id;
    ELSE
        RAISE EXCEPTION 'Either player_id or player_alias must be provided';
    END IF;
    
    -- Create new record (player_id can be NULL for alias-only records)
    INSERT INTO tt_player_records (player_id, player_alias)
    VALUES (p_player_id, alias_to_use)
    RETURNING id INTO record_id;
    
    RETURN record_id;
END;
$$ LANGUAGE plpgsql;

-- Increment functions for alias-based stats updates
CREATE OR REPLACE FUNCTION increment_tt_player_game_wins(p_player_alias TEXT)
RETURNS VOID AS $$
BEGIN
    UPDATE tt_player_records
    SET game_wins = game_wins + 1,
        updated_at = NOW()
    WHERE player_alias = p_player_alias;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION increment_tt_player_game_losses(p_player_alias TEXT)
RETURNS VOID AS $$
BEGIN
    UPDATE tt_player_records
    SET game_losses = game_losses + 1,
        updated_at = NOW()
    WHERE player_alias = p_player_alias;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION increment_tt_player_series_wins(p_player_alias TEXT)
RETURNS VOID AS $$
BEGIN
    UPDATE tt_player_records
    SET series_wins = series_wins + 1,
        updated_at = NOW()
    WHERE player_alias = p_player_alias;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION increment_tt_player_series_losses(p_player_alias TEXT)
RETURNS VOID AS $$
BEGIN
    UPDATE tt_player_records
    SET series_losses = series_losses + 1,
        updated_at = NOW()
    WHERE player_alias = p_player_alias;
END;
$$ LANGUAGE plpgsql;

-- Function to update player stats after a game
CREATE OR REPLACE FUNCTION update_tt_player_game_stats(
    p_winner_id UUID,
    p_loser_id UUID,
    p_winner_alias TEXT DEFAULT NULL,
    p_loser_alias TEXT DEFAULT NULL
)
RETURNS VOID AS $$
BEGIN
    -- Ensure both players have records
    PERFORM get_or_create_tt_player_record(p_winner_id, p_winner_alias);
    PERFORM get_or_create_tt_player_record(p_loser_id, p_loser_alias);
    
    -- Update winner's game wins
    UPDATE tt_player_records
    SET game_wins = game_wins + 1,
        updated_at = NOW()
    WHERE player_id = p_winner_id;
    
    -- Update loser's game losses
    UPDATE tt_player_records
    SET game_losses = game_losses + 1,
        updated_at = NOW()
    WHERE player_id = p_loser_id;
END;
$$ LANGUAGE plpgsql;

-- Function to update player stats after a series
CREATE OR REPLACE FUNCTION update_tt_player_series_stats(
    p_winner_id UUID,
    p_loser_id UUID,
    p_winner_alias TEXT DEFAULT NULL,
    p_loser_alias TEXT DEFAULT NULL
)
RETURNS VOID AS $$
BEGIN
    -- Ensure both players have records
    PERFORM get_or_create_tt_player_record(p_winner_id, p_winner_alias);
    PERFORM get_or_create_tt_player_record(p_loser_id, p_loser_alias);
    
    -- Update winner's series wins
    UPDATE tt_player_records
    SET series_wins = series_wins + 1,
        updated_at = NOW()
    WHERE player_id = p_winner_id;
    
    -- Update loser's series losses
    UPDATE tt_player_records
    SET series_losses = series_losses + 1,
        updated_at = NOW()
    WHERE player_id = p_loser_id;
END;
$$ LANGUAGE plpgsql;

-- Function to get top players by game wins
CREATE OR REPLACE FUNCTION get_tt_top_players_by_game_wins(limit_count INTEGER DEFAULT 10)
RETURNS TABLE (
    player_id UUID,
    player_alias TEXT,
    game_wins INTEGER,
    game_losses INTEGER,
    total_games INTEGER,
    win_rate NUMERIC(5,2),
    series_wins INTEGER,
    series_losses INTEGER,
    updated_at TIMESTAMPTZ
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        pr.player_id,
        pr.player_alias,
        pr.game_wins,
        pr.game_losses,
        (pr.game_wins + pr.game_losses) as total_games,
        CASE 
            WHEN (pr.game_wins + pr.game_losses) > 0 
            THEN ROUND((pr.game_wins::NUMERIC / (pr.game_wins + pr.game_losses)) * 100, 2)
            ELSE 0
        END as win_rate,
        pr.series_wins,
        pr.series_losses,
        pr.updated_at
    FROM tt_player_records pr
    WHERE (pr.game_wins + pr.game_losses) > 0
    ORDER BY pr.game_wins DESC, win_rate DESC
    LIMIT limit_count;
END;
$$ LANGUAGE plpgsql;

-- Function to get top players by series wins
CREATE OR REPLACE FUNCTION get_tt_top_players_by_series_wins(limit_count INTEGER DEFAULT 10)
RETURNS TABLE (
    player_id UUID,
    player_alias TEXT,
    series_wins INTEGER,
    series_losses INTEGER,
    total_series INTEGER,
    series_win_rate NUMERIC(5,2),
    game_wins INTEGER,
    game_losses INTEGER,
    updated_at TIMESTAMPTZ
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        pr.player_id,
        pr.player_alias,
        pr.series_wins,
        pr.series_losses,
        (pr.series_wins + pr.series_losses) as total_series,
        CASE 
            WHEN (pr.series_wins + pr.series_losses) > 0 
            THEN ROUND((pr.series_wins::NUMERIC / (pr.series_wins + pr.series_losses)) * 100, 2)
            ELSE 0
        END as series_win_rate,
        pr.game_wins,
        pr.game_losses,
        pr.updated_at
    FROM tt_player_records pr
    WHERE (pr.series_wins + pr.series_losses) > 0
    ORDER BY pr.series_wins DESC, series_win_rate DESC
    LIMIT limit_count;
END;
$$ LANGUAGE plpgsql;

-- Function to get player record by ID
CREATE OR REPLACE FUNCTION get_tt_player_record(p_player_id UUID)
RETURNS TABLE (
    player_id UUID,
    player_alias TEXT,
    game_wins INTEGER,
    game_losses INTEGER,
    total_games INTEGER,
    game_win_rate NUMERIC(5,2),
    series_wins INTEGER,
    series_losses INTEGER,
    total_series INTEGER,
    series_win_rate NUMERIC(5,2),
    created_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        pr.player_id,
        pr.player_alias,
        pr.game_wins,
        pr.game_losses,
        (pr.game_wins + pr.game_losses) as total_games,
        CASE 
            WHEN (pr.game_wins + pr.game_losses) > 0 
            THEN ROUND((pr.game_wins::NUMERIC / (pr.game_wins + pr.game_losses)) * 100, 2)
            ELSE 0
        END as game_win_rate,
        pr.series_wins,
        pr.series_losses,
        (pr.series_wins + pr.series_losses) as total_series,
        CASE 
            WHEN (pr.series_wins + pr.series_losses) > 0 
            THEN ROUND((pr.series_wins::NUMERIC / (pr.series_wins + pr.series_losses)) * 100, 2)
            ELSE 0
        END as series_win_rate,
        pr.created_at,
        pr.updated_at
    FROM tt_player_records pr
    WHERE pr.player_id = p_player_id;
END;
$$ LANGUAGE plpgsql;

COMMENT ON TABLE tt_player_records IS 'Triple Threat player overall performance records - tracks cumulative game/series wins and losses';
COMMENT ON COLUMN tt_player_records.player_alias IS 'Player alias stored at time of record creation for historical accuracy';
COMMENT ON COLUMN tt_player_records.game_wins IS 'Total individual game wins across all matches';
COMMENT ON COLUMN tt_player_records.game_losses IS 'Total individual game losses across all matches';
COMMENT ON COLUMN tt_player_records.series_wins IS 'Total best-of-X series wins';
COMMENT ON COLUMN tt_player_records.series_losses IS 'Total best-of-X series losses';
