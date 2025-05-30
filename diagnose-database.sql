-- Diagnostic script to check current database state
-- Run this in Supabase SQL Editor first

-- 1. Check what tables exist
SELECT 'EXISTING TABLES:' as info;
SELECT table_name, table_type 
FROM information_schema.tables 
WHERE table_schema = 'public' 
ORDER BY table_name;

-- 2. Check if profiles table exists and its structure
SELECT 'PROFILES TABLE STRUCTURE:' as info;
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns 
WHERE table_name = 'profiles' 
ORDER BY ordinal_position;

-- 3. Check if user_products table exists and its structure  
SELECT 'USER_PRODUCTS TABLE STRUCTURE:' as info;
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns 
WHERE table_name = 'user_products' 
ORDER BY ordinal_position;

-- 4. Check if donations table exists and its structure
SELECT 'DONATIONS TABLE STRUCTURE:' as info;
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns 
WHERE table_name = 'donations' 
ORDER BY ordinal_position;

-- 5. Check foreign key constraints
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
ORDER BY tc.table_name;

-- 6. Check if you have admin access
SELECT 'CURRENT USER ADMIN STATUS:' as info;
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

-- 7. Check data in user_products (the problematic table)
SELECT 'USER_PRODUCTS DATA:' as info;
SELECT COUNT(*) as total_records FROM user_products;

-- 8. Check for any existing data
SELECT 'SAMPLE DATA CHECK:' as info;
SELECT 'profiles' as table_name, COUNT(*) as record_count FROM profiles
UNION ALL
SELECT 'products', COUNT(*) FROM products  
UNION ALL
SELECT 'user_products', COUNT(*) FROM user_products
UNION ALL
SELECT 'donations', COUNT(*) FROM donations; 