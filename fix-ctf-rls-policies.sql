-- Fix CTF Roles RLS Policy Conflicts
-- This fixes the "Profile check timeout" and empty error issues

-- First, let's drop the conflicting CTF policies
DROP POLICY IF EXISTS "CTF admins can view all profiles" ON profiles;
DROP POLICY IF EXISTS "CTF admins can update CTF roles" ON profiles;

-- Check what existing policies we have on profiles table
-- (You can run this separately to see current policies)
-- SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check 
-- FROM pg_policies WHERE tablename = 'profiles';

-- Create a simple, non-conflicting policy for CTF role updates
-- This allows admins to update any profile, including CTF roles
CREATE POLICY "Admins can manage all profile fields" ON profiles
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM profiles 
            WHERE id = auth.uid() 
            AND is_admin = true
        )
    );

-- Alternative: If the above conflicts, let's modify existing policies
-- Find and modify the existing admin update policy to include ctf_role column

-- If you have an existing policy like "Admins can update profiles", 
-- we need to ensure it doesn't conflict with CTF role updates

-- Simple test to verify the column exists
-- SELECT column_name, data_type, is_nullable, column_default 
-- FROM information_schema.columns 
-- WHERE table_name = 'profiles' AND column_name = 'ctf_role';

-- Grant explicit permissions for updating ctf_role column
-- (Run this if the policies are still causing issues)
-- GRANT UPDATE(ctf_role) ON profiles TO authenticated;

-- Ensure the ctf_role column has proper defaults
UPDATE profiles SET ctf_role = 'none' WHERE ctf_role IS NULL;

-- Refresh the schema cache (this might help with the timeout issue)
NOTIFY pgrst, 'reload schema'; 