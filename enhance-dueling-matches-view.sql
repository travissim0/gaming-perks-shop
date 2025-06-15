-- Enhance the recent_dueling_matches view to include match statistics
-- This adds accuracy, shots fired/hit, and burst damage stats per match

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
    ) as rounds_data,
    -- Add match statistics
    JSON_BUILD_OBJECT(
        'player1_shots_fired', COALESCE((
            SELECT SUM(shots_fired) FROM dueling_kills dk 
            WHERE dk.match_id = dm.id AND dk.killer_name = dm.player1_name
        ), 0),
        'player1_shots_hit', COALESCE((
            SELECT SUM(shots_hit) FROM dueling_kills dk 
            WHERE dk.match_id = dm.id AND dk.killer_name = dm.player1_name
        ), 0),
        'player1_accuracy', COALESCE((
            SELECT 
                CASE WHEN SUM(shots_fired) > 0 
                     THEN SUM(shots_hit)::DECIMAL / SUM(shots_fired)::DECIMAL 
                     ELSE 0 END
            FROM dueling_kills dk 
            WHERE dk.match_id = dm.id AND dk.killer_name = dm.player1_name
        ), 0),
        'player1_double_hits', COALESCE((
            SELECT COUNT(*) FROM dueling_kills dk 
            WHERE dk.match_id = dm.id AND dk.killer_name = dm.player1_name AND dk.is_double_hit = TRUE
        ), 0),
        'player1_triple_hits', COALESCE((
            SELECT COUNT(*) FROM dueling_kills dk 
            WHERE dk.match_id = dm.id AND dk.killer_name = dm.player1_name AND dk.is_triple_hit = TRUE
        ), 0),
        'player2_shots_fired', COALESCE((
            SELECT SUM(shots_fired) FROM dueling_kills dk 
            WHERE dk.match_id = dm.id AND dk.killer_name = dm.player2_name
        ), 0),
        'player2_shots_hit', COALESCE((
            SELECT SUM(shots_hit) FROM dueling_kills dk 
            WHERE dk.match_id = dm.id AND dk.killer_name = dm.player2_name
        ), 0),
        'player2_accuracy', COALESCE((
            SELECT 
                CASE WHEN SUM(shots_fired) > 0 
                     THEN SUM(shots_hit)::DECIMAL / SUM(shots_fired)::DECIMAL 
                     ELSE 0 END
            FROM dueling_kills dk 
            WHERE dk.match_id = dm.id AND dk.killer_name = dm.player2_name
        ), 0),
        'player2_double_hits', COALESCE((
            SELECT COUNT(*) FROM dueling_kills dk 
            WHERE dk.match_id = dm.id AND dk.killer_name = dm.player2_name AND dk.is_double_hit = TRUE
        ), 0),
        'player2_triple_hits', COALESCE((
            SELECT COUNT(*) FROM dueling_kills dk 
            WHERE dk.match_id = dm.id AND dk.killer_name = dm.player2_name AND dk.is_triple_hit = TRUE
        ), 0)
    ) as match_stats
FROM dueling_matches dm
ORDER BY dm.completed_at DESC NULLS LAST, dm.started_at DESC; 