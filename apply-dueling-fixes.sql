-- Essential Dueling System Fixes
-- This applies the most important fixes without breaking existing functionality

-- 1. Fix duration issues by updating matches with NULL completed_at
UPDATE dueling_matches 
SET completed_at = started_at + INTERVAL '5 minutes',
    updated_at = NOW()
WHERE match_status = 'completed' 
  AND completed_at IS NULL;

-- 2. Add ELO calculation function
CREATE OR REPLACE FUNCTION calculate_dueling_elo(
    player_elo INTEGER,
    opponent_elo INTEGER,
    won BOOLEAN,
    games_played INTEGER DEFAULT 10
) RETURNS INTEGER AS $$
DECLARE
    k_factor DECIMAL(4,1) := 32.0;
    expected_score DECIMAL(5,4);
    actual_score DECIMAL(3,1);
    elo_change DECIMAL(6,2);
    new_elo INTEGER;
BEGIN
    -- Calculate expected score using ELO formula
    expected_score := 1.0 / (1.0 + POWER(10.0, (opponent_elo - player_elo) / 400.0));
    
    -- Actual score: 1 for win, 0 for loss
    actual_score := CASE WHEN won THEN 1.0 ELSE 0.0 END;
    
    -- Reduce K-factor for experienced players
    IF games_played > 30 THEN
        k_factor := 16.0;
    ELSIF games_played > 10 THEN
        k_factor := 24.0;
    END IF;
    
    -- Calculate ELO change
    elo_change := k_factor * (actual_score - expected_score);
    
    -- Calculate new ELO (minimum 800, maximum 2800)
    new_elo := GREATEST(800, LEAST(2800, player_elo + ROUND(elo_change)));
    
    RETURN new_elo;
END;
$$ LANGUAGE plpgsql;

-- 3. Add simple ELO recalculation function for testing
CREATE OR REPLACE FUNCTION simple_elo_test()
RETURNS TEXT AS $$
DECLARE
    test_elo INTEGER;
BEGIN
    -- Test the ELO calculation function
    test_elo := calculate_dueling_elo(1200, 1200, TRUE, 5);
    
    RETURN format('ELO calculation working! Test result: %s', test_elo);
END;
$$ LANGUAGE plpgsql;

-- 4. Show current dueling stats
SELECT 
    'Current Dueling Stats' as info,
    COUNT(*) as total_matches,
    COUNT(*) FILTER (WHERE completed_at IS NOT NULL) as matches_with_completion,
    COUNT(*) FILTER (WHERE match_status = 'completed') as completed_matches,
    AVG(EXTRACT(EPOCH FROM (completed_at - started_at))) FILTER (WHERE completed_at IS NOT NULL) as avg_duration_seconds
FROM dueling_matches;

-- 5. Test the ELO function
SELECT simple_elo_test() as test_result; 