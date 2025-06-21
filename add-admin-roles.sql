-- Add new admin role columns to profiles table
-- This adds is_zone_admin and site_admin columns for more granular permissions

-- Add is_zone_admin column for zone management access
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS is_zone_admin BOOLEAN DEFAULT false;

-- Add site_admin column for limited admin access (users, news, videos only)
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS site_admin BOOLEAN DEFAULT false;

-- Add indexes for better performance
CREATE INDEX IF NOT EXISTS idx_profiles_is_zone_admin ON profiles(is_zone_admin);
CREATE INDEX IF NOT EXISTS idx_profiles_site_admin ON profiles(site_admin);

-- Add comments for documentation
COMMENT ON COLUMN profiles.is_zone_admin IS 'Can access zone management in admin panel';
COMMENT ON COLUMN profiles.site_admin IS 'Limited admin access - can manage users, news, and videos only';

-- Update zone management API permissions to include zone admins
-- This will need to be implemented in the API route

-- Success message
SELECT 'Admin role columns added successfully!' as status; 