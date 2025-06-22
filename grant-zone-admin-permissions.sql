-- Grant zone admin permissions to your user account on production
-- Replace 'your-email@domain.com' with your actual email/login

-- First, find your user ID
SELECT id, email, raw_user_meta_data->>'alias' as alias 
FROM auth.users 
WHERE email = 'your-email@domain.com';

-- Then update your profile to have zone admin permissions
-- Replace 'your-user-id-here' with the ID from the query above
UPDATE profiles 
SET 
  is_zone_admin = true,
  is_admin = true  -- Optional: gives full admin access
WHERE id = 'your-user-id-here';

-- Verify the update
SELECT id, alias, is_admin, is_zone_admin 
FROM profiles 
WHERE id = 'your-user-id-here'; 