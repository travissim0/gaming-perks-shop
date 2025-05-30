-- Grant admin access to Axidus (qwerty5544@aim.com)
-- Run this in Supabase SQL Editor

-- Update by email (if they've registered)
UPDATE profiles 
SET is_admin = true 
WHERE email = 'qwerty5544@aim.com';

-- Update by in-game alias (alternative approach)
UPDATE profiles 
SET is_admin = true 
WHERE in_game_alias = 'Axidus';

-- Verify the update worked
SELECT 
    id,
    email, 
    in_game_alias, 
    is_admin, 
    registration_status,
    created_at
FROM profiles 
WHERE email = 'qwerty5544@aim.com' 
   OR in_game_alias = 'Axidus';

-- Show all current admins for verification
SELECT 
    email, 
    in_game_alias, 
    is_admin, 
    created_at
FROM profiles 
WHERE is_admin = true 
ORDER BY created_at DESC; 