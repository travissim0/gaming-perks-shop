-- Clean version of the product purchases function
CREATE OR REPLACE FUNCTION get_player_product_purchases()
RETURNS TABLE (
    player_alias TEXT,
    product_name TEXT
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        prof.in_game_alias as player_alias,
        CASE 
            WHEN up.product_id = 'f3a3bb5e-61cf-4efb-9662-2c35cd785965' THEN 'rainbow_caw'
            ELSE 'unknown_product'
        END as product_name
    FROM user_products up
    LEFT JOIN profiles prof ON up.user_id = prof.id
    LEFT JOIN products p ON up.product_id = p.id
    WHERE up.product_id IS NOT NULL
      AND up.product_id = 'f3a3bb5e-61cf-4efb-9662-2c35cd785965'
      AND prof.in_game_alias IS NOT NULL
      AND prof.in_game_alias != ''
    ORDER BY prof.in_game_alias, up.product_id;
END;
$$ LANGUAGE plpgsql;

-- Test the function
SELECT * FROM get_player_product_purchases(); 