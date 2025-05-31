-- Minimal CTF Role Fix
-- This ensures the column exists and removes policy conflicts

-- Create enum if it doesn't exist
DO $$ BEGIN
    CREATE TYPE ctf_role_type AS ENUM (
        'none',
        'ctf_admin', 
        'ctf_head_referee',
        'ctf_referee',
        'ctf_recorder',
        'ctf_commentator'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Add column if it doesn't exist
ALTER TABLE profiles 
ADD COLUMN IF NOT EXISTS ctf_role ctf_role_type DEFAULT 'none';

-- Remove conflicting policies
DROP POLICY IF EXISTS "CTF admins can view all profiles" ON profiles;
DROP POLICY IF EXISTS "CTF admins can update CTF roles" ON profiles;

-- Set default values for existing users
UPDATE profiles SET ctf_role = 'none' WHERE ctf_role IS NULL;

-- Create index for performance
CREATE INDEX IF NOT EXISTS idx_profiles_ctf_role ON profiles(ctf_role);

-- Refresh schema cache
NOTIFY pgrst, 'reload schema'; 