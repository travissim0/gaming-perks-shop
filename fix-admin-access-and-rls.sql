-- Comprehensive fix for admin access and RLS policies
-- Run this in Supabase SQL Editor

-- 1. First, grant admin access to your user
UPDATE profiles 
SET is_admin = true 
WHERE email = 'qwerty5544@aim.com';

-- Also grant to Axidus alias as backup
UPDATE profiles 
SET is_admin = true 
WHERE in_game_alias = 'Axidus';

-- 2. Verify admin access was granted
SELECT 'ADMIN ACCESS CHECK:' as info;
SELECT email, in_game_alias, is_admin, id 
FROM profiles 
WHERE is_admin = true;

-- 3. Fix RLS policies for user_products (the main problem)
DROP POLICY IF EXISTS "Admins can view all purchases" ON user_products;
CREATE POLICY "Admins can view all purchases" ON user_products
    FOR ALL USING (
        auth.uid() IN (SELECT id FROM profiles WHERE is_admin = true)
        OR auth.uid() = user_id
    );

-- 4. Fix RLS policies for profiles  
DROP POLICY IF EXISTS "Public profiles are viewable by everyone" ON profiles;
CREATE POLICY "Public profiles are viewable by everyone" ON profiles
    FOR SELECT USING (true);

-- 5. Fix RLS policies for products
DROP POLICY IF EXISTS "Products are viewable by everyone" ON products;
CREATE POLICY "Products are viewable by everyone" ON products
    FOR SELECT USING (
        active = true 
        OR auth.uid() IN (SELECT id FROM profiles WHERE is_admin = true)
    );

-- 6. Fix RLS policies for donation_transactions
DROP POLICY IF EXISTS "Admins can view all donations" ON donation_transactions;
CREATE POLICY "Admins can view all donations" ON donation_transactions
    FOR SELECT USING (
        auth.uid() IN (SELECT id FROM profiles WHERE is_admin = true)
        OR auth.uid() = user_id
    );

-- 7. Test the admin access with current auth user
SELECT 'CURRENT AUTH USER:' as info;
SELECT auth.uid() as current_user_id;

-- 8. Test if current user is admin
SELECT 'IS CURRENT USER ADMIN:' as info;
SELECT EXISTS(
    SELECT 1 FROM profiles 
    WHERE id = auth.uid() AND is_admin = true
) as is_admin;

-- 9. Test the user_products query that's failing
SELECT 'USER_PRODUCTS TEST:' as info;
SELECT count(*) as total_records FROM user_products;

-- 10. Test the join query
SELECT 'JOIN TEST:' as info;
SELECT 
    up.id,
    p.email,
    pr.name
FROM user_products up
LEFT JOIN profiles p ON up.user_id = p.id
LEFT JOIN products pr ON up.product_id = pr.id
LIMIT 3;

-- 11. Grant all necessary permissions (if needed)
GRANT ALL ON profiles TO authenticated;
GRANT ALL ON products TO authenticated;  
GRANT ALL ON user_products TO authenticated;
GRANT ALL ON donation_transactions TO authenticated;

-- 12. Final verification
SELECT 'FINAL ADMIN VERIFICATION:' as info;
SELECT 
    email,
    in_game_alias, 
    is_admin,
    id,
    CASE 
        WHEN id = auth.uid() THEN 'THIS IS YOU'
        ELSE 'OTHER USER'
    END as user_status
FROM profiles 
WHERE is_admin = true; 