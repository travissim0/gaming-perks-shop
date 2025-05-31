-- Final CTF Role Fix - Handles all edge cases
-- Run this step by step if needed

-- Step 1: Drop existing enum if it has issues
DROP TYPE IF EXISTS ctf_role_type CASCADE;

-- Step 2: Create enum with correct values
CREATE TYPE ctf_role_type AS ENUM (
    'none',
    'ctf_admin', 
    'ctf_head_referee',
    'ctf_referee',
    'ctf_recorder',
    'ctf_commentator'
);

-- Step 3: Drop column if it exists with wrong type
ALTER TABLE profiles DROP COLUMN IF EXISTS ctf_role;

-- Step 4: Add column with correct type
ALTER TABLE profiles ADD COLUMN ctf_role ctf_role_type DEFAULT 'none';

-- Step 5: Verify the column was created
-- SELECT column_name, data_type, column_default 
-- FROM information_schema.columns 
-- WHERE table_name = 'profiles' AND column_name = 'ctf_role';

-- Step 6: Set all existing users to 'none'
UPDATE profiles SET ctf_role = 'none';

-- Step 7: Remove any conflicting policies
DROP POLICY IF EXISTS "CTF admins can view all profiles" ON profiles;
DROP POLICY IF EXISTS "CTF admins can update CTF roles" ON profiles;

-- Step 8: Create index
CREATE INDEX IF NOT EXISTS idx_profiles_ctf_role ON profiles(ctf_role);

-- Step 9: Refresh schema
NOTIFY pgrst, 'reload schema'; 