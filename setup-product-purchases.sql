-- Function to get player product purchases for the ProductPurchaseManager
-- This function should return player_alias and product_name for all active purchases

CREATE OR REPLACE FUNCTION get_player_product_purchases()
RETURNS TABLE (
    player_alias TEXT,
    product_name TEXT
) AS $$
BEGIN
    -- Join user_products with profiles to get in-game aliases and with products to get product info
    RETURN QUERY
    SELECT 
        prof.in_game_alias as player_alias,
        CASE 
            -- Map specific product IDs to internal product names
            WHEN up.product_id = 'f3a3bb5e-61cf-4efb-9662-2c35cd785965' THEN 'rainbow_caw'  -- Rainbow CAW product
            -- Add more specific product mappings here as needed
            ELSE 'unknown_product'
        END as product_name
    FROM user_products up
    LEFT JOIN profiles prof ON up.user_id = prof.id
    LEFT JOIN products p ON up.product_id = p.id
    WHERE up.product_id IS NOT NULL
      AND up.product_id = 'f3a3bb5e-61cf-4efb-9662-2c35cd785965'  -- Only Rainbow CAW for now
      AND prof.in_game_alias IS NOT NULL  -- Must have an in-game alias
      AND prof.in_game_alias != ''  -- And it must not be empty
    ORDER BY prof.in_game_alias, up.product_id;
END;
$$ LANGUAGE plpgsql;

-- Grant execute permission to your application user
-- GRANT EXECUTE ON FUNCTION get_player_product_purchases() TO your_app_user;

-- Test the function
-- SELECT * FROM get_player_product_purchases();

-- Example result:
-- player_alias | product_name
-- -------------+-------------
-- PlayerName1  | rainbow_caw
-- PlayerName2  | premium_rifle
-- PlayerName1  | rainbow_caw 