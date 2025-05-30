-- Simple RLS Policy Fix - Avoids infinite recursion
-- This approach allows admin operations without circular dependencies

-- First, drop all existing policies to start clean
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
    
    RAISE NOTICE 'All existing policies dropped';
EXCEPTION
    WHEN OTHERS THEN
        RAISE NOTICE 'Some policies may not have existed, continuing...';
END $$;

-- Temporarily disable RLS to allow the service role to work
ALTER TABLE profiles DISABLE ROW LEVEL SECURITY;

-- Grant full access to authenticated users for now
-- This is a simpler approach that avoids recursion issues
GRANT ALL ON profiles TO authenticated;

-- Alternative: Create a security definer function for admin checks
CREATE OR REPLACE FUNCTION is_admin(user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM profiles 
        WHERE id = user_id 
        AND is_admin = true
    );
END;
$$;

-- Grant execute permission on the function
GRANT EXECUTE ON FUNCTION is_admin(uuid) TO authenticated;

-- Now create simpler policies using the function
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- Simple select policy - users can see their own profile OR if they're admin (all profiles)
CREATE POLICY "simple_select_policy" ON profiles
FOR SELECT USING (
    auth.uid() = id OR is_admin(auth.uid())
);

-- Simple update policy - users can update their own profile OR if they're admin (any profile)
CREATE POLICY "simple_update_policy" ON profiles
FOR UPDATE USING (
    auth.uid() = id OR is_admin(auth.uid())
);

-- Simple insert policy - users can insert their own profile
CREATE POLICY "simple_insert_policy" ON profiles
FOR INSERT WITH CHECK (auth.uid() = id);

-- Simple delete policy - only admins can delete
CREATE POLICY "simple_delete_policy" ON profiles
FOR DELETE USING (is_admin(auth.uid()));

DO $$
BEGIN
    RAISE NOTICE 'Simple RLS policies applied successfully!';
    RAISE NOTICE 'This approach avoids infinite recursion by using a security definer function';
    RAISE NOTICE 'Admins can now manage all user profiles including roles';
END $$; 