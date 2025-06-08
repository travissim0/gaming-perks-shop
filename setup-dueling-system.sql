-- Dueling System Database Schema
-- This script creates tables for tracking duels and tournaments

-- Create dueling_stats table for individual duel records
CREATE TABLE IF NOT EXISTS dueling_stats (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    duel_id VARCHAR(255) NOT NULL, -- Unique identifier for the duel
    
    -- Participants
    player1_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
    player1_alias VARCHAR(255) NOT NULL,
    player2_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
    player2_alias VARCHAR(255) NOT NULL,
    
    -- Duel details
    winner_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
    winner_alias VARCHAR(255) NOT NULL,
    loser_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
    loser_alias VARCHAR(255) NOT NULL,
    
    -- Game details
    arena_name VARCHAR(255) DEFAULT 'Unknown',
    game_mode VARCHAR(50) DEFAULT 'Duel',
    duel_type VARCHAR(50) DEFAULT 'pickup', -- 'pickup' or 'tournament'
    
    -- Round/Match info for tournaments
    tournament_id UUID,
    round_name VARCHAR(100), -- 'Round 1', 'Quarterfinals', 'Semifinals', 'Finals', etc.
    bracket_type VARCHAR(50) DEFAULT 'main', -- 'main' (winners) or 'losers'
    
    -- Stats
    player1_score INTEGER DEFAULT 0,
    player2_score INTEGER DEFAULT 0,
    total_rounds INTEGER DEFAULT 1,
    duel_length_minutes DECIMAL(6,2) DEFAULT 0.00,
    
    -- Timestamps
    duel_date TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Constraints
    CONSTRAINT valid_duel_type CHECK (duel_type IN ('pickup', 'tournament')),
    CONSTRAINT valid_bracket_type CHECK (bracket_type IN ('main', 'losers')),
    CONSTRAINT different_players CHECK (player1_id != player2_id)
);

-- Create tournaments table
CREATE TABLE IF NOT EXISTS tournaments (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    
    -- Tournament settings
    tournament_type VARCHAR(50) DEFAULT 'single_elimination', -- 'single_elimination', 'double_elimination'
    max_participants INTEGER DEFAULT 16,
    entry_fee INTEGER DEFAULT 0, -- in cents
    prize_pool INTEGER DEFAULT 0, -- in cents
    
    -- Status and timing
    status VARCHAR(50) DEFAULT 'registration', -- 'registration', 'in_progress', 'completed', 'cancelled'
    registration_deadline TIMESTAMP WITH TIME ZONE,
    start_time TIMESTAMP WITH TIME ZONE,
    end_time TIMESTAMP WITH TIME ZONE,
    
    -- Results
    winner_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
    runner_up_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
    third_place_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
    
    -- Admin
    created_by UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    CONSTRAINT valid_tournament_type CHECK (tournament_type IN ('single_elimination', 'double_elimination')),
    CONSTRAINT valid_status CHECK (status IN ('registration', 'in_progress', 'completed', 'cancelled'))
);

-- Create tournament_participants table
CREATE TABLE IF NOT EXISTS tournament_participants (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    tournament_id UUID NOT NULL,
    player_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
    player_alias VARCHAR(255) NOT NULL,
    
    -- Registration info
    registration_date TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    seed_position INTEGER, -- For bracket seeding
    
    -- Tournament progress
    current_status VARCHAR(50) DEFAULT 'active', -- 'active', 'eliminated', 'winner', 'runner_up'
    elimination_round VARCHAR(100), -- Which round they were eliminated in
    final_placement INTEGER, -- Final ranking in tournament
    
    -- Constraints
    UNIQUE(tournament_id, player_id),
    CONSTRAINT valid_participant_status CHECK (current_status IN ('active', 'eliminated', 'winner', 'runner_up'))
);

-- Add foreign key constraint after tournaments table is created
ALTER TABLE tournament_participants 
ADD CONSTRAINT fk_tournament_participants_tournament 
FOREIGN KEY (tournament_id) REFERENCES tournaments(id) ON DELETE CASCADE;

-- Add foreign key constraint for dueling_stats
ALTER TABLE dueling_stats 
ADD CONSTRAINT fk_dueling_stats_tournament 
FOREIGN KEY (tournament_id) REFERENCES tournaments(id) ON DELETE CASCADE;

-- Create tournament_matches table for bracket structure
CREATE TABLE IF NOT EXISTS tournament_matches (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    tournament_id UUID NOT NULL,
    
    -- Match details
    round_name VARCHAR(100) NOT NULL, -- 'Round 1', 'Quarterfinals', etc.
    match_number INTEGER NOT NULL, -- Position within the round
    bracket_type VARCHAR(50) DEFAULT 'main', -- 'main' (winners) or 'losers'
    
    -- Participants
    player1_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
    player1_alias VARCHAR(255),
    player2_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
    player2_alias VARCHAR(255),
    
    -- Results
    winner_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
    winner_alias VARCHAR(255),
    loser_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
    loser_alias VARCHAR(255),
    
    -- Game reference
    duel_id UUID,
    
    -- Status
    status VARCHAR(50) DEFAULT 'pending', -- 'pending', 'ready', 'in_progress', 'completed'
    scheduled_time TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    CONSTRAINT valid_match_bracket_type CHECK (bracket_type IN ('main', 'losers')),
    CONSTRAINT valid_match_status CHECK (status IN ('pending', 'ready', 'in_progress', 'completed'))
);

-- Add foreign key constraints after tables are created
ALTER TABLE tournament_matches 
ADD CONSTRAINT fk_tournament_matches_tournament 
FOREIGN KEY (tournament_id) REFERENCES tournaments(id) ON DELETE CASCADE;

ALTER TABLE tournament_matches 
ADD CONSTRAINT fk_tournament_matches_duel 
FOREIGN KEY (duel_id) REFERENCES dueling_stats(id) ON DELETE SET NULL;

-- Create dueling_aggregate_stats table for player statistics
CREATE TABLE IF NOT EXISTS dueling_aggregate_stats (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    player_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
    player_alias VARCHAR(255) NOT NULL,
    
    -- Overall stats
    total_duels INTEGER DEFAULT 0,
    total_wins INTEGER DEFAULT 0,
    total_losses INTEGER DEFAULT 0,
    win_rate DECIMAL(5,3) DEFAULT 0.000,
    
    -- Pickup vs Tournament stats
    pickup_duels INTEGER DEFAULT 0,
    pickup_wins INTEGER DEFAULT 0,
    pickup_losses INTEGER DEFAULT 0,
    pickup_win_rate DECIMAL(5,3) DEFAULT 0.000,
    
    tournament_duels INTEGER DEFAULT 0,
    tournament_wins INTEGER DEFAULT 0,
    tournament_losses INTEGER DEFAULT 0,
    tournament_win_rate DECIMAL(5,3) DEFAULT 0.000,
    
    -- Tournament achievements
    tournaments_entered INTEGER DEFAULT 0,
    tournaments_won INTEGER DEFAULT 0,
    tournaments_runner_up INTEGER DEFAULT 0,
    tournaments_top_3 INTEGER DEFAULT 0,
    
    -- Streaks and records
    current_win_streak INTEGER DEFAULT 0,
    longest_win_streak INTEGER DEFAULT 0,
    current_loss_streak INTEGER DEFAULT 0,
    longest_loss_streak INTEGER DEFAULT 0,
    
    -- Timestamps
    first_duel_date TIMESTAMP WITH TIME ZONE,
    last_duel_date TIMESTAMP WITH TIME ZONE,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Unique constraint
    UNIQUE(player_id)
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_dueling_stats_duel_id ON dueling_stats(duel_id);
CREATE INDEX IF NOT EXISTS idx_dueling_stats_player1 ON dueling_stats(player1_id);
CREATE INDEX IF NOT EXISTS idx_dueling_stats_player2 ON dueling_stats(player2_id);
CREATE INDEX IF NOT EXISTS idx_dueling_stats_winner ON dueling_stats(winner_id);
CREATE INDEX IF NOT EXISTS idx_dueling_stats_tournament ON dueling_stats(tournament_id);
CREATE INDEX IF NOT EXISTS idx_dueling_stats_date ON dueling_stats(duel_date);
CREATE INDEX IF NOT EXISTS idx_dueling_stats_type ON dueling_stats(duel_type);

CREATE INDEX IF NOT EXISTS idx_tournaments_status ON tournaments(status);
CREATE INDEX IF NOT EXISTS idx_tournaments_creator ON tournaments(created_by);
CREATE INDEX IF NOT EXISTS idx_tournaments_dates ON tournaments(start_time, end_time);

CREATE INDEX IF NOT EXISTS idx_tournament_participants_tournament ON tournament_participants(tournament_id);
CREATE INDEX IF NOT EXISTS idx_tournament_participants_player ON tournament_participants(player_id);
CREATE INDEX IF NOT EXISTS idx_tournament_participants_status ON tournament_participants(current_status);

CREATE INDEX IF NOT EXISTS idx_tournament_matches_tournament ON tournament_matches(tournament_id);
CREATE INDEX IF NOT EXISTS idx_tournament_matches_round ON tournament_matches(tournament_id, round_name);
CREATE INDEX IF NOT EXISTS idx_tournament_matches_status ON tournament_matches(status);

CREATE INDEX IF NOT EXISTS idx_dueling_aggregate_player ON dueling_aggregate_stats(player_id);
CREATE INDEX IF NOT EXISTS idx_dueling_aggregate_win_rate ON dueling_aggregate_stats(win_rate);

-- Add comments for documentation
COMMENT ON TABLE dueling_stats IS 'Individual duel records for both pickup games and tournament matches';
COMMENT ON TABLE tournaments IS 'Tournament events with brackets and prizes';
COMMENT ON TABLE tournament_participants IS 'Players registered for tournaments';
COMMENT ON TABLE tournament_matches IS 'Individual matches within tournament brackets';
COMMENT ON TABLE dueling_aggregate_stats IS 'Aggregated statistics for each player across all duels';

-- Create functions for updating aggregate stats
CREATE OR REPLACE FUNCTION update_dueling_aggregate_stats()
RETURNS TRIGGER AS $$
BEGIN
    -- Update aggregate stats for both players when a new duel is added
    IF TG_OP = 'INSERT' THEN
        -- Update winner stats
        INSERT INTO dueling_aggregate_stats (
            player_id, player_alias, total_duels, total_wins,
            pickup_duels, pickup_wins, tournament_duels, tournament_wins,
            tournaments_entered, first_duel_date, last_duel_date
        )
        VALUES (
            NEW.winner_id, NEW.winner_alias, 1, 1,
            CASE WHEN NEW.duel_type = 'pickup' THEN 1 ELSE 0 END,
            CASE WHEN NEW.duel_type = 'pickup' THEN 1 ELSE 0 END,
            CASE WHEN NEW.duel_type = 'tournament' THEN 1 ELSE 0 END,
            CASE WHEN NEW.duel_type = 'tournament' THEN 1 ELSE 0 END,
            CASE WHEN NEW.duel_type = 'tournament' THEN 1 ELSE 0 END,
            NEW.duel_date, NEW.duel_date
        )
        ON CONFLICT (player_id) DO UPDATE SET
            total_duels = dueling_aggregate_stats.total_duels + 1,
            total_wins = dueling_aggregate_stats.total_wins + 1,
            pickup_duels = dueling_aggregate_stats.pickup_duels + CASE WHEN NEW.duel_type = 'pickup' THEN 1 ELSE 0 END,
            pickup_wins = dueling_aggregate_stats.pickup_wins + CASE WHEN NEW.duel_type = 'pickup' THEN 1 ELSE 0 END,
            tournament_duels = dueling_aggregate_stats.tournament_duels + CASE WHEN NEW.duel_type = 'tournament' THEN 1 ELSE 0 END,
            tournament_wins = dueling_aggregate_stats.tournament_wins + CASE WHEN NEW.duel_type = 'tournament' THEN 1 ELSE 0 END,
            tournaments_entered = dueling_aggregate_stats.tournaments_entered + CASE WHEN NEW.duel_type = 'tournament' THEN 1 ELSE 0 END,
            last_duel_date = NEW.duel_date,
            win_rate = ROUND((dueling_aggregate_stats.total_wins + 1)::DECIMAL / (dueling_aggregate_stats.total_duels + 1), 3),
            pickup_win_rate = CASE 
                WHEN dueling_aggregate_stats.pickup_duels + CASE WHEN NEW.duel_type = 'pickup' THEN 1 ELSE 0 END > 0 
                THEN ROUND((dueling_aggregate_stats.pickup_wins + CASE WHEN NEW.duel_type = 'pickup' THEN 1 ELSE 0 END)::DECIMAL / (dueling_aggregate_stats.pickup_duels + CASE WHEN NEW.duel_type = 'pickup' THEN 1 ELSE 0 END), 3)
                ELSE 0 
            END,
            tournament_win_rate = CASE 
                WHEN dueling_aggregate_stats.tournament_duels + CASE WHEN NEW.duel_type = 'tournament' THEN 1 ELSE 0 END > 0 
                THEN ROUND((dueling_aggregate_stats.tournament_wins + CASE WHEN NEW.duel_type = 'tournament' THEN 1 ELSE 0 END)::DECIMAL / (dueling_aggregate_stats.tournament_duels + CASE WHEN NEW.duel_type = 'tournament' THEN 1 ELSE 0 END), 3)
                ELSE 0 
            END,
            updated_at = NOW();

        -- Update loser stats
        INSERT INTO dueling_aggregate_stats (
            player_id, player_alias, total_duels, total_losses,
            pickup_duels, pickup_losses, tournament_duels, tournament_losses,
            tournaments_entered, first_duel_date, last_duel_date
        )
        VALUES (
            NEW.loser_id, NEW.loser_alias, 1, 1,
            CASE WHEN NEW.duel_type = 'pickup' THEN 1 ELSE 0 END,
            CASE WHEN NEW.duel_type = 'pickup' THEN 1 ELSE 0 END,
            CASE WHEN NEW.duel_type = 'tournament' THEN 1 ELSE 0 END,
            CASE WHEN NEW.duel_type = 'tournament' THEN 1 ELSE 0 END,
            CASE WHEN NEW.duel_type = 'tournament' THEN 1 ELSE 0 END,
            NEW.duel_date, NEW.duel_date
        )
        ON CONFLICT (player_id) DO UPDATE SET
            total_duels = dueling_aggregate_stats.total_duels + 1,
            total_losses = dueling_aggregate_stats.total_losses + 1,
            pickup_duels = dueling_aggregate_stats.pickup_duels + CASE WHEN NEW.duel_type = 'pickup' THEN 1 ELSE 0 END,
            pickup_losses = dueling_aggregate_stats.pickup_losses + CASE WHEN NEW.duel_type = 'pickup' THEN 1 ELSE 0 END,
            tournament_duels = dueling_aggregate_stats.tournament_duels + CASE WHEN NEW.duel_type = 'tournament' THEN 1 ELSE 0 END,
            tournament_losses = dueling_aggregate_stats.tournament_losses + CASE WHEN NEW.duel_type = 'tournament' THEN 1 ELSE 0 END,
            tournaments_entered = dueling_aggregate_stats.tournaments_entered + CASE WHEN NEW.duel_type = 'tournament' THEN 1 ELSE 0 END,
            last_duel_date = NEW.duel_date,
            win_rate = ROUND((dueling_aggregate_stats.total_wins)::DECIMAL / (dueling_aggregate_stats.total_duels + 1), 3),
            pickup_win_rate = CASE 
                WHEN dueling_aggregate_stats.pickup_duels + CASE WHEN NEW.duel_type = 'pickup' THEN 1 ELSE 0 END > 0 
                THEN ROUND((dueling_aggregate_stats.pickup_wins)::DECIMAL / (dueling_aggregate_stats.pickup_duels + CASE WHEN NEW.duel_type = 'pickup' THEN 1 ELSE 0 END), 3)
                ELSE 0 
            END,
            tournament_win_rate = CASE 
                WHEN dueling_aggregate_stats.tournament_duels + CASE WHEN NEW.duel_type = 'tournament' THEN 1 ELSE 0 END > 0 
                THEN ROUND((dueling_aggregate_stats.tournament_wins)::DECIMAL / (dueling_aggregate_stats.tournament_duels + CASE WHEN NEW.duel_type = 'tournament' THEN 1 ELSE 0 END), 3)
                ELSE 0 
            END,
            updated_at = NOW();
    END IF;

    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- Create trigger for automatic stats updates
CREATE TRIGGER trigger_update_dueling_aggregate_stats
    AFTER INSERT ON dueling_stats
    FOR EACH ROW
    EXECUTE FUNCTION update_dueling_aggregate_stats();

-- Create function to generate bracket for tournament
CREATE OR REPLACE FUNCTION generate_tournament_bracket(tournament_uuid UUID)
RETURNS TEXT AS $$
DECLARE
    participant_count INTEGER;
    round_name TEXT;
    match_number INTEGER := 1;
    players_cursor CURSOR FOR 
        SELECT player_id, player_alias, seed_position 
        FROM tournament_participants 
        WHERE tournament_id = tournament_uuid 
        ORDER BY COALESCE(seed_position, 999), registration_date;
    player_record RECORD;
    players_array UUID[];
    aliases_array TEXT[];
    i INTEGER;
BEGIN
    -- Get participant count
    SELECT COUNT(*) INTO participant_count
    FROM tournament_participants
    WHERE tournament_id = tournament_uuid;
    
    IF participant_count < 2 THEN
        RETURN 'Error: Need at least 2 participants';
    END IF;
    
    -- Collect all players
    FOR player_record IN players_cursor LOOP
        players_array := array_append(players_array, player_record.player_id);
        aliases_array := array_append(aliases_array, player_record.player_alias);
    END LOOP;
    
    -- Generate first round matches
    round_name := 'Round 1';
    match_number := 1;
    
    -- Create matches by pairing players
    FOR i IN 1..array_length(players_array, 1) BY 2 LOOP
        IF i + 1 <= array_length(players_array, 1) THEN
            INSERT INTO tournament_matches (
                tournament_id, round_name, match_number, bracket_type,
                player1_id, player1_alias, player2_id, player2_alias,
                status
            ) VALUES (
                tournament_uuid, round_name, match_number, 'main',
                players_array[i], aliases_array[i], 
                players_array[i + 1], aliases_array[i + 1],
                'ready'
            );
            match_number := match_number + 1;
        END IF;
    END LOOP;
    
    RETURN format('Generated bracket with %s matches for %s participants', match_number - 1, participant_count);
END;
$$ LANGUAGE plpgsql; 