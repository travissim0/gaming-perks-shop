-- Test queries to understand your database structure
-- Run these one by one in your Supabase SQL editor

-- 1. Check what columns exist in kofi_donations
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'kofi_donations';

-- 2. Check what columns exist in profiles  
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'profiles'
ORDER BY ordinal_position;

-- 3. Check what columns exist in user_products
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'user_products';

-- 4. Check sample data from kofi_donations (first 3 rows)
SELECT * FROM kofi_donations LIMIT 3;

-- 5. Check sample data from user_products (first 3 rows) 
SELECT * FROM user_products LIMIT 3;

-- 6. Check if there are any Rainbow CAW purchases (specific product ID)
SELECT COUNT(*) as rainbow_caw_purchases_user_products
FROM user_products 
WHERE product_id = 'f3a3bb5e-61cf-4efb-9662-2c35cd785965';

-- Check what in-game aliases we have for Rainbow CAW purchases
SELECT prof.in_game_alias, prof.email, up.product_id, p.name as product_name
FROM user_products up
LEFT JOIN profiles prof ON up.user_id = prof.id
LEFT JOIN products p ON up.product_id = p.id
WHERE up.product_id = 'f3a3bb5e-61cf-4efb-9662-2c35cd785965'
ORDER BY prof.in_game_alias;

-- 7. Simple test function - try this version first (without assuming column names)
CREATE OR REPLACE FUNCTION get_player_product_purchases_test()
RETURNS TABLE (
    player_alias TEXT,
    product_name TEXT
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        up.user_id::TEXT as player_alias,  -- Just use user_id for now
        'rainbow_caw'::TEXT as product_name
    FROM user_products up
    WHERE up.product_id = 'f3a3bb5e-61cf-4efb-9662-2c35cd785965'
    LIMIT 5;  -- Just return first 5 for testing
END;
$$ LANGUAGE plpgsql;

-- 8. Test the function
SELECT * FROM get_player_product_purchases_test(); 