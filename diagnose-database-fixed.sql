-- Corrected diagnostic script using actual table names
-- Run this in Supabase SQL Editor

-- 1. Check what tables exist
SELECT 'EXISTING TABLES:' as info;
SELECT table_name, table_type 
FROM information_schema.tables 
WHERE table_schema = 'public' 
ORDER BY table_name;

-- 2. Check donation_transactions table structure (not donations)
SELECT 'DONATION_TRANSACTIONS TABLE STRUCTURE:' as info;
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns 
WHERE table_name = 'donation_transactions' 
ORDER BY ordinal_position;

-- 3. Check user_products table structure  
SELECT 'USER_PRODUCTS TABLE STRUCTURE:' as info;
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns 
WHERE table_name = 'user_products' 
ORDER BY ordinal_position;

-- 4. Check profiles table structure
SELECT 'PROFILES TABLE STRUCTURE:' as info;
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns 
WHERE table_name = 'profiles' 
ORDER BY ordinal_position;

-- 5. Check foreign key constraints using actual table names
SELECT 'FOREIGN KEY CONSTRAINTS:' as info;
SELECT 
    tc.table_name, 
    kcu.column_name, 
    ccu.table_name AS foreign_table_name,
    ccu.column_name AS foreign_column_name,
    tc.constraint_name
FROM 
    information_schema.table_constraints AS tc 
    JOIN information_schema.key_column_usage AS kcu
      ON tc.constraint_name = kcu.constraint_name
    JOIN information_schema.constraint_column_usage AS ccu
      ON ccu.constraint_name = tc.constraint_name
WHERE tc.constraint_type = 'FOREIGN KEY' 
  AND tc.table_name IN ('user_products', 'donation_transactions', 'profiles')
ORDER BY tc.table_name;

-- 6. Grant admin access to your user
UPDATE profiles 
SET is_admin = true 
WHERE email = 'qwerty5544@aim.com';

-- 7. Verify admin access was granted
SELECT 'ADMIN ACCESS VERIFICATION:' as info;
SELECT 
    id,
    email, 
    in_game_alias, 
    is_admin, 
    registration_status,
    created_at
FROM profiles 
WHERE email = 'qwerty5544@aim.com' 
   OR in_game_alias = 'Axidus'
   OR is_admin = true;

-- 8. Check data counts using correct table names
SELECT 'DATA COUNTS:' as info;
SELECT 'profiles' as table_name, COUNT(*) as record_count FROM profiles
UNION ALL
SELECT 'products', COUNT(*) FROM products  
UNION ALL
SELECT 'user_products', COUNT(*) FROM user_products
UNION ALL
SELECT 'donation_transactions', COUNT(*) FROM donation_transactions;

-- 9. Test the user_products relationship query
SELECT 'USER_PRODUCTS RELATIONSHIP TEST:' as info;
SELECT 
    up.id,
    up.created_at,
    p.email,
    p.in_game_alias,
    pr.name as product_name,
    pr.price
FROM user_products up
LEFT JOIN profiles p ON up.user_id = p.id
LEFT JOIN products pr ON up.product_id = pr.id
LIMIT 5; 