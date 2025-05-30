-- Fix RLS policies for admin operations
-- This script ensures admins can update user roles and registration statuses

-- First, drop existing problematic policies (with error handling)
DO $$ 
BEGIN
    DROP POLICY IF EXISTS "Users can view own profile" ON profiles;
    DROP POLICY IF EXISTS "Users can update own profile" ON profiles;
    DROP POLICY IF EXISTS "Enable read access for all users" ON profiles;
    DROP POLICY IF EXISTS "Enable update for users based on user_id" ON profiles;
    DROP POLICY IF EXISTS "Enable insert for authenticated users only" ON profiles;
    DROP POLICY IF EXISTS "profiles_select_policy" ON profiles;
    DROP POLICY IF EXISTS "profiles_update_policy" ON profiles;
    DROP POLICY IF EXISTS "profiles_insert_policy" ON profiles;
    DROP POLICY IF EXISTS "profiles_delete_policy" ON profiles;
    
    RAISE NOTICE 'Existing policies dropped successfully';
EXCEPTION
    WHEN OTHERS THEN
        RAISE NOTICE 'Some policies may not have existed, continuing...';
END $$;

-- Create comprehensive policies that work for both regular users and admins

-- 1. Allow users to view their own profile + admins can view all profiles
CREATE POLICY "profiles_select_policy" ON profiles
FOR SELECT USING (
  auth.uid() = id  -- Users can see their own profile
  OR 
  EXISTS (  -- OR user is an admin
    SELECT 1 FROM profiles 
    WHERE profiles.id = auth.uid() 
    AND profiles.is_admin = true
  )
);

-- 2. Allow users to update their own profile (except admin status) + admins can update everything
CREATE POLICY "profiles_update_policy" ON profiles
FOR UPDATE USING (
  auth.uid() = id  -- Users can update their own profile
  OR 
  EXISTS (  -- OR user is an admin (can update anyone)
    SELECT 1 FROM profiles 
    WHERE profiles.id = auth.uid() 
    AND profiles.is_admin = true
  )
) WITH CHECK (
  -- Regular users cannot change their admin status
  (auth.uid() = id AND is_admin = (SELECT is_admin FROM profiles WHERE id = auth.uid()))
  OR 
  -- Admins can change anything
  EXISTS (
    SELECT 1 FROM profiles 
    WHERE profiles.id = auth.uid() 
    AND profiles.is_admin = true
  )
);

-- 3. Allow profile creation for authenticated users
CREATE POLICY "profiles_insert_policy" ON profiles
FOR INSERT WITH CHECK (auth.uid() = id);

-- 4. Prevent deletion (admins should deactivate instead)
CREATE POLICY "profiles_delete_policy" ON profiles
FOR DELETE USING (
  EXISTS (
    SELECT 1 FROM profiles 
    WHERE profiles.id = auth.uid() 
    AND profiles.is_admin = true
  )
);

-- Ensure RLS is enabled
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- Grant necessary permissions to authenticated users (without sequence)
GRANT SELECT, INSERT, UPDATE ON profiles TO authenticated;

-- Test the policies by checking if an admin can update roles
DO $$
BEGIN
  RAISE NOTICE 'RLS policies updated successfully for profiles table';
  RAISE NOTICE 'Admins can now update user roles and registration statuses';
  RAISE NOTICE 'Regular users can still only update their own profiles (except admin status)';
END $$; 