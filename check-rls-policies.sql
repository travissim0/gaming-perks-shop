-- Check RLS policies on profiles table
SELECT 
    schemaname,
    tablename,
    policyname,
    permissive,
    roles,
    cmd,
    qual,
    with_check
FROM pg_policies 
WHERE tablename = 'profiles';

-- Check if RLS is enabled on profiles table
SELECT 
    schemaname,
    tablename,
    rowsecurity
FROM pg_tables 
WHERE tablename = 'profiles';

-- Check current user permissions
SELECT current_user, session_user;

-- Test update capability (this should show what the current user can do)
EXPLAIN (FORMAT JSON) 
UPDATE profiles 
SET is_admin = true 
WHERE id = (SELECT id FROM profiles LIMIT 1); 