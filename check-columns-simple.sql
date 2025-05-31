-- Check what columns exist in squad_members table
SELECT 'squad_members columns:' as info;
SELECT column_name, data_type, is_nullable 
FROM information_schema.columns 
WHERE table_name = 'squad_members' 
ORDER BY ordinal_position;

-- Check what columns exist in squads table  
SELECT 'squads columns:' as info;
SELECT column_name, data_type, is_nullable 
FROM information_schema.columns 
WHERE table_name = 'squads' 
ORDER BY ordinal_position;

-- Check what columns exist in profiles table
SELECT 'profiles columns:' as info;
SELECT column_name, data_type, is_nullable 
FROM information_schema.columns 
WHERE table_name = 'profiles' 
ORDER BY ordinal_position; 