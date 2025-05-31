-- Delete User: nolanpower@gmail.com
-- This will allow them to re-register with the same email

-- 1. First, find the user ID
SELECT id, email, created_at 
FROM auth.users 
WHERE email = 'gohan_dragon_@hotmail.com';

-- 2. Delete from auth.users (this will cascade to related auth tables)
DELETE FROM auth.users 
WHERE email = 'gohan_dragon_@hotmail.com';

-- 3. Verify deletion
SELECT id, email 
FROM auth.users 
WHERE email = 'gohan_dragon_@hotmail.com';

-- 4. Also check if there are any remaining records in profiles (should be empty if already deleted)
SELECT id, email, in_game_alias 
FROM profiles 
WHERE email = 'gohan_dragon_@hotmail.com';

-- 5. Optional: Check for any donation records (these can stay - just orphaned)
SELECT id, customer_email, amount_cents, created_at 
FROM donation_transactions 
WHERE customer_email = 'gohan_dragon_@hotmail.com';

-- Success message
SELECT 'User deletion complete. They can now re-register with gohan_dragon_@hotmail.com' as status; 