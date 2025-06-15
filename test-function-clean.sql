-- Clean test function
CREATE OR REPLACE FUNCTION get_player_product_purchases_test()
RETURNS TABLE (
    player_alias TEXT,
    product_name TEXT
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        up.user_id::TEXT as player_alias,
        'rainbow_caw'::TEXT as product_name
    FROM user_products up
    WHERE up.product_id = 'f3a3bb5e-61cf-4efb-9662-2c35cd785965'
    LIMIT 5;
END;
$$ LANGUAGE plpgsql;

-- Test it
SELECT * FROM get_player_product_purchases_test(); 