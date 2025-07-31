-- Update Squad Ratings System to 6-Star Scale
-- Changes the rating constraint from 1.0-5.0 to 1.0-6.0

-- Drop the existing constraint
ALTER TABLE player_ratings DROP CONSTRAINT IF EXISTS player_ratings_rating_check;

-- Add new constraint for 1.0-6.0 range with 0.5 increments
ALTER TABLE player_ratings ADD CONSTRAINT player_ratings_rating_check 
    CHECK (rating >= 1.0 AND rating <= 6.0 AND rating * 10 % 5 = 0);

-- Update the comment on the constraint for documentation
COMMENT ON CONSTRAINT player_ratings_rating_check ON player_ratings IS 
    'Ensures ratings are between 1.0 and 6.0 with 0.5 increments (1.0, 1.5, 2.0, 2.5, 3.0, 3.5, 4.0, 4.5, 5.0, 5.5, 6.0)';

-- Update the function comment if it exists
COMMENT ON TABLE player_ratings IS 
    'Individual player ratings within squad analyses. Uses 6-star rating system (1.0-6.0) with 0.5 increments.';

-- Verify the constraint works by testing some values (these will fail as intended)
-- Uncomment these lines to test the constraint:
-- INSERT INTO player_ratings (squad_rating_id, player_id, rating) VALUES ('00000000-0000-0000-0000-000000000000'::uuid, '00000000-0000-0000-0000-000000000000'::uuid, 0.5); -- Should fail: too low
-- INSERT INTO player_ratings (squad_rating_id, player_id, rating) VALUES ('00000000-0000-0000-0000-000000000000'::uuid, '00000000-0000-0000-0000-000000000000'::uuid, 6.5); -- Should fail: too high
-- INSERT INTO player_ratings (squad_rating_id, player_id, rating) VALUES ('00000000-0000-0000-0000-000000000000'::uuid, '00000000-0000-0000-0000-000000000000'::uuid, 3.3); -- Should fail: invalid increment