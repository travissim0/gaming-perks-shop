-- Update Triple Threat Player Records for Alias-Only Support
-- This script safely updates the existing tt_player_records table and functions

-- First, drop existing policies to recreate them
DROP POLICY IF EXISTS "Anyone can view player records" ON tt_player_records;
DROP POLICY IF EXISTS "Admins can manage player records" ON tt_player_records;

-- Drop existing functions to recreate them
DROP FUNCTION IF EXISTS get_or_create_tt_player_record(UUID, TEXT);
DROP FUNCTION IF EXISTS update_tt_player_game_stats(UUID, UUID, TEXT, TEXT);
DROP FUNCTION IF EXISTS update_tt_player_series_stats(UUID, UUID, TEXT, TEXT);
DROP FUNCTION IF EXISTS increment_tt_player_game_wins(TEXT);
DROP FUNCTION IF EXISTS increment_tt_player_game_losses(TEXT);
DROP FUNCTION IF EXISTS increment_tt_player_series_wins(TEXT);
DROP FUNCTION IF EXISTS increment_tt_player_series_losses(TEXT);

-- Update the table structure to allow NULL player_id
ALTER TABLE tt_player_records ALTER COLUMN player_id DROP NOT NULL;

-- Add unique constraint on player_alias if it doesn't exist
DO $$ 
BEGIN
    BEGIN
        ALTER TABLE tt_player_records ADD CONSTRAINT tt_player_records_player_alias_key UNIQUE (player_alias);
    EXCEPTION
        WHEN duplicate_table THEN
            -- Constraint already exists, ignore
            NULL;
    END;
END $$;

-- Recreate the helper function with alias-only support
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

-- Create increment functions for alias-based stats updates
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

-- Keep the original functions for backward compatibility (but they won't be used by the new API)
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

-- Recreate RLS policies
CREATE POLICY "Anyone can view player records" ON tt_player_records 
    FOR SELECT USING (true);

CREATE POLICY "Admins can manage player records" ON tt_player_records 
    FOR ALL USING (
        auth.uid() IN (
            SELECT id FROM profiles WHERE is_admin = true OR ctf_role = 'ctf_admin'
        )
    );

-- Add comments
COMMENT ON TABLE tt_player_records IS 'Triple Threat player overall performance records - tracks cumulative game/series wins and losses (supports both linked accounts and alias-only records)';
COMMENT ON COLUMN tt_player_records.player_id IS 'User ID from profiles table (NULL for alias-only records from game server)';
COMMENT ON COLUMN tt_player_records.player_alias IS 'Player alias stored at time of record creation for historical accuracy';
COMMENT ON COLUMN tt_player_records.game_wins IS 'Total individual game wins across all matches';
COMMENT ON COLUMN tt_player_records.game_losses IS 'Total individual game losses across all matches';
COMMENT ON COLUMN tt_player_records.series_wins IS 'Total best-of-X series wins';
COMMENT ON COLUMN tt_player_records.series_losses IS 'Total best-of-X series losses';

-- Success message
DO $$ 
BEGIN 
    RAISE NOTICE 'Triple Threat player records table updated successfully for alias-only support!';
END $$;
