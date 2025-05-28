-- Add registration status field to profiles table
-- This supports the in-game registration system

-- Add registration_status column
ALTER TABLE profiles 
ADD COLUMN registration_status TEXT DEFAULT 'completed';

-- Add index for performance
CREATE INDEX IF NOT EXISTS idx_profiles_registration_status 
ON profiles(registration_status);

-- Update existing profiles to have 'completed' status
UPDATE profiles 
SET registration_status = 'completed' 
WHERE registration_status IS NULL;

-- Add comment for documentation
COMMENT ON COLUMN profiles.registration_status IS 'Registration status: pending_verification, completed';

-- Verify the changes
SELECT column_name, data_type, is_nullable, column_default 
FROM information_schema.columns 
WHERE table_name = 'profiles' 
AND column_name = 'registration_status'; 